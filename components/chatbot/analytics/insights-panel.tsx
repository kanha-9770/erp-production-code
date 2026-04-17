"use client";

import { memo, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Copy,
  Database,
  Download,
  FileDown,
  FileJson,
  FileText,
  Gauge,
  Lightbulb,
  Loader2,
  PanelRightClose,
  Sparkles,
  Wand2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LocalMessage, ToolEvent } from "../types";
import { KpiCard, type KpiEntry } from "./kpi-card";
import { ChartRenderer, type ChartSpec } from "./chart-renderer";
import { extractAnalytics } from "./extract";
import {
  exportReportAsPDF,
  exportReportAsMarkdown,
  exportReportAsJSON,
} from "@/lib/chatbot-export";

interface Props {
  messages: LocalMessage[];
  activeConversationTitle: string;
  providerLabel?: string;
  modelLabel?: string;
  streaming: boolean;
  onClose: () => void;
  onPickFollowUp: (text: string) => void;
}

interface ExtractedInsights {
  kpis: KpiEntry[];
  charts: Array<{ spec: ChartSpec; source: "chart-fence" | "auto-table" }>;
  lastAssistantContent: string;
  lastUserQuestion: string;
  autoChartCount: number;
  explicitChartCount: number;
}

function findLastAssistant(messages: LocalMessage[]): LocalMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && !m.error) return m;
  }
  return null;
}

function findLastUser(messages: LocalMessage[]): LocalMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i];
  }
  return null;
}

function groupToolEvents(messages: LocalMessage[]): ToolEvent[] {
  const all: ToolEvent[] = [];
  for (const m of messages) {
    if (m.role !== "assistant" || !m.toolEvents) continue;
    for (const ev of m.toolEvents) all.push(ev);
  }
  const byName = new Map<string, ToolEvent>();
  for (const ev of all) {
    const prev = byName.get(ev.name);
    if (!prev || ev.status === "done") byName.set(ev.name, ev);
  }
  return Array.from(byName.values()).sort((a, b) => b.timestamp - a.timestamp);
}

const DEFAULT_FOLLOW_UPS = [
  "Break this down by department",
  "Show the 30-day trend as a chart",
  "Compare against last month",
  "Highlight the top 5 outliers",
  "Export this result as CSV",
];

function generateFollowUps(question: string): string[] {
  if (!question.trim()) return DEFAULT_FOLLOW_UPS.slice(0, 3);
  const q = question.toLowerCase();
  const suggestions: string[] = [];
  if (q.includes("user") || q.includes("people")) {
    suggestions.push("Break down by role and status");
    suggestions.push("Show login activity over last 30 days");
  }
  if (q.includes("record") || q.includes("data")) {
    suggestions.push("Which modules hold the most records?");
    suggestions.push("Show creation rate over time");
  }
  if (q.includes("audit") || q.includes("activity") || q.includes("log")) {
    suggestions.push("Group actions by user");
    suggestions.push("Filter to the last 24 hours");
  }
  if (q.includes("module")) {
    suggestions.push("Count active vs archived modules");
    suggestions.push("Show module creation timeline");
  }
  if (suggestions.length < 3) {
    suggestions.push(...DEFAULT_FOLLOW_UPS.slice(0, 5 - suggestions.length));
  }
  return Array.from(new Set(suggestions)).slice(0, 5);
}

