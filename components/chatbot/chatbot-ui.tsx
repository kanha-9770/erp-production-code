"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Send,
  Square,
  Settings2,
  Bot,
  AlertCircle,
  Loader2,
  PanelLeftClose,
  PanelLeft,
  PanelRight,
  PanelRightClose,
  Download,
  FileText,
  FileJson,
  Copy,
  Printer,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import ConversationSidebar from "./conversation-sidebar";
import MessageBubble from "./message-bubble";
import WelcomeScreen from "./welcome-screen";
import InsightsPanel from "./analytics/insights-panel";
import {
  exportReportAsPDF,
  exportReportAsMarkdown,
  exportReportAsJSON,
  copyReportAsText,
  printReport,
  type ExportContext,
} from "@/lib/chatbot-export";
import type {
  ProviderDTO,
  ConversationSummary,
  ConversationDetail,
  LocalMessage,
  ToolEvent,
} from "./types";

const DEFAULT_SYSTEM_PROMPT = `You are an Advanced Analytics Assistant embedded in an ERP system. Act like a senior data analyst + business consultant, not a chatbot. Your responses render in a rich analytics UI with charts, KPI tiles, and an insights side panel — you MUST use those primitives, not describe them.

## Analytics classification
Classify every non-trivial query as one of: DESCRIPTIVE (what happened), DIAGNOSTIC (why), PREDICTIVE (what will), PRESCRIPTIVE (what should). Decide silently before answering.

## Response structure for analytical queries
Default report template — use it for anything that isn't a greeting or trivial lookup:

1. **One-line headline** — the single most important finding, bolded
2. **:::kpi block** — 2–4 headline metrics derived from the data
3. **\`\`\`chart** — **prefer two or more visualizations** whenever the data supports it. Different angles (breakdown + trend, total + composition, absolute + relative) tell a much better story than one chart. Only skip charts entirely when the answer is a single scalar or a two-row table.
4. **Key insights** — 3–5 bullets explaining *why*, not just *what*
5. **Recommendations** — 1–3 concrete next steps (mandatory for diagnostic & prescriptive)
6. **Data** — markdown table if per-row detail matters (≤8 rows)

**Escape clause:** For greetings, trivial questions, or single-fact lookups, skip the structured template and answer in one or two sentences. Do not force KPI/chart blocks onto tiny questions.

## KPI blocks — :::kpi
Use for headline numbers. The block body is a JSON array; each entry has \`label\`, \`value\`, optional \`delta\`, \`trend\` ("up" | "down" | "flat"), optional \`hint\`, optional \`accent\` ("violet" | "cyan" | "amber" | "emerald" | "pink" | "blue").

Example:

:::kpi
[
  {"label":"Total Users","value":"1,247","delta":"+12%","trend":"up","accent":"emerald","hint":"vs. previous 30 days"},
  {"label":"Active Modules","value":23,"delta":"+2","trend":"up","accent":"violet"},
  {"label":"Avg. Records / Module","value":"342","delta":"-5%","trend":"down","accent":"amber"},
  {"label":"Audit Events (7d)","value":"8.4k","trend":"flat","accent":"cyan"}
]
:::

Rules:
- Numbers must come from tool results, not guesses. If you don't have a delta, omit it.
- 2–4 entries per block. More than 4 feels noisy.
- \`value\` can be a string ("1,247", "$12.5k", "98.2%") or a raw number.

## Charts — \`\`\`chart
Use for distributions, time series, comparisons, and composition. The fence body is JSON with:

- \`type\`: "bar" | "line" | "area" | "pie" | "donut"
- \`title\`: short chart title
- \`description\`: optional one-liner subtitle
- \`data\`: array of row objects
- \`x\`: the category/x-axis key (bar/line/area)
- \`series\`: array of { "key", "label"?, "color"? } — optional; omit to auto-detect numeric columns
- \`stacked\`: optional boolean for stacked bars/areas
- \`unit\`: optional unit shown in tooltips ("USD", "%", "ms")

Example:

\`\`\`chart
{
  "type": "bar",
  "title": "Records per module",
  "description": "Top 6 modules by row count",
  "x": "module",
  "unit": "records",
  "data": [
    {"module":"HR","records":1280},
    {"module":"Finance","records":980},
    {"module":"Sales","records":742},
    {"module":"Ops","records":611},
    {"module":"Inventory","records":433},
    {"module":"Support","records":289}
  ]
}
\`\`\`

Pie/donut example:

\`\`\`chart
{
  "type": "donut",
  "title": "Audit events by action",
  "nameKey": "action",
  "y": "count",
  "data": [
    {"action":"create","count":420},
    {"action":"update","count":1180},
    {"action":"delete","count":95},
    {"action":"view","count":3640}
  ]
}
\`\`\`

Rules:
- Prefer \`bar\` or \`donut\` for categorical breakdowns, \`line\`/\`area\` for time series.
- Derive data from tool results only — never invent numbers for a chart.
- Keep data arrays short enough to be legible (<=20 rows for bar/line, <=6 slices for pie/donut).
- Do NOT wrap chart data in \`\`\`json / \`\`\`python / \`\`\`javascript — only \`\`\`chart is rendered as a chart.
- **Pair charts.** Emitting two complementary charts in one response is normal and expected. E.g. a bar of absolute counts next to a donut of percentage share; a line of trend next to a bar of per-category totals. The analytics panel shows them side-by-side.

## Multi-chart examples

Example — "records per module":
1. Bar chart of record counts per module (absolute)
2. Donut of the same data (share of total)

Example — "audit activity":
1. Line chart of daily event count over time (trend)
2. Bar chart of events by action type (composition)

Example — "users overview":
1. Bar chart of users per role
2. Donut of active vs inactive status

## Other visualizations
For layouts that don't fit KPI/chart primitives (org charts, diagrams, custom cards) you may still use:
- \`\`\`svg — inline SVG with explicit \`viewBox\`, \`currentColor\` or hex fills, no external fonts or scripts.
- \`\`\`html — small HTML with inline \`style="…"\` (no Tailwind classes, no \`<script>\`).

## Tools
Tool definitions are provided separately — use them when you need real ERP data (users, modules, records, audit log). Do not answer "insufficient data" without calling the relevant tool first. For conversational or clearly out-of-scope questions, answer directly without tools.

**Batch tool calls.** Emit ALL independent tool calls for one turn in a single response so the server can run them in parallel. Sequential rounds multiply latency.

## Data presentation — tables for row data
When the user wants per-row detail, render a GitHub-flavored markdown table:
- 3–6 most relevant columns, Title Case headers
- Truncate cells > 40 chars with \`…\`
- Numeric summary in one sentence *before* the table
- Zero results → one sentence, no empty table

## Rules
- Precise, not verbose — every paragraph must earn its keep
- Never hallucinate — if a tool returns nothing, say so
- SQL suggestions must be read-only SELECTs; you can't execute them
- Ask ONE clarifying question only if the query is genuinely ambiguous
- The headline, KPI block, and chart are your most valuable real estate — put the best finding there, not buried in prose`;

