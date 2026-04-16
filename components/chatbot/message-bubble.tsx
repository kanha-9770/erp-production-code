"use client";

import { memo, useMemo, useState } from "react";
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
        <div className="flex flex-col items-end max-w-[85%] min-w-0">
          <div className="rounded-2xl bg-secondary text-foreground px-4 py-2.5 text-[14.5px] leading-relaxed break-words whitespace-pre-wrap">
            {message.content}
          </div>
          <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
    prev.canRegenerate === next.canRegenerate &&
    prev.onRegenerate === next.onRegenerate
  );
});

export default MessageBubble;
