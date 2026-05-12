"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import type { CompPlanDesignation } from "@/lib/api/real-estate/plans";
import {
  AlertTriangle,
  Award,
  Banknote,
  Building2,
  ChevronDown,
  ChevronUp,
  Copy,
  Crown,
  Gift,
  Plane,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";

type Designation = CompPlanDesignation;

interface Props {
  designations: Designation[];
  onChange: (des: Designation[]) => void;
}

function emptyRow(): Designation {
  return {
    minCumulativeArea: 0,
    designationCode: "",
    designationName: "",
    rewardType: "NONE",
    rewardDescription: null,
    rewardCashAmount: null,
  } as Designation;
}

const REWARD_TYPES: {
  value: Designation["rewardType"];
  label: string;
  Icon: typeof Award;
  ring: string;
  bg: string;
  fg: string;
}[] = [
  {
    value: "NONE",
    label: "None",
    Icon: Award,
    ring: "border-l-slate-300",
    bg: "bg-slate-500/10",
    fg: "text-slate-700 dark:text-slate-300",
  },
  {
    value: "CASH",
    label: "Cash",
    Icon: Banknote,
    ring: "border-l-emerald-500",
    bg: "bg-emerald-500/10",
    fg: "text-emerald-700 dark:text-emerald-300",
  },
  {
    value: "TRAVEL",
    label: "Travel",
    Icon: Plane,
    ring: "border-l-sky-500",
    bg: "bg-sky-500/10",
    fg: "text-sky-700 dark:text-sky-300",
  },
  {
    value: "SURPRISE",
    label: "Surprise",
    Icon: Gift,
    ring: "border-l-amber-500",
    bg: "bg-amber-500/10",
    fg: "text-amber-700 dark:text-amber-300",
  },
];

const REWARD_META = Object.fromEntries(REWARD_TYPES.map((r) => [r.value, r]));

const LADDER_8: Array<[number, string, string]> = [
  [0, "SP", "Sales Promoter"],
  [500, "SM", "Sales Manager"],
  [1000, "SSM", "Sr Sales Manager"],
  [2000, "AVP", "Asst Vice President"],
  [5000, "VP", "Vice President"],
  [10000, "DIR", "Director"],
  [40000, "SDIR", "Sr Director"],
  [100000, "PRES", "President"],
];

function rankIcon(idx: number, total: number) {
  if (idx === total - 1) return Crown;
  if (idx >= total - 3) return Trophy;
  if (idx >= total - 5) return Award;
  return Building2;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

export function DesignationEditor({ designations, onChange }: Props) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [confirmClear, setConfirmClear] = useState(false);

  const update = useCallback(
    (idx: number, patch: Partial<Designation>) =>
      onChange(designations.map((d, i) => (i === idx ? { ...d, ...patch } : d))),
    [designations, onChange],
  );

  const add = useCallback(() => {
    onChange([...designations, emptyRow()]);
    setExpanded((prev) => ({ ...prev, [designations.length]: true }));
  }, [designations, onChange]);

  const remove = useCallback(
    (idx: number) => {
      onChange(designations.filter((_, i) => i !== idx));
      toast({ title: "Designation removed" });
    },
    [designations, onChange, toast],
  );

  const duplicate = useCallback(
    (idx: number) => {
      const next = [...designations];
      next.splice(idx + 1, 0, { ...designations[idx] });
      onChange(next);
    },
    [designations, onChange],
  );

  const applyLadder = useCallback(() => {
    const rows: Designation[] = LADDER_8.map(([area, code, name]) => ({
      minCumulativeArea: area,
      designationCode: code,
      designationName: name,
      rewardType: code === "PRES" ? "TRAVEL" : code === "SDIR" ? "CASH" : "NONE",
      rewardDescription:
        code === "PRES"
          ? "International family trip"
          : code === "SDIR"
            ? "One-time cash reward"
            : null,
      rewardCashAmount: code === "SDIR" ? 100000 : null,
    })) as Designation[];
    onChange(rows);
    toast({
      title: "8-rank ladder applied",
      description: "Sales Promoter → President.",
    });
  }, [onChange, toast]);

  const sorted = useMemo(
    () =>
      [...designations]
        .map((d, i) => ({ d, i }))
        .sort((a, b) => a.d.minCumulativeArea - b.d.minCumulativeArea),
    [designations],
  );

  // validations
  const issues = useMemo(() => {
    const codeCount = new Map<string, number>();
    designations.forEach((d) => {
      const c = d.designationCode.trim();
      if (c) codeCount.set(c, (codeCount.get(c) ?? 0) + 1);
    });
    const duplicateCodes = new Set(
      [...codeCount.entries()].filter(([, n]) => n > 1).map(([c]) => c),
    );
    let nonMonotonic = false;
    for (let i = 1; i < sorted.length; i++) {
      if (
        sorted[i].d.minCumulativeArea <=
        sorted[i - 1].d.minCumulativeArea
      ) {
        nonMonotonic = true;
        break;
      }
    }
    return { duplicateCodes, nonMonotonic };
  }, [designations, sorted]);

  const totalCash = useMemo(
    () =>
      designations.reduce(
        (acc, d) =>
          d.rewardType === "CASH" ? acc + (d.rewardCashAmount ?? 0) : acc,
        0,
      ),
    [designations],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* Toolbar */}
        <Card className="rounded-2xl border-muted/60 shadow-sm">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-amber-500/15 to-rose-500/15 text-amber-700 dark:text-amber-300">
                <Trophy className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">
                  {designations.length} designation
                  {designations.length === 1 ? "" : "s"}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  Total cash rewards: ₹{fmt(totalCash)}
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
                aria-label="Add designation"
              >
                <Plus className="mr-1 h-4 w-4" /> Add designation
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                  >
                    <Sparkles className="mr-1 h-4 w-4" /> Templates
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Templates</DropdownMenuLabel>
                  <DropdownMenuItem onClick={applyLadder}>
                    <Trophy className="mr-2 h-4 w-4" />
                    8-rank ladder (Sales Promoter → President)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmClear(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> Clear all
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>

        {/* Validations */}
        {(issues.duplicateCodes.size > 0 || issues.nonMonotonic) && (
          <div className="space-y-2">
            {issues.duplicateCodes.size > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>
                  Duplicate codes:{" "}
                  <strong>
                    {[...issues.duplicateCodes].join(", ")}
                  </strong>
                </span>
              </div>
            )}
            {issues.nonMonotonic && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>
                  Thresholds aren't strictly increasing. Higher designations
                  should require more cumulative area.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {designations.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-500/15 to-rose-500/15">
                <Trophy className="h-7 w-7 text-amber-600" />
              </div>
              <div>
                <div className="text-base font-semibold">No designations yet</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a rank or load the 8-rank ladder to define promotions.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={add} className="rounded-xl">
                  <Plus className="mr-1 h-4 w-4" /> Add designation
                </Button>
                <Button
                  variant="outline"
                  onClick={applyLadder}
                  className="rounded-xl"
                >
                  <Sparkles className="mr-1 h-4 w-4" /> Load 8-rank ladder
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Ladder timeline */}
            <Card className="rounded-2xl border-muted/60 shadow-sm">
              <CardContent className="p-4">
                <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Promotion ladder
                </div>
                <ol className="relative ml-3 space-y-3 border-l-2 border-dashed border-muted">
                  {sorted.map(({ d, i }, sortedIdx) => {
                    const meta =
                      REWARD_META[d.rewardType] ?? REWARD_META["NONE"];
                    const RankIcon = rankIcon(sortedIdx, sorted.length);
                    return (
                      <li key={i} className="relative pl-6">
                        <span
                          className={`absolute -left-[11px] grid h-5 w-5 place-items-center rounded-full ${meta.bg} ring-2 ring-background`}
                        >
                          <RankIcon className={`h-3 w-3 ${meta.fg}`} />
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            {d.designationName || (
                              <span className="text-muted-foreground italic">
                                (unnamed)
                              </span>
                            )}
                          </span>
                          {d.designationCode && (
                            <Badge
                              variant="outline"
                              className="rounded-full text-[10px]"
                            >
                              {d.designationCode}
                            </Badge>
                          )}
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            @ {fmt(d.minCumulativeArea)} sqyd
                          </span>
                          {d.rewardType !== "NONE" && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.bg} ${meta.fg}`}
                            >
                              <meta.Icon className="h-3 w-3" /> {meta.label}
                              {d.rewardType === "CASH" &&
                                d.rewardCashAmount != null &&
                                ` · ₹${fmt(d.rewardCashAmount)}`}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>

            {/* Designation cards */}
            <div className="space-y-3">
              {designations.map((d, idx) => {
                const meta = REWARD_META[d.rewardType] ?? REWARD_META["NONE"];
                const isExpanded = expanded[idx] ?? false;
                const isDup =
                  d.designationCode && issues.duplicateCodes.has(d.designationCode);
                return (
                  <Card
                    key={idx}
                    className={`overflow-hidden rounded-2xl border-l-4 ${meta.ring} border-muted/60 shadow-sm transition-shadow hover:shadow-md ${
                      isDup ? "ring-1 ring-destructive/40" : ""
                    }`}
                  >
                    <CardContent className="space-y-3 p-4">
                      {/* Header row */}
                      <div className="flex items-center gap-3">
                        <div
                          className={`grid h-9 w-9 place-items-center rounded-xl ${meta.bg} ${meta.fg}`}
                        >
                          <meta.Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="rounded-full tabular-nums"
                            >
                              {d.designationCode || "—"}
                            </Badge>
                            <span className="truncate text-base font-semibold">
                              {d.designationName || (
                                <span className="text-muted-foreground italic">
                                  (unnamed)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                            @ {fmt(d.minCumulativeArea)} sqyd
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  setExpanded((prev) => ({
                                    ...prev,
                                    [idx]: !isExpanded,
                                  }))
                                }
                                aria-label={
                                  isExpanded ? "Collapse" : "Expand"
                                }
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {isExpanded ? "Collapse" : "Expand"}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => duplicate(idx)}
                                aria-label="Duplicate designation"
                              >
                                <Copy className="h-4 w-4" />
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
                                className="h-8 w-8"
                                onClick={() => remove(idx)}
                                aria-label="Delete designation"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <Label className="text-[11px] text-muted-foreground">
                            Min cumulative area
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={d.minCumulativeArea}
                            onChange={(e) =>
                              update(idx, {
                                minCumulativeArea: Number(e.target.value),
                              })
                            }
                            className="h-9 tabular-nums"
                            aria-label="Min cumulative area"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">
                            Code
                          </Label>
                          <Input
                            value={d.designationCode}
                            onChange={(e) =>
                              update(idx, {
                                designationCode: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder="e.g. SM"
                            className={`h-9 uppercase tracking-wider ${
                              isDup ? "border-destructive" : ""
                            }`}
                            aria-label="Designation code"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">
                            Name
                          </Label>
                          <Input
                            value={d.designationName}
                            onChange={(e) =>
                              update(idx, { designationName: e.target.value })
                            }
                            placeholder="e.g. Sales Manager"
                            className="h-9"
                            aria-label="Designation name"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">
                            Reward type
                          </Label>
                          <Select
                            value={d.rewardType}
                            onValueChange={(v) =>
                              update(idx, {
                                rewardType:
                                  v as Designation["rewardType"],
                                rewardCashAmount:
                                  v === "CASH" ? d.rewardCashAmount : null,
                              })
                            }
                          >
                            <SelectTrigger className="h-9" aria-label="Reward type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {REWARD_TYPES.map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                  <span className="inline-flex items-center gap-2">
                                    <r.Icon className="h-3.5 w-3.5" />
                                    {r.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="grid gap-3 rounded-xl bg-muted/30 p-3 sm:grid-cols-[2fr_1fr]">
                          <div>
                            <Label className="text-[11px] text-muted-foreground">
                              Reward description
                            </Label>
                            <Textarea
                              rows={2}
                              value={d.rewardDescription ?? ""}
                              onChange={(e) =>
                                update(idx, {
                                  rewardDescription: e.target.value || null,
                                })
                              }
                              placeholder="e.g. International trip for two"
                              className="resize-none"
                              aria-label="Reward description"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-muted-foreground">
                              Cash amount (₹)
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={d.rewardType !== "CASH"}
                              value={d.rewardCashAmount ?? ""}
                              onChange={(e) =>
                                update(idx, {
                                  rewardCashAmount:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                              placeholder={
                                d.rewardType === "CASH" ? "0.00" : "—"
                              }
                              className="tabular-nums"
                              aria-label="Cash reward amount"
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {/* Confirm clear */}
        <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all designations?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove every rank and its reward. Guarantees that
                reference removed designation codes will be orphaned.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onChange([]);
                  setConfirmClear(false);
                  toast({ title: "Cleared all designations" });
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Clear all
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
