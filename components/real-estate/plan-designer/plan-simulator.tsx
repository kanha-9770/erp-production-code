"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useSimulatePlanMutation,
  type CompPlanSlab,
  type CompPlanOverrideLevel,
} from "@/lib/api/real-estate/plans";
import { useToast } from "@/hooks/use-toast";
import {
  Bookmark,
  Calculator,
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  Save,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";

interface Props {
  planId: string;
  slabs: CompPlanSlab[];
  overrideLevels: CompPlanOverrideLevel[];
}

type SimResult = {
  sellerRate: number;
  directIncome: number;
  overrides: Array<{ level: number; rate: number; factor: number; amount: number }>;
  overrideTotal: number;
  brokerageAmount: number;
  total: number;
};

type Scenario = {
  id: string;
  name: string;
  dealArea: string;
  sellerCumArea: string;
  uplineAreas: string[];
};

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const COLORS = {
  direct: "#10b981", // emerald
  override: "#6366f1", // indigo
  brokerage: "#f59e0b", // amber
};

export function PlanSimulator({ planId }: Props) {
  const { toast } = useToast();
  const [simulate, { isLoading }] = useSimulatePlanMutation();

  const [dealArea, setDealArea] = useState("");
  const [sellerCumArea, setSellerCumArea] = useState("");
  const [uplineAreas, setUplineAreas] = useState<string[]>(
    Array.from({ length: 10 }, () => ""),
  );
  const [showAllUplines, setShowAllUplines] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const submitRef = useRef<() => void>(() => {});

  const setUpline = useCallback((idx: number, val: string) => {
    setUplineAreas((prev) => prev.map((v, i) => (i === idx ? val : v)));
  }, []);

  const applyQuickFill = useCallback(
    (area: number) => {
      setDealArea(String(area));
      if (!sellerCumArea) setSellerCumArea("500");
    },
    [sellerCumArea],
  );

  const run = useCallback(async () => {
    const area = Number(dealArea);
    const cumArea = Number(sellerCumArea);
    if (!area || area <= 0) {
      toast({
        title: "Enter a deal area",
        description: "Deal area must be greater than zero.",
        variant: "destructive",
      });
      return;
    }
    if (Number.isNaN(cumArea)) {
      toast({
        title: "Invalid seller cumulative area",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await simulate({
        id: planId,
        dealArea: area,
        sellerCumulativeAreaBefore: cumArea,
        uplineAreas: uplineAreas
          .map(Number)
          .filter((n) => !Number.isNaN(n) && n > 0),
      }).unwrap();
      setResult(res.data);
    } catch (err: any) {
      toast({
        title: "Simulation failed",
        description: err?.data?.error || err?.message || "Unknown error",
        variant: "destructive",
      });
    }
  }, [dealArea, sellerCumArea, uplineAreas, simulate, planId, toast]);

  // keep ref to run() so the keyboard listener sees the latest closure
  useEffect(() => {
    submitRef.current = run;
  }, [run]);

  // keyboard shortcut: ⌘/Ctrl + Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const saveScenario = useCallback(() => {
    if (!dealArea) {
      toast({ title: "Enter a deal area first" });
      return;
    }
    const name = `${fmt(Number(dealArea))} sqyd`;
    setScenarios((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2),
        name,
        dealArea,
        sellerCumArea,
        uplineAreas,
      },
    ]);
    toast({ title: "Scenario saved", description: name });
  }, [dealArea, sellerCumArea, uplineAreas, toast]);

  const applyScenario = useCallback((s: Scenario) => {
    setDealArea(s.dealArea);
    setSellerCumArea(s.sellerCumArea);
    setUplineAreas(s.uplineAreas);
  }, []);

  const removeScenario = useCallback((id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const visibleUplineCount = showAllUplines ? 10 : 5;

  // donut chart segments
  const donut = useMemo(() => {
    if (!result) return null;
    const parts = [
      { key: "direct", label: "Direct income", value: result.directIncome, color: COLORS.direct },
      { key: "override", label: "Override total", value: result.overrideTotal, color: COLORS.override },
      { key: "brokerage", label: "Brokerage", value: result.brokerageAmount, color: COLORS.brokerage },
    ];
    const total = parts.reduce((a, p) => a + (p.value || 0), 0);
    if (total <= 0) return { parts, total, segments: [] as any[] };
    const radius = 60;
    const cx = 80;
    const cy = 80;
    let cum = 0;
    const segments = parts.map((p) => {
      const frac = (p.value || 0) / total;
      const start = cum;
      const end = cum + frac;
      cum = end;
      const a0 = start * 2 * Math.PI - Math.PI / 2;
      const a1 = end * 2 * Math.PI - Math.PI / 2;
      const x0 = cx + radius * Math.cos(a0);
      const y0 = cy + radius * Math.sin(a0);
      const x1 = cx + radius * Math.cos(a1);
      const y1 = cy + radius * Math.sin(a1);
      const largeArc = frac > 0.5 ? 1 : 0;
      // For a full-circle single segment, draw two halves to avoid degenerate path.
      const d =
        frac >= 1
          ? `M ${cx - radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx + radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx - radius} ${cy} Z`
          : `M ${cx} ${cy} L ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} 1 ${x1} ${y1} Z`;
      return { ...p, d, frac };
    });
    return { parts, total, segments };
  }, [result]);

  const maxOverrideAmount = useMemo(() => {
    if (!result) return 0;
    return Math.max(...result.overrides.map((o) => o.amount || 0), 1);
  }, [result]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid gap-4 md:grid-cols-12">
        {/* Inputs panel */}
        <div className="md:col-span-5">
          <Card className="sticky top-4 rounded-2xl border-muted/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-sky-500/15 to-indigo-500/15 text-sky-700 dark:text-sky-300">
                  <Calculator className="h-4 w-4" />
                </div>
                Simulation inputs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">
                    Deal area (sqyd)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={dealArea}
                    onChange={(e) => setDealArea(e.target.value)}
                    placeholder="e.g. 200"
                    className="h-9 tabular-nums"
                    aria-label="Deal area"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">
                    Seller cum. area (sqyd)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={sellerCumArea}
                    onChange={(e) => setSellerCumArea(e.target.value)}
                    placeholder="e.g. 500"
                    className="h-9 tabular-nums"
                    aria-label="Seller cumulative area before deal"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Quick fill:
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyQuickFill(200)}
                  className="h-7 rounded-full px-2.5 text-xs"
                >
                  Small · 200
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyQuickFill(1000)}
                  className="h-7 rounded-full px-2.5 text-xs"
                >
                  Medium · 1k
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyQuickFill(5000)}
                  className="h-7 rounded-full px-2.5 text-xs"
                >
                  Large · 5k
                </Button>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Users className="h-3 w-3" /> Upline cumulative areas
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowAllUplines((s) => !s)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    aria-label={
                      showAllUplines ? "Show fewer uplines" : "Show more uplines"
                    }
                  >
                    {showAllUplines ? (
                      <>
                        Show 5 <ChevronUp className="h-3 w-3" />
                      </>
                    ) : (
                      <>
                        Show 10 <ChevronDown className="h-3 w-3" />
                      </>
                    )}
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {uplineAreas.slice(0, visibleUplineCount).map((v, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        L{i + 1}
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={v}
                        onChange={(e) => setUpline(i, e.target.value)}
                        placeholder="—"
                        className="h-8 tabular-nums text-xs"
                        aria-label={`Upline level ${i + 1} cumulative area`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={run}
                  disabled={isLoading}
                  className="flex-1 rounded-xl"
                  aria-label="Run simulation"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Simulating…
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Simulate
                      <kbd className="ml-2 hidden rounded bg-white/20 px-1.5 py-0.5 text-[10px] sm:inline">
                        ⌘↵
                      </kbd>
                    </>
                  )}
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={saveScenario}
                      className="rounded-xl"
                      aria-label="Save scenario"
                    >
                      <Save className="mr-1 h-4 w-4" />
                      Save
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save these inputs as a scenario</TooltipContent>
                </Tooltip>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results panel */}
        <div className="md:col-span-7">
          {/* Saved scenarios */}
          {scenarios.length > 0 && (
            <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
              {scenarios.map((s) => (
                <div
                  key={s.id}
                  className="group inline-flex shrink-0 items-center gap-1 rounded-full border border-muted/60 bg-card px-3 py-1 text-xs shadow-sm hover:shadow-md"
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 font-medium"
                    onClick={() => applyScenario(s)}
                    aria-label={`Apply scenario ${s.name}`}
                  >
                    <Bookmark className="h-3 w-3 text-sky-500" />
                    {s.name}
                  </button>
                  <button
                    type="button"
                    className="ml-1 text-muted-foreground hover:text-destructive"
                    onClick={() => removeScenario(s.id)}
                    aria-label="Remove scenario"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!result ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-500/15 to-indigo-500/15">
                  <Zap className="h-7 w-7 text-sky-600" />
                </div>
                <div>
                  <div className="text-base font-semibold">
                    Ready when you are
                  </div>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Enter inputs on the left and hit{" "}
                    <kbd className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                      ⌘↵
                    </kbd>{" "}
                    to preview the payout breakdown.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Headline */}
              <Card className="rounded-2xl border-muted/60 bg-gradient-to-br from-emerald-500/5 via-transparent to-sky-500/5 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Total payout
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-4xl font-bold tabular-nums">
                      ₹{fmt(result.total)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      for this deal
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* KPI tiles */}
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Kpi
                  label="Seller rate"
                  value={`₹${fmt(result.sellerRate)}`}
                  hint="per sqyd"
                  color="emerald"
                />
                <Kpi
                  label="Direct income"
                  value={`₹${fmt(result.directIncome)}`}
                  color="emerald"
                />
                <Kpi
                  label="Override total"
                  value={`₹${fmt(result.overrideTotal)}`}
                  color="indigo"
                />
                <Kpi
                  label="Brokerage"
                  value={`₹${fmt(result.brokerageAmount)}`}
                  color="amber"
                />
              </div>

              {/* Donut + legend */}
              {donut && donut.total > 0 && (
                <Card className="rounded-2xl border-muted/60 shadow-sm">
                  <CardContent className="flex flex-col items-center gap-4 p-4 sm:flex-row">
                    <div className="relative shrink-0">
                      <svg
                        width={160}
                        height={160}
                        viewBox="0 0 160 160"
                        role="img"
                        aria-label="Payout split donut chart"
                      >
                        {donut.segments.map((s: any) => (
                          <path
                            key={s.key}
                            d={s.d}
                            fill={s.color}
                            stroke="white"
                            strokeWidth={2}
                          />
                        ))}
                        {/* donut hole */}
                        <circle cx={80} cy={80} r={36} fill="white" />
                      </svg>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Total
                        </span>
                        <span className="text-sm font-semibold tabular-nums">
                          ₹{fmt(donut.total)}
                        </span>
                      </div>
                    </div>
                    <ul className="flex flex-1 flex-col gap-2 text-sm">
                      {donut.parts.map((p) => {
                        const frac = donut.total > 0 ? (p.value / donut.total) * 100 : 0;
                        return (
                          <li key={p.key} className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-sm"
                              style={{ backgroundColor: p.color }}
                            />
                            <span className="flex-1">{p.label}</span>
                            <span className="tabular-nums">₹{fmt(p.value)}</span>
                            <span className="ml-2 w-10 text-right text-xs tabular-nums text-muted-foreground">
                              {frac.toFixed(1)}%
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Per-level override bars */}
              {result.overrides.length > 0 && (
                <Card className="rounded-2xl border-muted/60 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-indigo-500" />
                      Per-level overrides
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {result.overrides.map((o) => {
                      const w =
                        maxOverrideAmount > 0
                          ? (o.amount / maxOverrideAmount) * 100
                          : 0;
                      return (
                        <div
                          key={o.level}
                          className="grid grid-cols-[40px_1fr_110px] items-center gap-2"
                        >
                          <Badge
                            variant="outline"
                            className="justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          >
                            L{o.level}
                          </Badge>
                          <div className="h-5 overflow-hidden rounded-md bg-muted/40">
                            <div
                              className="h-full rounded-md bg-gradient-to-r from-indigo-500 to-sky-400 transition-all duration-300"
                              style={{ width: `${Math.max(2, w)}%` }}
                            />
                          </div>
                          <div className="text-right text-xs font-semibold tabular-nums">
                            ₹{fmt(o.amount)}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Detailed table */}
              {result.overrides.length > 0 && (
                <Card className="rounded-2xl border-muted/60 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                      Detailed breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="grid grid-cols-4 gap-2 border-t bg-muted/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <div>Level</div>
                      <div className="text-right">Rate (₹)</div>
                      <div className="text-right">Factor</div>
                      <div className="text-right">Amount (₹)</div>
                    </div>
                    {result.overrides.map((o) => (
                      <div
                        key={o.level}
                        className="grid grid-cols-4 gap-2 border-t border-muted/40 px-4 py-1.5 text-sm tabular-nums"
                      >
                        <div className="font-medium">L{o.level}</div>
                        <div className="text-right">{fmt(o.rate)}</div>
                        <div className="text-right">{o.factor.toFixed(2)}</div>
                        <div className="text-right font-semibold">
                          ₹{fmt(o.amount)}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function Kpi({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color: "emerald" | "indigo" | "amber";
}) {
  const ring =
    color === "emerald"
      ? "from-emerald-500/15 to-emerald-500/0"
      : color === "indigo"
        ? "from-indigo-500/15 to-indigo-500/0"
        : "from-amber-500/15 to-amber-500/0";
  return (
    <div
      className={`rounded-2xl border border-muted/60 bg-gradient-to-br ${ring} p-3 shadow-sm`}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
