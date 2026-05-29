"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Pin,
  PinOff,
  Pencil,
  Check,
  X,
  Loader2,
  Search,
  MoreHorizontal,
  MessageSquareText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "./types";

const MIN_WIDTH = 180;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 220;
const STORAGE_KEY = "chatbot-sidebar-width-v2";

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, isPinned: boolean) => void;
  // When true (viewport < md), the sidebar renders as a fixed-position
  // slide-over drawer instead of an inline column. The resize handle is
  // hidden in this mode and a close button replaces it.
  isMobile?: boolean;
  onCloseMobile?: () => void;
}

const BUCKET_ORDER = [
  "Starred",
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Previous 30 days",
  "Older",
] as const;

type BucketName = (typeof BUCKET_ORDER)[number];

const DAY_MS = 86_400_000;

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateBucket(
  iso: string,
  now: Date,
  yesterday: Date,
  nowMs: number
): Exclude<BucketName, "Starred"> {
  const d = new Date(iso);
  const diff = nowMs - d.getTime();

  if (sameDay(d, now)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  if (diff < 7 * DAY_MS) return "Previous 7 days";
  if (diff < 30 * DAY_MS) return "Previous 30 days";
  return "Older";
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
  isMobile = false,
  onCloseMobile,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [query, setQuery] = useState("");

  // ── Resizable width with localStorage persistence ─────────────────────
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);

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
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
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
  }, [dragging]);

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

    // Snapshot "now" once per memo run so bucket assignment and the sort
    // key share a single time reference (also avoids N `new Date()` allocs).
    const now = new Date();
    const nowMs = now.getTime();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    // Pre-parse updatedAt once per row; reuse for both bucketing and sort.
    type Decorated = { c: ConversationSummary; ms: number; bucket: BucketName };
    const decorated: Decorated[] = filtered.map((c) => ({
      c,
      ms: new Date(c.updatedAt).getTime(),
      bucket: c.isPinned ? "Starred" : dateBucket(c.updatedAt, now, yesterday, nowMs),
    }));

    const map = new Map<BucketName, Decorated[]>();
    for (const d of decorated) {
      let list = map.get(d.bucket);
      if (!list) {
        list = [];
        map.set(d.bucket, list);
      }
      list.push(d);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.ms - a.ms);
    }
    return BUCKET_ORDER.filter((k) => (map.get(k)?.length ?? 0) > 0).map(
      (k) => ({ name: k, items: map.get(k)!.map((d) => d.c) })
    );
  }, [conversations, query]);

  const totalVisible = buckets.reduce((n, b) => n + b.items.length, 0);

  return (
    <aside
      className={cn(
        "flex flex-col text-foreground h-full border-r border-border/70",
        "bg-gradient-to-b from-muted/70 via-muted/40 to-muted/70 backdrop-blur-xl",
        // Solid fallback layer behind the gradient so nothing ever bleeds
        "[--sidebar-solid:hsl(var(--muted))] before:absolute before:inset-0 before:-z-10 before:bg-[var(--sidebar-solid)]",
        "relative",
        isMobile
          ? "fixed inset-y-0 left-0 z-40 w-[80vw] max-w-[260px] shadow-2xl shrink-0"
          : "shrink-0"
      )}
      style={!isMobile ? { width: `${width}px` } : undefined}
    >
      {/* Resize handle — desktop only; the drawer can't be resized on mobile. */}
      {!isMobile && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onMouseDown={handleResizeMouseDown}
          onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
          className={cn(
            "absolute top-0 right-0 h-full w-1 -mr-0.5 cursor-col-resize z-10 transition-colors",
            "hover:bg-primary/30",
            dragging && "bg-primary/50"
          )}
          title="Drag to resize · double-click to reset"
        />
      )}

      {/* Brand row */}
      <div className="px-3 pt-4 pb-3 flex items-center gap-2.5">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-xl bg-primary/30 blur-md" />
          <div className="relative h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md shadow-primary/20">
            <MessageSquareText className="h-4 w-4 text-primary-foreground" />
          </div>
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="text-[13px] font-semibold tracking-tight text-foreground">
            Assistant
          </div>
          <div className="text-[10.5px] text-muted-foreground/80 font-medium uppercase tracking-wider">
            Analytics
          </div>
        </div>
        {isMobile && onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* New chat */}
      <div className="px-3 pt-1 pb-3">
        <Button
          onClick={onNew}
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-start h-9 px-2.5 rounded-xl font-medium transition-all",
            "bg-background/90 hover:bg-background text-foreground",
            "border border-border/60 hover:border-primary/40",
            "shadow-sm hover:shadow-md hover:shadow-primary/5"
          )}
        >
          <Plus className="h-4 w-4 mr-2 text-primary" />
          New chat
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="h-8 pl-8 pr-7 text-[13px] rounded-lg bg-background/70 border-border/50 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40 placeholder:text-muted-foreground/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-background transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto claude-scroll px-2">
        {loading && conversations.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : totalVisible === 0 ? (
          <div className="px-3 py-10 text-center text-[12px] text-muted-foreground">
            {query ? (
              <>No chats match &quot;{query}&quot;</>
            ) : (
              <>
                No chats yet.
                <br />
                Start a new conversation.
              </>
            )}
          </div>
        ) : (
          <div className="pb-4">
            {buckets.map((bucket) => (
              <div key={bucket.name} className="mt-4 first:mt-2">
                <div className="px-2.5 pb-1.5 text-[10.5px] font-semibold text-muted-foreground/70 tracking-[0.08em] uppercase">
                  {bucket.name}
                </div>
                <ul className="space-y-0.5">
                  {bucket.items.map((c) => {
                    const isActive = c.id === activeId;
                    const isEditing = editingId === c.id;
                    return (
                      <li key={c.id}>
                        <div
                          className={cn(
                            "group relative flex items-center rounded-lg h-9 pl-2.5 pr-1 cursor-pointer transition-all",
                            isActive
                              ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                              : "text-foreground/80 hover:bg-background/60 hover:text-foreground"
                          )}
                          onClick={() => !isEditing && onSelect(c.id)}
                        >
                          {isActive && (
                            <span
                              aria-hidden
                              className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-r-full bg-primary"
                            />
                          )}
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
                                className="h-6 text-[13px] px-1.5"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={commitEdit}
                                className="p-1 rounded hover:bg-background text-muted-foreground hover:text-primary"
                                aria-label="Save"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="p-1 rounded hover:bg-background text-muted-foreground hover:text-destructive"
                                aria-label="Cancel"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                {c.isPinned && (
                                  <Pin className="h-3 w-3 text-muted-foreground/80 shrink-0 fill-current" />
                                )}
                                <span
                                  className={cn(
                                    "truncate text-[13px] leading-tight",
                                    isActive ? "font-medium" : "font-normal"
                                  )}
                                >
                                  {c.title}
                                </span>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    className={cn(
                                      "shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all",
                                      "opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100",
                                      isActive && "opacity-100"
                                    )}
                                    aria-label="Chat options"
                                  >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-44"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onTogglePin(c.id, !c.isPinned);
                                    }}
                                  >
                                    {c.isPinned ? (
                                      <>
                                        <PinOff className="h-3.5 w-3.5 mr-2" />
                                        Unstar
                                      </>
                                    ) : (
                                      <>
                                        <Pin className="h-3.5 w-3.5 mr-2" />
                                        Star
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(c);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5 mr-2" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDelete(c.id);
                                    }}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
