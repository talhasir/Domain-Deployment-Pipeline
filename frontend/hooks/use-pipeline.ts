"use client";

import { useState, useCallback } from "react";
import type { DomainPipeline, PipelineLog, Summary, SSEEvent } from "@/types";
import {
  processDomain,
  retryDomainPipeline,
  resetAllData,
  getDomains,
  getLogs,
  getSummary,
} from "@/lib/pipeline-engine";

export function usePipeline() {
  const [domains, setDomains] = useState<DomainPipeline[]>([]);
  const [logs, setLogs] = useState<PipelineLog[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    completed: 0,
    failed: 0,
    running: 0,
    pending: 0,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<SSEEvent[]>([]);

  const refreshAll = useCallback(() => {
    setDomains(getDomains());
    setLogs(getLogs());
    setSummary(getSummary());
  }, []);

  const runBatch = useCallback(
    async (domainList: string[]) => {
      setIsRunning(true);
      setEvents([]);

      for (const domain of domainList) {
        setEvents((prev) => [...prev, { type: "start", domain }]);

        try {
          const result = await processDomain(domain, refreshAll);

          setEvents((prev) => [
            ...prev,
            {
              type: "result",
              domain: result.domain,
              status: result.status,
              failed_at: result.failed_at,
              message: result.message,
            },
          ]);
        } catch (e) {
          setEvents((prev) => [
            ...prev,
            { type: "error", domain, message: String(e) },
          ]);
        }

        refreshAll();
      }

      setEvents((prev) => [...prev, { type: "done" }]);
      setIsRunning(false);
      refreshAll();
    },
    [refreshAll]
  );

  const resetAll = useCallback(() => {
    resetAllData();
    setEvents([]);
    refreshAll();
  }, [refreshAll]);

  const retryDomain = useCallback(
    async (domain: string) => {
      setIsRunning(true);
      retryDomainPipeline(domain);
      refreshAll();

      try {
        const result = await processDomain(domain, refreshAll);
        setEvents((prev) => [
          ...prev,
          {
            type: "result",
            domain: result.domain,
            status: result.status,
            failed_at: result.failed_at,
            message: result.message,
          },
        ]);
      } catch (e) {
        setEvents((prev) => [
          ...prev,
          { type: "error", domain, message: String(e) },
        ]);
      }

      setIsRunning(false);
      refreshAll();
    },
    [refreshAll]
  );

  return {
    domains,
    logs,
    summary,
    isRunning,
    events,
    refreshAll,
    runBatch,
    resetAll,
    retryDomain,
  };
}
