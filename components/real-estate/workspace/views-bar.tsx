"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Bookmark, BookmarkPlus, Plus, Trash2, Pencil } from "lucide-react";
import type { SavedView } from "./saved-views";

/**
 * Strip of saved-view tabs. The leftmost is always "All" (= no view applied);
 * the rest come from `views`. Plus button opens a tiny popover to name a new
 * view from the current filters.
 *
 * The page owns the filters state — this component only reads/writes through
 * the callbacks. Keep that contract intact so persistence stays in one place.
 */

interface ViewsBarProps<F extends object> {
  views: SavedView<F>[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  /** Save a new view from the current filters. */
  onSave: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** Whether current filters differ from the active view (or from defaults). */
  isDirty?: boolean;
  /** Optional: shown when the user has unsaved filter changes. */
  onSaveOver?: () => void;
}

export function ViewsBar<F extends object>({
  views,
  activeId,
  onSelect,
  onSave,
  onRename,
  onDelete,
  isDirty,
  onSaveOver,
}: ViewsBarProps<F>) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
      <ViewTab
        active={activeId === null}
        onClick={() => onSelect(null)}
        label="All"
      />
      {views.map((v) => (
        <ViewTab
          key={v.id}
          active={activeId === v.id}
          onClick={() => onSelect(v.id)}
          label={v.name}
          onRename={(name) => onRename(v.id, name)}
          onDelete={() => onDelete(v.id)}
        />
      ))}
      <SavePopover onSave={onSave} />
      {isDirty && activeId !== null && onSaveOver && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSaveOver}
          className="h-7 text-xs text-amber-600 hover:text-amber-700"
        >
          • Unsaved
        </Button>
      )}
    </div>
  );
}

function ViewTab({
  active,
  label,
  onClick,
  onRename,
  onDelete,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);
  const isCustom = !!onRename;

  const submitRename = () => {
    const next = editValue.trim();
    if (next && next !== label) onRename?.(next);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "h-7 px-2.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 border transition-colors shrink-0",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-background hover:bg-accent border-border",
      )}
    >
      {isCustom && active && <Bookmark className="h-3 w-3 fill-current" />}
      {editing ? (
        <Input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename();
            if (e.key === "Escape") {
              setEditValue(label);
              setEditing(false);
            }
          }}
          className="h-5 px-1 text-xs w-24 border-0 bg-transparent focus-visible:ring-0"
        />
      ) : (
        <button type="button" onClick={onClick} className="select-none">
          {label}
        </button>
      )}
      {isCustom && active && !editing && (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="hover:bg-foreground/10 rounded-full p-0.5"
            aria-label="Rename view"
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="hover:bg-foreground/10 rounded-full p-0.5"
            aria-label="Delete view"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </>
      )}
    </div>
  );
}

function SavePopover({ onSave }: { onSave: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title="Save current filters as a view"
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-2">
          <div className="text-xs font-medium">Save view</div>
          <p className="text-[11px] text-muted-foreground">
            Captures your current filters. Column visibility/sort is shared
            across all views.
          </p>
          <Input
            autoFocus
            placeholder="e.g. Hot leads, BKC commercial"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={!name.trim()}>
              <Plus className="h-3 w-3 mr-1" /> Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
