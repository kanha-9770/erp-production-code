"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  MessageSquare,
  Trash2,
  Pin,
  PinOff,
  Pencil,
  Check,
  X,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "./types";

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 256;
const STORAGE_KEY = "chatbot-sidebar-width";

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, isPinned: boolean) => void;
}

const BUCKET_ORDER = [
  "Pinned",
  "Today",
  "Yesterday",
  "Last 7 days",
  "Last 30 days",
  "Older",
] as const;

type BucketName = (typeof BUCKET_ORDER)[number];

function dateBucket(iso: string): Exclude<BucketName, "Pinned"> {
  const d = new Date(iso);
  const now = new Date();
  const dayMs = 86_400_000;
  const diff = now.getTime() - d.getTime();

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";
  if (diff < 7 * dayMs) return "Last 7 days";
  if (diff < 30 * dayMs) return "Last 30 days";
  return "Older";
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString();
}

export default function ConversationSidebar({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onTogglePin,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [query, setQuery] = useState("");

  // ── Resizable width with localStorage persistence ─────────────────────
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);

  // Load persisted width on mount (client-only to avoid SSR hydration mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const n = parseInt(stored, 10);
        if (Number.isFinite(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) {
          setWidth(n);
        }
      }
    } catch {
      /* localStorage may be unavailable */
    }
  }, []);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartRef.current = { x: e.clientX, width };
      setDragging(true);
    },
    [width]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const delta = e.clientX - start.x;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, start.width + delta));
      setWidth(next);
    };
    const onUp = () => {
      setDragging(false);
      dragStartRef.current = null;
      try {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        localStorage.setItem(STORAGE_KEY, String(width));
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    // Disable text selection + show resize cursor while dragging
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
    // `width` is intentionally not in deps — we read it via closure in onUp,
    // and including it would rebind the move listener on every drag frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  // Persist width whenever the drag ends (above) and on any programmatic change
  useEffect(() => {
    if (dragging) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, [width, dragging]);

  const startEdit = (c: ConversationSummary) => {
    setEditingId(c.id);
    setEditValue(c.title);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };
  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    cancelEdit();
  };

  const buckets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? conversations.filter((c) => c.title.toLowerCase().includes(q))
      : conversations;

    const map = new Map<BucketName, ConversationSummary[]>();
    for (const c of filtered) {
      const key: BucketName = c.isPinned ? "Pinned" : dateBucket(c.updatedAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    // Sort each bucket by updatedAt desc (pinned keeps original order — already sorted by parent)
    for (const [k, list] of map) {
      list.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      map.set(k, list);
    }
    return BUCKET_ORDER.filter((k) => (map.get(k)?.length ?? 0) > 0).map(
      (k) => ({ name: k, items: map.get(k)! })
    );
  }, [conversations, query]);

  const totalVisible = buckets.reduce((n, b) => n + b.items.length, 0);

  return (
    <aside
      className="relative flex flex-col border-r bg-background shrink-0 h-full"
      style={{ width: `${width}px` }}
    >
      {/* Drag handle — 6px hit area on the right edge */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={handleResizeMouseDown}
        onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
        className={cn(
          "absolute top-0 right-0 h-full w-1.5 -mr-0.5 cursor-col-resize z-10 group",
          "hover:bg-primary/20",
          dragging && "bg-primary/40"
        )}
        title="Drag to resize · double-click to reset"
      >
        <div
          className={cn(
            "absolute top-1/2 right-0 -translate-y-1/2 w-0.5 h-8 rounded-full transition-colors",
            dragging
              ? "bg-primary"
              : "bg-transparent group-hover:bg-primary/60"
          )}
        />
      </div>
      <div className="p-3 border-b space-y-2">
        <Button onClick={onNew} size="sm" className="w-full justify-start">
          <Plus className="h-4 w-4 mr-2" />
          New chat
        </Button>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="h-8 pl-7 text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : totalVisible === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {query ? (
              <>No conversations match &quot;{query}&quot;.</>
            ) : (
              <>
                No conversations yet.
                <br />
                Start a new chat.
              </>
            )}
          </div>
        ) : (
          <div className="p-1.5 space-y-3">
            {buckets.map((bucket) => (
              <div key={bucket.name}>
                <div className="px-2 pt-1 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  {bucket.name === "Pinned" && (
                    <Pin className="h-2.5 w-2.5 text-primary" />
                  )}
                  {bucket.name}
                  <span className="text-muted-foreground/50">
                    · {bucket.items.length}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {bucket.items.map((c) => {
                    const isActive = c.id === activeId;
                    const isEditing = editingId === c.id;
                    return (
                      <li key={c.id}>
                        <div
                          className={cn(
                            "group relative flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer transition-colors",
                            isActive
                              ? "bg-muted"
                              : "hover:bg-muted/60"
                          )}
                          onClick={() => !isEditing && onSelect(c.id)}
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-primary" />
                          )}
                          <MessageSquare
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              isActive
                                ? "text-foreground"
                                : "text-muted-foreground"
                            )}
                          />
                          {isEditing ? (
                            <div
                              className="flex-1 flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitEdit();
                                  else if (e.key === "Escape") cancelEdit();
                                }}
                                className="h-6 text-xs px-1.5"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={commitEdit}
                                className="p-0.5 hover:text-primary"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="p-0.5 hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0">
                                <div
                                  className={cn(
                                    "text-xs truncate",
                                    isActive
                                      ? "font-medium text-foreground"
                                      : "text-foreground/90"
                                  )}
                                >
                                  {c.title}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {c.messageCount} msg · {timeAgo(c.updatedAt)}
                                </div>
                              </div>
                              <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 bg-background/80 backdrop-blur-sm rounded px-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onTogglePin(c.id, !c.isPinned);
                                  }}
                                  className="p-0.5 hover:text-primary"
                                  title={c.isPinned ? "Unpin" : "Pin"}
                                >
                                  {c.isPinned ? (
                                    <PinOff className="h-3 w-3" />
                                  ) : (
                                    <Pin className="h-3 w-3" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEdit(c);
                                  }}
                                  className="p-0.5 hover:text-primary"
                                  title="Rename"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(c.id);
                                  }}
                                  className="p-0.5 hover:text-destructive"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
