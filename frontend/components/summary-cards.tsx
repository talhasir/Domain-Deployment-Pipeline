"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Summary } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Globe, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  summary: Summary;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    const duration = 600;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    prevRef.current = to;
  }, [value]);

  return <>{display}</>;
}

const cards = [
  {
    key: "total" as const,
    label: "Total Domains",
    icon: Globe,
    color: "text-foreground",
    bg: "",
    glow: "",
  },
  {
    key: "completed" as const,
    label: "Completed",
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "border-emerald-500/20",
    glow: "hover:shadow-emerald-500/10",
  },
  {
    key: "failed" as const,
    label: "Failed",
    icon: XCircle,
    color: "text-red-500",
    bg: "border-red-500/20",
    glow: "hover:shadow-red-500/10",
  },
  {
    key: "running" as const,
    label: "Running",
    icon: Loader2,
    color: "text-blue-500",
    bg: "border-blue-500/20",
    glow: "hover:shadow-blue-500/10",
  },
  {
    key: "pending" as const,
    label: "Pending",
    icon: Clock,
    color: "text-amber-500",
    bg: "border-amber-500/20",
    glow: "hover:shadow-amber-500/10",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

export function SummaryCards({ summary }: Props) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-5"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {cards.map((c) => {
        const Icon = c.icon;
        const isRunning = c.key === "running" && summary.running > 0;
        return (
          <motion.div key={c.key} variants={item}>
            <motion.div whileHover={{ y: -2, scale: 1.02 }} transition={{ type: "spring", stiffness: 400 }}>
              <Card className={cn("overflow-hidden hover:shadow-lg transition-shadow", c.bg, c.glow)}>
                <CardContent className={cn("p-4 relative", isRunning && "animate-shimmer")}>
                  <div className="flex items-center gap-2">
                    <motion.div
                      animate={isRunning ? { rotate: 360 } : {}}
                      transition={isRunning ? { repeat: Infinity, duration: 2, ease: "linear" } : {}}
                    >
                      <Icon className={cn("h-4 w-4", c.color)} />
                    </motion.div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {c.label}
                    </span>
                  </div>
                  <p className={cn("mt-1 text-2xl sm:mt-2 sm:text-3xl font-bold tabular-nums", c.color)}>
                    <AnimatedNumber value={summary[c.key]} />
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
