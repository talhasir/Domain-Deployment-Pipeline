"use client";

import { useState, useCallback, useRef } from "react";
import type { DomainPipeline, PipelineLog, Summary, SSEEvent } from "@/types";

const API = "/api";

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDomains = useCallback(async () => {
    const res = await fetch(`${API}/domains`);
    if (res.ok) setDomains(await res.json());
  }, []);

  const fetchLogs = useCallback(async (domain?: string) => {
    const url = domain ? `${API}/logs?domain=${domain}` : `${API}/logs`;
    const res = await fetch(url);
    if (res.ok) setLogs(await res.json());
  }, []);

  const fetchSummary = useCallback(async () => {
    const res = await fetch(`${API}/summary`);
    if (res.ok) setSummary(await res.json());
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchDomains(), fetchLogs(), fetchSummary()]);
  }, [fetchDomains, fetchLogs, fetchSummary]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(refreshAll, 1500);
  }, [refreshAll]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const runBatch = useCallback(
    async (domainList: string[]) => {
      setIsRunning(true);
      setEvents([]);
      startPolling();

      try {
        const res = await fetch(`${API}/run-batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domains: domainList }),
        });

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const event: SSEEvent = JSON.parse(line.slice(6));
                  setEvents((prev) => [...prev, event]);
                  if (event.type === "result" || event.type === "error") {
                    await refreshAll();
                  }
                } catch {
                  // skip malformed events
                }
              }
            }
          }
        }
      } finally {
        setIsRunning(false);
        stopPolling();
        await refreshAll();
      }
    },
    [refreshAll, startPolling, stopPolling]
  );

  const resetAll = useCallback(async () => {
    await fetch(`${API}/reset`, { method: "POST" });
    setEvents([]);
    await refreshAll();
  }, [refreshAll]);

  const retryDomain = useCallback(
    async (domain: string) => {
      setIsRunning(true);
      startPolling();
      try {
        await fetch(`${API}/retry/${domain}`, { method: "POST" });
      } finally {
        setIsRunning(false);
        stopPolling();
        await refreshAll();
      }
    },
    [refreshAll, startPolling, stopPolling]
  );

  return {
    domains,
    logs,
    summary,
    isRunning,
    events,
    fetchDomains,
    fetchLogs,
    fetchSummary,
    refreshAll,
    runBatch,
    resetAll,
    retryDomain,
  };
}
