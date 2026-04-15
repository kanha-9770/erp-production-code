"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Users,
  FolderTree,
  Activity,
  BarChart3,
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
    accent: "from-violet-500/20 to-fuchsia-500/10",
  },
  {
    icon: BarChart3,
    title: "Count records",
    body: "How many records do we have across all modules?",
    accent: "from-sky-500/20 to-cyan-500/10",
  },
  {
    icon: Activity,
    title: "Recent activity",
    body: "What are the 10 most recent actions in the audit log?",
    accent: "from-amber-500/20 to-orange-500/10",
  },
  {
    icon: Users,
    title: "User overview",
    body: "List active users and their assigned roles.",
    accent: "from-emerald-500/20 to-teal-500/10",
  },
];

interface Props {
  providerLabel: string;
  modelLabel: string;
  onPickPrompt: (text: string) => void;
}

function WelcomeScreenImpl({ providerLabel, modelLabel, onPickPrompt }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 relative">
      {/* Ambient glow behind the hero icon */}
      <div
        aria-hidden
        className="absolute top-8 left-1/2 -translate-x-1/2 w-[420px] h-[260px] pointer-events-none"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-primary/5 to-transparent blur-3xl rounded-full" />
      </div>

      {/* Hero icon with animated pulse ring */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="relative mb-6"
      >
        <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl animate-pulse" />
        <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/90 to-primary/60 border border-primary/40 shadow-lg shadow-primary/20 flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-primary-foreground" />
        </div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.35 }}
        className="text-3xl font-semibold tracking-tight text-foreground text-center bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text"
      >
        How can I help you today?
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14, duration: 0.35 }}
        className="text-sm text-muted-foreground mt-3 text-center max-w-md leading-relaxed"
      >
        Ask anything about your ERP data. I can query modules, records, users,
        and audit logs — scoped to your permissions.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.35 }}
        className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full border border-border/70 bg-background/60 backdrop-blur text-muted-foreground"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
        {providerLabel} · {modelLabel}
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-10 w-full max-w-2xl">
        {PROMPTS.map((p, idx) => {
          const Icon = p.icon;
          return (
            <motion.button
              key={p.title}
              type="button"
              onClick={() => onPickPrompt(p.body)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + idx * 0.06, duration: 0.4 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "group relative text-left rounded-xl border border-border/70 bg-background p-4 overflow-hidden",
                "transition-all duration-300",
                "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              )}
            >
              {/* Gradient wash on hover */}
              <div
                className={cn(
                  "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br pointer-events-none",
                  p.accent
                )}
              />
              {/* Top-right accent line */}
              <div className="absolute top-0 right-0 h-px w-12 bg-gradient-to-l from-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg border border-border/70 bg-background/80 backdrop-blur flex items-center justify-center shrink-0 group-hover:border-primary/40 group-hover:text-primary transition-colors">
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    {p.title}
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground -translate-y-0.5 translate-x-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-1 transition-all" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
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