function InsightsPanelImpl({
  messages,
  activeConversationTitle,
  providerLabel,
  modelLabel,
  streaming,
  onClose,
  onPickFollowUp,
}: Props) {
  const [busyExport, setBusyExport] = useState(false);

  const lastAssistant = useMemo(() => findLastAssistant(messages), [messages]);
  const lastUser = useMemo(() => findLastUser(messages), [messages]);
  const lastAssistantContent = lastAssistant?.content ?? "";
  const lastUserQuestion = lastUser?.content ?? "";

  // Only re-parse analytics when the assistant content string actually
  // changes — not on every setMessages call during streaming.
  const analytics = useMemo(() => {
    if (!lastAssistantContent) return { kpis: [], charts: [] as ExtractedInsights["charts"] };
    return extractAnalytics(lastAssistantContent);
  }, [lastAssistantContent]);

  const insights: ExtractedInsights = useMemo(
    () => ({
      kpis: analytics.kpis,
      charts: analytics.charts,
      lastAssistantContent,
      lastUserQuestion,
      autoChartCount: analytics.charts.filter((c) => c.source === "auto-table").length,
      explicitChartCount: analytics.charts.filter((c) => c.source === "chart-fence").length,
    }),
    [analytics, lastAssistantContent, lastUserQuestion]
  );

  const toolEvents = useMemo(() => groupToolEvents(messages), [messages]);
  const followUps = useMemo(
    () => generateFollowUps(insights.lastUserQuestion),
    [insights.lastUserQuestion]
  );

  const buildCtx = () => ({
    messages,
    conversationTitle: activeConversationTitle || "Analysis",
    providerLabel,
    modelLabel,
    lastAnswerOnly: true,
  });

  const exportAsPDF = async () => {
    if (!insights.lastAssistantContent) {
      toast.error("Nothing to export yet");
      return;
    }
    setBusyExport(true);
    try {
      await exportReportAsPDF(buildCtx());
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error(`PDF export failed: ${(err as Error).message}`);
    } finally {
      setBusyExport(false);
    }
  };

  const exportAsMarkdown = () => {
    if (!insights.lastAssistantContent) {
      toast.error("Nothing to export yet");
      return;
    }
    try {
      exportReportAsMarkdown(buildCtx());
      toast.success("Markdown downloaded");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const exportAsJSON = () => {
    if (!insights.lastAssistantContent) {
      toast.error("Nothing to export yet");
      return;
    }
    try {
      exportReportAsJSON(buildCtx());
      toast.success("JSON downloaded");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const copyMarkdown = async () => {
    if (!insights.lastAssistantContent) {
      toast.error("Nothing to copy yet");
      return;
    }
    try {
      await navigator.clipboard.writeText(insights.lastAssistantContent);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Clipboard blocked");
    }
  };

  return (
    <aside className="relative flex flex-col w-[340px] xl:w-[380px] shrink-0 h-full border-l border-border/70 bg-gradient-to-b from-background via-background to-muted/20">
      {/* Header */}
      <div className="relative px-4 py-3 border-b border-border/70">
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative h-6 w-6 rounded-lg bg-gradient-to-br from-violet-500/80 to-fuchsia-500/60 border border-violet-500/30 shadow-sm flex items-center justify-center shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Insights
              </div>
              <div className="text-xs text-foreground/80 truncate">
                Live analysis workspace
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            title="Hide insights panel"
            className="h-7 w-7 p-0 hover:bg-muted/60"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Current query */}
        <Section
          icon={<Activity className="h-3 w-3" />}
          title="Current query"
          accent="text-violet-500"
        >
          {insights.lastUserQuestion ? (
            <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2.5 text-xs text-foreground/90 leading-relaxed">
              {insights.lastUserQuestion}
            </div>
          ) : (
            <EmptyHint>No query yet. Ask a question to begin.</EmptyHint>
          )}
        </Section>

        {/* Extracted KPIs */}
        <Section
          icon={<Gauge className="h-3 w-3" />}
          title="Key metrics"
          count={insights.kpis.length}
          accent="text-emerald-500"
        >
          {insights.kpis.length > 0 ? (
            <div className="space-y-2">
              {insights.kpis.map((k, i) => (
                <KpiCard key={`${k.label}-${i}`} entry={k} index={i} compact />
              ))}
            </div>
          ) : streaming ? (
            <EmptyHint>
              <Loader2 className="h-3 w-3 animate-spin shrink-0 mt-0.5" />
              <span>Extracting metrics…</span>
            </EmptyHint>
          ) : (
            <EmptyHint>
              No metrics yet. Ask for counts, totals, or ratios and the
              assistant will surface them here.
            </EmptyHint>
          )}
        </Section>

        {/* Visualizations — real mini charts */}
        <Section
          icon={<BarChart3 className="h-3 w-3" />}
          title="Visualizations"
          count={insights.charts.length}
          accent="text-cyan-500"
          hint={
            insights.autoChartCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                <Wand2 className="h-2.5 w-2.5" />
                {insights.autoChartCount} auto
              </span>
            ) : null
          }
        >
          {insights.charts.length > 0 ? (
            <div className="space-y-2">
              {insights.charts.map((c, i) => (
                <MiniChart
                  key={`${c.source}-${c.spec.title ?? i}-${i}`}
                  spec={c.spec}
                  source={c.source}
                />
              ))}
            </div>
          ) : streaming ? (
            <EmptyHint>
              <Loader2 className="h-3 w-3 animate-spin shrink-0 mt-0.5" />
              <span>Rendering charts as they arrive…</span>
            </EmptyHint>
          ) : (
            <EmptyHint>
              No charts yet. Ask for a breakdown, trend, or distribution and
              one will appear here automatically.
            </EmptyHint>
          )}
        </Section>

        {/* Data sources */}
        <Section
          icon={<Database className="h-3 w-3" />}
          title="Data sources"
          count={toolEvents.length}
          accent="text-amber-500"
        >
          {toolEvents.length > 0 ? (
            <ul className="space-y-1">
              <AnimatePresence initial={false}>
                {toolEvents.map((ev) => (
                  <motion.li
                    key={ev.name}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5 text-[11px]"
                  >
                    <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-mono text-foreground/90 truncate">
                      {ev.name}
                    </span>
                    <span
                      className={cn(
                        "ml-auto text-[9px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded",
                        ev.status === "calling"
                          ? "bg-primary/10 text-primary"
                          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      )}
                    >
                      {ev.status === "calling" ? "running" : "done"}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <EmptyHint>
              No tool calls yet. Live data sources will appear here as they
              execute.
            </EmptyHint>
          )}
        </Section>

        {/* Follow-ups */}
        <Section
          icon={<Lightbulb className="h-3 w-3" />}
          title="Suggested follow-ups"
          accent="text-pink-500"
        >
          <ul className="space-y-1">
            {followUps.map((f, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onPickFollowUp(f)}
                  disabled={streaming}
                  className={cn(
                    "group w-full text-left rounded-md border border-border/70 bg-background/60 px-2.5 py-2 text-[11px] text-foreground/90 transition-all",
                    "hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 leading-snug">{f}</span>
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {/* Footer actions */}
      <div className="border-t border-border/70 px-4 py-3 bg-background/60 backdrop-blur-sm space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyMarkdown}
            disabled={!insights.lastAssistantContent}
            className="h-8 text-xs rounded-lg"
          >
            <Copy className="h-3 w-3 mr-1.5" />
            Copy
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!insights.lastAssistantContent || busyExport}
                className="h-8 text-xs rounded-lg"
              >
                {busyExport ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-3 w-3 mr-1.5" />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                Export this analysis
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={exportAsPDF} disabled={busyExport}>
                <FileDown className="h-3.5 w-3.5 mr-2 text-primary" />
                <span className="flex-1">PDF report</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  .pdf
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportAsMarkdown}>
                <FileText className="h-3.5 w-3.5 mr-2" />
                <span className="flex-1">Markdown</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  .md
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportAsJSON}>
                <FileJson className="h-3.5 w-3.5 mr-2" />
                <span className="flex-1">JSON data</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  .json
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {(providerLabel || modelLabel) && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
            <FileText className="h-2.5 w-2.5" />
            <span className="truncate">
              {providerLabel}
              {providerLabel && modelLabel && " · "}
              {modelLabel}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

function MiniChart({
  spec,
  source,
}: {
  spec: ChartSpec;
  source: "chart-fence" | "auto-table";
}) {
  // Force a compact height for side-panel rendering regardless of spec.
  const compactSpec: ChartSpec = { ...spec, height: 160 };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="relative rounded-xl border border-border/70 bg-background/60 overflow-hidden"
    >
      {source === "auto-table" && (
        <span
          className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400"
          title="Auto-generated from a markdown table in the response"
        >
          <Wand2 className="h-2 w-2" />
          auto
        </span>
      )}
      <div className="px-1 pb-1">
        <ChartRenderer spec={compactSpec} />
      </div>
    </motion.div>
  );
}

function Section({
  icon,
  title,
  count,
  accent,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  accent?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        <span
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center rounded border border-border/70 bg-background",
            accent
          )}
        >
          {icon}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        {typeof count === "number" && count > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground/70">
            {count}
          </span>
        )}
        <span className="ml-auto">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
      {children}
    </div>
  );
}

const InsightsPanel = memo(InsightsPanelImpl);
export default InsightsPanel;
