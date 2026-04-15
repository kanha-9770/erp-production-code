"use client";

import { memo } from "react";
import {
  Sparkles,
  Users,
  FolderTree,
  Activity,
  BarChart3,
  ArrowRight,
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

function WelcomeScreenImpl({ providerLabel, modelLabel, onPickPrompt }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Simple icon */}
      <div className="h-12 w-12 rounded-full border border-border bg-background flex items-center justify-center mb-5">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground text-center">
        How can I help you today?
      </h2>
      <p className="text-sm text-muted-foreground mt-2 text-center max-w-md leading-relaxed">
        Ask anything about your ERP data. I can query modules, records, users,
        and audit logs — scoped to your permissions.
      </p>
      <div className="mt-3 text-[11px] text-muted-foreground font-mono">
        {providerLabel} · {modelLabel}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-10 w-full max-w-2xl">
        {PROMPTS.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.title}
              type="button"
              onClick={() => onPickPrompt(p.body)}
              className={cn(
                "group text-left rounded-md border bg-background transition-colors p-3.5",
                "hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              <div className="flex items-start gap-3">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 transition-colors group-hover:text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {p.title}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {p.body}
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const WelcomeScreen = memo(WelcomeScreenImpl);
export default WelcomeScreen;
