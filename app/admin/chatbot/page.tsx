"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import {
  Bot, Send, Plus, Trash2, MessageSquare, Sparkles,
  Loader2, ShieldCheck, Database, BarChart3, Users, FileText, Clock,
  AlertCircle, Copy, Check, Settings, PanelLeftClose, PanelLeft,
  CalendarDays, Fingerprint, Wallet, UserSearch, Building2, Lock,
  Search, ListOrdered, X, SquarePen,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

import {
  createConversation,
  getConversations,
  deleteConversation,
  getSuggestedQuestions,
  getConversationMessages,
  saveMessage,
} from "@/app/actions/erp-chat";

/* ═══════════════════════════ HELPERS ═══════════════════════════ */

function getMessageText(msg: UIMessage): string {
  if (!msg.parts || !Array.isArray(msg.parts)) return "";
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function relativeDate(d: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" });
}

/* ═══════════════════════════ TOOL META ═══════════════════════════ */

const TOOL_META: Record<string, { icon: typeof Database; label: string }> = {
  getKPISummary:            { icon: BarChart3,    label: "KPI Summary" },
  discoverStructure:        { icon: Database,     label: "Organization Structure" },
  findFormByName:           { icon: Search,       label: "Form Lookup" },
  queryFormRecords:         { icon: FileText,     label: "Form Records" },
  getModuleAnalytics:       { icon: BarChart3,    label: "Module Analytics" },
  getSubmissionTimeline:    { icon: Clock,        label: "Submission Timeline" },
  getUserActivity:          { icon: Users,        label: "User Activity" },
  getStatusBreakdown:       { icon: BarChart3,    label: "Status Breakdown" },
  listOrgUsers:             { icon: Users,        label: "Organization Users" },
  getAuditLogs:             { icon: ShieldCheck,  label: "Audit Logs" },
  getAttendanceInfo:        { icon: CalendarDays, label: "Attendance" },
  getPayrollSummary:        { icon: Wallet,       label: "Payroll Summary" },
  getEmployeeDirectory:     { icon: UserSearch,   label: "Employee Directory" },
  getLoginHistory:          { icon: Fingerprint,  label: "Login History" },
  getFormDetails:           { icon: FileText,     label: "Form Details" },
  getUserDetails:           { icon: Users,        label: "User Details" },
  getOrgUnitsAndRoles:      { icon: Building2,    label: "Org Units & Roles" },
  getRolesAndPermissions:   { icon: Lock,         label: "Permissions Matrix" },
  searchRecordsAcrossForms: { icon: Search,       label: "Record Search" },
  getRecentSubmissions:     { icon: ListOrdered,  label: "Recent Submissions" },
};

/* ═══════════════════════════ TOOL CARD ═══════════════════════════ */

function ToolResultCard({ toolName, result }: { toolName: string; result: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const data = result as Record<string, unknown>;
  const meta = TOOL_META[toolName] || { icon: Database, label: toolName };
  const Icon = meta.icon;

  if (data && typeof data === "object" && "error" in data) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs">
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
        <span>{String(data.error)}</span>
      </div>
    );
  }

  const json = JSON.stringify(data, null, 2);
  const preview = json.length > 180 ? json.slice(0, 180) + "…" : json;

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden text-xs my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
      >
        <Icon className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
        <span className="font-medium text-foreground/70 flex-1">{meta.label}</span>
        <span className="text-muted-foreground text-[10px]">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 bg-muted/20 border-t border-border/40 max-h-72 overflow-auto">
          <pre className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap break-words font-mono">
            {json.slice(0, 5000)}
          </pre>
        </div>
      )}
      {!expanded && json.length > 5 && (
        <div className="px-3 py-1.5 bg-muted/20 border-t border-border/30">
          <p className="text-[11px] text-muted-foreground/60 font-mono truncate">{preview}</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ MARKDOWN ═══════════════════════════ */

function processInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const m = match[0];
    if (m.startsWith("**")) parts.push(<strong key={match.index} className="font-semibold">{m.slice(2, -2)}</strong>);
    else if (m.startsWith("`")) parts.push(<code key={match.index} className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono">{m.slice(1, -1)}</code>);
    else if (m.startsWith("*")) parts.push(<em key={match.index}>{m.slice(1, -1)}</em>);
    lastIndex = match.index + m.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

function RenderMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="bg-zinc-900 text-zinc-100 rounded-lg p-3 my-2 overflow-x-auto text-xs">
            <code className="font-mono leading-relaxed">{codeContent.trimEnd()}</code>
          </pre>
        );
        codeContent = "";
        inCodeBlock = false;
      } else { inCodeBlock = true; }
      continue;
    }
    if (inCodeBlock) { codeContent += line + "\n"; continue; }

    if (line.startsWith("### "))       elements.push(<h3 key={i} className="font-semibold text-[13px] mt-3 mb-1">{processInline(line.slice(4))}</h3>);
    else if (line.startsWith("## "))   elements.push(<h2 key={i} className="font-semibold text-sm mt-4 mb-1.5">{processInline(line.slice(3))}</h2>);
    else if (line.startsWith("# "))    elements.push(<h1 key={i} className="font-bold text-base mt-4 mb-1.5">{processInline(line.slice(2))}</h1>);
    else if (line.startsWith("---"))   elements.push(<hr key={i} className="my-3 border-border/50" />);
    else if (line.startsWith("|")) {
      const tableLines: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].startsWith("|")) { tableLines.push(lines[j]); j++; }
      elements.push(
        <div key={i} className="overflow-x-auto my-2 rounded-lg border border-border/50">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                {tableLines[0].split("|").filter(Boolean).map((cell, ci) => (
                  <th key={ci} className="px-3 py-2 text-left font-semibold text-foreground/70 border-b border-border/50 whitespace-nowrap">{cell.trim()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableLines.slice(2).map((row, ri) => (
                <tr key={ri} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                  {row.split("|").filter(Boolean).map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5 whitespace-nowrap">{processInline(cell.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j - 1;
    } else if (line.match(/^[\s]*[-*]\s/)) {
      const indent = line.match(/^(\s*)/)?.[1]?.length || 0;
      elements.push(
        <div key={i} className="flex gap-1.5 text-[13px] leading-relaxed" style={{ paddingLeft: `${Math.min(indent, 8) * 4 + 4}px` }}>
          <span className="text-muted-foreground mt-0.5 select-none">•</span>
          <span>{processInline(line.replace(/^[\s]*[-*]\s/, ""))}</span>
        </div>
      );
    } else if (line.match(/^\d+\.\s/)) {
      const m = line.match(/^(\d+)\.\s(.*)/);
      if (m) elements.push(
        <div key={i} className="flex gap-1.5 text-[13px] leading-relaxed pl-1">
          <span className="text-muted-foreground font-mono text-xs min-w-[1.5rem]">{m[1]}.</span>
          <span>{processInline(m[2])}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(<p key={i} className="text-[13px] leading-relaxed">{processInline(line)}</p>);
    }
  }
  return <div className="space-y-0.5">{elements}</div>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  );
}

/* ═══════════════════════════ MAIN PAGE ═══════════════════════════ */

export default function ERPChatbotPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSheet, setMobileSheet] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [messageCache, setMessageCache] = useState<Record<string, UIMessage[]>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/erp-chat",
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages, conversationId: activeConversationId },
      }),
    }),
    onError: (error) => {
      const msg = error?.message || "Something went wrong";
      setChatError(msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
    },
  });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    getConversations().then((c) => setConversations(c as any));
    getSuggestedQuestions().then(setSuggestions);
  }, []);

  useEffect(() => {
    if (activeConversationId && messages.length > 0) {
      setMessageCache((prev) => ({ ...prev, [activeConversationId]: [...messages] }));
    }
  }, [messages, activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) { setMessages([]); return; }
    if (messageCache[activeConversationId]) { setMessages(messageCache[activeConversationId]); return; }
    let cancelled = false;
    setIsLoadingHistory(true);
    getConversationMessages(activeConversationId)
      .then((loaded) => { if (!cancelled) { setMessages(loaded); setMessageCache((prev) => ({ ...prev, [activeConversationId]: loaded })); } })
      .catch(() => { if (!cancelled) setMessages([]); })
      .finally(() => { if (!cancelled) setIsLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [activeConversationId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); handleNewChat(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }, []);

  const handleSend = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isStreaming) return;
    setChatError(null);

    let convId = activeConversationId;
    if (!convId) {
      const conv = await createConversation(msg.slice(0, 60));
      if (!conv) return;
      convId = conv.id;
      setActiveConversationId(convId);
      setConversations((prev) => [{ id: conv.id, title: conv.title, updatedAt: conv.updatedAt, messages: [] }, ...prev]);
    }

    saveMessage(convId, "user", msg);
    sendMessage({ text: msg });
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }, [input, isStreaming, activeConversationId, sendMessage]);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setChatError(null);
    setMobileSheet(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [setMessages]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setMobileSheet(false);
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setMessages([]);
      setMessageCache((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  }, [activeConversationId, setMessages]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  // Group conversations by date
  const grouped = conversations.reduce<Record<string, typeof conversations>>((acc, c) => {
    const key = relativeDate(c.updatedAt);
    (acc[key] ||= []).push(c);
    return acc;
  }, {});

  const hasMessages = messages.length > 0 || activeConversationId;

  /* ─── Sidebar content (shared between desktop sidebar and mobile sheet) ─── */
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* New Chat */}
      <div className="p-3 flex-shrink-0">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border/70 bg-background hover:bg-muted/60 transition-colors text-sm font-medium text-foreground"
        >
          <SquarePen className="h-4 w-4" />
          New chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 && (
          <div className="text-center py-10 px-4">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground/60">No conversations yet</p>
          </div>
        )}
        {Object.entries(grouped).map(([date, convs]) => (
          <div key={date}>
            <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest px-3 pt-5 pb-1.5">{date}</p>
            {convs.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-0.5 ${
                  activeConversationId === conv.id
                    ? "bg-muted text-foreground"
                    : "text-foreground/70 hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <p className="text-[13px] truncate flex-1 leading-tight">{conv.title || "Untitled"}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                  className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/10 hover:text-destructive transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Bottom */}
      <div className="flex-shrink-0 p-2 border-t border-border/50">
        <Link
          href="/admin/settings"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          AI Settings
        </Link>
      </div>
    </div>
  );

  return (
    <div className="mx-6 my-8 flex h-[calc(100vh-60px)] bg-background overflow-hidden">

      {/* ══════ DESKTOP SIDEBAR ══════ */}
      <aside
        className={`hidden md:flex flex-col flex-shrink-0 border-r border-border bg-muted/20 transition-all duration-200 ease-in-out ${
          sidebarOpen ? "w-[260px]" : "w-0"
        } overflow-hidden`}
      >
        <div className="w-[260px] h-full">{sidebarContent}</div>
      </aside>

      {/* ══════ MOBILE SHEET ══════ */}
      {mobileSheet && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMobileSheet(false)} />
          <aside className="fixed inset-y-0 left-0 w-[280px] z-50 bg-background border-r border-border shadow-xl md:hidden animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-sm font-semibold">Chats</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileSheet(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* ══════ MAIN AREA ══════ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* ── Header ── */}
        <header className="flex items-center gap-1 px-2 sm:px-3 h-12 border-b border-border bg-background flex-shrink-0 z-10">
          {/* Desktop sidebar toggle */}
          <Button variant="ghost" size="icon" className="h-8 w-8 hidden md:flex" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </Button>
          {/* Mobile sidebar trigger */}
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setMobileSheet(true)}>
            <PanelLeft className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNewChat} title="New chat (Ctrl+Shift+O)">
            <SquarePen className="h-4 w-4" />
          </Button>

          <div className="flex-1 flex items-center justify-center">
            <span className="text-sm font-medium text-foreground/70">ERP Assistant</span>
          </div>

          {isStreaming && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="hidden sm:inline">Generating…</span>
            </div>
          )}
        </header>

        {/* ── Chat body ── */}
        {!hasMessages ? (
          /* Welcome */
          <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pb-24">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold mb-2">How can I help you?</h2>
            <p className="text-sm text-muted-foreground mb-10 text-center max-w-md leading-relaxed">
              Ask about your organization — records, analytics, employees, attendance, payroll, and more.
            </p>
            {suggestions.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                {suggestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(q)}
                    disabled={isStreaming}
                    className="text-left px-4 py-3 rounded-xl border border-border bg-background hover:bg-muted/40 hover:border-border/80 transition-all text-[13px] text-foreground/70 hover:text-foreground disabled:opacity-50 leading-snug"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Messages */
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 space-y-6">
              {isLoadingHistory && (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {messages.map((message) => {
                const isUser = message.role === "user";
                const text = getMessageText(message);

                if (isUser) {
                  return (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[85%] sm:max-w-[75%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={message.id} className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center mt-1">
                      <Bot className="h-4 w-4 text-foreground/50" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {message.parts.map((part, pi) => {
                        if (part.type === "text" && part.text) {
                          return (
                            <div key={pi} className="group">
                              <RenderMarkdown text={part.text} />
                              <div className="flex items-center mt-1">
                                <CopyButton text={part.text} />
                              </div>
                            </div>
                          );
                        }
                        if (part.type === "tool-invocation") {
                          const tp = part as any;
                          if (tp.state === "output-available") {
                            return (
                              <ToolResultCard
                                key={pi}
                                toolName={tp.toolInvocation?.toolName || tp.toolName || ""}
                                result={tp.toolInvocation?.output || tp.output}
                              />
                            );
                          }
                          if (tp.state === "input-available" || tp.state === "input-streaming") {
                            const name = tp.toolInvocation?.toolName || tp.toolName || "";
                            const label = TOOL_META[name]?.label || name;
                            return (
                              <div key={pi} className="flex items-center gap-2 text-xs text-muted-foreground py-1.5">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>Querying {label}…</span>
                              </div>
                            );
                          }
                        }
                        return null;
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Thinking dots */}
              {isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                    <Bot className="h-4 w-4 text-foreground/50" />
                  </div>
                  <div className="flex items-center gap-1 py-3 px-1">
                    <span className="w-2 h-2 bg-foreground/20 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-foreground/20 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-foreground/20 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}

              {/* Error */}
              {chatError && (
                <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-red-700 dark:text-red-400">{chatError}</p>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => setChatError(null)} className="text-xs text-red-600 hover:underline">Dismiss</button>
                        <Link href="/admin/settings" className="text-xs text-muted-foreground hover:underline">Configure AI</Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* ── Input ── */}
        <div className="flex-shrink-0 border-t border-border bg-background p-3 sm:p-4">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message ERP Assistant…"
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none rounded-2xl border border-input bg-muted/30 px-4 py-3 text-sm leading-relaxed
                         focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/50 focus:bg-background
                         disabled:opacity-50 placeholder:text-muted-foreground/50
                         transition-colors"
              style={{ maxHeight: "160px" }}
            />
            <Button
              size="icon"
              className="h-[46px] w-[46px] rounded-2xl flex-shrink-0"
              disabled={!input.trim() || isStreaming}
              onClick={() => handleSend()}
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
