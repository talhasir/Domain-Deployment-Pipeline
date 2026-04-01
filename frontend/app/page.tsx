"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePipeline } from "@/hooks/use-pipeline";
import { SummaryCards } from "@/components/summary-cards";
import { PipelineControls } from "@/components/pipeline-controls";
import { DomainCard } from "@/components/domain-card";
import { LogViewer } from "@/components/log-viewer";
import { EventFeed } from "@/components/event-feed";
import { Separator } from "@/components/ui/separator";
import { Activity } from "lucide-react";

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      type: "spring" as const,
      stiffness: 260,
      damping: 24,
    },
  }),
};

export default function DashboardPage() {
  const {
    domains,
    logs,
    summary,
    isRunning,
    events,
    refreshAll,
    runBatch,
    resetAll,
    retryDomain,
  } = usePipeline();

  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
          >
            <Activity className="h-5 w-5 text-primary" />
          </motion.div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Domain Deployment Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              Multi-stage deployment with retry, idempotency &amp; real-time observability
            </p>
          </div>
        </div>
      </motion.div>

      {/* Summary */}
      <motion.section
        className="mb-6"
        custom={0}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
      >
        <SummaryCards summary={summary} />
      </motion.section>

      {/* Controls */}
      <motion.section
        className="mb-6"
        custom={1}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
      >
        <PipelineControls onRun={runBatch} onReset={resetAll} isRunning={isRunning} />
      </motion.section>

      {/* Live Event Feed */}
      <AnimatePresence>
        {events.length > 0 && (
          <motion.section
            className="mb-6"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <motion.h2
              className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
            >
              Live Feed
            </motion.h2>
            <EventFeed events={events} />
          </motion.section>
        )}
      </AnimatePresence>

      <motion.div
        custom={2}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
      >
        <Separator className="my-6" />
      </motion.div>

      {/* Domain Cards */}
      <AnimatePresence>
        {domains.length > 0 && (
          <motion.section
            className="mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Domains ({domains.length})
              </h2>
              <AnimatePresence>
                {selectedDomain && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => setSelectedDomain(null)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear filter
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {domains.map((d, i) => (
                  <DomainCard
                    key={d.id}
                    pipeline={d}
                    onRetry={retryDomain}
                    onSelect={setSelectedDomain}
                    isSelected={selectedDomain === d.domain}
                    index={i}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Logs */}
      <motion.section
        custom={3}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
      >
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Pipeline Logs {selectedDomain && `\u2014 ${selectedDomain}`}
        </h2>
        <LogViewer logs={logs} selectedDomain={selectedDomain} />
      </motion.section>
    </div>
  );
}
