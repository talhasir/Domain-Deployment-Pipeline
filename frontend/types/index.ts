export interface DomainPipeline {
  id: number;
  domain: string;
  current_stage: string;
  stage_status: string;
  hosting_provider: string | null;
  retry_count: number;
  last_error: string | null;
  last_attempted_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface PipelineLog {
  id: number;
  domain: string;
  stage: string;
  status: string;
  message: string | null;
  attempt: number | null;
  duration_ms: number | null;
  created_at: string | null;
}

export interface Summary {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
}

export interface SSEEvent {
  type: "start" | "result" | "error" | "done";
  domain?: string;
  status?: string;
  failed_at?: string;
  message?: string;
}

export const STAGES = [
  "assign_hosting",
  "configure_dns",
  "deploy_site",
  "verify_live",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<string, string> = {
  pending: "Pending",
  assign_hosting: "Assign Hosting",
  configure_dns: "Configure DNS",
  deploy_site: "Deploy Site",
  verify_live: "Verify Live",
  completed: "Completed",
};
