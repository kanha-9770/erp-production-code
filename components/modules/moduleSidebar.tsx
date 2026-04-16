"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  MeasuringStrategy,
  type DragEndEvent,
  type DragStartEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";

/**
 * Noop sorting strategy: returns null for every item so SortableContext does
 * NOT visually shift rows during a drag. We render our own crisp drop
 * indicator line instead. This is the single biggest UX win — without it,
 * rows oscillate under the cursor and "drop inside" detection feels wobbly.
 */
const noShiftStrategy = () => null;

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  ArrowUpDown,
  ArrowDownAZ,
  ArrowUpAZ,
  Move,
  FileText,
  FolderPlus,
  Edit,
  GripVertical,
  LayoutDashboard,
  ChevronRight,
  ChevronDown,
  Undo2,
  Redo2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Form {
  id: string;
  name: string;
  isPublished: boolean;
}

interface Module {
  id: string;
  name: string;
  parentId: string | null;
  children?: Module[];
  forms?: Form[];
}

type SortOrder = "manual" | "asc" | "desc";

/**
 * One entry in the sidebar's reorder history. Each successful drag-drop
 * captures both where the module came from and where it ended up, so we
 * can replay the move forward (redo) or in reverse (undo) by calling the
 * existing onReorderModule API.
 *
 * `fromIndex` is the module's index in its original parent's children
 * array (with itself still present). `toIndex` is the index passed to
 * onReorderModule when the action was performed (i.e. index in the
 * post-removal sibling array). Both forms are valid inputs to the
 * optimistic reorder hook because that hook always removes the module
 * first, then inserts at the requested index.
 */
interface ReorderHistoryEntry {
  moduleId: string;
  fromParentId: string | null;
  fromIndex: number;
  toParentId: string | null;
  toIndex: number;
}

interface ModuleSidebarProps {
  filteredModules: Module[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortOrder: SortOrder;
  setSortOrder: (o: SortOrder) => void;
  selectedModule: Module | null;
  setSelectedModule: (m: Module | null) => void;
  setSelectedForm: (f: Form | null) => void;
  openSubmoduleDialog: (m: Module) => void;
  openEditDialog: (m: Module) => void;
  onMoveForm: (formId: string, targetModuleId: string | null) => Promise<void>;
  onMoveModule: (moduleId: string, newParentId: string | null) => Promise<void>;
  onReorderModule: (
    moduleId: string,
    newParentId: string | null,
    newIndex: number
  ) => Promise<void>;
}

// ── Tree helpers ─────────────────────────────────────────────────────────────

interface FlatNode {
  id: string;
  parentId: string | null;
  depth: number;
  module: Module;
}

type ParentSortMode = "asc" | "desc";

/**
 * Flatten the visible tree (respecting expanded state) into a list.
 *
 * `parentSortOverrides` lets each parent module override the order of its
 * direct children with an alphabetical sort. Children whose parent has no
 * override are kept in the order they came from the server / global sort.
 */
function flattenVisible(
  modules: Module[],
  expanded: Set<string>,
  parentSortOverrides: Map<string, ParentSortMode>,
  parentId: string | null = null,
  depth = 0,
  out: FlatNode[] = []
): FlatNode[] {
  // Apply this level's override (if any). The root level (parentId === null)
  // is never overridden — that's controlled by the global sort.
  let levelItems = modules;
  if (parentId !== null) {
    const override = parentSortOverrides.get(parentId);
    if (override) {
      levelItems = [...modules].sort((a, b) =>
        override === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name)
      );
    }
  }

  for (const m of levelItems) {
    out.push({ id: m.id, parentId, depth, module: m });
    if (expanded.has(m.id) && m.children?.length) {
      flattenVisible(
        m.children,
        expanded,
        parentSortOverrides,
        m.id,
        depth + 1,
        out
      );
    }
  }
  return out;
}

/** Find a module anywhere in the tree. */
function findModule(modules: Module[], id: string): Module | null {
  for (const m of modules) {
    if (m.id === id) return m;
    if (m.children?.length) {
      const f = findModule(m.children, id);
      if (f) return f;
    }
  }
  return null;
}

/** Get the children list of `parentId` (or root list if null). */
function getSiblings(modules: Module[], parentId: string | null): Module[] {
  if (parentId === null) return modules;
  const parent = findModule(modules, parentId);
  return parent?.children ?? [];
}

/** True if `targetId` is a descendant of `ancestorId` (cycle prevention). */
function isDescendant(
  modules: Module[],
  ancestorId: string,
  targetId: string
): boolean {
  const ancestor = findModule(modules, ancestorId);
  if (!ancestor?.children?.length) return false;
  for (const c of ancestor.children) {
    if (c.id === targetId) return true;
    if (isDescendant(modules, c.id, targetId)) return true;
  }
  return false;
}

