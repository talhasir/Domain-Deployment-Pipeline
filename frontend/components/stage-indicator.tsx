"use client";

import { motion } from "framer-motion";
import { STAGES, STAGE_LABELS } from "@/types";
import { cn } from "@/lib/utils";
import { Check, X, Loader2, Circle } from "lucide-react";

interface Props {
  currentStage: string;
  stageStatus: string;
}

type StageState = "done" | "active" | "failed" | "upcoming";

function getStageState(
  stage: string,
  currentStage: string,
  stageStatus: string
): StageState {
  const stageList = [...STAGES];
  const currentIdx = stageList.indexOf(currentStage as any);
  const stageIdx = stageList.indexOf(stage as any);

  if (currentStage === "completed") return "done";
  if (stageIdx < currentIdx) return "done";
  if (stageIdx === currentIdx) {
    if (stageStatus === "failed") return "failed";
    if (stageStatus === "running") return "active";
    if (stageStatus === "success") return "done";
    return "active";
  }
  return "upcoming";
}

const stateConfig: Record<
  StageState,
  { dot: string; label: string; connector: string }
> = {
  done: {
    dot: "bg-emerald-500/20 border-emerald-500/50 text-emerald-500",
    label: "text-emerald-500",
    connector: "bg-emerald-500",
  },
  active: {
    dot: "bg-blue-500/20 border-blue-500/50 text-blue-500",
    label: "text-blue-400",
    connector: "bg-border",
  },
  failed: {
    dot: "bg-red-500/20 border-red-500/50 text-red-500",
    label: "text-red-400",
    connector: "bg-border",
  },
  upcoming: {
    dot: "bg-muted border-border text-muted-foreground",
    label: "text-muted-foreground",
    connector: "bg-border",
  },
};

const dotVariants = {
  upcoming: { scale: 0.8, opacity: 0.5 },
  active: { scale: 1, opacity: 1 },
  done: { scale: 1, opacity: 1 },
  failed: { scale: 1, opacity: 1 },
};

const checkVariants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: { pathLength: 1, opacity: 1, transition: { duration: 0.4, ease: "easeOut" } },
};

const SHORT_LABELS: Record<string, string> = {
  assign_hosting: "Hosting",
  configure_dns: "DNS",
  deploy_site: "Deploy",
  verify_live: "Verify",
};

export function StageIndicator({ currentStage, stageStatus }: Props) {
  return (
    <div className="flex items-center justify-between sm:justify-start">
      {STAGES.map((stage, i) => {
        const state = getStageState(stage, currentStage, stageStatus);
        const cfg = stateConfig[state];
        return (
          <div key={stage} className="flex items-center">
            <div className="flex flex-col items-center gap-0.5 sm:gap-1">
              <motion.div
                className={cn(
                  "flex items-center justify-center rounded-full border",
                  "h-6 w-6 sm:h-7 sm:w-7",
                  cfg.dot,
                  state === "active" && "animate-pulse-glow"
                )}
                initial="upcoming"
                animate={state}
                variants={dotVariants}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                {state === "done" && (
                  <motion.div initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}>
                    <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3" strokeWidth={3} />
                  </motion.div>
                )}
                {state === "active" && (
                  <Loader2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 animate-spin" />
                )}
                {state === "failed" && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                    <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" strokeWidth={3} />
                  </motion.div>
                )}
                {state === "upcoming" && (
                  <Circle className="h-1.5 w-1.5 sm:h-2 sm:w-2" />
                )}
              </motion.div>
              <motion.span
                className={cn("text-[9px] sm:text-[10px] font-medium leading-none text-center", cfg.label)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <span className="sm:hidden">{SHORT_LABELS[stage]}</span>
                <span className="hidden sm:inline">{STAGE_LABELS[stage]}</span>
              </motion.span>
            </div>
            {i < STAGES.length - 1 && (
              <div className="relative mx-1 sm:mx-1.5 h-[2px] w-3 sm:w-6 rounded-full bg-border overflow-hidden">
                <motion.div
                  className={cn("absolute inset-0 rounded-full stage-connector-fill", cfg.connector)}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: state === "done" ? 1 : 0 }}
                  transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
