"use client";

import { motion } from "framer-motion";
import type { DomainPipeline } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StageIndicator } from "./stage-indicator";
import { cn } from "@/lib/utils";
import { RotateCw, Globe, Server } from "lucide-react";

interface Props {
  pipeline: DomainPipeline;
  onRetry: (domain: string) => void;
  onSelect: (domain: string) => void;
  isSelected: boolean;
  index: number;
}

export function DomainCard({ pipeline, onRetry, onSelect, isSelected, index }: Props) {
  const isFailed = pipeline.stage_status === "failed";
  const isComplete = pipeline.current_stage === "completed";
  const isActive = pipeline.stage_status === "running";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      transition={{
        type: "spring" as const,
        stiffness: 300,
        damping: 25,
        delay: index * 0.06,
      }}
    >
      <motion.div
        whileHover={{ y: -3, scale: 1.015 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        <Card
          onClick={() => onSelect(pipeline.domain)}
          className={cn(
            "cursor-pointer transition-all duration-200 hover:shadow-lg",
            isSelected && "ring-2 ring-ring border-ring shadow-lg",
            isFailed && "border-red-500/30",
            isComplete && "border-emerald-500/20",
            isActive && "animate-shimmer"
          )}
        >
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={isActive ? { rotate: [0, 10, -10, 0] } : {}}
                    transition={isActive ? { repeat: Infinity, duration: 2 } : {}}
                  >
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </motion.div>
                  <h3 className="truncate text-sm font-semibold">{pipeline.domain}</h3>
                  {isComplete && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                    >
                      <Badge variant="success">Live</Badge>
                    </motion.div>
                  )}
                  {isFailed && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                    >
                      <Badge variant="destructive">Failed</Badge>
                    </motion.div>
                  )}
                  {isActive && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                    >
                      <Badge variant="info">Running</Badge>
                    </motion.div>
                  )}
                </div>

                {pipeline.hosting_provider && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="mt-1.5 ml-6 flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <Server className="h-3 w-3" />
                    {pipeline.hosting_provider}
                  </motion.div>
                )}

                {isFailed && pipeline.last_error && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-1.5 ml-6 truncate text-xs text-red-400/80"
                  >
                    {pipeline.last_error}
                  </motion.p>
                )}
              </div>

              {isFailed && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry(pipeline.domain);
                    }}
                    className="shrink-0 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                  >
                    <RotateCw className="h-3 w-3" />
                    Retry
                  </Button>
                </motion.div>
              )}
            </div>

            <div className="mt-4 overflow-x-auto">
              <StageIndicator
                currentStage={pipeline.current_stage}
                stageStatus={pipeline.stage_status}
              />
            </div>

            {pipeline.retry_count > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 ml-6 text-[11px] text-muted-foreground"
              >
                {pipeline.retry_count} retries
              </motion.p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
