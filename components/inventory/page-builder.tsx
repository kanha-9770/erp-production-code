"use client";

/**
 * Webflow-style page builder for the inventory storefront page.
 *
 * Layout model: a vertical stack of **rows**. Each row hosts a 12-column
 * grid of **blocks**, each carrying a `colSpan` (1..12). Rows wrap onto
 * new visual lines when their blocks exceed 12; you'll usually keep
 * them at exactly 12 across.
 *
 * Interactions:
 *   • Drag from the left **library** onto a row to add a block.
 *   • Drag a block within a row to reorder; drag rows by their handle to
 *     reorder vertically.
 *   • Click a block → it becomes selected; the right panel exposes its
 *     props and a column-span slider.
 *   • Each block has +/- shortcuts to bump its span by ±1 column.
 *   • Cmd+Z / Cmd+Shift+Z undo/redo (single linear history).
 *
 * Persistence is via a parent `onChange(layout)` callback; this component
 * is purely controlled to keep the autosave story simple.
 */

import * as React from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Layers,
  Minus,
  Plus,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  BLOCK_LIBRARY,
  BlockMeta,
  blockMeta,
  defaultLayout,
  newBlockId,
} from "./constants";
import { BlockRenderer } from "./block-renderer";
import type {
  BlockType,
  InventoryProduct,
  PageBlock,
  PageLayout,
  PageRow,
} from "@/lib/api/inventory/types";

interface BuilderProps {
  product: InventoryProduct;
  layout: PageLayout | null;
  onChange: (next: PageLayout) => void;
}

interface Selection {
  rowId: string;
  blockId: string;
}

const LIBRARY_DRAG_PREFIX = "lib:"; // dnd id format for items dragged from the library
const ROW_DRAG_PREFIX = "row:";

