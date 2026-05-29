"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  Users,
  FolderTree,
  Activity,
  BarChart3,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SuggestedPrompt {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  accent: string;
}

const PROMPTS: SuggestedPrompt[] = [
  {
    icon: FolderTree,
    title: "Explore modules",
    body: "What modules and forms exist in my organization?",
    accent: "from-violet-500/15 to-violet-500/0 text-violet-600 dark:text-violet-400",
  },
  {
    icon: BarChart3,
    title: "Count records",
    body: "How many records do we have across all modules?",
    accent: "from-emerald-500/15 to-emerald-500/0 text-emerald-600 dark:text-emerald-400",
  },
  {
    icon: Activity,
    title: "Recent activity",
    body: "What are the 10 most recent actions in the audit log?",
    accent: "from-amber-500/15 to-amber-500/0 text-amber-600 dark:text-amber-400",
  },
  {
    icon: Users,
    title: "User overview",
    body: "List active users and their assigned roles.",
    accent: "from-sky-500/15 to-sky-500/0 text-sky-600 dark:text-sky-400",
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
    <div className="relative flex flex-col items-center justify-center py-14 sm:py-20 px-4">
      {/* Soft hero glow behind the greeting */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[340px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/0.12),transparent_70%)]"
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center text-center"
      >
        <div className="mb-6 relative">
          <div className="absolute inset-0 -m-2 rounded-full bg-primary/20 blur-xl" />
          <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/25">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
        </div>

        <h2 className="text-[34px] sm:text-[40px] font-semibold tracking-tight leading-tight">
          <span className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
            {getGreeting()}
          </span>
        </h2>
        <p className="text-[15px] text-muted-foreground mt-3 max-w-md leading-relaxed">
          Ask anything about your ERP data. I&apos;ll query modules, records,
          users, and audit logs — all scoped to your permissions.
        </p>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span className="font-medium text-foreground/80">{providerLabel}</span>
          <span className="opacity-40">·</span>
          <span className="font-mono text-[10.5px]">{modelLabel}</span>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-10 sm:mt-12 w-full max-w-xl">
        {PROMPTS.map((p, idx) => {
          const Icon = p.icon;
          return (
            <motion.button
              key={p.title}
              type="button"
              onClick={() => onPickPrompt(p.body)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 + idx * 0.06, duration: 0.35 }}
              className={cn(
                "group relative overflow-hidden text-left rounded-2xl border border-border/70 bg-card p-4",
                "hover:border-border hover:shadow-md hover:-translate-y-0.5",
                "transition-all duration-200"
              )}
            >
              {/* Soft tinted gradient that brightens on hover */}
              <div
                aria-hidden
                className={cn(
                  "absolute inset-0 bg-gradient-to-br opacity-40 group-hover:opacity-70 transition-opacity",
                  p.accent
                )}
              />
              <div className="relative flex items-start gap-3">
                <div className="shrink-0 h-9 w-9 rounded-xl bg-background/80 border border-border/60 flex items-center justify-center backdrop-blur-sm">
                  <Icon className={cn("h-4 w-4", p.accent.split(" ").find(c => c.startsWith("text-")))} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13.5px] font-semibold text-foreground">
                      {p.title}
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                  </div>
                  <div className="text-[12.5px] text-muted-foreground mt-1 leading-snug line-clamp-2">
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
