"use client";

import { useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CompPlanOverrideLevel } from "@/lib/api/real-estate/plans";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Layers,
  RotateCcw,
  Sparkles,
  TrendingDown,
} from "lucide-react";

const DEFAULT_FACTORS: Record<number, number> = {
  1: 1.0,
  2: 0.75,
  3: 0.5,
};

function defaultFactor(level: number): number {
  return DEFAULT_FACTORS[level] ?? 0.25;
}

export function buildDefaultOverrideLevels(): CompPlanOverrideLevel[] {
  return Array.from({ length: 10 }, (_, i) => ({
    level: i + 1,
    factor: defaultFactor(i + 1),
  })) as CompPlanOverrideLevel[];
}

interface Props {
  levels: CompPlanOverrideLevel[];
  overrideMode: string;
  onChange: (levels: CompPlanOverrideLevel[]) => void;
  simulateResult?: Array<{ level: number; amount: number }>;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

export function OverrideEditor({
  levels,
  overrideMode,
  onChange,
  simulateResult,
}: Props) {
  const rows: CompPlanOverrideLevel[] = useMemo(() => {
    if (levels.length === 10) return levels;
    return Array.from({ length: 10 }, (_, i) => {
      const existing = levels.find((l) => l.level === i + 1);
      return (
        existing ?? ({ level: i + 1, factor: defaultFactor(i + 1) } as CompPlanOverrideLevel)
      );
    });
  }, [levels]);

  const update = useCallback(
    (level: number, factor: number) => {
      const clamped = Number.isFinite(factor) ? Math.max(0, factor) : 0;
      onChange(rows.map((r) => (r.level === level ? { ...r, factor: clamped } : r)));
    },
    [rows, onChange],
  );

  const applyAll = useCallback(
    (mapper: (level: number, idx: number) => number) => {
      onChange(rows.map((r, i) => ({ ...r, factor: mapper(r.level, i) })));
    },
    [rows, onChange],
  );

  const totalFactor = useMemo(
    () => rows.reduce((acc, r) => acc + (r.factor || 0), 0),
    [rows],
  );

  const maxFactor = useMemo(
    () => Math.max(...rows.map((r) => r.factor || 0), 0.01),
    [rows],
  );

  const exceedsSeller = useMemo(
    () => rows.some((r) => (r.factor || 0) > 1.0),
    [rows],
  );

  const simByLevel = useMemo(() => {
    const m = new Map<number, number>();
    simulateResult?.forEach((s) => m.set(s.level, s.amount));
    return m;
  }, [simulateResult]);

  const totalSim = useMemo(
    () => (simulateResult ?? []).reduce((acc, s) => acc + (s.amount || 0), 0),
    [simulateResult],
  );

  const modeFormula =
    overrideMode === "DIFF_FACTOR"
      ? "factor × dealArea (paid out across levels)"
      : "(level rate − previous rate) × area × factor";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* Mode banner */}
        <Card className="rounded-2xl border-muted/60 bg-gradient-to-br from-sky-500/5 via-transparent to-indigo-500/5 shadow-sm">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300">
              <Layers className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Override mode
                </span>
                <Badge variant="secondary" className="rounded-full">
                  {overrideMode}
                </Badge>
              </div>
              <div className="text-sm">
                Override per level ={" "}
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">
                  {modeFormula}
                </span>
              </div>
            </div>
            <Separator orientation="vertical" className="hidden h-8 sm:block" />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="rounded-full px-3 py-1 text-xs tabular-nums"
                  >
                    Total factor: {totalFactor.toFixed(2)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Sum of factors across all 10 levels.
                </TooltipContent>
              </Tooltip>
              {simulateResult && (
                <Badge
                  variant="outline"
                  className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs tabular-nums text-emerald-700 dark:text-emerald-300"
                >
                  Simulated ₹{fmt(totalSim)}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {exceedsSeller && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <span>
              One or more factors exceed <strong>1.0</strong> — overrides may
              pay out more than the seller's own income.
            </span>
          </div>
        )}

        {/* Bar chart */}
        <Card className="rounded-2xl border-muted/60 shadow-sm">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <BarChart3 className="h-3.5 w-3.5" /> Factor distribution
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                max {maxFactor.toFixed(2)}
              </span>
            </div>
            <div className="flex h-32 items-end gap-1.5 rounded-lg bg-gradient-to-b from-muted/30 to-transparent p-2">
              {rows.map((r) => {
                const h = Math.max(4, (r.factor / maxFactor) * 100);
                const warn = r.factor > 1.0;
                return (
                  <Tooltip key={r.level}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={`group relative flex flex-1 flex-col items-center justify-end rounded-md bg-gradient-to-t transition-all duration-200 hover:opacity-90 ${
                          warn
                            ? "from-amber-500 to-amber-300"
                            : "from-indigo-600 to-sky-400"
                        }`}
                        style={{ height: `${h}%` }}
                        aria-label={`Level ${r.level} factor ${r.factor}`}
                      >
                        <span className="-mt-5 hidden text-[10px] font-semibold tabular-nums group-hover:block">
                          {r.factor.toFixed(2)}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <div className="font-medium">L{r.level}</div>
                        <div className="tabular-nums">
                          Factor: {r.factor.toFixed(3)} (
                          {(r.factor * 100).toFixed(0)}%)
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
              {rows.map((r) => (
                <span key={r.level} className="flex-1 text-center">
                  L{r.level}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange(buildDefaultOverrideLevels())}
            className="rounded-xl"
          >
            <RotateCcw className="mr-1 h-4 w-4" /> Reset to standard
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              applyAll((_, i) => {
                // 1.0 down to 0.1 linearly across 10 levels
                const v = 1.0 - i * (0.9 / 9);
                return Math.round(v * 100) / 100;
              });
            }}
            className="rounded-xl"
          >
            <TrendingDown className="mr-1 h-4 w-4" /> Linear decay
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => applyAll((_, i) => (i < 5 ? 1.0 : 0))}
            className="rounded-xl"
          >
            <Sparkles className="mr-1 h-4 w-4" /> Cliff at L5
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl"
              >
                More <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Other presets</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => applyAll(() => 0.5)}>
                All equal (0.5)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => applyAll(() => 1.0)}>
                All maxed (1.0)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="text-destructive focus:text-destructive"
                  >
                    All zero…
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Zero out every level?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This disables all upline overrides. The plan will only
                      pay out direct income.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => applyAll(() => 0)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Zero all
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Level rows */}
        <Card className="rounded-2xl border-muted/60 shadow-sm">
          <CardContent className="space-y-2 p-3">
            {rows.map((row) => {
              const simAmt = simByLevel.get(row.level);
              const warn = row.factor > 1.0;
              return (
                <div
                  key={row.level}
                  className={`grid grid-cols-[44px_110px_64px_1fr_auto] items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                    warn
                      ? "border-amber-400/40 bg-amber-500/5"
                      : "border-muted/40"
                  }`}
                >
                  <div
                    className={`grid h-9 w-9 place-items-center rounded-full text-xs font-semibold ${
                      row.factor === 0
                        ? "bg-muted text-muted-foreground"
                        : "bg-gradient-to-br from-indigo-500 to-sky-500 text-white"
                    }`}
                  >
                    L{row.level}
                  </div>
                  <div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="10"
                      value={row.factor}
                      onChange={(e) =>
                        update(row.level, Number(e.target.value))
                      }
                      className="h-9 tabular-nums"
                      aria-label={`Level ${row.level} factor`}
                    />
                  </div>
                  <div className="text-sm tabular-nums text-muted-foreground">
                    {(row.factor * 100).toFixed(0)}%
                  </div>
                  <div className="px-1">
                    <Slider
                      value={[Math.min(2, row.factor)]}
                      min={0}
                      max={2}
                      step={0.01}
                      onValueChange={(v) => update(row.level, v[0] ?? 0)}
                      aria-label={`Level ${row.level} factor slider`}
                    />
                  </div>
                  <div className="min-w-[110px] text-right">
                    {simAmt != null ? (
                      <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                        <Sparkles className="h-3 w-3" />₹{fmt(simAmt)}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