export function PageBuilder({ product, layout, onChange }: BuilderProps) {
  const [history, setHistory] = React.useState<PageLayout[]>([]);
  const [future, setFuture] = React.useState<PageLayout[]>([]);
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);

  // Initialize from saved layout, or fall back to a sensible default.
  const initial = React.useMemo<PageLayout>(
    () => normalize(layout ?? defaultLayout()),
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // The current layout is whatever was last set via onChange — controlled value:
  const value: PageLayout = React.useMemo(() => normalize(layout ?? initial), [layout, initial]);

  const setLayout = (next: PageLayout) => {
    setHistory((h) => [...h, value]);
    setFuture([]);
    onChange(next);
  };

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [value, ...f]);
      onChange(prev);
      return h.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setHistory((h) => [...h, value]);
      onChange(next);
      return f.slice(1);
    });
  };

  // Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, history, future]);

  // ─── Mutations ───────────────────────────────────────────────────────────

  const addRow = () => {
    setLayout({
      ...value,
      rows: [...value.rows, { id: newBlockId("row"), blocks: [] }],
    });
  };

  const removeRow = (rowId: string) => {
    setLayout({ ...value, rows: value.rows.filter((r) => r.id !== rowId) });
    if (selection?.rowId === rowId) setSelection(null);
  };

  const duplicateRow = (rowId: string) => {
    const idx = value.rows.findIndex((r) => r.id === rowId);
    if (idx < 0) return;
    const src = value.rows[idx];
    const cloned: PageRow = {
      id: newBlockId("row"),
      blocks: src.blocks.map((b) => ({ ...b, id: newBlockId("blk"), props: { ...b.props } })),
    };
    const rows = [...value.rows];
    rows.splice(idx + 1, 0, cloned);
    setLayout({ ...value, rows });
  };

  const moveRow = (rowId: string, dir: -1 | 1) => {
    const idx = value.rows.findIndex((r) => r.id === rowId);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= value.rows.length) return;
    const rows = arrayMove(value.rows, idx, j);
    setLayout({ ...value, rows });
  };

  const addBlock = (rowId: string, type: BlockType) => {
    const meta = blockMeta(type);
    const block: PageBlock = {
      id: newBlockId("blk"),
      type,
      colSpan: meta.defaultSpan,
      props: { ...meta.defaultProps },
    };
    const rows = value.rows.map((r) =>
      r.id === rowId ? { ...r, blocks: [...r.blocks, block] } : r,
    );
    setLayout({ ...value, rows });
    setSelection({ rowId, blockId: block.id });
  };

  const removeBlock = (rowId: string, blockId: string) => {
    const rows = value.rows.map((r) =>
      r.id === rowId ? { ...r, blocks: r.blocks.filter((b) => b.id !== blockId) } : r,
    );
    setLayout({ ...value, rows });
    if (selection?.blockId === blockId) setSelection(null);
  };

  const duplicateBlock = (rowId: string, blockId: string) => {
    const rows = value.rows.map((r) => {
      if (r.id !== rowId) return r;
      const i = r.blocks.findIndex((b) => b.id === blockId);
      if (i < 0) return r;
      const src = r.blocks[i];
      const clone: PageBlock = { ...src, id: newBlockId("blk"), props: { ...src.props } };
      const blocks = [...r.blocks];
      blocks.splice(i + 1, 0, clone);
      return { ...r, blocks };
    });
    setLayout({ ...value, rows });
  };

  const updateBlock = (rowId: string, blockId: string, patch: Partial<PageBlock>) => {
    const rows = value.rows.map((r) =>
      r.id !== rowId
        ? r
        : { ...r, blocks: r.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) },
    );
    setLayout({ ...value, rows });
  };

  const updateBlockProp = (rowId: string, blockId: string, key: string, val: any) => {
    const rows = value.rows.map((r) =>
      r.id !== rowId
        ? r
        : {
            ...r,
            blocks: r.blocks.map((b) =>
              b.id === blockId ? { ...b, props: { ...b.props, [key]: val } } : b,
            ),
          },
    );
    setLayout({ ...value, rows });
  };

  // ─── Drag-and-drop ───────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveDragId(null);
    if (!over) return;
    const aid = String(active.id);
    const oid = String(over.id);

    // Library item dropped
    if (aid.startsWith(LIBRARY_DRAG_PREFIX)) {
      const type = aid.slice(LIBRARY_DRAG_PREFIX.length) as BlockType;
      // Drop targets: row container, or a specific block (insert before)
      const toRowId = oid.startsWith(ROW_DRAG_PREFIX)
        ? oid.slice(ROW_DRAG_PREFIX.length)
        : findBlockRowId(value, oid);
      if (!toRowId) return;
      addBlock(toRowId, type);
      return;
    }

    // Row reorder
    if (aid.startsWith(ROW_DRAG_PREFIX) && oid.startsWith(ROW_DRAG_PREFIX)) {
      const fromId = aid.slice(ROW_DRAG_PREFIX.length);
      const toId = oid.slice(ROW_DRAG_PREFIX.length);
      if (fromId === toId) return;
      const fromIdx = value.rows.findIndex((r) => r.id === fromId);
      const toIdx = value.rows.findIndex((r) => r.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      setLayout({ ...value, rows: arrayMove(value.rows, fromIdx, toIdx) });
      return;
    }

    // Block reorder within (or across) rows
    const fromRowId = findBlockRowId(value, aid);
    const toRowId = oid.startsWith(ROW_DRAG_PREFIX)
      ? oid.slice(ROW_DRAG_PREFIX.length)
      : findBlockRowId(value, oid);
    if (!fromRowId || !toRowId) return;

    if (fromRowId === toRowId) {
      const row = value.rows.find((r) => r.id === fromRowId)!;
      const fromIdx = row.blocks.findIndex((b) => b.id === aid);
      const toIdx = row.blocks.findIndex((b) => b.id === oid);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
      const blocks = arrayMove(row.blocks, fromIdx, toIdx);
      const rows = value.rows.map((r) => (r.id === fromRowId ? { ...r, blocks } : r));
      setLayout({ ...value, rows });
    } else {
      const fromRow = value.rows.find((r) => r.id === fromRowId)!;
      const toRow = value.rows.find((r) => r.id === toRowId)!;
      const block = fromRow.blocks.find((b) => b.id === aid);
      if (!block) return;
      const fromBlocks = fromRow.blocks.filter((b) => b.id !== aid);
      const insertAt = oid.startsWith(ROW_DRAG_PREFIX)
        ? toRow.blocks.length
        : Math.max(0, toRow.blocks.findIndex((b) => b.id === oid));
      const toBlocks = [...toRow.blocks];
      toBlocks.splice(insertAt, 0, block);
      const rows = value.rows.map((r) =>
        r.id === fromRowId ? { ...r, blocks: fromBlocks } : r.id === toRowId ? { ...r, blocks: toBlocks } : r,
      );
      setLayout({ ...value, rows });
    }
  };

  const selected = React.useMemo(() => {
    if (!selection) return null;
    const row = value.rows.find((r) => r.id === selection.rowId);
    const block = row?.blocks.find((b) => b.id === selection.blockId);
    if (!row || !block) return null;
    return { row, block };
  }, [selection, value]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-[240px_1fr_300px] gap-3 h-full min-h-0">
        {/* Library */}
        <aside className="border rounded-lg overflow-hidden flex flex-col bg-card">
          <div className="px-3 py-2 border-b flex items-center gap-2 bg-muted/40">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Blocks
            </span>
          </div>
          <ScrollArea className="flex-1">
            <BlockLibrary />
          </ScrollArea>
          <div className="px-2 py-2 border-t flex items-center gap-1 bg-muted/20">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={undo} disabled={history.length === 0} title="Undo (⌘Z)">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={redo} disabled={future.length === 0} title="Redo (⌘⇧Z)">
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="h-7" onClick={addRow}>
              <Plus className="h-3 w-3 mr-1" /> Row
            </Button>
          </div>
        </aside>

        {/* Canvas */}
        <main className="border rounded-lg bg-muted/20 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-3">
              <SortableContext
                items={value.rows.map((r) => `${ROW_DRAG_PREFIX}${r.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {value.rows.map((row) => (
                  <RowCard
                    key={row.id}
                    row={row}
                    product={product}
                    selection={selection}
                    onSelect={(rowId, blockId) => setSelection({ rowId, blockId })}
                    onAddBlock={(type) => addBlock(row.id, type)}
                    onRemoveRow={() => removeRow(row.id)}
                    onDuplicateRow={() => duplicateRow(row.id)}
                    onMoveRow={(d) => moveRow(row.id, d)}
                    onUpdateBlock={(blockId, patch) => updateBlock(row.id, blockId, patch)}
                    onRemoveBlock={(blockId) => removeBlock(row.id, blockId)}
                    onDuplicateBlock={(blockId) => duplicateBlock(row.id, blockId)}
                  />
                ))}
              </SortableContext>

              <button
                type="button"
                onClick={addRow}
                className="w-full rounded-lg border-2 border-dashed border-muted-foreground/30 bg-background/40 py-4 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition"
              >
                <Plus className="h-3.5 w-3.5 inline -mt-0.5 mr-1" />
                Add row
              </button>

              <div className="text-[11px] text-muted-foreground text-center pt-2">
                <Sparkles className="h-3 w-3 inline -mt-0.5 mr-1" />
                Drag blocks from the left into any row · click a block to edit · ⌘Z to undo
              </div>
            </div>
          </ScrollArea>
        </main>

        {/* Inspector */}
        <aside className="border rounded-lg overflow-hidden flex flex-col bg-card">
          <div className="px-3 py-2 border-b flex items-center gap-2 bg-muted/40">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {selected ? "Block" : "Page"}
            </span>
          </div>
          <ScrollArea className="flex-1">
            {selected ? (
              <BlockInspector
                row={selected.row}
                block={selected.block}
                onUpdate={(patch) => updateBlock(selected.row.id, selected.block.id, patch)}
                onUpdateProp={(k, v) => updateBlockProp(selected.row.id, selected.block.id, k, v)}
              />
            ) : (
              <PageInspector layout={value} />
            )}
          </ScrollArea>
        </aside>
      </div>

      <DragOverlay>
        {activeDragId && activeDragId.startsWith(LIBRARY_DRAG_PREFIX) ? (
          <LibraryItem
            meta={
              BLOCK_LIBRARY.find(
                (m) => m.type === (activeDragId.slice(LIBRARY_DRAG_PREFIX.length) as BlockType),
              )!
            }
            ghost
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Library ────────────────────────────────────────────────────────────────

function BlockLibrary() {
  const groups: Record<string, BlockMeta[]> = { Bound: [], Layout: [], Content: [] };
  for (const m of BLOCK_LIBRARY) groups[m.group].push(m);
  return (
    <div className="p-2 space-y-3">
      {(["Bound", "Layout", "Content"] as const).map((g) => (
        <div key={g}>
          <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {g}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {groups[g].map((m) => (
              <LibraryItem key={m.type} meta={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LibraryItem({ meta, ghost }: { meta: BlockMeta; ghost?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${LIBRARY_DRAG_PREFIX}${meta.type}`,
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      title={meta.description}
      className={cn(
        "rounded border bg-background px-2 py-2 text-left text-xs hover:border-primary cursor-grab active:cursor-grabbing select-none",
        (ghost || isDragging) && "opacity-50",
      )}
    >
      <div className="font-medium truncate">{meta.label}</div>
      <div className="text-[10px] text-muted-foreground truncate">{meta.description}</div>
    </button>
  );
}

// ─── Row card ───────────────────────────────────────────────────────────────

interface RowCardProps {
  row: PageRow;
  product: InventoryProduct;
  selection: Selection | null;
  onSelect: (rowId: string, blockId: string) => void;
  onAddBlock: (t: BlockType) => void;
  onRemoveRow: () => void;
  onDuplicateRow: () => void;
  onMoveRow: (d: -1 | 1) => void;
  onUpdateBlock: (blockId: string, patch: Partial<PageBlock>) => void;
  onRemoveBlock: (blockId: string) => void;
  onDuplicateBlock: (blockId: string) => void;
}

function RowCard(p: RowCardProps) {
  const { row } = p;
  const sortable = useSortable({ id: `${ROW_DRAG_PREFIX}${row.id}` });
  const droppable = useDroppable({ id: `${ROW_DRAG_PREFIX}${row.id}` });
  const setRef = (el: HTMLElement | null) => {
    sortable.setNodeRef(el);
    droppable.setNodeRef(el);
  };
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div ref={setRef} style={style} className="group/row">
      <div className="rounded-lg border bg-card hover:border-primary/40 transition relative">
        {/* Row header */}
        <div className="absolute -top-2.5 left-3 right-3 flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-1 rounded-md border bg-background shadow-sm px-1 py-0.5">
            <button
              type="button"
              {...sortable.attributes}
              {...sortable.listeners}
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
              title="Drag to reorder row"
            >
              <GripVertical className="h-3 w-3" />
            </button>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => p.onMoveRow(-1)} title="Move up">
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => p.onMoveRow(1)} title="Move down">
              <ChevronDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={p.onDuplicateRow} title="Duplicate row">
              <Copy className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={p.onRemoveRow} title="Delete row">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* 12-col grid */}
        <div className="grid grid-cols-12 gap-2 p-3">
          <SortableContext items={row.blocks.map((b) => b.id)} strategy={horizontalListSortingStrategy}>
            {row.blocks.length === 0 ? (
              <DropZone rowId={row.id} />
            ) : (
              row.blocks.map((b) => (
                <BlockCard
                  key={b.id}
                  block={b}
                  product={p.product}
                  selected={p.selection?.blockId === b.id}
                  onSelect={() => p.onSelect(row.id, b.id)}
                  onUpdate={(patch) => p.onUpdateBlock(b.id, patch)}
                  onRemove={() => p.onRemoveBlock(b.id)}
                  onDuplicate={() => p.onDuplicateBlock(b.id)}
                />
              ))
            )}
          </SortableContext>
        </div>
      </div>
    </div>
  );
}

