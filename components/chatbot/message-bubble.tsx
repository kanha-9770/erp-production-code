"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Copy,
  Check,
  RefreshCw,
  Loader2,
  AlertCircle,
  Wrench,
  CheckCircle2,
  Sparkles,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  FileText,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  FileAudio,
  FileVideo,
  ImageIcon,
  File as FileIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import type { LocalMessage, ToolEvent, ChatAttachment, AttachmentKind } from "./types";

function attachmentIcon(kind: AttachmentKind) {
  switch (kind) {
    case "image":
      return ImageIcon;
    case "audio":
      return FileAudio;
    case "video":
      return FileVideo;
    case "spreadsheet":
      return FileSpreadsheet;
    case "code":
      return FileCode;
    case "archive":
      return FileArchive;
    case "document":
      return FileText;
    default:
      return FileIcon;
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function MessageAttachments({ attachments }: { attachments: ChatAttachment[] }) {
  return (
    <div className="flex flex-wrap gap-2 mb-1.5 justify-end">
      {attachments.map((a) => {
        const Icon = attachmentIcon(a.kind);
        const isImage = a.kind === "image";
        const isVideo = a.kind === "video";
        const isAudio = a.kind === "audio";
        if (isImage) {
          return (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-[240px] rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
              title={`${a.name} · ${formatBytes(a.size)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.name} className="block max-h-[200px] object-contain" />
            </a>
          );
        }
        if (isVideo) {
          return (
            <video
              key={a.id}
              src={a.url}
              controls
              className="max-w-[280px] max-h-[200px] rounded-lg border border-border"
              title={`${a.name} · ${formatBytes(a.size)}`}
            />
          );
        }
        if (isAudio) {
          return (
            <div
              key={a.id}
              className="flex flex-col gap-1 rounded-lg border border-border bg-card px-2.5 py-2 max-w-[280px]"
            >
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <FileAudio className="h-3.5 w-3.5" />
                <span className="truncate">{a.name}</span>
              </div>
              <audio src={a.url} controls className="w-full max-w-[260px]" />
            </div>
          );
        }
        return (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12px] max-w-[260px] hover:border-primary/50 transition-colors"
            title={`${a.name} · ${formatBytes(a.size)}`}
          >
            <div className="h-7 w-7 rounded bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{a.name}</div>
              <div className="text-[10.5px] text-muted-foreground/80">
                {formatBytes(a.size)} · {a.kind}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

interface Props {
  message: LocalMessage;
  isLast: boolean;
  isLastUserMessage?: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onEditUserMessage?: (id: string, newContent: string) => void;
  streaming?: boolean;
}

const FEEDBACK_KEY = "chatbot-message-feedback";

function readFeedback(): Record<string, "up" | "down"> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FEEDBACK_KEY);
    return raw ? (JSON.parse(raw) as Record<string, "up" | "down">) : {};
  } catch {
    return {};
  }
}

function writeFeedback(map: Record<string, "up" | "down">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify(map));
  } catch {
    /* storage may be unavailable */
  }
}

function MessageBubbleImpl({
  message,
  isLast,
  isLastUserMessage,
  canRegenerate,
  onRegenerate,
  onEditUserMessage,
  streaming,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const isUser = message.role === "user";

  // Hydrate stored feedback on mount / message change
  useEffect(() => {
    if (isUser) return;
    const map = readFeedback();
    setFeedback(map[message.id] ?? null);
  }, [isUser, message.id]);

  useEffect(() => {
    if (editing) {
      setEditValue(message.content);
      queueMicrotask(() => {
        const el = editRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
        }
      });
    }
  }, [editing, message.content]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const submitEdit = () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === message.content.trim()) {
      setEditing(false);
      return;
    }
    onEditUserMessage?.(message.id, trimmed);
    setEditing(false);
  };

  const setFeedbackValue = (next: "up" | "down") => {
    const map = readFeedback();
    if (map[message.id] === next) {
      delete map[message.id];
      setFeedback(null);
    } else {
      map[message.id] = next;
      setFeedback(next);
    }
    writeFeedback(map);
  };

  // Collapse duplicate tool events ({calling, done} for same name → one pill)
  const toolPills = useMemo(() => {
    if (!message.toolEvents?.length) return [];
    const byName = new Map<string, ToolEvent>();
    for (const ev of message.toolEvents) {
      const prev = byName.get(ev.name);
      if (!prev || ev.status === "done") byName.set(ev.name, ev);
    }
    return Array.from(byName.values());
  }, [message.toolEvents]);

  if (isUser) {
    // User message — subtle warm pill, right-aligned
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="group flex justify-end"
      >
        <div className="flex flex-col items-end max-w-[85%] min-w-0 w-full">
          {editing ? (
            <div className="w-full rounded-2xl border border-primary/40 bg-background p-2 shadow-sm">
              <textarea
                ref={editRef}
                value={editValue}
                onChange={(e) => {
                  setEditValue(e.target.value);
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submitEdit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setEditing(false);
                  }
                }}
                rows={1}
                className="w-full resize-none bg-transparent text-[14.5px] leading-relaxed outline-none px-2 py-1.5 placeholder:text-muted-foreground"
                placeholder="Edit your message…"
              />
              <div className="flex items-center justify-end gap-1 mt-1 pt-1 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-2 py-1 text-[11px] rounded-md text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitEdit}
                  disabled={
                    !editValue.trim() ||
                    editValue.trim() === message.content.trim() ||
                    streaming
                  }
                  className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save & resend
                  <kbd className="ml-1.5 opacity-70 text-[9px] font-mono">
                    ⌘↵
                  </kbd>
                </button>
              </div>
            </div>
          ) : (
            <>
              {message.attachments && message.attachments.length > 0 && (
                <MessageAttachments attachments={message.attachments} />
              )}
              {message.content && (
                <div className="rounded-2xl bg-secondary text-foreground px-4 py-2.5 text-[14.5px] leading-relaxed break-words whitespace-pre-wrap">
                  {message.content}
                </div>
              )}
            </>
          )}
          {!editing && (
            <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {isLastUserMessage && onEditUserMessage && !streaming && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
                  title="Edit message and resend"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={copy}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
                title="Copy"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // Assistant message — plain flowing text with a tiny avatar, Claude-style
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="group flex gap-3"
    >
      <div
        className={cn(
          "h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-1",
          message.error
            ? "bg-destructive/10 text-destructive"
            : "bg-primary/10 text-primary"
        )}
      >
        {message.error ? (
          <AlertCircle className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </div>

      <div className="flex flex-col flex-1 min-w-0 pt-0.5">
        {/* Tool-call pills */}
        {toolPills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {toolPills.map((ev) => (
              <ToolPill key={ev.name} event={ev} />
            ))}
          </div>
        )}

        <div
          className={cn(
            "text-[14.5px] leading-relaxed break-words text-foreground/95",
            message.error && "text-destructive"
          )}
        >
          {message.content ? (
            <Markdown content={message.content} pending={message.pending} />
          ) : message.pending ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-[pulse_1.2s_ease-in-out_infinite]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-[pulse_1.2s_ease-in-out_0.2s_infinite]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-[pulse_1.2s_ease-in-out_0.4s_infinite]" />
              </span>
            </span>
          ) : null}
          {message.pending && message.content && (
            <span className="inline-block w-[2px] h-3.5 bg-primary ml-0.5 align-middle animate-pulse" />
          )}
        </div>

        {!message.pending && message.content && (
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-1 rounded-md hover:bg-muted transition-colors"
              title="Copy"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Copied
                  </span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>
            {canRegenerate && isLast && (
              <button
                type="button"
                onClick={onRegenerate}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-1 rounded-md hover:bg-muted transition-colors"
                title="Regenerate"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            )}
            {!message.error && (
              <>
                <button
                  type="button"
                  onClick={() => setFeedbackValue("up")}
                  className={cn(
                    "flex items-center gap-1 text-[11px] px-1.5 py-1 rounded-md transition-colors",
                    feedback === "up"
                      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  title="Good response"
                  aria-pressed={feedback === "up"}
                >
                  <ThumbsUp
                    className={cn(
                      "h-3 w-3",
                      feedback === "up" && "fill-current"
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackValue("down")}
                  className={cn(
                    "flex items-center gap-1 text-[11px] px-1.5 py-1 rounded-md transition-colors",
                    feedback === "down"
                      ? "text-rose-600 dark:text-rose-400 bg-rose-500/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  title="Bad response"
                  aria-pressed={feedback === "down"}
                >
                  <ThumbsDown
                    className={cn(
                      "h-3 w-3",
                      feedback === "down" && "fill-current"
                    )}
                  />
                </button>
              </>
            )}
            {(message.providerName || message.model) && (
              <span className="ml-auto text-[10px] text-muted-foreground/70 font-mono">
                {message.providerName}
                {message.providerName && message.model && " · "}
                {message.model}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ToolPill({ event }: { event: ToolEvent }) {
  const running = event.status === "calling";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 3 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10.5px] font-mono overflow-hidden",
        running
          ? "border-primary/30 bg-primary/5 text-primary"
          : "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      )}
      title={running ? `Calling ${event.name}…` : `Called ${event.name}`}
    >
      {running && (
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/20 to-transparent animate-shimmer" />
      )}
      <span className="relative flex items-center gap-1.5">
        {running ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-2.5 w-2.5" />
        )}
        <Wrench className="h-2.5 w-2.5" />
        <span>{event.name}</span>
      </span>
    </motion.div>
  );
}

const MessageBubble = memo(MessageBubbleImpl, (prev, next) => {
  return (
    prev.message === next.message &&
    prev.isLast === next.isLast &&
    prev.isLastUserMessage === next.isLastUserMessage &&
    prev.canRegenerate === next.canRegenerate &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onEditUserMessage === next.onEditUserMessage &&
    prev.streaming === next.streaming
  );
});

export default MessageBubble;
