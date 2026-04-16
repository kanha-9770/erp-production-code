"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  Users,
  FolderTree,
  Activity,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SuggestedPrompt {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}

const PROMPTS: SuggestedPrompt[] = [
  {
    icon: FolderTree,
    title: "Explore modules",
    body: "What modules and forms exist in my organization?",
  },
  {
    icon: BarChart3,
    title: "Count records",
    body: "How many records do we have across all modules?",
  },
  {
    icon: Activity,
    title: "Recent activity",
    body: "What are the 10 most recent actions in the audit log?",
  },
  {
    icon: Users,
    title: "User overview",
    body: "List active users and their assigned roles.",
  },
];

interface Props {
  providerLabel: string;
  modelLabel: string;
  onPickPrompt: (text: string) => void;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Working late?";
}

function WelcomeScreenImpl({ providerLabel, modelLabel, onPickPrompt }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center text-center"
      >
        <div className="mb-5 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <div className="h-5 w-5 rounded-full bg-primary" />
        </div>
        <h2 className="text-[28px] font-normal tracking-tight text-foreground">
          <span className="text-primary">*</span> {getGreeting()}
        </h2>
        <p className="text-[14px] text-muted-foreground mt-3 max-w-md leading-relaxed">
          Ask anything about your ERP data. I can query modules, records, users,
          and audit logs — scoped to your permissions.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {providerLabel} · {modelLabel}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-10 w-full max-w-xl">
        {PROMPTS.map((p, idx) => {
          const Icon = p.icon;
          return (
            <motion.button
              key={p.title}
              type="button"
              onClick={() => onPickPrompt(p.body)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + idx * 0.05, duration: 0.3 }}
              className={cn(
                "group text-left rounded-xl border border-border/60 bg-card hover:bg-secondary/50 hover:border-border p-3.5",
                "transition-colors"
              )}
            >
              <div className="flex items-start gap-2.5">
                <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-foreground">
                    {p.title}
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                    {p.body}
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

const WelcomeScreen = memo(WelcomeScreenImpl);
export default WelcomeScreen;
