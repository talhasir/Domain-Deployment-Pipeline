/**
 * Browser-side pipeline simulation engine.
 * Mirrors the Python backend logic: stages, retry with exponential backoff,
 * idempotency (skip completed stages), and structured logging.
 */

import type { DomainPipeline, PipelineLog, Stage } from "@/types";
import { STAGES } from "@/types";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 800;

const FAILURE_RATES: Record<string, number> = {
  assign_hosting: 0.3,
  configure_dns: 0.4,
  deploy_site: 0.3,
  verify_live: 0.2,
};

const HOSTING_PROVIDERS = [
  "HostGator",
  "SiteGround",
  "Bluehost",
  "DreamHost",
  "A2Hosting",
];

interface StageResult {
  success: boolean;
  message: string;
  error: string;
  data?: Record<string, string>;
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function shouldFail(stage: string): boolean {
  return Math.random() < (FAILURE_RATES[stage] ?? 0);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function executeStage(
  stage: Stage,
  domain: string,
  provider: string
): Promise<StageResult> {
  await sleep(randomBetween(100, 400));

  if (stage === "assign_hosting") {
    if (shouldFail(stage))
      return { success: false, message: "", error: `Provider API timeout while assigning hosting for ${domain}` };
    const p = pick(HOSTING_PROVIDERS);
    return { success: true, message: `Assigned to ${p}`, error: "", data: { provider: p } };
  }

  if (stage === "configure_dns") {
    if (shouldFail(stage))
      return { success: false, message: "", error: "DNS configuration rejected by nameserver" };
    return { success: true, message: `NS records pointed to ${provider} nameservers`, error: "" };
  }

  if (stage === "deploy_site") {
    if (shouldFail(stage))
      return { success: false, message: "", error: "Archive snapshot not found for domain" };
    return { success: true, message: "Site rebuilt from archive snapshot", error: "" };
  }

  // verify_live
  if (shouldFail(stage))
    return { success: false, message: "", error: "HTTP check failed — site returned 500 or empty response (silent failure caught)" };
  return { success: true, message: "HTTP 200 confirmed — site is live", error: "" };
}

// ── In-memory store ──

let nextPipelineId = 1;
let nextLogId = 1;
let pipelines: DomainPipeline[] = [];
let logs: PipelineLog[] = [];

export type OnUpdate = () => void;

function addLog(
  domain: string,
  stage: string,
  status: string,
  message: string,
  attempt: number | null = null,
  duration_ms: number | null = null
): PipelineLog {
  const entry: PipelineLog = {
    id: nextLogId++,
    domain,
    stage,
    status,
    message,
    attempt,
    duration_ms,
    created_at: new Date().toISOString(),
  };
  logs = [entry, ...logs];
  return entry;
}

function findPipeline(domain: string): DomainPipeline | undefined {
  return pipelines.find((p) => p.domain === domain);
}

function stageAlreadyCompleted(domain: string, stage: string): boolean {
  return logs.some(
    (l) => l.domain === domain && l.stage === stage && l.status === "success"
  );
}

async function runStageWithRetry(
  domain: string,
  stage: Stage,
  provider: string,
  onUpdate: OnUpdate
): Promise<{ success: boolean; provider: string }> {
  if (stageAlreadyCompleted(domain, stage)) {
    addLog(domain, stage, "skipped", "Already completed — skipping");
    onUpdate();
    return { success: true, provider };
  }

  addLog(domain, stage, "started", "Beginning stage");
  onUpdate();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const start = performance.now();
    const result = await executeStage(stage, domain, provider);
    const elapsed = Math.round(performance.now() - start);

    if (result.success) {
      let newProvider = provider;
      if (stage === "assign_hosting" && result.data?.provider) {
        newProvider = result.data.provider;
        const p = findPipeline(domain);
        if (p) p.hosting_provider = newProvider;
      }
      addLog(domain, stage, "success", result.message, attempt, elapsed);
      onUpdate();
      return { success: true, provider: newProvider };
    }

    const p = findPipeline(domain);
    if (p) {
      p.retry_count += 1;
      p.last_error = result.error;
    }

    if (attempt < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      const jitter = Math.random() * delay * 0.2;
      const wait = Math.round(delay + jitter);
      addLog(
        domain,
        stage,
        "retrying",
        `Attempt ${attempt}/${MAX_RETRIES} failed: ${result.error}. Retrying in ${(wait / 1000).toFixed(1)}s`,
        attempt,
        elapsed
      );
      onUpdate();
      await sleep(wait);
    } else {
      addLog(
        domain,
        stage,
        "failed",
        `All ${MAX_RETRIES} attempts failed. Last error: ${result.error}`,
        attempt,
        elapsed
      );
      onUpdate();
    }
  }

  return { success: false, provider };
}

export interface PipelineResult {
  domain: string;
  status: "completed" | "failed";
  failed_at?: string;
  message: string;
}

export async function processDomain(
  domain: string,
  onUpdate: OnUpdate
): Promise<PipelineResult> {
  let pipeline = findPipeline(domain);
  if (!pipeline) {
    pipeline = {
      id: nextPipelineId++,
      domain,
      current_stage: "pending",
      stage_status: "pending",
      hosting_provider: null,
      retry_count: 0,
      last_error: null,
      last_attempted_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
    };
    pipelines = [...pipelines, pipeline];
  }

  let provider = pipeline.hosting_provider ?? "unknown";

  for (const stage of STAGES) {
    pipeline.current_stage = stage;
    pipeline.stage_status = "running";
    pipeline.last_attempted_at = new Date().toISOString();
    onUpdate();

    const result = await runStageWithRetry(domain, stage, provider, onUpdate);

    if (!result.success) {
      pipeline.stage_status = "failed";
      onUpdate();
      return {
        domain,
        status: "failed",
        failed_at: stage,
        message: `Pipeline failed at stage: ${stage}`,
      };
    }

    provider = result.provider;
    pipeline.stage_status = "success";
    onUpdate();
  }

  pipeline.current_stage = "completed";
  pipeline.stage_status = "success";
  pipeline.completed_at = new Date().toISOString();
  onUpdate();

  return {
    domain,
    status: "completed",
    message: `${domain} is live!`,
  };
}

export function retryDomainPipeline(domain: string) {
  const p = findPipeline(domain);
  if (p) {
    p.stage_status = "pending";
    p.last_error = null;
  }
}

export function resetAllData() {
  pipelines = [];
  logs = [];
  nextPipelineId = 1;
  nextLogId = 1;
}

export function getDomains(): DomainPipeline[] {
  return [...pipelines];
}

export function getLogs(): PipelineLog[] {
  return [...logs];
}

export function getSummary() {
  const total = pipelines.length;
  const completed = pipelines.filter((p) => p.current_stage === "completed").length;
  const failed = pipelines.filter((p) => p.stage_status === "failed").length;
  const running = pipelines.filter((p) => p.stage_status === "running").length;
  const pending = total - completed - failed - running;
  return { total, completed, failed, running, pending };
}
