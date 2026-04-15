"use client";

import { memo, useMemo, useState } from "react";
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
    <div
      className={cn(
        "flex gap-3 group",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 border",
          isUser
            ? "bg-primary text-primary-foreground border-primary"
            : message.error
              ? "bg-destructive/10 text-destructive border-destructive/30"
              : "bg-background text-foreground border-border"
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
            "rounded-lg px-3.5 py-2 text-sm break-words",
            isUser
              ? "bg-primary text-primary-foreground whitespace-pre-wrap"
              : message.error
                ? "bg-destructive/10 text-destructive border border-destructive/30"
                : "bg-background border border-border"
          )}
        >
          {isUser ? (
            message.content
          ) : message.content ? (
            <Markdown content={message.content} />
          ) : message.pending ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Thinking…
            </span>
          ) : null}
          {message.pending && message.content && !isUser && (
            <span className="inline-block w-[2px] h-3.5 bg-foreground ml-0.5 align-middle animate-pulse" />
          )}
        </div>

        {!message.pending && message.content && (
          <div
            className={cn(
              "flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity",
              isUser ? "flex-row-reverse" : ""
            )}
          >
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              title="Copy"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied
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
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                title="Regenerate"
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </button>
            )}
            {!isUser && (message.providerName || message.model) && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {message.providerName}
                {message.providerName && message.model && " · "}
                {message.model}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolPill({ event }: { event: ToolEvent }) {
  const running = event.status === "calling";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-background"
      )}
      title={running ? `Calling ${event.name}…` : `Called ${event.name}`}
    >
      {running ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : (
        <CheckCircle2 className="h-2.5 w-2.5 text-foreground" />
      )}
      <Wrench className="h-2.5 w-2.5" />
      <span>{event.name}</span>
    </div>
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