function DropZone({ rowId }: { rowId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${ROW_DRAG_PREFIX}${rowId}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "col-span-12 h-20 rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground",
        isOver ? "border-primary bg-primary/5 text-primary" : "border-muted-foreground/30 bg-muted/30",
      )}
    >
      Drop a block here
    </div>
  );
}

// ─── Block card ─────────────────────────────────────────────────────────────

interface BlockCardProps {
  block: PageBlock;
  product: InventoryProduct;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<PageBlock>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}

function BlockCard({ block, product, selected, onSelect, onUpdate, onRemove, onDuplicate }: BlockCardProps) {
  const sortable = useSortable({ id: block.id });
  const meta = blockMeta(block.type);
  const span = clamp(block.colSpan, meta.minSpan, 12);

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    gridColumn: `span ${span} / span ${span}`,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={cn(
        "relative rounded border bg-background hover:border-primary/40 transition cursor-pointer",
        selected && "border-primary ring-1 ring-primary/30",
        sortable.isDragging && "opacity-50",
      )}
    >
      {/* Toolbar */}
      <div className="absolute -top-2.5 right-2 flex items-center gap-0.5 rounded-md border bg-background shadow-sm px-0.5 py-0.5 opacity-0 group-hover/row:opacity-100 transition z-10">
        <button
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
          className="h-5 w-5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
          title="Drag"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="h-5 w-5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
          title="Decrease span"
          onClick={(e) => {
            e.stopPropagation();
            onUpdate({ colSpan: Math.max(meta.minSpan, span - 1) });
          }}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="px-1 text-[10px] tabular-nums text-muted-foreground select-none">{span}/12</span>
        <button
          type="button"
          className="h-5 w-5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
          title="Increase span"
          onClick={(e) => {
            e.stopPropagation();
            onUpdate({ colSpan: Math.min(12, span + 1) });
          }}
        >
          <Plus className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="h-5 w-5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
          title="Duplicate"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
        >
          <Copy className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="h-5 w-5 inline-flex items-center justify-center text-destructive hover:bg-destructive/10"
          title="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <div className="p-3 min-h-12">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <span className="font-semibold">{meta.label}</span>
          <span className="text-muted-foreground/60">· {span}/12</span>
        </div>
        <div className="pointer-events-none">
          <BlockRenderer block={block} product={product} mode="builder" />
        </div>
      </div>
    </div>
  );
}

