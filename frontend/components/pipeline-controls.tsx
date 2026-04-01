"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Trash2, Plus, X, Rocket } from "lucide-react";

const DEFAULT_DOMAINS = [
  "vintage-watches-blog.com",
  "recipe-garden-fresh.net",
  "local-plumber-nyc.com",
  "tech-startup-review.io",
  "fitness-tips-daily.org",
];

interface Props {
  onRun: (domains: string[]) => void;
  onReset: () => void;
  isRunning: boolean;
}

const tagVariants = {
  initial: { opacity: 0, scale: 0.6, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 500, damping: 25 },
  },
  exit: {
    opacity: 0,
    scale: 0.6,
    y: -8,
    transition: { duration: 0.15 },
  },
};

export function PipelineControls({ onRun, onReset, isRunning }: Props) {
  const [domains, setDomains] = useState<string[]>(DEFAULT_DOMAINS);
  const [input, setInput] = useState("");

  const addDomain = () => {
    const d = input.trim().toLowerCase();
    if (d && !domains.includes(d)) {
      setDomains((prev) => [...prev, d]);
      setInput("");
    }
  };

  const removeDomain = (domain: string) => {
    setDomains((prev) => prev.filter((d) => d !== domain));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.15 }}
    >
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addDomain()}
                placeholder="Add domain..."
                className="h-9 flex-1 min-w-0 rounded-md border border-input bg-transparent px-3 text-sm
                  placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring
                  transition-shadow duration-200"
              />
              <Button size="sm" variant="outline" onClick={addDomain} disabled={!input.trim()}>
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>

            <div className="flex gap-2">
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex-1 sm:flex-none"
              >
                <Button className="w-full sm:w-auto" onClick={() => onRun(domains)} disabled={isRunning || domains.length === 0}>
                  {isRunning ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    >
                      <Rocket className="h-4 w-4" />
                    </motion.div>
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isRunning ? "Running..." : "Run Pipeline"}
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button variant="outline" onClick={onReset} disabled={isRunning}>
                  <Trash2 className="h-4 w-4" />
                  Reset
                </Button>
              </motion.div>
            </div>
          </div>

          {domains.length > 0 && (
            <motion.div
              className="mt-3 flex flex-wrap gap-1.5"
              layout
            >
              <AnimatePresence mode="popLayout">
                {domains.map((d) => (
                  <motion.span
                    key={d}
                    layout
                    variants={tagVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-medium"
                  >
                    {d}
                    <motion.button
                      whileHover={{ scale: 1.2, rotate: 90 }}
                      whileTap={{ scale: 0.8 }}
                      onClick={() => removeDomain(d)}
                      className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </motion.button>
                  </motion.span>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
