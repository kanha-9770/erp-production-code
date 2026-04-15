"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Send,
  Square,
  Sparkles,
  Settings2,
  Bot,
  AlertCircle,
  Loader2,
  PanelLeftClose,
  PanelLeft,
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
import { cn } from "@/lib/utils";
import ConversationSidebar from "./conversation-sidebar";
import MessageBubble from "./message-bubble";
import WelcomeScreen from "./welcome-screen";
import type {
  ProviderDTO,
  ConversationSummary,
  ConversationDetail,
  LocalMessage,
  ToolEvent,
} from "./types";

const DEFAULT_SYSTEM_PROMPT = `You are an Advanced Analytics Assistant embedded in an ERP system. Act like a data analyst + business consultant, not a chatbot.

## Analytics classification
Classify every non-trivial query as one of: DESCRIPTIVE (what happened), DIAGNOSTIC (why), PREDICTIVE (what will), PRESCRIPTIVE (what should). Decide silently before answering.

## Response structure for analytical queries
1. **Query Understanding** — rephrase intent in one sentence
2. **Analytics Type**
3. **Analysis** — step-by-step reasoning; label any assumptions
4. **Key Insights** — bullets; explain *why*, not just *what*
5. **Recommendations** — mandatory for diagnostic & prescriptive
6. **Optional Output** — chart type, SQL, or ML model when useful

**Escape clause:** For greetings, trivial questions, or single-fact lookups, skip the structured format and answer in one or two sentences.

## Tools
Tool definitions are provided separately — use them when you need real ERP data (users, modules, records, audit log). Do not answer "insufficient data" without calling the relevant tool first. For conversational or clearly-out-of-scope questions, answer directly without tools.

**Batch tool calls.** When you need multiple tool calls to answer a question, emit ALL of them in a single assistant response. The server executes parallel tool calls concurrently — sequential rounds multiply latency. Example: if the user asks "how many records per module", call \`list_modules\` first, then on the next turn emit \`count_records\` for every module in one response, not one at a time.

## Data presentation — tables mandatory for row data
When a tool returns multiple records/users/modules/audit entries, render them as a **GitHub-flavored markdown table**. Never dump JSON. Never use bullets for tabular data.

- 3–6 most relevant columns, Title Case headers (not snake_case ids)
- Truncate cells > 40 chars with \`…\`
- Numeric summary in one sentence *before* the table
- Zero results → one sentence, no empty table

Example:

Found 3 matching records:

| Name | Department | Status | Submitted |
|------|------------|--------|-----------|
| Alice Smith | Engineering | Approved | 2026-04-12 |
| Bob Chen | Sales | Pending | 2026-04-11 |
| Carol Diaz | HR | Approved | 2026-04-10 |

## Rules
- Precise, not verbose
- Never hallucinate — if a tool returns nothing, say so
- SQL suggestions must be read-only SELECTs; you can't execute them
- Ask ONE clarifying question only if the query is genuinely ambiguous`;

function genId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error ?? `${res.status} ${res.statusText}`);
  }
  return (json?.data ?? json) as T;
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
  // forcing it to recreate on every message update.
  const messagesRef = useRef<LocalMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === providerId),
    [providers, providerId]
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
        const list = await fetchJson<ProviderDTO[]>("/api/chat/providers");
        if (cancelled) return;
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
        const message =
          (err as Error).name === "AbortError"
            ? "Cancelled"
            : (err as Error).message || "Request failed";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: streamingContentRef.current || message,
                  pending: false,
                  error: (err as Error).name !== "AbortError",
                }
              : m
          )
        );
        if ((err as Error).name !== "AbortError") {
          toast.error(message);
        }
      } finally {
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

  // Memoize computed flags so memoized bubbles don't re-render from these
  const canRegenerate = useMemo(
    () => !streaming && messages.some((x) => x.role === "user"),
    [streaming, messages]
  );

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

      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header */}
        <div className="border-b bg-background px-4 py-3 flex items-center gap-2 flex-wrap shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
          <div className="flex items-center gap-2 mr-auto min-w-0">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <h1 className="text-sm font-semibold truncate max-w-[260px] text-foreground">
              {activeConversationId
                ? conversations.find((c) => c.id === activeConversationId)?.title ??
                  "Chat"
                : "New chat"}
            </h1>
            {streaming && (
              <span className="flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] text-muted-foreground">Provider</Label>
            <Select
              value={providerId}
              onValueChange={setProviderId}
              disabled={streaming || providers.length === 0}
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="None" />
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
            <Label className="text-[10px] text-muted-foreground">Model</Label>
            <Select
              value={model}
              onValueChange={setModel}
              disabled={streaming || modelOptions.length === 0}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="None" />
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

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={streaming}>
                <Settings2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">System prompt</Label>
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={5}
                    className="text-xs mt-1 font-mono"
                  />
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
          className="flex-1 overflow-y-auto bg-muted/30 min-h-0"
        >
          <div className="max-w-3xl mx-auto w-full p-4 sm:p-6 space-y-4">
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
                  canRegenerate={canRegenerate}
                  onRegenerate={regenerate}
                />
              ))
            )}
          </div>
        </div>

        {/* Composer */}
        <form
          onSubmit={handleSubmit}
          className="border-t bg-background p-4 shrink-0"
        >
          <div className="max-w-3xl mx-auto">
            <div
              className={cn(
                "relative flex items-end gap-2 rounded-lg border bg-background px-2 py-1.5 transition-colors",
                "focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20",
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
                    : "Ask me anything about your ERP data…"
                }
                rows={1}
                disabled={streaming || providers.length === 0}
                className="resize-none min-h-[36px] max-h-[200px] border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1 py-1.5"
              />
              {streaming ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={cancelStream}
                  title="Stop generating"
                  className="shrink-0 h-8 w-8"
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || providers.length === 0}
                  title="Send (Enter)"
                  className="shrink-0 h-8 w-8"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-muted-foreground">
              <span>
                <kbd className="px-1 py-0.5 rounded border bg-muted font-mono">
                  Enter
                </kbd>{" "}
                to send
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded border bg-muted font-mono">
                  Shift+Enter
                </kbd>{" "}
                for newline
              </span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