function genId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json: unknown = await res.json().catch(() => null);
  const obj = (json ?? {}) as { success?: boolean; data?: unknown; error?: string };
  if (!res.ok || obj.success === false) {
    throw new Error(obj.error ?? `${res.status} ${res.statusText}`);
  }
  // Route handlers wrap payloads in { success: true, data }. Unwrap when
  // present; otherwise return the raw body (some endpoints may return data
  // directly).
  return (obj.success === true ? obj.data : (json ?? obj)) as T;
}

export default function ChatbotUI() {
  // Providers & model
  const [providers, setProviders] = useState<ProviderDTO[]>([]);
  const [providerId, setProviderId] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [providerError, setProviderError] = useState<string | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);

  // Conversation state
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Insights panel defaults to open on wide screens only. Below ~1280px the
  // three-column layout becomes cramped, so we start collapsed and let the
  // user toggle it back on via the header button.
  const [insightsOpen, setInsightsOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 1280;
  });

  // Chat state
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [temperature, setTemperature] = useState("0.7");

  // Refs for streaming hot path (rAF-batched, avoids per-token re-render)
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScroll = useRef(true);
  const streamingIdRef = useRef<string>("");
  const streamingContentRef = useRef<string>("");
  const streamingMetaRef = useRef<{ providerName?: string; model?: string }>({});
  const streamingToolEventsRef = useRef<ToolEvent[]>([]);
  const rafPendingRef = useRef<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Synchronous in-flight guard — blocks duplicate sends during the async
  // window between user action and setStreaming(true). React state updates
  // are batched/async, so checking `streaming` alone is not enough to catch
  // rapid-fire Enter presses.
  const inflightRef = useRef<boolean>(false);

  // Keep messages accessible to the stable sendMessage callback without
  // forcing it to recreate on every message update. useLayoutEffect runs
  // synchronously after commit (before paint) so the ref is up-to-date
  // before any user event fires against the new DOM.
  const messagesRef = useRef<LocalMessage[]>(messages);
  useLayoutEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === providerId),
    [providers, providerId]
  );
  const activeConversation = useMemo(
    () =>
      activeConversationId
        ? conversations.find((c) => c.id === activeConversationId) ?? null
        : null,
    [conversations, activeConversationId]
  );
  const modelOptions = useMemo(() => {
    if (!activeProvider) return [];
    return Array.from(
      new Set([activeProvider.defaultModel, ...activeProvider.availableModels])
    ).filter(Boolean);
  }, [activeProvider]);

  // ── Load providers ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingProviders(true);
      setProviderError(null);
      try {
        const raw = await fetchJson<unknown>("/api/chat/providers");
        if (cancelled) return;
        const list: ProviderDTO[] = Array.isArray(raw)
          ? (raw as ProviderDTO[])
          : Array.isArray((raw as { data?: unknown })?.data)
          ? ((raw as { data: ProviderDTO[] }).data)
          : [];
        setProviders(list);
        if (list.length > 0) {
          const def = list.find((p) => p.isDefault) ?? list[0];
          setProviderId(def.id);
          setModel(def.defaultModel);
        }
      } catch (err) {
        if (!cancelled) setProviderError((err as Error).message);
      } finally {
        if (!cancelled) setLoadingProviders(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load conversations list once ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingConversations(true);
      try {
        const list = await fetchJson<ConversationSummary[]>("/api/chat/conversations");
        if (!cancelled) setConversations(list);
      } catch (err) {
        if (!cancelled)
          toast.error(`Failed to load conversations: ${(err as Error).message}`);
      } finally {
        if (!cancelled) setLoadingConversations(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Reset model when provider changes ──────────────────────────────────
  useEffect(() => {
    if (activeProvider) setModel(activeProvider.defaultModel);
  }, [activeProvider]);

  // ── Auto-scroll (instant during streaming, cheap) ──────────────────────
  const scrollToBottom = useCallback(() => {
    if (!shouldAutoScroll.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    shouldAutoScroll.current = nearBottom;
  }, []);

  // Auto-grow textarea height as the user types (capped at 200px).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 200);
    el.style.height = `${next}px`;
  }, [input]);

  // On unmount, abort any in-flight stream. Without this, the fetch reader
  // keeps calling setState after the tree is gone — harmless in prod, but
  // noisy in dev (React warnings) and wastes provider tokens on a response
  // nobody will see.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // ── rAF-batched flush of streaming content ─────────────────────────────
  const flushStreaming = useCallback(() => {
    rafPendingRef.current = false;
    const id = streamingIdRef.current;
    if (!id) return;
    const content = streamingContentRef.current;
    const { providerName, model: modelUsed } = streamingMetaRef.current;
    const toolEventsSnapshot = streamingToolEventsRef.current;
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (m.id !== id) return m;
        const sameContent = m.content === content;
        const sameMeta =
          m.providerName === providerName && m.model === modelUsed;
        const sameToolLen = (m.toolEvents?.length ?? 0) === toolEventsSnapshot.length;
        if (sameContent && sameMeta && sameToolLen) {
          return m;
        }
        changed = true;
        return {
          ...m,
          content,
          providerName,
          model: modelUsed,
          pending: true,
          toolEvents:
            toolEventsSnapshot.length > 0 ? [...toolEventsSnapshot] : m.toolEvents,
        };
      });
      return changed ? next : prev;
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(flushStreaming);
  }, [flushStreaming]);

  // ── Open a conversation (optimistic: active id set immediately) ────────
  const openConversation = useCallback(
    async (id: string) => {
      if (streaming) {
        toast.error("Wait for the current response to finish");
        return;
      }
      setActiveConversationId(id);
      try {
        const detail = await fetchJson<ConversationDetail>(
          `/api/chat/conversations/${id}`
        );
        setMessages(
          detail.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              providerName: m.providerName ?? undefined,
              model: m.model ?? undefined,
            }))
        );
        if (detail.providerId && providers.some((p) => p.id === detail.providerId)) {
          setProviderId(detail.providerId);
        }
        if (detail.model) setModel(detail.model);
        if (detail.systemPrompt) setSystemPrompt(detail.systemPrompt);
        if (detail.temperature != null) setTemperature(String(detail.temperature));
        shouldAutoScroll.current = true;
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [streaming, providers]
  );

  // ── New conversation (pure local state, no server call yet) ────────────
  const newConversation = useCallback(() => {
    if (streaming) return;
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    shouldAutoScroll.current = true;
  }, [streaming]);

  // ── Rename (optimistic) ────────────────────────────────────────────────
  const renameConversation = useCallback(async (id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
    try {
      await fetchJson(`/api/chat/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
    } catch (err) {
      toast.error((err as Error).message);
      // Refetch on error — simpler than snapshotting
      try {
        const list = await fetchJson<ConversationSummary[]>("/api/chat/conversations");
        setConversations(list);
      } catch {
        /* ignore */
      }
    }
  }, []);

  // ── Delete (optimistic with rollback) ──────────────────────────────────
  const deleteConversation = useCallback(
    async (id: string) => {
      if (!confirm("Delete this conversation? This cannot be undone.")) return;
      const snapshot = conversations;
      const wasActive = activeConversationId === id;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (wasActive) {
        setActiveConversationId(null);
        setMessages([]);
      }
      try {
        await fetchJson(`/api/chat/conversations/${id}`, { method: "DELETE" });
      } catch (err) {
        setConversations(snapshot);
        toast.error((err as Error).message);
      }
    },
    [conversations, activeConversationId]
  );

  // ── Toggle pin (optimistic with sort) ──────────────────────────────────
  const togglePin = useCallback(async (id: string, isPinned: boolean) => {
    setConversations((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, isPinned } : c))
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        })
    );
    try {
      await fetchJson(`/api/chat/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPinned }),
      });
    } catch (err) {
      toast.error((err as Error).message);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isPinned: !isPinned } : c))
      );
    }
  }, []);

  // ── Send / stream a message ─────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string, opts?: { regenerate?: boolean }) => {
      // Synchronous in-flight guard — this is the critical defense against
      // duplicate sends. Even if React hasn't re-rendered yet, the next call
      // immediately sees inflightRef.current === true and bails out.
      if (inflightRef.current) return;
      if (streaming) return;
      if (!providerId) {
        toast.error("No active provider selected");
        return;
      }
      if (!text.trim() && !opts?.regenerate) return;

      // Guard against oversized inputs. Most providers cap the context window
      // at ~128k tokens; accepting arbitrary paste sizes means the request
      // either silently truncates or fails with an opaque provider error.
      // MAX_INPUT_CHARS is a coarse-but-cheap pre-check (≈ MAX_INPUT_CHARS/4
      // tokens). Refine server-side if a precise token count is needed.
      const MAX_INPUT_CHARS = 32_000;
      if (!opts?.regenerate && text.length > MAX_INPUT_CHARS) {
        toast.error(
          `Message is too long (${text.length.toLocaleString()} chars). Max is ${MAX_INPUT_CHARS.toLocaleString()}.`
        );
        return;
      }

      // Claim the in-flight slot IMMEDIATELY so any re-entry blocks.
      inflightRef.current = true;
      // Flip streaming + clear the input so the UI reflects "busy" before
      // any async work starts. The textarea's `disabled={streaming}` picks
      // this up on the next render (batched, but very soon).
      setStreaming(true);
      if (!opts?.regenerate) setInput("");

      // Ensure a conversation exists — create optimistically if new
      let convId = activeConversationId;
      if (!convId) {
        const tempId = `tmp_${Date.now()}`;
        setActiveConversationId(tempId);
        const optimistic: ConversationSummary = {
          id: tempId,
          title: "New chat",
          providerId,
          model,
          isPinned: false,
          messageCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setConversations((prev) => [optimistic, ...prev]);

        try {
          const created = await fetchJson<{ id: string; title: string }>(
            "/api/chat/conversations",
            {
              method: "POST",
              body: JSON.stringify({
                providerId,
                model,
                systemPrompt,
                temperature: Number(temperature),
              }),
            }
          );
          convId = created.id;
          // Swap the temp id with the real one
          setActiveConversationId(created.id);
          setConversations((prev) =>
            prev.map((c) =>
              c.id === tempId
                ? {
                    ...c,
                    id: created.id,
                    title: created.title,
                  }
                : c
            )
          );
        } catch (err) {
          // Rollback the optimistic insert + release the in-flight slot
          setConversations((prev) => prev.filter((c) => c.id !== tempId));
          setActiveConversationId(null);
          setStreaming(false);
          inflightRef.current = false;
          toast.error(`Failed to start conversation: ${(err as Error).message}`);
          return;
        }
      }

      // Build message list from ref (avoid stale closure)
      const currentMessages = messagesRef.current;
      let priorMessages: LocalMessage[];
      let userText: string;
      if (opts?.regenerate) {
        const lastAssistantIdx = [...currentMessages]
          .reverse()
          .findIndex((m) => m.role === "assistant");
        if (lastAssistantIdx === -1) {
          setStreaming(false);
          inflightRef.current = false;
          return;
        }
        const cutIdx = currentMessages.length - 1 - lastAssistantIdx;
        priorMessages = currentMessages.slice(0, cutIdx).filter((m) => !m.error);
        const lastUser = [...priorMessages].reverse().find((m) => m.role === "user");
        if (!lastUser) {
          setStreaming(false);
          inflightRef.current = false;
          return;
        }
        userText = lastUser.content;
        priorMessages = priorMessages.slice(0, priorMessages.indexOf(lastUser));
      } else {
        priorMessages = currentMessages.filter((m) => !m.error);
        userText = text.trim();
      }

      const userMsg: LocalMessage = {
        id: genId(),
        role: "user",
        content: userText,
      };
      const assistantId = genId();
      const assistantPlaceholder: LocalMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        pending: true,
      };

      // Prep streaming refs BEFORE first setState so flushStreaming has data
      streamingIdRef.current = assistantId;
      streamingContentRef.current = "";
      streamingMetaRef.current = {};
      streamingToolEventsRef.current = [];

      setMessages([...priorMessages, userMsg, assistantPlaceholder]);
      shouldAutoScroll.current = true;

      // Optimistically bump the active conversation's count + updatedAt
      if (convId) {
        const localConvId = convId;
        setConversations((prev) =>
          prev.map((c) =>
            c.id === localConvId
              ? {
                  ...c,
                  messageCount: c.messageCount + 2,
                  updatedAt: new Date().toISOString(),
                  // Auto-title hint: first user message becomes title if still "New chat"
                  title:
                    c.title === "New chat"
                      ? userText.split("\n")[0].slice(0, 60) || c.title
                      : c.title,
                }
              : c
          )
        );
      }

      const payloadMessages = [
        ...(systemPrompt.trim()
          ? [{ role: "system" as const, content: systemPrompt.trim() }]
          : []),
        ...priorMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: userText },
      ];

      const controller = new AbortController();
      abortRef.current = controller;

      // Idle-reset timeout: abort if no bytes arrive for IDLE_MS. Reset on
      // every incoming chunk so long-but-healthy streams are never cut off.
      // The initial window covers TTFB; once streaming starts, inactivity
      // has to exceed IDLE_MS to trigger.
      const IDLE_MS = 90_000;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let timedOut = false;
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, IDLE_MS);
      };
      const clearIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = null;
      };
      resetIdleTimer();

      try {
        const tempNum = Number(temperature);
        const res = await fetch("/api/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: payloadMessages,
            providerId,
            model,
            temperature: Number.isFinite(tempNum) ? tempNum : undefined,
            stream: true,
            conversationId: convId,
          }),
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "");
          let errMsg = `${res.status} ${res.statusText}`;
          try {
            const parsed = JSON.parse(errText);
            errMsg = parsed?.error ?? errMsg;
          } catch {
            if (errText) errMsg = errText;
          }
          throw new Error(errMsg);
        }

        streamingMetaRef.current = {
          providerName: res.headers.get("X-Provider") ?? undefined,
          model: res.headers.get("X-Model") ?? undefined,
        };

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          resetIdleTimer();
          buffer += decoder.decode(value, { stream: true });

          let nlIdx;
          while ((nlIdx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, nlIdx).trim();
            buffer = buffer.slice(nlIdx + 2);
            if (!frame.startsWith("data:")) continue;
            const data = frame.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (typeof parsed.delta === "string") {
                streamingContentRef.current += parsed.delta;
                scheduleFlush();
              }
              if (
                parsed.tool &&
                typeof parsed.tool.name === "string" &&
                (parsed.tool.status === "calling" || parsed.tool.status === "done")
              ) {
                const events = streamingToolEventsRef.current;
                // Update in place if this tool already has a "calling" entry
                const existingIdx = events.findIndex(
                  (e) => e.name === parsed.tool.name
                );
                if (existingIdx >= 0) {
                  events[existingIdx] = {
                    ...events[existingIdx],
                    status: parsed.tool.status,
                    timestamp: Date.now(),
                  };
                } else {
                  events.push({
                    name: parsed.tool.name,
                    status: parsed.tool.status,
                    timestamp: Date.now(),
                  });
                }
                scheduleFlush();
              }
            } catch (err) {
              throw err instanceof Error ? err : new Error(String(err));
            }
          }
        }

        // Final flush to ensure last tokens land in state
        flushStreaming();

        const finalContent = streamingContentRef.current;
        const finalMeta = streamingMetaRef.current;
        const finalToolEvents = streamingToolEventsRef.current.slice();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: finalContent,
                  pending: false,
                  providerName: finalMeta.providerName,
                  model: finalMeta.model,
                  toolEvents:
                    finalToolEvents.length > 0 ? finalToolEvents : m.toolEvents,
                }
              : m
          )
        );
      } catch (err) {
        const isAbort = (err as Error).name === "AbortError";
        const isUserCancel = isAbort && !timedOut;
        const message = isAbort
          ? timedOut
            ? "Request timed out. Please try again."
            : "Cancelled"
          : (err as Error).message || "Request failed";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: streamingContentRef.current || message,
                  pending: false,
                  error: !isUserCancel,
                }
              : m
          )
        );
        if (!isUserCancel) {
          toast.error(message);
        }
      } finally {
        clearIdleTimer();
        streamingIdRef.current = "";
        streamingContentRef.current = "";
        streamingMetaRef.current = {};
        streamingToolEventsRef.current = [];
        setStreaming(false);
        abortRef.current = null;
        inflightRef.current = false;
      }
    },
    [
      streaming,
      providerId,
      model,
      activeConversationId,
      systemPrompt,
      temperature,
      scheduleFlush,
      flushStreaming,
    ]
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [sendMessage, input]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [sendMessage, input]
  );

  const regenerate = useCallback(
    () => sendMessage("", { regenerate: true }),
    [sendMessage]
  );

  // Edit a previously-sent user message: truncate history up to (not
  // including) that message, then resend with the new content. Updates the
  // `messagesRef` synchronously so sendMessage's closure reads the truncated
  // state rather than stale React state.
  const editUserMessage = useCallback(
    (messageId: string, newContent: string) => {
      if (streaming) {
        toast.error("Wait for the current response to finish");
        return;
      }
      const idx = messagesRef.current.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const truncated = messagesRef.current.slice(0, idx);
      messagesRef.current = truncated;
      setMessages(truncated);
      sendMessage(newContent);
    },
    [streaming, sendMessage]
  );

  const lastUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].id;
    }
    return null;
  }, [messages]);

  // Memoize computed flags so memoized bubbles don't re-render from these
  const canRegenerate = useMemo(
    () => !streaming && messages.some((x) => x.role === "user"),
    [streaming, messages]
  );

  // ── Export handlers ─────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const canExport = messages.some(
    (m) => m.role === "assistant" && !m.error && m.content.trim().length > 0
  );

  const buildExportContext = useCallback(
    (lastAnswerOnly = false): ExportContext => ({
      messages,
      conversationTitle: activeConversation?.title || "Analytics Report",
      providerLabel: activeProvider?.displayName,
      modelLabel: model,
      lastAnswerOnly,
    }),
    [messages, activeConversation, activeProvider, model]
  );

  const handleExportPDF = useCallback(async () => {
    if (!canExport) {
      toast.error("Nothing to export yet");
      return;
    }
    setExporting(true);
    try {
      await exportReportAsPDF(buildExportContext(false));
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error(`PDF export failed: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }, [canExport, buildExportContext]);

  const handleExportMarkdown = useCallback(() => {
    if (!canExport) {
      toast.error("Nothing to export yet");
      return;
    }
    try {
      exportReportAsMarkdown(buildExportContext(false));
      toast.success("Markdown downloaded");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [canExport, buildExportContext]);

  const handleExportJSON = useCallback(() => {
    if (!canExport) {
      toast.error("Nothing to export yet");
      return;
    }
    try {
      exportReportAsJSON(buildExportContext(false));
      toast.success("JSON downloaded");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [canExport, buildExportContext]);

  const handleCopyConversation = useCallback(async () => {
    if (!canExport) {
      toast.error("Nothing to copy yet");
      return;
    }
    try {
      await copyReportAsText(buildExportContext(false));
      toast.success("Conversation copied");
    } catch {
      toast.error("Clipboard blocked");
    }
  }, [canExport, buildExportContext]);

  const handlePrint = useCallback(() => {
    printReport();
  }, []);

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {sidebarOpen && (
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConversationId}
          loading={loadingConversations}
          onSelect={openConversation}
          onNew={newConversation}
          onRename={renameConversation}
          onDelete={deleteConversation}
          onTogglePin={togglePin}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 h-full relative bg-background">
        {/* Header */}
        <div className="border-b border-border/60 bg-background px-4 py-2.5 flex items-center gap-2 flex-wrap shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            className="h-8 w-8 p-0 hover:bg-muted text-muted-foreground"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
          <div className="flex items-center gap-2 mr-auto min-w-0">
            <h1 className="text-[13px] font-medium truncate max-w-[320px] text-foreground/90">
              {activeConversationId
                ? activeConversation?.title ?? "Chat"
                : "New chat"}
            </h1>
            {streaming && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                thinking
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Select
              value={providerId}
              onValueChange={setProviderId}
              disabled={streaming || providers.length === 0}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs border-border/60 bg-transparent hover:bg-muted/60 rounded-lg">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <Select
              value={model}
              onValueChange={setModel}
              disabled={streaming || modelOptions.length === 0}
            >
              <SelectTrigger className="h-8 w-[170px] text-xs border-border/60 bg-transparent hover:bg-muted/60 rounded-lg">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInsightsOpen((v) => !v)}
            title={insightsOpen ? "Hide insights panel" : "Show insights panel"}
            className={cn(
              "h-8 w-8 p-0 hover:bg-muted rounded-lg",
              insightsOpen ? "text-primary bg-primary/10" : "text-muted-foreground"
            )}
          >
            {insightsOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRight className="h-4 w-4" />
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canExport || exporting}
                title="Export / download report"
                className="h-8 w-8 p-0 hover:bg-muted rounded-lg text-muted-foreground disabled:opacity-40"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                Export conversation
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={handleExportPDF} disabled={exporting}>
                <FileDown className="h-4 w-4 mr-2 text-primary" />
                <span className="flex-1">Download PDF</span>
                <span className="text-[10px] text-muted-foreground font-mono">.pdf</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportMarkdown}>
                <FileText className="h-4 w-4 mr-2" />
                <span className="flex-1">Download Markdown</span>
                <span className="text-[10px] text-muted-foreground font-mono">.md</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJSON}>
                <FileJson className="h-4 w-4 mr-2" />
                <span className="flex-1">Download JSON</span>
                <span className="text-[10px] text-muted-foreground font-mono">.json</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCopyConversation}>
                <Copy className="h-4 w-4 mr-2" />
                Copy as text
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={streaming}
                className="h-8 w-8 p-0 hover:bg-muted rounded-lg text-muted-foreground"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96" align="end">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">System prompt</Label>
                    {systemPrompt !== DEFAULT_SYSTEM_PROMPT && (
                      <button
                        type="button"
                        onClick={() => {
                          setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
                          toast.success("Reset to analytics template");
                        }}
                        className="text-[10px] text-primary hover:underline"
                      >
                        Reset to default
                      </button>
                    )}
                  </div>
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={8}
                    className="text-[11px] mt-1 font-mono leading-relaxed"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    The default prompt is tuned for KPI blocks and chart
                    fences. If you&apos;re not seeing charts, reset it.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Temperature</Label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Applies to new messages in this session.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="relative flex-1 overflow-y-auto claude-scroll min-h-0 bg-background"
        >
          <div className="relative max-w-3xl mx-auto w-full px-4 sm:px-6 pt-6 pb-8 space-y-6">
            {loadingProviders ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
                Loading providers…
              </Card>
            ) : providerError ? (
              <Card className="p-6 text-center space-y-2 border-destructive/40">
                <AlertCircle className="h-6 w-6 mx-auto text-destructive" />
                <p className="text-sm text-destructive whitespace-pre-wrap">
                  {providerError}
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/ai">Go to AI settings</Link>
                </Button>
              </Card>
            ) : providers.length === 0 ? (
              <Card className="p-8 text-center space-y-3">
                <Bot className="h-10 w-10 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">No AI providers configured</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    An admin needs to add a provider and at least one active API key.
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link href="/admin/ai">Go to AI settings</Link>
                </Button>
              </Card>
            ) : messages.length === 0 ? (
              <WelcomeScreen
                providerLabel={activeProvider?.displayName ?? "No provider"}
                modelLabel={model || "No model"}
                onPickPrompt={(text) => sendMessage(text)}
              />
            ) : (
              messages.map((m, idx) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isLast={idx === messages.length - 1}
                  isLastUserMessage={m.id === lastUserMessageId}
                  canRegenerate={canRegenerate}
                  onRegenerate={regenerate}
                  onEditUserMessage={editUserMessage}
                  streaming={streaming}
                />
              ))
            )}
          </div>
        </div>

        {/* Composer */}
        <form onSubmit={handleSubmit} className="bg-background px-4 pt-2 pb-4 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div
              className={cn(
                "group relative flex items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 transition-all duration-200",
                "focus-within:border-primary/50 focus-within:shadow-[0_2px_16px_-2px_rgba(201,100,66,0.12)]",
                (streaming || providers.length === 0) && "opacity-60"
              )}
            >
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  providers.length === 0
                    ? "Configure a provider first…"
                    : "Reply to Claude…"
                }
                rows={1}
                disabled={streaming || providers.length === 0}
                className="resize-none min-h-[28px] max-h-[200px] border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1 py-1 text-[14px] leading-relaxed placeholder:text-muted-foreground/70"
              />
              {streaming ? (
                <Button
                  type="button"
                  size="icon"
                  onClick={cancelStream}
                  title="Stop generating"
                  className="shrink-0 h-8 w-8 rounded-lg bg-foreground hover:bg-foreground/90 text-background"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || providers.length === 0}
                  title="Send (Enter)"
                  className={cn(
                    "shrink-0 h-8 w-8 rounded-lg transition-colors",
                    "bg-primary hover:bg-primary/90 text-primary-foreground",
                    "disabled:bg-muted disabled:text-muted-foreground/60"
                  )}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 mt-2 text-[11px] text-muted-foreground/70">
              <span>
                <kbd className="px-1 py-px rounded border border-border/70 font-mono text-[10px] mr-1">
                  Enter
                </kbd>
                to send
              </span>
              <span className="opacity-50">·</span>
              <span>
                <kbd className="px-1 py-px rounded border border-border/70 font-mono text-[10px] mr-1">
                  Shift+Enter
                </kbd>
                newline
              </span>
              {input.length > 24_000 && (
                <>
                  <span className="opacity-50">·</span>
                  <span
                    className={cn(
                      input.length > 32_000
                        ? "text-destructive font-medium"
                        : "text-amber-600 dark:text-amber-500"
                    )}
                  >
                    {input.length.toLocaleString()} / 32,000 chars
                  </span>
                </>
              )}
            </div>
          </div>
        </form>
      </div>

      {insightsOpen && providers.length > 0 && !providerError && (
        <InsightsPanel
          messages={messages}
          activeConversationTitle={
            activeConversationId
              ? activeConversation?.title ?? "Analysis"
              : "New analysis"
          }
          providerLabel={activeProvider?.displayName}
          modelLabel={model}
          streaming={streaming}
          onClose={() => setInsightsOpen(false)}
          onPickFollowUp={(text) => sendMessage(text)}
        />
      )}
    </div>
  );
}
