"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import {
  Bot, Send, Plus, Trash2, MessageSquare, Sparkles, RefreshCw, ChevronLeft,
  Loader2, ShieldCheck, Database, BarChart3, Users, FileText, Clock,
  AlertCircle, Copy, Check, Settings,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  createConversation,
  getConversations,
  deleteConversation,
  getSuggestedQuestions,
  getConversationMessages,
  saveMessage,
} from "@/app/actions/erp-chat";

// ====================== HELPERS ======================
function getMessageText(msg: UIMessage): string {
  if (!msg.parts || !Array.isArray(msg.parts)) return "";
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function ToolResultCard({
  toolName,
  result,
}: {
  toolName: string;
  result: unknown;
}) {
  const data = result as Record<string, unknown>;
  const iconMap: Record<string, typeof Database> = {
    getKPISummary: BarChart3,
    discoverStructure: Database,
    queryFormRecords: FileText,
    getModuleAnalytics: BarChart3,
    getSubmissionTimeline: Clock,
    getUserActivity: Users,
    getStatusBreakdown: BarChart3,
    listOrgUsers: Users,
    getAuditLogs: ShieldCheck,
  };
  const Icon = iconMap[toolName] || Database;

  const labelMap: Record<string, string> = {
    getKPISummary: "KPI Summary",
    discoverStructure: "Organization Structure",
    queryFormRecords: "Form Records",
    getModuleAnalytics: "Module Analytics",
    getSubmissionTimeline: "Submission Timeline",
    getUserActivity: "User Activity",
    getStatusBreakdown: "Status Breakdown",
    listOrgUsers: "Organization Users",
    getAuditLogs: "Audit Logs",
  };

  if (data && typeof data === "object" && "error" in data) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>{String(data.error)}</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/60">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {labelMap[toolName] || toolName}
        </span>
      </div>
      <div className="px-3 py-2 max-h-48 overflow-auto">
        <pre className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-all font-mono">
          {JSON.stringify(data, null, 2).slice(0, 2000)}
        </pre>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
    >
      {copied ? (
        <Check className="h-3 w-3 text-chart-2" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}

function RenderContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="bg-muted rounded-md p-3 my-2 overflow-x-auto">
            <code className="text-xs font-mono">{codeContent.trimEnd()}</code>
          </pre>
        );
        codeContent = "";
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += line + "\n";
      continue;
    }

    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="font-semibold text-sm mt-3 mb-1">{processInline(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="font-semibold text-base mt-3 mb-1">{processInline(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="font-bold text-lg mt-3 mb-1">{processInline(line.slice(2))}</h1>);
    } else if (line.startsWith("|")) {
      const tableLines: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].startsWith("|")) {
        tableLines.push(lines[j]);
        j++;
      }
      elements.push(
        <div key={i} className="overflow-x-auto my-2">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                {tableLines[0].split("|").filter(Boolean).map((cell, ci) => (
                  <th key={ci} className="px-2 py-1 text-left font-medium text-muted-foreground">{cell.trim()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableLines.slice(2).map((row, ri) => (
                <tr key={ri} className="border-b border-border/50">
                  {row.split("|").filter(Boolean).map((cell, ci) => (
                    <td key={ci} className="px-2 py-1">{cell.trim()}</td>
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
        <div key={i} className="flex gap-1.5 text-sm leading-relaxed" style={{ paddingLeft: `${indent * 4 + 4}px` }}>
          <span className="text-muted-foreground mt-1">-</span>
          <span>{processInline(line.replace(/^[\s]*[-*]\s/, ""))}</span>
        </div>
      );
    } else if (line.match(/^\d+\.\s/)) {
      const match = line.match(/^(\d+)\.\s(.*)/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-1.5 text-sm leading-relaxed pl-1">
            <span className="text-muted-foreground font-mono text-xs min-w-[1.5rem]">{match[1]}.</span>
            <span>{processInline(match[2])}</span>
          </div>
        );
      }
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-sm leading-relaxed">{processInline(line)}</p>);
    }
  }
  return <div className="space-y-0.5">{elements}</div>;
}

function processInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const m = match[0];
    if (m.startsWith("**")) parts.push(<strong key={match.index}>{m.slice(2, -2)}</strong>);
    else if (m.startsWith("`")) {
      parts.push(<code key={match.index} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{m.slice(1, -1)}</code>);
    } else if (m.startsWith("*")) parts.push(<em key={match.index}>{m.slice(1, -1)}</em>);
    lastIndex = match.index + m.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

// ====================== SUB COMPONENTS ======================
function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  sidebarOpen,
  setSidebarOpen,
}: {
  conversations: Array<{ id: string; title: string | null; updatedAt: Date; messages: Array<{ content: string }> }>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}) {
  return (
    <div className={`${sidebarOpen ? "w-72" : "w-0"} transition-all duration-200 flex-shrink-0 border-r border-border bg-muted/20 pt-10 overflow-hidden`}>
      <div className="w-72 h-full flex flex-col">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm">Conversations</h2>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNew}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New conversation</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSidebarOpen(false)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && <div className="text-center py-8 text-muted-foreground text-xs">No conversations yet</div>}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                activeId === conv.id ? "bg-accent text-accent-foreground" : "hover:bg-muted text-foreground"
              }`}
              onClick={() => onSelect(conv.id)}
            >
              <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{conv.title || "Untitled"}</p>
                {conv.messages[0] && <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.messages[0].content.slice(0, 40)}</p>}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SuggestionChips({ questions, onSelect, disabled }: { questions: string[]; onSelect: (q: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
      {questions.map((q, i) => (
        <button
          key={i}
          onClick={() => onSelect(q)}
          disabled={disabled}
          className="px-3 py-1.5 text-xs rounded-full border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

function WelcomeState({ suggestions, onSelectSuggestion, disabled }: { suggestions: string[]; onSelectSuggestion: (q: string) => void; disabled: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center pt-10 justify-center px-6">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-foreground/5 mb-6">
        <Sparkles className="h-7 w-7 text-foreground/60" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2 text-balance text-center">ERP Intelligence Assistant</h2>
      <p className="text-sm text-muted-foreground max-w-md text-center mb-8 text-pretty leading-relaxed">
        Ask questions about your organization data, generate analytics, explore modules, and get insights. All queries respect your role-based permissions.
      </p>

      <div className="grid grid-cols-2 gap-3 max-w-lg mb-8">
        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-muted/30">
          <ShieldCheck className="h-4 w-4 text-chart-2 mt-0.5 flex-shrink-0" />
          <div><p className="text-xs font-medium">Role-Based Access</p><p className="text-xs text-muted-foreground mt-0.5">Data filtered by your permissions</p></div>
        </div>
        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-muted/30">
          <Database className="h-4 w-4 text-chart-1 mt-0.5 flex-shrink-0" />
          <div><p className="text-xs font-medium">Live Data</p><p className="text-xs text-muted-foreground mt-0.5">Queries run against real-time data</p></div>
        </div>
        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-muted/30">
          <BarChart3 className="h-4 w-4 text-chart-4 mt-0.5 flex-shrink-0" />
          <div><p className="text-xs font-medium">Smart Analytics</p><p className="text-xs text-muted-foreground mt-0.5">Dynamic KPI & trend analysis</p></div>
        </div>
        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-muted/30">
          <FileText className="h-4 w-4 text-chart-5 mt-0.5 flex-shrink-0" />
          <div><p className="text-xs font-medium">All Modules</p><p className="text-xs text-muted-foreground mt-0.5">Discover forms & records dynamically</p></div>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground text-center">Try asking:</p>
          <SuggestionChips questions={suggestions} onSelect={onSelectSuggestion} disabled={disabled} />
        </div>
      )}
    </div>
  );
}

// ====================== MAIN PAGE ======================
export default function ERPChatbotPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
      prepareSendMessagesRequest: ({ messages }) => ({ body: { messages, conversationId: activeConversationId } }),
    }),
    onError: (error) => {
      const msg = error?.message || "Something went wrong";
      setChatError(msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    getConversations().then((convs) => setConversations(convs as any));
    getSuggestedQuestions().then(setSuggestions);
  }, []);

  useEffect(() => {
    if (activeConversationId && messages.length > 0) {
      setMessageCache((prev) => ({ ...prev, [activeConversationId]: [...messages] }));
    }
  }, [messages, activeConversationId]);

  useEffect(() => {
    async function loadHistory() {
      if (!activeConversationId) {
        setMessages([]);
        return;
      }
      if (messageCache[activeConversationId]) {
        setMessages(messageCache[activeConversationId]);
        return;
      }
      setIsLoadingHistory(true);
      try {
        const loaded = await getConversationMessages(activeConversationId);
        setMessages(loaded);
        setMessageCache((prev) => ({ ...prev, [activeConversationId]: loaded }));
      } catch (err) {
        console.error("Failed to load history:", err);
        setMessages([]);
      } finally {
        setIsLoadingHistory(false);
      }
    }
    loadHistory();
  }, [activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }, []);

  const handleSend = useCallback(async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;
    setChatError(null);

    let convId = activeConversationId;
    if (!convId) {
      const conv = await createConversation(messageText.slice(0, 60));
      if (conv) {
        convId = conv.id;
        setActiveConversationId(convId);
        setConversations((prev) => [{ id: conv.id, title: conv.title, updatedAt: conv.updatedAt, messages: [] }, ...prev]);
      } else return;
    }

    await saveMessage(convId, "user", messageText);
    sendMessage({ text: messageText });
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }, [input, isLoading, activeConversationId, sendMessage]);

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
  }, [setMessages]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setMessages([]);
      setMessageCache((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    }
  }, [activeConversationId, setMessages]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="-mx-6 -my-8 flex h-[calc(100vh-60px)]">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      <div className="flex-1 flex flex-col pt-10 min-w-0">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(true)}>
              <MessageSquare className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground/5">
              <Bot className="h-4 w-4 text-foreground/70" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">ERP Intelligence</h1>
              <p className="text-xs text-muted-foreground">{isLoading ? "Analyzing..." : "Ready"}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNewConversation}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New conversation</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                    <Link href="/admin/settings"><Settings className="h-4 w-4" /></Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>AI Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {messages.length === 0 && !activeConversationId ? (
          <WelcomeState suggestions={suggestions} onSelectSuggestion={(q) => handleSend(q)} disabled={isLoading} />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {isLoadingHistory && (
                <div className="flex justify-center py-12">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading conversation history...
                  </div>
                </div>
              )}

              {messages.map((message) => {
                const isUser = message.role === "user";
                const text = getMessageText(message);

                return (
                  <div key={message.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                    {!isUser && (
                      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-foreground/5 flex items-center justify-center mt-1">
                        <Bot className="h-3.5 w-3.5 text-foreground/60" />
                      </div>
                    )}

                    <div className={`group max-w-[85%] ${isUser ? "order-first" : ""}`}>
                      {isUser ? (
                        <div className="bg-foreground text-background rounded-2xl rounded-br-md px-4 py-2.5">
                          <p className="text-sm leading-relaxed">{text}</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {message.parts.map((part, partIndex) => {
                            if (part.type === "text" && part.text) {
                              return (
                                <div key={partIndex} className="bg-muted/50 rounded-2xl rounded-bl-md px-4 py-3">
                                  <RenderContent text={part.text} />
                                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border/50">
                                    <span className="text-xs text-muted-foreground">{formatTime(new Date())}</span>
                                    <CopyButton text={part.text} />
                                  </div>
                                </div>
                              );
                            }
                            if (part.type === "tool-invocation") {
                              const toolPart = part as any;
                              if (toolPart.state === "output-available") {
                                return (
                                  <ToolResultCard
                                    key={partIndex}
                                    toolName={toolPart.toolInvocation?.toolName || toolPart.toolName || ""}
                                    result={toolPart.toolInvocation?.output || toolPart.output}
                                  />
                                );
                              }
                              if (toolPart.state === "input-available" || toolPart.state === "input-streaming") {
                                return (
                                  <div key={partIndex} className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-1.5 bg-muted/30 rounded-lg">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>Querying {toolPart.toolInvocation?.toolName || toolPart.toolName || "data"}...</span>
                                  </div>
                                );
                              }
                            }
                            return null;
                          })}
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-foreground text-background flex items-center justify-center mt-1">
                        <Users className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-foreground/5 flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-foreground/60" />
                  </div>
                  <div className="bg-muted/50 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Analyzing your question...</span>
                    </div>
                  </div>
                </div>
              )}

              {chatError && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  </div>
                  <div className="bg-destructive/5 border border-destructive/20 rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]">
                    <p className="text-sm text-destructive font-medium mb-1">Something went wrong</p>
                    <p className="text-sm text-destructive/80">{chatError}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs border-destructive/20 text-destructive hover:bg-destructive/10" onClick={() => setChatError(null)}>Dismiss</Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" asChild><Link href="/admin/settings">Configure AI Settings</Link></Button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {messages.length > 0 && messages.length <= 2 && !isLoading && (
          <div className="px-4 pb-2">
            <SuggestionChips questions={suggestions.slice(0, 4)} onSelect={(q) => handleSend(q)} disabled={isLoading} />
          </div>
        )}

        <div className="border-t border-border bg-background p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your organization data..."
                  rows={1}
                  disabled={isLoading}
                  className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 pr-12 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50 placeholder:text-muted-foreground"
                  style={{ maxHeight: "160px" }}
                />
              </div>
              <Button size="icon" className="h-11 w-11 rounded-xl flex-shrink-0" disabled={!input.trim() || isLoading} onClick={() => handleSend()}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">Responses are generated based on your role permissions. Data is scoped to your organization.</p>
          </div>
        </div>
      </div>
    </div>
  );
}