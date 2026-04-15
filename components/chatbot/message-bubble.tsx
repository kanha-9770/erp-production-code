"use client";

import { memo, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  User,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  AlertCircle,
  Wrench,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import type { LocalMessage, ToolEvent } from "./types";

interface Props {
  message: LocalMessage;
  isLast: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
}

function MessageBubbleImpl({
  message,
  isLast,
  canRegenerate,
  onRegenerate,
}: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  // Collapse duplicate tool events ({calling, done} for same name → one pill)
  const toolPills = useMemo(() => {
    if (!message.toolEvents?.length) return [];
    const byName = new Map<string, ToolEvent>();
    for (const ev of message.toolEvents) {
      const prev = byName.get(ev.name);
      // "done" overrides "calling"; if we only have "calling", keep it
      if (!prev || ev.status === "done") byName.set(ev.name, ev);
    }
    return Array.from(byName.values());
  }, [message.toolEvents]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex gap-3 group",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border shadow-sm transition-all",
          isUser
            ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-primary/40 shadow-primary/20"
            : message.error
              ? "bg-destructive/10 text-destructive border-destructive/30"
              : "bg-gradient-to-br from-background to-muted/50 text-foreground border-border"
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : message.error ? (
          <AlertCircle className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-primary" />
        )}
      </div>

      <div className={cn("flex flex-col max-w-[85%] min-w-0", isUser && "items-end")}>
        {/* Tool-call pills (assistant only) */}
        {!isUser && toolPills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {toolPills.map((ev) => (
              <ToolPill key={ev.name} event={ev} />
            ))}
          </div>
        )}

        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm break-words shadow-sm transition-shadow",
            isUser
              ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground whitespace-pre-wrap rounded-tr-md shadow-primary/10"
              : message.error
                ? "bg-destructive/10 text-destructive border border-destructive/30 rounded-tl-md"
                : "bg-background border border-border/70 rounded-tl-md hover:shadow-md hover:border-border"
          )}
        >
          {isUser ? (
            message.content
          ) : message.content ? (
            <Markdown content={message.content} pending={message.pending} />
          ) : message.pending ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-[pulse_1.2s_ease-in-out_infinite]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-[pulse_1.2s_ease-in-out_0.2s_infinite]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-[pulse_1.2s_ease-in-out_0.4s_infinite]" />
              </span>
              <span className="text-xs">Thinking…</span>
            </span>
          ) : null}
          {message.pending && message.content && !isUser && (
            <span className="inline-block w-[2px] h-3.5 bg-primary ml-0.5 align-middle animate-pulse" />
          )}
        </div>

        {!message.pending && message.content && (
          <div
            className={cn(
              "flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
              isUser ? "flex-row-reverse" : ""
            )}
          >
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/60 transition-all"
              title="Copy"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">
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
            {!isUser && canRegenerate && isLast && (
              <button
                type="button"
                onClick={onRegenerate}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/60 transition-all"
                title="Regenerate"
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </button>
            )}
            {!isUser && (message.providerName || message.model) && (
              <span className="text-[10px] text-muted-foreground/80 font-mono">
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
      initial={{ opacity: 0, scale: 0.9, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-mono overflow-hidden",
        running
          ? "border-primary/40 bg-primary/5 text-primary"
          : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      )}
      title={running ? `Calling ${event.name}…` : `Called ${event.name}`}
    >
      {running && (
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/25 to-transparent animate-shimmer" />
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
    prev.canRegenerate === next.canRegenerate &&
    prev.onRegenerate === next.onRegenerate
  );
});

export default MessageBubble;