// ─── Inspectors ─────────────────────────────────────────────────────────────

function PageInspector({ layout }: { layout: PageLayout }) {
  const blockCount = layout.rows.reduce((n, r) => n + r.blocks.length, 0);
  return (
    <div className="p-3 space-y-3 text-sm">
      <Card className="p-3 bg-muted/30">
        <div className="text-xs text-muted-foreground">Click any block to edit it</div>
      </Card>
      <div className="text-xs space-y-1.5">
        <Stat label="Rows" value={layout.rows.length} />
        <Stat label="Blocks" value={blockCount} />
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        <strong>Bound</strong> blocks read live data from the product (image, price, specs).{" "}
        <strong>Content</strong> blocks (heading, text, image, video, html) carry their own
        content. The 12-col grid keeps everything aligned across breakpoints.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

interface InspectorProps {
  row: PageRow;
  block: PageBlock;
  onUpdate: (patch: Partial<PageBlock>) => void;
  onUpdateProp: (key: string, v: any) => void;
}

function BlockInspector({ row, block, onUpdate, onUpdateProp }: InspectorProps) {
  const meta = blockMeta(block.type);
  return (
    <div className="p-3 space-y-4 text-sm">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{meta.group}</div>
        <div className="font-semibold">{meta.label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{meta.description}</div>
      </div>

      <div>
        <Label className="text-xs">Width — {block.colSpan}/12 columns</Label>
        <Slider
          min={meta.minSpan}
          max={12}
          step={1}
          value={[block.colSpan]}
          onValueChange={([v]) => onUpdate({ colSpan: clamp(v, meta.minSpan, 12) })}
          className="mt-2"
        />
      </div>

      <BlockProps block={block} onUpdateProp={onUpdateProp} />

      <div className="text-[10px] text-muted-foreground border-t pt-2">
        Row · <code className="font-mono">{row.id.slice(0, 12)}</code>
      </div>
    </div>
  );
}

function BlockProps({ block, onUpdateProp }: { block: PageBlock; onUpdateProp: (k: string, v: any) => void }) {
  const t = block.type;
  const p = block.props;
  switch (t) {
    case "hero":
      return (
        <>
          <RowField label="Show price">
            <Switch checked={p.showPrice !== false} onCheckedChange={(v) => onUpdateProp("showPrice", v)} />
          </RowField>
          <RowField label="Show CTA">
            <Switch checked={p.showCta !== false} onCheckedChange={(v) => onUpdateProp("showCta", v)} />
          </RowField>
          <Field label="CTA label">
            <Input value={p.ctaLabel ?? ""} onChange={(e) => onUpdateProp("ctaLabel", e.target.value)} />
          </Field>
        </>
      );
    case "gallery":
      return (
        <>
          <Field label="Columns">
            <Select value={String(p.columns ?? 2)} onValueChange={(v) => onUpdateProp("columns", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Aspect">
            <Select value={String(p.aspect ?? "1/1")} onValueChange={(v) => onUpdateProp("aspect", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1/1">1:1 square</SelectItem>
                <SelectItem value="4/3">4:3</SelectItem>
                <SelectItem value="16/9">16:9</SelectItem>
                <SelectItem value="3/4">3:4 portrait</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      );
    case "title":
    case "heading":
      return (
        <>
          {t === "heading" && (
            <Field label="Text">
              <Input value={p.text ?? ""} onChange={(e) => onUpdateProp("text", e.target.value)} />
            </Field>
          )}
          <Field label="Level">
            <Select value={String(p.level ?? 2)} onValueChange={(v) => onUpdateProp("level", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">H1 (largest)</SelectItem>
                <SelectItem value="2">H2</SelectItem>
                <SelectItem value="3">H3</SelectItem>
                <SelectItem value="4">H4 (smallest)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      );
    case "price":
      return (
        <Field label="Size">
          <Select value={String(p.size ?? "lg")} onValueChange={(v) => onUpdateProp("size", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lg">Large</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      );
    case "specs":
      return (
        <Field label="Columns">
          <Select value={String(p.columns ?? 2)} onValueChange={(v) => onUpdateProp("columns", Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      );
    case "addToCart":
      return (
        <Field label="Button label">
          <Input value={p.label ?? ""} onChange={(e) => onUpdateProp("label", e.target.value)} />
        </Field>
      );
    case "text":
      return (
        <Field label="Text">
          <Textarea rows={6} value={p.text ?? ""} onChange={(e) => onUpdateProp("text", e.target.value)} />
        </Field>
      );
    case "image":
      return (
        <>
          <Field label="Image URL">
            <Input value={p.url ?? ""} onChange={(e) => onUpdateProp("url", e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Alt text">
            <Input value={p.alt ?? ""} onChange={(e) => onUpdateProp("alt", e.target.value)} />
          </Field>
          <Field label="Aspect">
            <Select value={String(p.aspect ?? "16/9")} onValueChange={(v) => onUpdateProp("aspect", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="16/9">16:9</SelectItem>
                <SelectItem value="4/3">4:3</SelectItem>
                <SelectItem value="1/1">1:1</SelectItem>
                <SelectItem value="3/4">3:4</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      );
    case "video":
      return (
        <>
          <Field label="Video URL">
            <Input value={p.url ?? ""} onChange={(e) => onUpdateProp("url", e.target.value)} placeholder="YouTube / Vimeo / mp4" />
          </Field>
          <Field label="Aspect">
            <Select value={String(p.aspect ?? "16/9")} onValueChange={(v) => onUpdateProp("aspect", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="16/9">16:9</SelectItem>
                <SelectItem value="4/3">4:3</SelectItem>
                <SelectItem value="1/1">1:1</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      );
    case "html":
      return (
        <Field label="HTML">
          <Textarea rows={8} className="font-mono text-xs" value={p.html ?? ""} onChange={(e) => onUpdateProp("html", e.target.value)} />
        </Field>
      );
    case "spacer":
      return (
        <Field label={`Height (${Number(p.height) || 24}px)`}>
          <Slider
            min={4}
            max={240}
            step={4}
            value={[Number(p.height) || 24]}
            onValueChange={([v]) => onUpdateProp("height", v)}
          />
        </Field>
      );
    default:
      return (
        <p className="text-xs text-muted-foreground">No props for this block — adjust width above.</p>
      );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
function RowField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function findBlockRowId(layout: PageLayout, blockId: string): string | null {
  for (const r of layout.rows) {
    if (r.blocks.some((b) => b.id === blockId)) return r.id;
  }
  return null;
}

/** Coerce/clean a layout coming from the API (clamp spans, drop unknown types). */
function normalize(l: PageLayout): PageLayout {
  return {
    rows: (l.rows ?? []).map((r) => ({
      id: r.id || newBlockId("row"),
      blocks: (r.blocks ?? []).map((b) => ({
        id: b.id || newBlockId("blk"),
        type: b.type,
        colSpan: clamp(Number(b.colSpan) || 6, 1, 12),
        props: b.props ?? {},
      })),
    })),
  };
}
