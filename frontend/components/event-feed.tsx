"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SSEEvent } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle2, XCircle, Loader2, Flag } from "lucide-react";

interface Props {
  events: SSEEvent[];
}

const icons: Record<string, React.ReactNode> = {
  start: <ArrowRight className="h-3.5 w-3.5 text-blue-400" />,
  result: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  error: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  done: <Flag className="h-3.5 w-3.5 text-amber-500" />,
};

function eventText(e: SSEEvent): string {
  switch (e.type) {
    case "start":
      return `Starting pipeline for ${e.domain}`;
    case "result":
      return e.status === "completed"
        ? `${e.domain} — deployed successfully`
        : `${e.domain} — failed at ${e.failed_at}`;
    case "error":
      return `${e.domain} — ${e.message}`;
    case "done":
      return "Batch complete";
  }
}

const eventVariants = {
  initial: { opacity: 0, x: -20, height: 0 },
  animate: {
    opacity: 1,
    x: 0,
    height: "auto",
    transition: { type: "spring" as const, stiffness: 400, damping: 25 },
  },
  exit: { opacity: 0, x: 20, height: 0 },
};

export function EventFeed({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (events.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <ScrollArea className="h-[160px] rounded-lg border bg-card">
        <div className="p-3 space-y-1">
          <AnimatePresence initial={false}>
            {events.map((event, i) => (
              <motion.div
                key={i}
                variants={eventVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className={cn(
                  "flex items-center gap-2 text-xs py-0.5 rounded-md px-2",
                  event.type === "error" && "text-red-400 bg-red-500/5",
                  event.type === "result" && event.status === "completed" && "text-emerald-400 bg-emerald-500/5",
                  event.type === "result" && event.status !== "completed" && "text-red-400 bg-red-500/5",
                  event.type === "start" && "text-muted-foreground",
                  event.type === "done" && "text-amber-400 bg-amber-500/5"
                )}
              >
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.1 }}
                >
                  {icons[event.type] ?? <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                </motion.div>
                <span>{eventText(event)}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </motion.div>
  );
}