// ── Sortable row component ───────────────────────────────────────────────────

interface SortableRowProps {
  node: FlatNode;
  isExpanded: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onAddSub: () => void;
  onEdit: () => void;
  // Per-parent sort cycle (only meaningful when hasChildren is true)
  sortMode: ParentSortMode | null;
  onCycleSort: () => void;
  // drop visualization
  dropPosition: "above" | "inside" | "below" | null;
}

function SortableRow({
  node,
  isExpanded,
  isSelected,
  hasChildren,
  onToggle,
  onSelect,
  onAddSub,
  onEdit,
  sortMode,
  onCycleSort,
  dropPosition,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: node.id,
  });

  // Intentionally NOT applying `transform` / `transition` from useSortable.
  // Our `noShiftStrategy` keeps non-active rows in place, and the active
  // row is represented by the floating DragOverlay — so the original row
  // should sit perfectly still (just dimmed) while being dragged. This
  // eliminates all row-shift jitter that made the old experience wobbly.
  const style: React.CSSProperties = {
    paddingLeft: `${node.depth * 16 + 4}px`,
  };

  return (
    // Outer container — owns the indentation and stacks the row card + the
    // (optional) forms list vertically. It does NOT carry setNodeRef any
    // more, otherwise dnd-kit would measure both the row AND the forms
    // list as one giant droppable rect — which broke "inside / above /
    // below" detection on every parent module that had forms expanded.
    <div style={style}>
      {/* Row-card wrapper. Holds the drop indicators positioned relative
          to the card so they always sit at the card's exact top/bottom
          edges, regardless of whether forms are rendered below. */}
      <div className="relative my-0.5">
        {/* ABOVE drop indicator — thick glowing bar with a leading dot.
            The dot anchors the line so the user instantly knows "this is
            a drop target", not a divider. */}
        {dropPosition === "above" && (
          <div className="absolute left-2 right-2 -top-[3px] h-[4px] z-30 pointer-events-none">
            <div className="absolute inset-0 bg-blue-500 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.85)]" />
            <div className="absolute -left-[2px] top-1/2 -translate-y-1/2 h-[10px] w-[10px] rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.85)] ring-2 ring-white" />
          </div>
        )}
        {/* BELOW drop indicator */}
        {dropPosition === "below" && (
          <div className="absolute left-2 right-2 -bottom-[3px] h-[4px] z-30 pointer-events-none">
            <div className="absolute inset-0 bg-blue-500 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.85)]" />
            <div className="absolute -left-[2px] top-1/2 -translate-y-1/2 h-[10px] w-[10px] rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.85)] ring-2 ring-white" />
          </div>
        )}

        {/* THIS is the dnd-kit droppable. Its rect is exactly the row
            card (≈40px tall) — never inflated by the forms list — so the
            cursor-Y / rect-height math in handleDragMove always lines up
            with what the user sees. This single change is what fixes
            nested-module drag-and-drop. */}
        <div
          ref={setNodeRef}
          className={`
          group mx-2 rounded-md transition-all duration-150
          ${isDragging ? "opacity-30 saturate-50" : ""}
          ${
            isSelected && dropPosition !== "inside"
              ? "bg-blue-50 border border-blue-200"
              : "border border-transparent hover:bg-gray-50"
          }
          ${
            dropPosition === "inside"
              ? "ring-[3px] ring-emerald-500 ring-offset-1 bg-emerald-50 shadow-lg shadow-emerald-200/60 scale-[1.015]"
              : ""
          }
        `}
        >
        <div className="flex items-center min-h-[40px] gap-1">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="p-1.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600 touch-none"
            aria-label="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          {/* Expand/collapse chevron */}
          <button
            type="button"
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) onToggle();
            }}
            disabled={!hasChildren}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )
            ) : (
              <span className="inline-block w-3.5 h-3.5" />
            )}
          </button>

          {/* Module name (click to select) */}
          <button
            type="button"
            onClick={onSelect}
            className="flex-1 min-w-0 flex items-center gap-2 py-1.5 pr-1 text-left"
          >
            <LayoutDashboard
              className={`h-4 w-4 flex-shrink-0 ${
                isSelected ? "text-blue-600" : "text-gray-400"
              }`}
            />
            <span
              className={`text-[12px] font-bold tracking-wide truncate ${
                isSelected ? "text-blue-900" : "text-gray-700"
              }`}
            >
              {node.module.name.toUpperCase()}
            </span>
          </button>

          {/* "Drop inside" hint badge — only visible while a drag is hovering
              the middle of this row. Tells the user exactly what will happen. */}
          {dropPosition === "inside" && (
            <div className="flex items-center gap-1 mr-2 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold tracking-wide shadow-sm pointer-events-none">
              <FolderPlus className="h-3 w-3" />
              DROP INSIDE
            </div>
          )}

          {/* Per-parent sort cycle button.
              - Only rendered for parent modules (those with children).
              - Always visible (not hover-only) when an override is ACTIVE so
                the user can see at a glance which parents are auto-sorted.
              - Faded and hover-revealed otherwise. */}
          {hasChildren && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 transition-opacity ${
                sortMode
                  ? "opacity-100 text-blue-600 hover:text-blue-700 hover:bg-white"
                  : "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 hover:bg-white"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onCycleSort();
              }}
              title={
                sortMode === "asc"
                  ? "Children sorted A → Z (click for Z → A)"
                  : sortMode === "desc"
                  ? "Children sorted Z → A (click to clear)"
                  : "Sort children A → Z"
              }
              aria-label="Sort children"
            >
              {sortMode === "asc" ? (
                <ArrowDownAZ className="h-3.5 w-3.5" />
              ) : sortMode === "desc" ? (
                <ArrowUpAZ className="h-3.5 w-3.5" />
              ) : (
                <ArrowUpDown className="h-3.5 w-3.5" />
              )}
            </Button>
          )}

          {/* Hover actions */}
          <div className="flex gap-0.5 pr-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-white hover:text-blue-600"
              onClick={(e) => {
                e.stopPropagation();
                onAddSub();
              }}
              title="Add submodule"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-white hover:text-blue-600"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="Edit module"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {/* end of row card */}
        </div>
      </div>
      {/* Forms list — read-only here, full editing in main pane.
          Lives OUTSIDE the dnd-kit setNodeRef element so it never
          inflates the row's hit-test rect. Slight ml bump (10 vs 8)
          compensates for the missing card mx-2. */}
      {isExpanded && node.module.forms && node.module.forms.length > 0 && (
        <div className="ml-10 pl-2 pb-2 border-l border-gray-100 space-y-0.5">
          {node.module.forms.map((form) => (
            <div
              key={form.id}
              className="flex items-center gap-2 px-2 py-1 text-[11px] rounded hover:bg-white"
            >
              <FileText
                className={`h-3 w-3 flex-shrink-0 ${
                  form.isPublished ? "text-green-500" : "text-amber-500"
                }`}
              />
              <span className="truncate font-semibold text-gray-600 tracking-wide">
                {form.name.toUpperCase()}
              </span>
              {form.isPublished && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-green-500" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main sidebar ─────────────────────────────────────────────────────────────

export default function ModuleSidebar({
  filteredModules,
  searchQuery,
  setSearchQuery,
  sortOrder,
  setSortOrder,
  selectedModule,
  setSelectedModule,
  setSelectedForm,
  openSubmoduleDialog,
  openEditDialog,
  onReorderModule,
}: ModuleSidebarProps) {
  // Resize state
  const [width, setWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Expanded modules
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Per-parent sort overrides (parentId → "asc" | "desc"). When set for a
  // parent, that parent's direct children are alphabetized in the sidebar
  // regardless of the global sort or stored sortOrder. Cleared automatically
  // when the user drags inside an overridden parent.
  const [parentSortOverrides, setParentSortOverrides] = useState<
    Map<string, ParentSortMode>
  >(new Map());

  const cycleParentSort = useCallback((parentId: string) => {
    setParentSortOverrides((prev) => {
      const next = new Map(prev);
      const cur = next.get(parentId);
      if (cur === undefined) next.set(parentId, "asc");
      else if (cur === "asc") next.set(parentId, "desc");
      else next.delete(parentId);
      return next;
    });
  }, []);

  // ── Undo / Redo history ────────────────────────────────────────────────────
  //
  // Single source of truth for the reorder history. `index` points at the
  // last applied entry — so undo replays history[index] in reverse and then
  // decrements; redo increments and replays history[index] forward. New
  // user actions truncate any "future" entries past `index` (the standard
  // editor undo model).
  const [historyState, setHistoryState] = useState<{
    stack: ReorderHistoryEntry[];
    index: number;
  }>({ stack: [], index: -1 });

  // We need the LATEST historyState inside async undo/redo (which call
  // onReorderModule and may be invoked rapidly via keyboard). A ref keeps
  // the read in sync without making the callbacks change identity on every
  // history mutation, which would otherwise cause the keyboard listener
  // effect to re-bind constantly.
  const historyStateRef = useRef(historyState);
  historyStateRef.current = historyState;

  // Toast helper for user-visible feedback on undo/redo actions. Without
  // this, a successful undo is silent and users can't tell whether the
  // keyboard shortcut fired (the common cause of "undo/redo not working"
  // reports).
  const { toast } = useToast();

  // Shift-held tracker — while a drag is in progress and Shift is held,
  // the "inside" (nest) zone expands to cover almost the entire row so
  // deliberate nesting is trivial. Without Shift, the narrower default zone
  // prevents accidental nesting when the user just wants to reorder.
  const shiftHeldRef = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeldRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeldRef.current = false;
    };
    const blur = () => {
      shiftHeldRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const canUndo = historyState.index >= 0;
  const canRedo = historyState.index < historyState.stack.length - 1;

  const pushHistory = useCallback((entry: ReorderHistoryEntry) => {
    setHistoryState((prev) => ({
      stack: [...prev.stack.slice(0, prev.index + 1), entry],
      index: prev.index + 1,
    }));
  }, []);

  const undo = useCallback(async () => {
    const cur = historyStateRef.current;
    if (cur.index < 0) {
      toast({ title: "Nothing to undo" });
      return;
    }
    const entry = cur.stack[cur.index];
    // Optimistically move the pointer back so rapid Ctrl+Z presses chain
    // through history without waiting on the in-flight network request.
    setHistoryState((prev) => ({ ...prev, index: prev.index - 1 }));
    try {
      await onReorderModule(
        entry.moduleId,
        entry.fromParentId,
        entry.fromIndex
      );
      toast({
        title: "Undone",
        description: "Module move reverted.",
      });
    } catch (err) {
      console.error("[Sidebar] undo failed", err);
      // Roll the pointer back forward — the action did not succeed.
      setHistoryState((prev) => ({ ...prev, index: prev.index + 1 }));
      toast({
        title: "Undo failed",
        description: (err as Error).message ?? "Please try again.",
        variant: "destructive",
      });
    }
  }, [onReorderModule, toast]);

  const redo = useCallback(async () => {
    const cur = historyStateRef.current;
    if (cur.index >= cur.stack.length - 1) {
      toast({ title: "Nothing to redo" });
      return;
    }
    const entry = cur.stack[cur.index + 1];
    setHistoryState((prev) => ({ ...prev, index: prev.index + 1 }));
    try {
      await onReorderModule(entry.moduleId, entry.toParentId, entry.toIndex);
      toast({
        title: "Redone",
        description: "Module move reapplied.",
      });
    } catch (err) {
      console.error("[Sidebar] redo failed", err);
      setHistoryState((prev) => ({ ...prev, index: prev.index - 1 }));
      toast({
        title: "Redo failed",
        description: (err as Error).message ?? "Please try again.",
        variant: "destructive",
      });
    }
  }, [onReorderModule, toast]);

  // ── Manual FLIP animation for smooth reorder ───────────────────────────────
  //
  // We can't rely on framer-motion's `layout` prop here because the rows are
  // also dnd-kit sortable nodes — `useSortable` + `pointerWithin` measuring
  // strategy interfere with motion's layout snapshots, and the animation
  // either doesn't fire or fires from wrong starting positions.
  //
  // Instead, we implement the standard FLIP technique by hand:
  //   1. (F)irst — store every row's bounding rect after the previous render.
  //   2. (L)ast — measure rects again on the next render. The DOM has just
  //      committed the new order, so each row is at its new position.
  //   3. (I)nvert — for any row whose top moved, instantly translate it back
  //      to its old top. The user sees rows still at their old positions.
  //   4. (P)lay — on the next animation frame, remove the inverse transform
  //      with a CSS transition so each row glides to its real position.
  //
  // Doing it manually means it always works regardless of which other libs
  // are mounting/unmounting the rows, and we get full control over easing.

  const rowElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const flipRafRef = useRef<number | null>(null);

  const registerRowEl = useCallback(
    (id: string, el: HTMLDivElement | null) => {
      if (el) rowElsRef.current.set(id, el);
      else rowElsRef.current.delete(id);
    },
    []
  );

  // The FLIP useLayoutEffect that consumes `flatIds` lives further down,
  // right after `flatIds` itself is declared (you can't reference a
  // memoized value before its declaration in React render order).

  // Keyboard shortcuts: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z
  // = redo. We deliberately ignore the shortcut while focus is in a text
  // field so we don't hijack the browser's native text-editing undo.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        void undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        void redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  // Auto-expand parents of selected module so it stays in view
  useEffect(() => {
    if (!selectedModule) return;
    const path: string[] = [];
    let current: Module | null = selectedModule;
    while (current?.parentId) {
      path.push(current.parentId);
      current = findModule(filteredModules, current.parentId);
    }
    if (path.length > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        path.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [selectedModule, filteredModules]);

  // Build flat visible list (respecting expand state + per-parent overrides)
  const flatNodes = useMemo(
    () => flattenVisible(filteredModules, expanded, parentSortOverrides),
    [filteredModules, expanded, parentSortOverrides]
  );
  const flatIds = useMemo(() => flatNodes.map((n) => n.id), [flatNodes]);

  // ── FLIP layout effect ─────────────────────────────────────────────────────
  // Run after every render that changes the visible row order. Because
  // `flatIds` is a memoized array (stable identity per real data change),
  // this effect only fires when the tree actually mutates — drag-drop,
  // undo, redo, expand/collapse, search, sort. It does NOT fire on every
  // mouse-move during a drag.
  useLayoutEffect(() => {
    // Cancel any in-flight FLIP from a previous render so two reorders in
    // quick succession don't fight each other.
    if (flipRafRef.current !== null) {
      cancelAnimationFrame(flipRafRef.current);
      flipRafRef.current = null;
    }

    const els = rowElsRef.current;
    const prevRects = prevRectsRef.current;
    const newRects = new Map<string, DOMRect>();

    // Phase L + I: measure new positions, apply inverse translateY for any
    // row that moved. We only animate vertical movement — horizontal shifts
    // come from depth/indentation changes and look better snapping than
    // sliding sideways.
    const moved: HTMLDivElement[] = [];
    els.forEach((el, id) => {
      const newRect = el.getBoundingClientRect();
      newRects.set(id, newRect);

      const prevRect = prevRects.get(id);
      if (!prevRect) return; // newly added row — no previous position to FLIP from

      const dy = prevRect.top - newRect.top;
      // Sub-pixel jitter shouldn't trigger an animation.
      if (Math.abs(dy) < 1) return;

      // Kill any leftover transition from a previous animation, snap back
      // to the old position, and remember to play it forward next frame.
      el.style.transition = "none";
      el.style.transform = `translate3d(0, ${dy}px, 0)`;
      // Force the browser to flush the inverse transform before we set the
      // transition in the next frame. Reading offsetHeight is a no-op that
      // triggers a synchronous reflow.
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      el.offsetHeight;
      moved.push(el);
    });

    // Phase P: schedule the play step. Using requestAnimationFrame ensures
    // the inverse transform is painted at least once before we start the
    // outbound transition — without this the browser may collapse both
    // style writes into one frame and the user sees no animation at all.
    if (moved.length > 0) {
      flipRafRef.current = requestAnimationFrame(() => {
        flipRafRef.current = null;
        for (const el of moved) {
          el.style.transition =
            "transform 320ms cubic-bezier(0.22, 0.85, 0.28, 1)";
          el.style.transform = "";
        }
      });
    }

    prevRectsRef.current = newRects;
  }, [flatIds]);

  // Belt-and-braces cleanup: cancel any pending animation frame on unmount
  // so we never call into a stale ref.
  useEffect(() => {
    return () => {
      if (flipRafRef.current !== null) {
        cancelAnimationFrame(flipRafRef.current);
        flipRafRef.current = null;
      }
    };
  }, []);

  // dnd-kit state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overPosition, setOverPosition] = useState<
    "above" | "inside" | "below" | null
  >(null);

  // Live cursor Y. We track it ourselves on a window pointermove listener
  // because @dnd-kit's `activatorEvent` only carries the START position, not
  // the current position — that was the root cause of the broken
  // "drop inside" behavior.
  const cursorYRef = useRef(0);

  // Auto-expand-on-hover: when the user pauses over a collapsed module while
  // dragging, expand it after a short delay so they can drop into descendants.
  const expandTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastHoveredIdRef = useRef<string | null>(null);

  const clearExpandTimer = useCallback(() => {
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  }, []);

  // Safety: if the component unmounts mid-drag (route change, etc.), make
  // sure we restore the document cursor / userSelect and remove the
  // pointermove listener so we never leak global state.
  useEffect(() => {
    return () => {
      const cleanup = (window as any).__moduleSidebarCursorCleanup;
      if (typeof cleanup === "function") {
        cleanup();
        (window as any).__moduleSidebarCursorCleanup = null;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const sensors = useSensors(
    // Slightly larger distance threshold (8px) is more forgiving — clicks
    // and tiny mouse jitter never accidentally start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Touch users get a press-and-hold instead of distance, so a tap on
    // the grip handle still selects/expands instead of dragging.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    })
  );

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));

    // Seed cursorY from the activator pointer event so the very first move
    // calculation has a sane value.
    const ae = e.activatorEvent as PointerEvent | undefined;
    if (ae && typeof ae.clientY === "number") {
      cursorYRef.current = ae.clientY;
    }

    // Track the live cursor while the drag is in progress.
    const onPointerMove = (ev: PointerEvent) => {
      cursorYRef.current = ev.clientY;
    };
    window.addEventListener("pointermove", onPointerMove);

    // Stash cleanup so dragEnd / dragCancel can stop tracking.
    (window as any).__moduleSidebarCursorCleanup = () => {
      window.removeEventListener("pointermove", onPointerMove);
    };

    // Visual cue: while a drag is in progress, the whole document gets a
    // grabbing cursor and text-selection is disabled. This is what makes
    // the drag feel "professional" rather than "sticky".
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  }, []);

  const handleDragMove = useCallback(
    (e: DragMoveEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) {
        if (overId !== null) {
          setOverId(null);
          setOverPosition(null);
        }
        clearExpandTimer();
        lastHoveredIdRef.current = null;
        return;
      }

      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);

      // Cycle prevention — never let a parent drop into its own subtree.
      if (isDescendant(filteredModules, activeIdStr, overIdStr)) {
        if (overId !== null) {
          setOverId(null);
          setOverPosition(null);
        }
        clearExpandTimer();
        lastHoveredIdRef.current = null;
        return;
      }

      // Compute position from the LIVE cursor Y (tracked via pointermove),
      // not the start position.
      //
      // Default split 35/30/35 — 14/12/14 px on a 40 px row — gives roughly
      // equal-sized targets for above / inside / below. Small enough that
      // sibling reordering doesn't accidentally nest, big enough that
      // center-aim nesting is discoverable.
      //
      // Shift-held override: when the user holds Shift during a drag, we
      // expand "inside" to cover almost the whole row (10/80/10). This is
      // the explicit "nest this" gesture — hard to miss, reserved for
      // deliberate nesting, no guesswork.
      const rect = over.rect;
      const cursorY = cursorYRef.current;
      const offset = cursorY - rect.top;
      const ratio = Math.max(0, Math.min(1, offset / rect.height));

      const shift = shiftHeldRef.current;
      const insideLow = shift ? 0.1 : 0.35;
      const insideHigh = shift ? 0.9 : 0.65;

      let position: "above" | "inside" | "below";
      if (ratio < insideLow) position = "above";
      else if (ratio > insideHigh) position = "below";
      else position = "inside";

      // Smart "below" → "inside" remap. When the user hovers the VERY
      // bottom edge of an EXPANDED parent that has visible children, the
      // insertion line visually points right above the parent's first
      // child, so the user expects the drop to land as a new first child.
      // We only promote in the last 15% of the row (ratio > 0.85) — not
      // the whole "below" zone — so the rest of the "below" area behaves
      // as a normal sibling-after-parent reorder.
      if (position === "below" && ratio > 0.85) {
        const overModule = findModule(filteredModules, overIdStr);
        const isExpanded = expanded.has(overIdStr);
        if (overModule?.children?.length && isExpanded) {
          position = "inside";
        }
      }

      // Update visual state only when something actually changed (avoids
      // re-renders on every pixel).
      if (overId !== overIdStr || overPosition !== position) {
        setOverId(overIdStr);
        setOverPosition(position);
      }

      // Auto-expand-on-hover: if the user is hovering "inside" a collapsed
      // module that has children, expand it after 600ms so they can drill in.
      if (position === "inside" && lastHoveredIdRef.current !== overIdStr) {
        clearExpandTimer();
        lastHoveredIdRef.current = overIdStr;

        const overModule = findModule(filteredModules, overIdStr);
        const hasKids = !!overModule?.children?.length;
        const isOpen = expanded.has(overIdStr);
        if (overModule && hasKids && !isOpen) {
          expandTimerRef.current = setTimeout(() => {
            setExpanded((prev) => {
              const next = new Set(prev);
              next.add(overIdStr);
              return next;
            });
          }, 450);
        }
      } else if (position !== "inside") {
        clearExpandTimer();
        lastHoveredIdRef.current = null;
      }
    },
    [filteredModules, overId, overPosition, expanded, clearExpandTimer]
  );

  // Stop tracking the cursor / clear timers no matter how the drag ends.
  const stopDragTracking = useCallback(() => {
    const cleanup = (window as any).__moduleSidebarCursorCleanup;
    if (typeof cleanup === "function") {
      cleanup();
      (window as any).__moduleSidebarCursorCleanup = null;
    }
    clearExpandTimer();
    lastHoveredIdRef.current = null;
    // Restore default cursor / text selection.
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [clearExpandTimer]);

  const handleDragEnd = useCallback(
    async (e: DragEndEvent) => {
      const { active, over } = e;
      const draggedId = String(active.id);

      // reset visual state
      setActiveId(null);
      const finalOverId = overId;
      const finalOverPos = overPosition;
      setOverId(null);
      setOverPosition(null);

      if (!over || !finalOverId || !finalOverPos) return;
      if (draggedId === finalOverId) return;

      // Cycle guard
      if (isDescendant(filteredModules, draggedId, finalOverId)) return;

      const draggedNode = findModule(filteredModules, draggedId);
      const overNode = findModule(filteredModules, finalOverId);
      if (!draggedNode || !overNode) return;

      // Compute target parent + index
      let targetParentId: string | null;
      let targetIndex: number;

      if (finalOverPos === "inside") {
        // Drop INSIDE the hovered module → becomes its first child
        targetParentId = overNode.id;
        targetIndex = 0;
      } else {
        // Drop ABOVE/BELOW → same parent as hovered
        targetParentId = overNode.parentId;
        const siblings = getSiblings(filteredModules, targetParentId).filter(
          (s) => s.id !== draggedId // remove dragged from siblings if same parent
        );
        const overIndexInSiblings = siblings.findIndex(
          (s) => s.id === overNode.id
        );
        if (overIndexInSiblings === -1) {
          // overNode is the dragged itself or not in this list — fallback
          targetIndex = siblings.length;
        } else {
          targetIndex =
            finalOverPos === "above"
              ? overIndexInSiblings
              : overIndexInSiblings + 1;
        }
      }

      // Capture the BEFORE state for history. We need this *now*, before
      // the optimistic update mutates the tree, so undo can put the module
      // back exactly where it came from.
      const beforeParentId = draggedNode.parentId;
      const beforeSiblings = getSiblings(filteredModules, beforeParentId);
      const beforeIndex = beforeSiblings.findIndex((s) => s.id === draggedId);

      // No-op: dropping a module right back where it already is
      if (
        draggedNode.parentId === targetParentId &&
        getSiblings(filteredModules, targetParentId).findIndex(
          (s) => s.id === draggedId
        ) === targetIndex
      ) {
        return;
      }

      // Auto-expand the new parent so the dropped module is visible
      if (targetParentId) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(targetParentId!);
          return next;
        });
      }

      // Manual reorder must win over per-parent auto-sort. If the user
      // drops something into a parent that has an "asc"/"desc" override
      // active, clear that override — otherwise the visual order would
      // immediately snap back alphabetically and the drag would feel broken.
      if (targetParentId && parentSortOverrides.has(targetParentId)) {
        setParentSortOverrides((prev) => {
          const next = new Map(prev);
          next.delete(targetParentId!);
          return next;
        });
      }

      try {
        await onReorderModule(draggedId, targetParentId, targetIndex);
        // Only record on success — failed reorders shouldn't pollute the
        // undo history with phantom entries the user can't actually undo.
        if (beforeIndex !== -1) {
          pushHistory({
            moduleId: draggedId,
            fromParentId: beforeParentId,
            fromIndex: beforeIndex,
            toParentId: targetParentId,
            toIndex: targetIndex,
          });
        }
      } catch (err) {
        console.error("[Sidebar] reorder failed", err);
      }
    },
    [
      overId,
      overPosition,
      filteredModules,
      onReorderModule,
      parentSortOverrides,
      pushHistory,
    ]
  );

  // ── Resize logic ───────────────────────────────────────────────────────────

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const w = Math.max(260, Math.min(520, e.clientX - rect.left));
      setWidth(w);
    };
    const up = () => setIsResizing(false);

    if (isResizing) {
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    }
    return () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [isResizing]);

  // ── Toggle expand ──────────────────────────────────────────────────────────

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Sort cycle: manual → asc → desc → manual
  const cycleSort = () => {
    if (sortOrder === "manual") setSortOrder("asc");
    else if (sortOrder === "asc") setSortOrder("desc");
    else setSortOrder("manual");
  };

  const sortIcon =
    sortOrder === "manual" ? (
      <Move className="h-4 w-4" />
    ) : sortOrder === "asc" ? (
      <ArrowDownAZ className="h-4 w-4" />
    ) : (
      <ArrowUpAZ className="h-4 w-4" />
    );

  const sortLabel =
    sortOrder === "manual"
      ? "Manual order — drag to reorder"
      : sortOrder === "asc"
      ? "Sorted A → Z (click to flip)"
      : "Sorted Z → A (click to reset)";

  // ── Render ─────────────────────────────────────────────────────────────────

  // Find the active node for the drag overlay preview
  const activeNode = activeId
    ? flatNodes.find((n) => n.id === activeId) ?? null
    : null;

  return (
    <div
      ref={sidebarRef}
      className="relative bg-white border-r flex flex-col h-full shadow-sm select-none"
      style={{ width: `${width}px` }}
    >
      {/* Header */}
      <div className="p-4 space-y-3 border-b bg-gray-50/30">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-black text-gray-500 uppercase tracking-[0.18em]">
            System Modules
          </h2>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-gray-500"
              onClick={() => void undo()}
              disabled={!canUndo}
              title={
                canUndo
                  ? `Undo last reorder (Ctrl+Z) — ${historyState.index + 1} step(s) available`
                  : "Nothing to undo"
              }
              aria-label="Undo reorder"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-gray-500"
              onClick={() => void redo()}
              disabled={!canRedo}
              title={
                canRedo
                  ? `Redo reorder (Ctrl+Y) — ${historyState.stack.length - historyState.index - 1} step(s) available`
                  : "Nothing to redo"
              }
              aria-label="Redo reorder"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:text-blue-600"
              onClick={cycleSort}
              title={sortLabel}
            >
              {sortIcon}
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search modules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-[12px] font-medium bg-white border-gray-200 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {sortOrder !== "manual" && (
          <p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-snug">
            Alphabetical sort active. Switch to{" "}
            <button
              onClick={() => setSortOrder("manual")}
              className="underline hover:text-amber-900"
            >
              manual order
            </button>{" "}
            to drag and reorder.
          </p>
        )}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-2">
        {filteredModules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Search className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-xs font-bold tracking-widest uppercase">
              No Modules Found
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            // pointerWithin gives accurate hit-testing for our row layout —
            // it picks the row the cursor is literally inside, not just the
            // one whose center is geometrically closest.
            collisionDetection={pointerWithin}
            // Re-measure droppables on every drag move so the rects stay
            // accurate when the tree mutates mid-drag (e.g. auto-expand).
            measuring={{
              droppable: { strategy: MeasuringStrategy.Always },
            }}
            // Auto-scroll the sidebar's scroll container when the cursor
            // gets within 18% of the top/bottom edge. This is critical for
            // long lists.
            autoScroll={{
              threshold: { x: 0, y: 0.18 },
              acceleration: 12,
            }}
            // Keep the floating overlay inside the viewport so it never
            // disappears off-screen on small windows.
            modifiers={[restrictToWindowEdges]}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={(e) => {
              stopDragTracking();
              handleDragEnd(e);
            }}
            onDragCancel={() => {
              stopDragTracking();
              setActiveId(null);
              setOverId(null);
              setOverPosition(null);
            }}
          >
            <SortableContext
              items={flatIds}
              strategy={noShiftStrategy}
              disabled={sortOrder !== "manual"}
            >
              <div>
                {flatNodes.map((node) => {
                  const hasChildren = !!node.module.children?.length;
                  const isExpanded = expanded.has(node.id);
                  const isSelected = selectedModule?.id === node.id;
                  const dropPosition =
                    overId === node.id && activeId !== node.id
                      ? overPosition
                      : null;

                  return (
                    // FLIP wrapper. The ref registers this DOM element with
                    // `rowElsRef` so the layout effect can measure it on
                    // every reorder and animate it from its old position
                    // to its new one. The wrapper itself has no styling so
                    // it's invisible to the layout — it only exists as a
                    // measurement target that won't conflict with dnd-kit's
                    // own ref on the inner SortableRow.
                    <div
                      key={node.id}
                      ref={(el) => registerRowEl(node.id, el)}
                      style={{ willChange: "transform" }}
                    >
                      <SortableRow
                        node={node}
                        isExpanded={isExpanded}
                        isSelected={isSelected}
                        hasChildren={hasChildren}
                        onToggle={() => toggleExpand(node.id)}
                        onSelect={() => {
                          setSelectedModule(node.module);
                          setSelectedForm(null);
                        }}
                        onAddSub={() => openSubmoduleDialog(node.module)}
                        onEdit={() => openEditDialog(node.module)}
                        sortMode={parentSortOverrides.get(node.id) ?? null}
                        onCycleSort={() => cycleParentSort(node.id)}
                        dropPosition={dropPosition}
                      />
                    </div>
                  );
                })}
              </div>
            </SortableContext>

            {/* Floating preview that follows the cursor.
                - dropAnimation null = the overlay simply disappears on drop
                  (no awkward fly-back animation, since the optimistic update
                  already moved the real row).
                - Slight tilt + heavy shadow makes it feel "lifted". */}
            <DragOverlay
              dropAnimation={null}
              style={{ cursor: "grabbing" }}
            >
              {activeNode ? (
                <div
                  className="bg-white border-2 border-blue-500 shadow-2xl rounded-lg px-3 py-2.5 flex flex-col gap-1 max-w-[320px] backdrop-blur-sm bg-white/95"
                  style={{ transform: "rotate(-1.5deg)" }}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <LayoutDashboard className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <span className="text-[12px] font-bold tracking-wide text-blue-900 truncate">
                      {activeNode.module.name.toUpperCase()}
                    </span>
                    {activeNode.module.children?.length ? (
                      <span className="ml-auto pl-2 text-[10px] font-bold text-blue-500 tabular-nums">
                        +{activeNode.module.children.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[9.5px] text-gray-500 leading-tight pl-6 flex items-center gap-1 font-medium">
                    <kbd className="px-1 py-[1px] rounded border border-gray-300 bg-gray-50 font-mono text-[9px]">
                      Shift
                    </kbd>
                    <span>hold to nest inside</span>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-all"
        onMouseDown={() => setIsResizing(true)}
      />
    </div>
  );
}
