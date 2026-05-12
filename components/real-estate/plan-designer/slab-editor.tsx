"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { CompPlanSlab } from "@/lib/api/real-estate/plans";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Grip,
  Infinity as InfinityIcon,
  LayoutGrid,
  Layers,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

type SlabRow = CompPlanSlab;

interface Props {
  slabs: SlabRow[];
  onChange: (slabs: SlabRow[]) => void;
}

function emptyRow(prev?: SlabRow): SlabRow {
  const min = prev && prev.maxArea != null ? prev.maxArea + 1 : 0;
  return { minArea: min, maxArea: null, ratePerUnit: 0 } as SlabRow;
}

const PRODUCTION_14: Array<[number, number | null, number]> = [
  [0, 499, 500],
  [500, 999, 600],
  [1000, 1999, 700],
  [2000, 4999, 800],
  [5000, 9999, 900],
  [10000, 19999, 1000],
  [20000, 39999, 1100],
  [40000, 59999, 1200],
  [60000, 79999, 1300],
  [80000, 99999, 1400],
  [100000, 199999, 1500],
  [200000, 499999, 1550],
  [500000, 999999, 1580],
  [1000000, null, 1600],
];

function linearFive(): SlabRow[] {
  const result: SlabRow[] = [];
  const step = 1000;
  for (let i = 0; i < 5; i++) {
    result.push({
      minArea: i * step,
      maxArea: i === 4 ? null : (i + 1) * step - 1,
      ratePerUnit: 500 + i * 250,
    } as SlabRow);
  }
  return result;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

export function SlabEditor({ slabs, onChange }: Props) {
  const { toast } = useToast();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const lastTypeAt = useRef<number>(0);

  const update = useCallback(
    (idx: number, patch: Partial<SlabRow>) => {
      onChange(slabs.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
      lastTypeAt.current = Date.now();
    },
    [slabs, onChange],
  );

  const add = useCallback(() => {
    const prev = slabs[slabs.length - 1];
    onChange([...slabs, emptyRow(prev)]);
  }, [slabs, onChange]);

  const remove = useCallback(
    (idx: number) => {
      onChange(slabs.filter((_, i) => i !== idx));
      toast({ title: "Slab removed", description: `Row ${idx + 1} deleted.` });
    },
    [slabs, onChange, toast],
  );

  const duplicate = useCallback(
    (idx: number) => {
      const copy = { ...slabs[idx] } as SlabRow;
      const next = [...slabs];
      next.splice(idx + 1, 0, copy);
      onChange(next);
    },
    [slabs, onChange],
  );

  const move = useCallback(
    (idx: number, dir: -1 | 1) => {
      const next = [...slabs];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return;
      [next[idx], next[target]] = [next[target], next[idx]];
      onChange(next);
    },
    [slabs, onChange],
  );

  const applyPreset = useCallback(
    (preset: "prod14" | "linear5") => {
      const rows: SlabRow[] =
        preset === "prod14"
          ? PRODUCTION_14.map(
              ([min, max, rate]) =>
                ({ minArea: min, maxArea: max, ratePerUnit: rate }) as SlabRow,
            )
          : linearFive();
      onChange(rows);
      toast({
        title: "Preset applied",
        description: `${rows.length} slabs loaded.`,
      });
    },
    [onChange, toast],
  );

  const handleBulkApply = useCallback(() => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const rows: SlabRow[] = [];
    for (const line of lines) {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      if (parts.length < 3) continue;
      const min = Number(parts[0]);
      const maxRaw = parts[1].toLowerCase();
      const max =
        maxRaw === "" || maxRaw === "null" || maxRaw === "inf" || maxRaw === "∞"
          ? null
          : Number(parts[1]);
      const rate = Number(parts[2]);
      if (Number.isNaN(min) || Number.isNaN(rate)) continue;
      if (max !== null && Number.isNaN(max)) continue;
      rows.push({ minArea: min, maxArea: max, ratePerUnit: rate } as SlabRow);
    }
    if (rows.length === 0) {
      toast({
        title: "Could not parse",
        description: "Expected lines like: minArea,maxArea,rate",
        variant: "destructive",
      });
      return;
    }
    onChange(rows);
    setBulkOpen(false);
    setBulkText("");
    toast({ title: "Imported", description: `${rows.length} slabs applied.` });
  }, [bulkText, onChange, toast]);

  // Validation: row-level + overlap.
  const validation = useMemo(() => {
    const rowErrors = new Array<string | null>(slabs.length).fill(null);
    for (let i = 0; i < slabs.length; i++) {
      const r = slabs[i];
      if (r.maxArea != null && r.minArea >= r.maxArea) {
        rowErrors[i] = "Min must be less than Max";
      }
    }
    // overlap detection (only for rows with both bounds defined)
    for (let i = 0; i < slabs.length; i++) {
      if (rowErrors[i]) continue;
      const a = slabs[i];
      for (let j = i + 1; j < slabs.length; j++) {
        if (rowErrors[j]) continue;
        const b = slabs[j];
        const aMax = a.maxArea ?? Number.POSITIVE_INFINITY;
        const bMax = b.maxArea ?? Number.POSITIVE_INFINITY;
        const overlap = a.minArea <= bMax && b.minArea <= aMax;
        if (overlap) {
          rowErrors[i] = rowErrors[i] || `Overlaps row ${j + 1}`;
          rowErrors[j] = rowErrors[j] || `Overlaps row ${i + 1}`;
        }
      }
    }
    return rowErrors;
  }, [slabs]);

  // Chart math
  const chart = useMemo(() => {
    if (slabs.length === 0) return null;
    const maxRate = Math.max(...slabs.map((s) => s.ratePerUnit || 0), 1);
    // Use indexed widths if any maxArea is null or ranges are huge.
    // We give each bar a "logical" width: clamp to a finite span using max-finite + buffer.
    const finiteMax = Math.max(
      ...slabs.map((s) => (s.maxArea != null ? s.maxArea : s.minArea + 1)),
      1,
    );
    const span = finiteMax * 1.1;
    return {
      maxRate,
      span,
    };
  }, [slabs]);

  const totalRange = useMemo(() => {
    if (slabs.length === 0) return "—";
    const min = Math.min(...slabs.map((s) => s.minArea));
    const hasOpen = slabs.some((s) => s.maxArea == null);
    const maxFinite = Math.max(
      ...slabs.map((s) => (s.maxArea ?? Number.NEGATIVE_INFINITY)),
    );
    return `${fmt(min)} – ${hasOpen ? "∞" : fmt(maxFinite)}`;
  }, [slabs]);

  // Keyboard handler for last input → add row; Ctrl+D → delete row
  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number, isLast: boolean) => {
      if (e.key === "Enter" && isLast) {
        e.preventDefault();
        if (idx === slabs.length - 1) add();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        // Debounce: only if user hasn't typed in 400ms
        if (Date.now() - lastTypeAt.current > 400) {
          e.preventDefault();
          remove(idx);
        }
      }
    },
    [slabs.length, add, remove],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* Toolbar */}
        <Card className="rounded-2xl border-muted/60 shadow-sm">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-sky-500/15 text-emerald-700 dark:text-emerald-300">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">
                  {slabs.length} slab{slabs.length === 1 ? "" : "s"}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  Range {totalRange}
                </div>
              </div>
            </div>

            <Separator orientation="vertical" className="hidden h-8 sm:block" />

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={add}
                className="rounded-xl"
                aria-label="Add new slab"
              >
                <Plus className="mr-1 h-4 w-4" /> Add slab
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    aria-label="Quick presets"
                  >
                    <Sparkles className="mr-1 h-4 w-4" /> Presets
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Quick presets</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => applyPreset("prod14")}>
                    <Layers className="mr-2 h-4 w-4" />
                    Production 14-slab template
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => applyPreset("linear5")}>
                    <LayoutGrid className="mr-2 h-4 w-4" />
                    Linear 5-slab (₹500 → ₹1500)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmReset(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset / clear all
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setBulkOpen(true)}
                className="rounded-xl"
                aria-label="Bulk import slabs"
              >
                <Upload className="mr-1 h-4 w-4" /> Bulk import
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Visual chart */}
        {slabs.length > 0 && chart && (
          <Card className="rounded-2xl border-muted/60 shadow-sm">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Rate landscape
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  max ₹{fmt(chart.maxRate)}
                </div>
              </div>
              <div className="relative flex h-32 w-full items-end gap-[2px] overflow-hidden rounded-lg bg-gradient-to-b from-muted/30 to-transparent p-2">
                {slabs.map((s, i) => {
                  const min = s.minArea;
                  const max = s.maxArea ?? Math.max(min + 1, chart.span);
                  const width =
                    ((Math.max(max - min + 1, 1)) / chart.span) * 100;
                  const heightPct =
                    chart.maxRate === 0
                      ? 0
                      : Math.max(8, ((s.ratePerUnit || 0) / chart.maxRate) * 100);
                  const isLow = (s.ratePerUnit || 0) <= chart.maxRate * 0.5;
                  const grad = isLow
                    ? "from-emerald-500 to-emerald-300"
                    : "from-sky-600 to-sky-400";
                  const isHover = hoveredIdx === i;
                  return (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onMouseEnter={() => setHoveredIdx(i)}
                          onMouseLeave={() => setHoveredIdx(null)}
                          className={`group relative flex min-w-[6px] flex-col items-center justify-end rounded-md bg-gradient-to-t ${grad} transition-all duration-200 ${
                            isHover
                              ? "ring-2 ring-offset-2 ring-primary/60"
                              : ""
                          }`}
                          style={{
                            width: `max(${width}%, 12px)`,
                            height: `${heightPct}%`,
                          }}
                          aria-label={`Slab ${i + 1}: ₹${s.ratePerUnit}`}
                        >
                          <span className="-mt-5 hidden text-[10px] font-semibold tabular-nums text-foreground/80 group-hover:block">
                            ₹{fmt(s.ratePerUnit || 0)}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <div className="font-medium">Slab {i + 1}</div>
                          <div className="tabular-nums">
                            {fmt(min)} – {s.maxArea == null ? "∞" : fmt(s.maxArea)}{" "}
                            sqyd
                          </div>
                          <div className="tabular-nums">
                            ₹{fmt(s.ratePerUnit || 0)} / unit
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
                <span>0</span>
                <span>{fmt(Math.round(chart.span))}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {slabs.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-sky-500/15">
                <Layers className="h-7 w-7 text-emerald-600" />
              </div>
              <div>
                <div className="text-base font-semibold">No slabs yet</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add your first rate slab or load a preset to get started.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={add} className="rounded-xl">
                  <Plus className="mr-1 h-4 w-4" /> Add slab
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyPreset("prod14")}
                  className="rounded-xl"
                >
                  <Sparkles className="mr-1 h-4 w-4" /> Load 14-slab preset
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden rounded-2xl border-muted/60 shadow-sm sm:block">
              <div className="overflow-hidden rounded-2xl">
                <div className="sticky top-0 z-10 grid grid-cols-[40px_60px_1fr_1fr_1fr_1fr_120px] items-center gap-2 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <div />
                  <div>#</div>
                  <div>Min area</div>
                  <div>Max area</div>
                  <div>Range size</div>
                  <div>Rate / unit (₹)</div>
                  <div className="text-right">Actions</div>
                </div>
                <div>
                  {slabs.map((slab, idx) => {
                    const err = validation[idx];
                    const rangeSize =
                      slab.maxArea == null
                        ? "∞"
                        : fmt(Math.max(0, slab.maxArea - slab.minArea + 1));
                    const isDropTarget = dropIdx === idx && dragIdx !== idx;
                    return (
                      <div
                        key={idx}
                        draggable
                        onDragStart={() => setDragIdx(idx)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDropIdx(idx);
                        }}
                        onDragEnd={() => {
                          setDragIdx(null);
                          setDropIdx(null);
                        }}
                        onDrop={() => {
                          if (
                            dragIdx == null ||
                            dragIdx === idx ||
                            dragIdx < 0
                          ) {
                            setDragIdx(null);
                            setDropIdx(null);
                            return;
                          }
                          const next = [...slabs];
                          const [m] = next.splice(dragIdx, 1);
                          next.splice(idx, 0, m);
                          onChange(next);
                          setDragIdx(null);
                          setDropIdx(null);
                        }}
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        className={`grid grid-cols-[40px_60px_1fr_1fr_1fr_1fr_120px] items-center gap-2 border-t border-muted/40 px-3 py-2 transition-colors ${
                          err
                            ? "bg-destructive/5"
                            : hoveredIdx === idx
                              ? "bg-muted/30"
                              : ""
                        } ${isDropTarget ? "border-t-2 border-t-primary" : ""} ${
                          dragIdx === idx ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-center justify-center">
                          <Grip
                            className="h-4 w-4 cursor-grab text-muted-foreground/60 active:cursor-grabbing"
                            aria-label="Drag to reorder"
                          />
                        </div>
                        <div className="tabular-nums text-sm text-muted-foreground">
                          {idx + 1}
                        </div>
                        <div>
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            value={slab.minArea}
                            onChange={(e) =>
                              update(idx, { minArea: Number(e.target.value) })
                            }
                            onKeyDown={(e) => handleRowKeyDown(e, idx, false)}
                            className={`h-9 tabular-nums ${
                              err ? "border-destructive" : ""
                            }`}
                            aria-label={`Slab ${idx + 1} minimum area`}
                          />
                        </div>
                        <div>
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            placeholder="& Above"
                            value={slab.maxArea ?? ""}
                            onChange={(e) =>
                              update(idx, {
                                maxArea:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                            onKeyDown={(e) => handleRowKeyDown(e, idx, false)}
                            className={`h-9 tabular-nums ${
                              err ? "border-destructive" : ""
                            }`}
                            aria-label={`Slab ${idx + 1} maximum area`}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
                          {slab.maxArea == null ? (
                            <InfinityIcon className="h-3.5 w-3.5" />
                          ) : null}
                          <span>{rangeSize}</span>
                        </div>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            ₹
                          </span>
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            value={slab.ratePerUnit}
                            onChange={(e) =>
                              update(idx, {
                                ratePerUnit: Number(e.target.value),
                              })
                            }
                            onKeyDown={(e) =>
                              handleRowKeyDown(e, idx, true)
                            }
                            className={`h-9 pl-5 tabular-nums ${
                              err ? "border-destructive" : ""
                            }`}
                            aria-label={`Slab ${idx + 1} rate per unit`}
                          />
                        </div>
                        <div className="flex items-center justify-end gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={idx === 0}
                                onClick={() => move(idx, -1)}
                                aria-label="Move up"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Move up</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={idx === slabs.length - 1}
                                onClick={() => move(idx, 1)}
                                aria-label="Move down"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Move down</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => duplicate(idx)}
                                aria-label="Duplicate row"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Duplicate</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => remove(idx)}
                                aria-label="Delete row"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete (Ctrl+D)</TooltipContent>
                          </Tooltip>
                        </div>
                        {err && (
                          <div className="col-span-7 pl-[100px] text-[11px] font-medium text-destructive">
                            {err}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Mobile card stack */}
            <div className="space-y-3 sm:hidden">
              {slabs.map((slab, idx) => {
                const err = validation[idx];
                const rangeSize =
                  slab.maxArea == null
                    ? "∞"
                    : fmt(Math.max(0, slab.maxArea - slab.minArea + 1));
                return (
                  <Card
                    key={idx}
                    className={`rounded-2xl border-muted/60 shadow-sm ${
                      err ? "border-destructive/50 bg-destructive/5" : ""
                    }`}
                  >
                    <CardContent className="space-y-3 p-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="rounded-full">
                          Slab {idx + 1}
                        </Badge>
                        <div className="flex gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={idx === 0}
                            onClick={() => move(idx, -1)}
                            aria-label="Move up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={idx === slabs.length - 1}
                            onClick={() => move(idx, 1)}
                            aria-label="Move down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => duplicate(idx)}
                            aria-label="Duplicate"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => remove(idx)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] text-muted-foreground">
                            Min area
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={slab.minArea}
                            onChange={(e) =>
                              update(idx, { minArea: Number(e.target.value) })
                            }
                            className="h-9 tabular-nums"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">
                            Max area
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="& Above"
                            value={slab.maxArea ?? ""}
                            onChange={(e) =>
                              update(idx, {
                                maxArea:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                            className="h-9 tabular-nums"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">
                            Range size
                          </Label>
                          <div className="flex h-9 items-center text-sm tabular-nums text-muted-foreground">
                            {rangeSize}
                          </div>
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">
                            Rate (₹/unit)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={slab.ratePerUnit}
                            onChange={(e) =>
                              update(idx, {
                                ratePerUnit: Number(e.target.value),
                              })
                            }
                            onKeyDown={(e) =>
                              handleRowKeyDown(e, idx, true)
                            }
                            className="h-9 tabular-nums"
                          />
                        </div>
                      </div>
                      {err && (
                        <div className="text-[11px] font-medium text-destructive">
                          {err}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {/* Confirm reset */}
        <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all slabs?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove every slab. You can undo with Ctrl+Z in your
                browser, but it's safer to keep your existing rows.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onChange([]);
                  setConfirmReset(false);
                  toast({ title: "All slabs cleared" });
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Clear all
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk import */}
        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-4 w-4" /> Bulk import slabs
              </DialogTitle>
              <DialogDescription>
                One slab per line as <code>minArea,maxArea,rate</code>. Leave
                maxArea blank or write <code>∞</code> for the last open-ended
                slab.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              rows={10}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"0,499,500\n500,999,600\n1000,,700"}
              className="font-mono text-xs"
              aria-label="Bulk import CSV"
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setBulkOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button onClick={handleBulkApply} className="rounded-xl">
                <Upload className="mr-1 h-4 w-4" /> Apply
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
