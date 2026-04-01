"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { PipelineLog } from "@/types";
import { STAGE_LABELS } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  logs: PipelineLog[];
  selectedDomain: string | null;
}

const statusVariant: Record<string, "success" | "destructive" | "info" | "warning" | "secondary"> = {
  success: "success",
  failed: "destructive",
  started: "info",
  retrying: "warning",
  skipped: "secondary",
};

const rowVariants = {
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 12, height: 0 },
};

export function LogViewer({ logs, selectedDomain }: Props) {
  const filtered = selectedDomain
    ? logs.filter((l) => l.domain === selectedDomain)
    : logs;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <ScrollArea className="h-[400px] w-full rounded-lg border bg-card">
        <div className="p-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Domain</th>
                <th className="px-3 py-2 text-left font-medium">Stage</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Message</th>
                <th className="px-3 py-2 text-right font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filtered.length === 0 ? (
                  <motion.tr
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No logs yet. Run the pipeline to see activity.
                    </td>
                  </motion.tr>
                ) : (
                  filtered.map((log, i) => (
                    <motion.tr
                      key={log.id}
                      variants={rowVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={{
                        type: "spring" as const,
                        stiffness: 400,
                        damping: 30,
                        delay: Math.min(i * 0.02, 0.3),
                      }}
                      className={cn(
                        "border-b border-border/50 transition-colors hover:bg-muted/50",
                        log.status === "failed" && "bg-red-500/5",
                        log.status === "success" && "bg-emerald-500/[0.02]"
                      )}
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-muted-foreground">
                        {log.created_at
                          ? new Date(log.created_at).toLocaleTimeString()
                          : "\u2014"}
                      </td>
                      <td className="max-w-[150px] truncate px-3 py-1.5 font-medium">
                        {log.domain}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {STAGE_LABELS[log.stage] ?? log.stage}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge variant={statusVariant[log.status] ?? "secondary"} className="text-[10px]">
                          {log.status}
                        </Badge>
                      </td>
                      <td className="max-w-[300px] truncate px-3 py-1.5 text-muted-foreground">
                        {log.message}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-muted-foreground">
                        {log.duration_ms != null ? `${log.duration_ms}ms` : "\u2014"}
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </ScrollArea>
    </motion.div>
  );
}
