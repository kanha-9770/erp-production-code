"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useGetPlansQuery,
  useActivatePlanMutation,
  useDeactivatePlanMutation,
  useDeletePlanMutation,
  type CompPlan,
} from "@/lib/api/real-estate/plans";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  ArrowLeft,
  Award,
  ChevronRight,
  Clock,
  FileText,
  Keyboard,
  Layers,
  LayoutGrid,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";

const STATUS_BADGE: Record<
  CompPlan["status"],
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Draft",
    className:
      "bg-amber-100 text-amber-800 border border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50",
  },
  ACTIVE: {
    label: "Active",
    className:
      "bg-emerald-100 text-emerald-800 border border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/50",
  },
  ARCHIVED: {
    label: "Archived",
    className:
      "bg-slate-100 text-slate-600 border border-slate-200/60 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700/60",
  },
};

type FilterKey = "ALL" | "DRAFT" | "ACTIVE" | "ARCHIVED";

function KbdShortcut({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-mono border-b-2 border-border"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

interface ConfirmState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

function ConfirmAlert({
  state,
  setState,
}: {
  state: ConfirmState;
  setState: (s: ConfirmState) => void;
}) {
  return (
    <AlertDialog
      open={state.open}
      onOpenChange={(open) => setState({ ...state, open })}
    >
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          <AlertDialogDescription>{state.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={
              state.destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
            onClick={() => {
              state.onConfirm();
              setState({ ...state, open: false });
            }}
          >
            {state.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ShortcutHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" /> Keyboard shortcuts
          </AlertDialogTitle>
          <AlertDialogDescription>
            Move through the Plan Designer without lifting your hands.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 text-sm">
          <Row label="New plan">
            <KbdShortcut keys={["N"]} />
          </Row>
          <Row label="Focus search">
            <KbdShortcut keys={["/"]} />
          </Row>
          <Row label="Open this help">
            <KbdShortcut keys={["?"]} />
          </Row>
          <Row label="Close dialog / blur search">
            <KbdShortcut keys={["Esc"]} />
          </Row>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)}>
            Got it
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function PlanDesignerListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data, isLoading } = useGetPlansQuery();
  const [activate] = useActivatePlanMutation();
  const [deactivate] = useDeactivatePlanMutation();
  const [deletePlan] = useDeletePlanMutation();

  const plans = useMemo<CompPlan[]>(() => data?.data ?? [], [data]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const chipsRef = useRef<HTMLDivElement | null>(null);

  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: "",
    description: "",
    confirmLabel: "Confirm",
    onConfirm: () => {},
  });

  const counts = useMemo(() => {
    const c = { ALL: plans.length, DRAFT: 0, ACTIVE: 0, ARCHIVED: 0 };
    for (const p of plans) c[p.status] += 1;
    return c;
  }, [plans]);

  const totalSlabs = useMemo(
    () => plans.reduce((sum, p) => sum + (p.slabs?.length ?? 0), 0),
    [plans],
  );
  const totalRules = useMemo(
    () =>
      plans.reduce(
        (sum, p) =>
          sum +
          (p.slabs?.length ?? 0) +
          (p.overrideLevels?.length ?? 0) +
          (p.designations?.length ?? 0) +
          (p.guarantees?.length ?? 0),
        0,
      ),
    [plans],
  );

  const activePlan = useMemo(
    () => plans.find((p) => p.status === "ACTIVE") ?? null,
    [plans],
  );

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((p) => {
      if (filter !== "ALL" && p.status !== filter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q)
      );
    });
  }, [plans, filter, search]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        if (helpOpen) {
          setHelpOpen(false);
          e.preventDefault();
          return;
        }
        if (isTyping && target && "blur" in target) {
          (target as HTMLElement).blur();
          e.preventDefault();
          return;
        }
      }

      if (isTyping) return;

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        router.push("/real-estate/admin/plan-designer/new");
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [helpOpen, router]);

  const onChipKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const chips = Array.from(
        chipsRef.current?.querySelectorAll<HTMLButtonElement>(
          "button[data-chip]",
        ) ?? [],
      );
      const idx = chips.findIndex((c) => c === document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      const next =
        e.key === "ArrowRight"
          ? (idx + 1) % chips.length
          : (idx - 1 + chips.length) % chips.length;
      chips[next]?.focus();
    },
    [],
  );

  const doActivate = useCallback(
    (plan: CompPlan) => {
      setConfirm({
        open: true,
        title: `Activate "${plan.name}"?`,
        description:
          "Activating this plan will archive any currently active plan. New deals will use the new rules.",
        confirmLabel: "Activate plan",
        onConfirm: async () => {
          try {
            await activate(plan.id).unwrap();
            toast({ title: "Plan activated" });
          } catch (err) {
            const e = err as { data?: { error?: string }; message?: string };
            toast({
              title: "Could not activate plan",
              description: e?.data?.error || e?.message,
              variant: "destructive",
            });
          }
        },
      });
    },
    [activate, toast],
  );

  const doDeactivate = useCallback(
    (plan: CompPlan) => {
      setConfirm({
        open: true,
        title: `Deactivate "${plan.name}"?`,
        description:
          "Deactivating this plan archives it. No plan will be active until you activate another one.",
        confirmLabel: "Deactivate",
        destructive: true,
        onConfirm: async () => {
          try {
            await deactivate(plan.id).unwrap();
            toast({ title: "Plan deactivated" });
          } catch (err) {
            const e = err as { data?: { error?: string }; message?: string };
            toast({
              title: "Could not deactivate plan",
              description: e?.data?.error || e?.message,
              variant: "destructive",
            });
          }
        },
      });
    },
    [deactivate, toast],
  );

  const doDelete = useCallback(
    (plan: CompPlan) => {
      setConfirm({
        open: true,
        title: `Delete "${plan.name}"?`,
        description:
          "This will permanently remove the draft plan and all of its configuration. This action cannot be undone.",
        confirmLabel: "Delete plan",
        destructive: true,
        onConfirm: async () => {
          try {
            await deletePlan(plan.id).unwrap();
            toast({ title: "Plan deleted" });
          } catch (err) {
            const e = err as { data?: { error?: string }; message?: string };
            toast({
              title: "Could not delete plan",
              description: e?.data?.error || e?.message,
              variant: "destructive",
            });
          }
        },
      });
    },
    [deletePlan, toast],
  );

  const showSkeletons = isLoading && plans.length === 0;
  const showEmpty = !isLoading && plans.length === 0;

  return (
    <TooltipProvider delayDuration={250}>
      <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-6xl">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-background ring-1 ring-border/40 shadow-sm">
          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative p-5 sm:p-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3 sm:gap-4 min-w-0">
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="shrink-0 mt-0.5"
              >
                <Link href="/real-estate" aria-label="Back to Real Estate">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div className="flex items-start gap-3 min-w-0">
                <div className="shrink-0 rounded-full bg-primary/10 text-primary p-2.5 sm:p-3 ring-1 ring-primary/20">
                  <Settings2 className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
                    Plan Designer
                    <Badge
                      variant="secondary"
                      className="text-[10px] hidden sm:inline-flex"
                    >
                      <Sparkles className="h-3 w-3 mr-1" /> v2
                    </Badge>
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                    Design and ship compensation plans — slabs, overrides,
                    designations, guarantees.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 lg:items-center lg:shrink-0">
              <div className="relative flex-1 sm:min-w-[240px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search plans…"
                  aria-label="Search plans"
                  className="pl-8 pr-14 h-10"
                />
                <kbd className="absolute right-2 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-mono border-b-2 border-border hidden sm:inline-block">
                  /
                </kbd>
              </div>
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setHelpOpen(true)}
                      aria-label="Open keyboard shortcuts"
                      className="h-10 w-10"
                    >
                      <Keyboard className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Shortcuts <KbdShortcut keys={["?"]} />
                  </TooltipContent>
                </Tooltip>
                <Button
                  onClick={() =>
                    router.push("/real-estate/admin/plan-designer/new")
                  }
                  className="h-10"
                >
                  <Plus className="h-4 w-4 mr-2" /> New Plan
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Active plan callout */}
        {activePlan && (
          <Card className="rounded-2xl border-emerald-200/60 bg-emerald-50/30 dark:bg-emerald-950/20 dark:border-emerald-900/60 shadow-sm">
            <CardContent className="p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div className="shrink-0 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 p-2.5 ring-1 ring-emerald-500/30">
                  <Zap className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      Active
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      v{activePlan.version}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {activePlan.overrideMode}
                    </Badge>
                  </div>
                  <div className="text-lg sm:text-xl font-semibold mt-1 truncate">
                    {activePlan.name}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" />
                      <span className="tabular-nums">
                        {activePlan.slabs.length}
                      </span>{" "}
                      slabs
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      <span className="tabular-nums">
                        {activePlan.designations.length}
                      </span>{" "}
                      designations
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Updated {timeAgo(activePlan.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 md:shrink-0">
                <Button asChild variant="outline" className="flex-1 md:flex-none">
                  <Link
                    href={`/real-estate/admin/plan-designer/${activePlan.id}`}
                  >
                    <Settings2 className="h-4 w-4 mr-2" /> Edit
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 md:flex-none"
                  onClick={() => doDeactivate(activePlan)}
                >
                  <PauseCircle className="h-4 w-4 mr-2" /> Deactivate
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            icon={<LayoutGrid className="h-4 w-4" />}
            label="Total Plans"
            value={counts.ALL}
            accent="text-primary bg-primary/10 ring-primary/20"
          />
          <KpiCard
            icon={<FileText className="h-4 w-4" />}
            label="Drafts"
            value={counts.DRAFT}
            accent="text-amber-700 dark:text-amber-300 bg-amber-500/10 ring-amber-500/20"
          />
          <KpiCard
            icon={<Activity className="h-4 w-4" />}
            label="Active"
            value={counts.ACTIVE}
            accent="text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 ring-emerald-500/20"
          />
          <KpiCard
            icon={<Award className="h-4 w-4" />}
            label="Total Slabs"
            value={totalSlabs}
            sub={`${totalRules} rules`}
            accent="text-violet-700 dark:text-violet-300 bg-violet-500/10 ring-violet-500/20"
          />
        </div>

        {/* Filter chips */}
        <div
          ref={chipsRef}
          onKeyDown={onChipKeyDown}
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Filter plans by status"
        >
          {(
            [
              { key: "ALL", label: "All", count: counts.ALL },
              { key: "DRAFT", label: "Drafts", count: counts.DRAFT },
              { key: "ACTIVE", label: "Active", count: counts.ACTIVE },
              { key: "ARCHIVED", label: "Archived", count: counts.ARCHIVED },
            ] as Array<{ key: FilterKey; label: string; count: number }>
          ).map((c) => {
            const active = filter === c.key;
            return (
              <button
                key={c.key}
                data-chip
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(c.key)}
                className={`group inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background hover:bg-muted text-foreground/80 border-border"
                }`}
              >
                {c.label}
                <span
                  className={`tabular-nums rounded-full px-1.5 text-[10px] ${
                    active
                      ? "bg-primary-foreground/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.count}
                </span>
              </button>
            );
          })}
          {search && (
            <button
              onClick={() => setSearch("")}
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" /> Clear "{search}"
            </button>
          )}
        </div>

        {/* Grid */}
        {showSkeletons ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : showEmpty ? (
          <Card className="rounded-2xl">
            <CardContent className="py-16 text-center">
              <div className="mx-auto rounded-full bg-primary/10 text-primary p-4 w-fit ring-1 ring-primary/20">
                <Layers className="h-10 w-10" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No plans yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Compensation plans define how slabs, overrides, designations,
                and guarantees pay out. Start by creating your first draft.
              </p>
              <Button
                size="lg"
                onClick={() =>
                  router.push("/real-estate/admin/plan-designer/new")
                }
                className="mt-5"
              >
                <Plus className="h-4 w-4 mr-2" /> Create your first plan
              </Button>
            </CardContent>
          </Card>
        ) : filteredPlans.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                No plans match your filters.
              </p>
              <Button
                variant="link"
                onClick={() => {
                  setSearch("");
                  setFilter("ALL");
                }}
              >
                Reset filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onActivate={() => doActivate(plan)}
                onDelete={() => doDelete(plan)}
              />
            ))}
          </div>
        )}

        <ConfirmAlert state={confirm} setState={setConfirm} />
        <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </TooltipProvider>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  accent: string;
}) {
  return (
    <Card
      tabIndex={0}
      className="rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all focus-visible:ring-2 focus-visible:ring-ring outline-none"
    >
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`rounded-lg p-2 ring-1 ${accent}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            {label}
          </div>
          <div className="text-2xl font-bold tabular-nums leading-tight mt-0.5">
            {value}
          </div>
          {sub && (
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {sub}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PlanCard({
  plan,
  onActivate,
  onDelete,
}: {
  plan: CompPlan;
  onActivate: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const badge = STATUS_BADGE[plan.status];
  const onCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't navigate when clicking interactive children
    const target = e.target as HTMLElement;
    if (target.closest("button, a, [role=menuitem], [data-no-nav]")) return;
    router.push(`/real-estate/admin/plan-designer/${plan.id}`);
  };

  return (
    <Card
      onClick={onCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          router.push(`/real-estate/admin/plan-designer/${plan.id}`);
        }
      }}
      tabIndex={0}
      className="group rounded-2xl shadow-sm hover:shadow-md hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer flex flex-col outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Open plan ${plan.name}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight line-clamp-2">
            {plan.name}
          </CardTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            {plan.status === "ACTIVE" && (
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            )}
            <Badge className={`text-[10px] ${badge.className}`}>
              {badge.label}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Badge variant="secondary" className="text-[10px]">
            v{plan.version}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {plan.areaUnit}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {plan.overrideMode}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        <div className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
          {plan.description?.trim() ? (
            plan.description
          ) : (
            <span className="italic opacity-60">No description.</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Stat
            icon={<Layers className="h-3.5 w-3.5" />}
            value={plan.slabs.length}
            label="slabs"
          />
          <Stat
            icon={<Users className="h-3.5 w-3.5" />}
            value={plan.designations.length}
            label="desig."
          />
          <Stat
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            value={plan.guarantees.length}
            label="guar."
          />
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-auto">
          <Clock className="h-3 w-3" /> Updated {timeAgo(plan.updatedAt)}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="flex-1"
            data-no-nav
          >
            <Link href={`/real-estate/admin/plan-designer/${plan.id}`}>
              <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Link>
          </Button>
          {plan.status === "DRAFT" ? (
            <Button
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onActivate();
              }}
            >
              <PlayCircle className="h-3.5 w-3.5 mr-1.5" /> Activate
            </Button>
          ) : (
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="flex-1"
              data-no-nav
            >
              <Link href={`/real-estate/admin/plan-designer/${plan.id}`}>
                <ChevronRight className="h-3.5 w-3.5 mr-1.5" /> View
              </Link>
            </Button>
          )}
          {plan.status === "DRAFT" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="More actions"
                  onClick={(e) => e.stopPropagation()}
                  className="h-9 w-9"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete draft
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2 py-1.5 flex flex-col items-center justify-center text-center">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="tabular-nums font-semibold text-foreground">
          {value}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

