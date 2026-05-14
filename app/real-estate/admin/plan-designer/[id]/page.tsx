"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useGetPlanQuery,
  useUpdatePlanMutation,
  useActivatePlanMutation,
  useDeletePlanMutation,
  type CompPlan,
  type CompPlanSlab,
  type CompPlanOverrideLevel,
  type CompPlanDesignation,
  type CompPlanGuarantee,
} from "@/lib/api/real-estate/plans";
import { SlabEditor } from "@/components/real-estate/plan-designer/slab-editor";
import {
  OverrideEditor,
  buildDefaultOverrideLevels,
} from "@/components/real-estate/plan-designer/override-editor";
import { DesignationEditor } from "@/components/real-estate/plan-designer/designation-editor";
import { GuaranteeEditor } from "@/components/real-estate/plan-designer/guarantee-editor";
import { PlanSimulator } from "@/components/real-estate/plan-designer/plan-simulator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
  DropdownMenuSeparator,
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
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCopy,
  Copy,
  Eye,
  FileText,
  Keyboard,
  Layers,
  Loader2,
  Minus,
  MoreHorizontal,
  PlayCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Users,
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

interface EditState {
  slabs: CompPlanSlab[];
  overrideLevels: CompPlanOverrideLevel[];
  designations: CompPlanDesignation[];
  guarantees: CompPlanGuarantee[];
}

type TabKey =
  | "slabs"
  | "overrides"
  | "designations"
  | "guarantees"
  | "simulate";

const TAB_ORDER: TabKey[] = [
  "slabs",
  "overrides",
  "designations",
  "guarantees",
  "simulate",
];

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
            Power-user shortcuts available on this editor page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 text-sm">
          <ShortcutRow label="Save draft">
            <KbdShortcut keys={["⌘", "S"]} />
          </ShortcutRow>
          <ShortcutRow label="Activate plan">
            <KbdShortcut keys={["⌘", "↵"]} />
          </ShortcutRow>
          <ShortcutRow label="Switch tabs">
            <KbdShortcut keys={["⌘", "1"]} />
            <span className="text-muted-foreground text-[11px] mx-1">…</span>
            <KbdShortcut keys={["⌘", "5"]} />
          </ShortcutRow>
          <ShortcutRow label="Open this help">
            <KbdShortcut keys={["?"]} />
          </ShortcutRow>
          <ShortcutRow label="Back to list">
            <KbdShortcut keys={["Esc"]} />
          </ShortcutRow>
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

function ShortcutRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 gap-2">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center">{children}</div>
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
  return `${Math.floor(h / 24)}d ago`;
}

export default function PlanEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { toast } = useToast();

  const { data, isLoading } = useGetPlanQuery(id);
  const [updatePlan, { isLoading: isSaving }] = useUpdatePlanMutation();
  const [activatePlan, { isLoading: isActivating }] = useActivatePlanMutation();
  const [deletePlan] = useDeletePlanMutation();

  const [state, setState] = useState<EditState | null>(null);
  const initialRef = useRef<string>("");
  const [tab, setTab] = useState<TabKey>("slabs");
  const [helpOpen, setHelpOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: "",
    description: "",
    confirmLabel: "Confirm",
    onConfirm: () => {},
  });

  useEffect(() => {
    if (data?.data) {
      const p = data.data;
      const next: EditState = {
        slabs: p.slabs,
        overrideLevels: p.overrideLevels,
        designations: p.designations,
        guarantees: p.guarantees,
      };
      setState(next);
      initialRef.current = JSON.stringify(next);
    }
  }, [data]);

  const plan = data?.data;

  const isDirty = useMemo(() => {
    if (!state) return false;
    return JSON.stringify(state) !== initialRef.current;
  }, [state]);

  const onSave = useCallback(async () => {
    if (!state || !plan) return;
    try {
      await updatePlan({
        id,
        slabs: state.slabs,
        overrideLevels: state.overrideLevels,
        designations: state.designations,
        guarantees: state.guarantees,
      }).unwrap();
      initialRef.current = JSON.stringify(state);
      // Bump dirty re-eval
      setState((s) => (s ? { ...s } : s));
      toast({ title: "Draft saved" });
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      toast({
        title: "Could not save",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  }, [id, plan, state, toast, updatePlan]);

  const doActivate = useCallback(async () => {
    if (!plan) return;
    try {
      await activatePlan(id).unwrap();
      toast({ title: "Plan activated" });
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      toast({
        title: "Could not activate",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  }, [activatePlan, id, plan, toast]);

  const doDelete = useCallback(async () => {
    if (!plan) return;
    try {
      await deletePlan(id).unwrap();
      toast({ title: "Plan deleted" });
      router.push("/real-estate/admin/plan-designer");
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      toast({
        title: "Could not delete",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  }, [deletePlan, id, plan, router, toast]);

  const onExportJSON = useCallback(async () => {
    if (!plan || !state) return;
    const payload = {
      ...plan,
      slabs: state.slabs,
      overrideLevels: state.overrideLevels,
      designations: state.designations,
      guarantees: state.guarantees,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast({ title: "Plan JSON copied to clipboard" });
    } catch {
      toast({
        title: "Could not copy",
        description: "Clipboard access denied — check your browser settings.",
        variant: "destructive",
      });
    }
  }, [plan, state, toast]);

  const onDuplicate = useCallback(() => {
    toast({
      title: "Duplicate plan",
      description:
        "Duplication will be wired up shortly — for now you can export JSON and create a new plan.",
    });
  }, [toast]);

  const onResetOverrides = useCallback(() => {
    setConfirm({
      open: true,
      title: "Reset override levels?",
      description:
        "This will replace all 10 override levels with the default factors. Unsaved changes will remain unsaved until you press Save.",
      confirmLabel: "Reset to defaults",
      onConfirm: () => {
        setState((s) =>
          s ? { ...s, overrideLevels: buildDefaultOverrideLevels() } : s,
        );
      },
    });
  }, []);

  // beforeunload warn on dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const meta = e.metaKey || e.ctrlKey;

      if (e.key === "Escape" && !isTyping) {
        if (helpOpen) {
          setHelpOpen(false);
          e.preventDefault();
          return;
        }
        if (!activateOpen && !deleteOpen && !confirm.open && !isDirty) {
          router.push("/real-estate/admin/plan-designer");
          e.preventDefault();
        }
        return;
      }

      if (meta && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (isDirty) void onSave();
        return;
      }
      if (meta && e.key === "Enter") {
        e.preventDefault();
        if (plan?.status === "DRAFT" && (state?.slabs.length ?? 0) > 0) {
          setActivateOpen(true);
        }
        return;
      }
      if (meta && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        setTab(TAB_ORDER[idx]);
        return;
      }

      if (!isTyping && e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    activateOpen,
    confirm.open,
    deleteOpen,
    helpOpen,
    isDirty,
    onSave,
    plan?.status,
    router,
    state?.slabs.length,
  ]);

  const designationCodes = useMemo(
    () =>
      (state?.designations ?? [])
        .map((d) => d.designationCode)
        .filter(Boolean),
    [state?.designations],
  );

  // Sidebar / completion summary
  const sectionStatus = useMemo(() => {
    const slabsOk = (state?.slabs.length ?? 0) > 0;
    const overridesOk = (state?.overrideLevels.length ?? 0) === 10;
    const desigOk = (state?.designations.length ?? 0) > 0;
    const guarOk = (state?.guarantees.length ?? 0) > 0;
    return { slabsOk, overridesOk, desigOk, guarOk };
  }, [state]);

  const completion = useMemo(() => {
    // required: slabs + overrides; bonus: designations + guarantees
    let pct = 0;
    if (sectionStatus.slabsOk) pct += 50;
    if (sectionStatus.overridesOk) pct += 30;
    if (sectionStatus.desigOk) pct += 10;
    if (sectionStatus.guarOk) pct += 10;
    return pct;
  }, [sectionStatus]);

  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (!state) return errs;
    if (state.slabs.length === 0)
      errs.push("Add at least one slab to define seller payouts.");
    if (state.overrideLevels.length !== 10)
      errs.push("Override levels must include all 10 levels.");
    // Check slab overlap (basic)
    const sorted = [...state.slabs].sort((a, b) => a.minArea - b.minArea);
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur.maxArea !== null && cur.maxArea > next.minArea) {
        errs.push(`Slabs overlap between rows ${i + 1} and ${i + 2}.`);
        break;
      }
    }
    return errs;
  }, [state]);

  const saveStatus: "saved" | "dirty" | "saving" = isSaving
    ? "saving"
    : isDirty
      ? "dirty"
      : "saved";

  if (isLoading || !state) {
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-7xl space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-9 space-y-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
          <div className="lg:col-span-3 space-y-3">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center space-y-4">
            <div className="mx-auto rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 p-4 w-fit ring-1 ring-amber-500/20">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Plan not found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This plan may have been deleted or you may not have access.
              </p>
            </div>
            <Button asChild>
              <Link href="/real-estate/admin/plan-designer">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Plan Designer
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const badge = STATUS_BADGE[plan.status];

  return (
    <TooltipProvider delayDuration={250}>
      <div className="min-h-screen flex flex-col">
        {/* Breadcrumb */}
        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b">
          <div className="container mx-auto px-4 sm:px-6 max-w-7xl py-2 text-xs text-muted-foreground flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
            <Link href="/real-estate" className="hover:text-foreground">
              Real Estate
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <Link href="/real-estate" className="hover:text-foreground">
              Admin
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <Link
              href="/real-estate/admin/plan-designer"
              className="hover:text-foreground"
            >
              Plan Designer
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <span className="text-foreground font-medium truncate">
              {plan.name}
            </span>
          </div>
        </div>

        {/* Sticky header */}
        <div className="sticky top-9 z-30 bg-background/80 backdrop-blur-md border-b">
          <div className="container mx-auto px-4 sm:px-6 max-w-7xl py-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-2 sm:gap-3 min-w-0">
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="shrink-0 mt-0.5"
              >
                <Link
                  href="/real-estate/admin/plan-designer"
                  aria-label="Back to list"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate max-w-[16rem] sm:max-w-md">
                    {plan.name}
                  </h1>
                  <div className="flex items-center gap-1.5">
                    {plan.status === "ACTIVE" && (
                      <span
                        className="relative flex h-2 w-2"
                        aria-hidden
                      >
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                    )}
                    <Badge className={`text-[10px] ${badge.className}`}>
                      {badge.label}
                    </Badge>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    v{plan.version}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <span>{plan.areaUnit}</span>
                  <span>·</span>
                  <span>{plan.overrideMode}</span>
                  <span>·</span>
                  <span>Updated {timeAgo(plan.updatedAt)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <SaveIndicator status={saveStatus} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={onSave}
                    disabled={!isDirty || isSaving}
                    aria-label="Save draft"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Draft
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Save changes <KbdShortcut keys={["⌘", "S"]} />
                </TooltipContent>
              </Tooltip>

              {plan.status === "DRAFT" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        onClick={() => setActivateOpen(true)}
                        disabled={isActivating || state.slabs.length === 0}
                        aria-label="Activate plan"
                      >
                        {isActivating ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <PlayCircle className="h-4 w-4 mr-2" />
                        )}
                        Activate
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {state.slabs.length === 0
                      ? "Add at least one slab to activate"
                      : "Activate plan"}{" "}
                    <KbdShortcut keys={["⌘", "↵"]} />
                  </TooltipContent>
                </Tooltip>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem asChild>
                    <Link href={`/real-estate/admin/plan-designer/${id}/preview`}>
                      <Eye className="h-3.5 w-3.5 mr-2" /> Preview & Print
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDuplicate}>
                    <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate plan
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onExportJSON}>
                    <ClipboardCopy className="h-3.5 w-3.5 mr-2" /> Export JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setHelpOpen(true)}>
                    <Keyboard className="h-3.5 w-3.5 mr-2" /> Shortcuts
                  </DropdownMenuItem>
                  {plan.status === "DRAFT" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete draft
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="container mx-auto p-4 sm:p-6 max-w-7xl flex-1">
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Tabs col */}
            <div className="lg:col-span-9 space-y-4">
              <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as TabKey)}
                className="space-y-4"
              >
                <div className="overflow-x-auto -mx-1 px-1">
                  <TabsList className="h-auto flex w-full sm:w-auto gap-1 p-1">
                    <TabTrigger
                      value="slabs"
                      icon={<Layers className="h-3.5 w-3.5" />}
                      label="Slabs"
                      status={sectionStatus.slabsOk ? "ok" : "warn"}
                    />
                    <TabTrigger
                      value="overrides"
                      icon={<Activity className="h-3.5 w-3.5" />}
                      label="Overrides"
                      status={sectionStatus.overridesOk ? "ok" : "warn"}
                    />
                    <TabTrigger
                      value="designations"
                      icon={<Users className="h-3.5 w-3.5" />}
                      label="Designations"
                      status={sectionStatus.desigOk ? "ok" : "dash"}
                    />
                    <TabTrigger
                      value="guarantees"
                      icon={<ShieldCheck className="h-3.5 w-3.5" />}
                      label="Guarantees"
                      status={sectionStatus.guarOk ? "ok" : "dash"}
                    />
                    <TabTrigger
                      value="simulate"
                      icon={<Calculator className="h-3.5 w-3.5" />}
                      label="Simulate"
                      status="neutral"
                    />
                  </TabsList>
                </div>

                <TabsContent value="slabs" className="mt-0 space-y-3">
                  <SectionCard
                    icon={<Layers className="h-4 w-4 text-primary" />}
                    title="Slabs (Plan 1 + 2)"
                    description="Define seller payout rates by cumulative area sold."
                    tooltip="Slabs are area thresholds — when the seller's cumulative area crosses a slab, their per-unit rate changes."
                  >
                    <SlabEditor
                      slabs={state.slabs}
                      onChange={(slabs) =>
                        setState((s) => (s ? { ...s, slabs } : s))
                      }
                    />
                  </SectionCard>
                </TabsContent>

                <TabsContent value="overrides" className="mt-0 space-y-3">
                  <SectionCard
                    icon={<Activity className="h-4 w-4 text-primary" />}
                    title="Override Levels (Plan 3)"
                    description="How each upline level earns from a deal."
                    tooltip="Override levels distribute commission upward through the recruiter tree. Mode controls whether factor multiplies or subtracts from seller rate."
                    actions={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onResetOverrides}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to
                        defaults
                      </Button>
                    }
                  >
                    <OverrideEditor
                      levels={state.overrideLevels}
                      overrideMode={plan.overrideMode}
                      onChange={(overrideLevels) =>
                        setState((s) =>
                          s ? { ...s, overrideLevels } : s,
                        )
                      }
                    />
                  </SectionCard>
                </TabsContent>

                <TabsContent value="designations" className="mt-0 space-y-3">
                  <SectionCard
                    icon={<Users className="h-4 w-4 text-primary" />}
                    title="Designations (Plan 4)"
                    description="Tier titles awarded as sellers cross cumulative milestones."
                    tooltip="Designations are recognition tiers. They can include rewards (cash, travel, surprise) and are referenced by guarantees."
                  >
                    <DesignationEditor
                      designations={state.designations}
                      onChange={(designations) =>
                        setState((s) =>
                          s ? { ...s, designations } : s,
                        )
                      }
                    />
                  </SectionCard>
                </TabsContent>

                <TabsContent value="guarantees" className="mt-0 space-y-3">
                  <SectionCard
                    icon={<ShieldCheck className="h-4 w-4 text-primary" />}
                    title="Guarantees (Plan 5)"
                    description="Minimum monthly payouts tied to a designation."
                    tooltip="Guarantees ensure sellers at a designation receive at least this monthly amount when their actual earnings fall below."
                  >
                    <GuaranteeEditor
                      guarantees={state.guarantees}
                      designationCodes={designationCodes}
                      onChange={(guarantees) =>
                        setState((s) =>
                          s ? { ...s, guarantees } : s,
                        )
                      }
                    />
                  </SectionCard>
                </TabsContent>

                <TabsContent value="simulate" className="mt-0 space-y-3">
                  <SectionCard
                    icon={<Calculator className="h-4 w-4 text-primary" />}
                    title="Preview & Simulate"
                    description="Run a deal through the engine to verify payouts before activating."
                    tooltip="Simulation uses the current draft values — not the saved plan. Save first if you want consistent results across sessions."
                  >
                    <PlanSimulator
                      planId={id}
                      slabs={state.slabs}
                      overrideLevels={state.overrideLevels}
                    />
                  </SectionCard>
                </TabsContent>
              </Tabs>
            </div>

            {/* Sidebar */}
            <aside className="lg:col-span-3 space-y-4">
              <div className="lg:sticky lg:top-32 space-y-4">
                {/* Configuration summary */}
                <Card className="rounded-2xl shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <SummaryRow
                      icon={<Layers className="h-3.5 w-3.5" />}
                      label="Slabs"
                      count={state.slabs.length}
                      status={sectionStatus.slabsOk ? "ok" : "warn"}
                      onClick={() => setTab("slabs")}
                      active={tab === "slabs"}
                    />
                    <SummaryRow
                      icon={<Activity className="h-3.5 w-3.5" />}
                      label="Overrides"
                      count={state.overrideLevels.length}
                      status={sectionStatus.overridesOk ? "ok" : "warn"}
                      onClick={() => setTab("overrides")}
                      active={tab === "overrides"}
                    />
                    <SummaryRow
                      icon={<Users className="h-3.5 w-3.5" />}
                      label="Designations"
                      count={state.designations.length}
                      status={sectionStatus.desigOk ? "ok" : "dash"}
                      onClick={() => setTab("designations")}
                      active={tab === "designations"}
                    />
                    <SummaryRow
                      icon={<ShieldCheck className="h-3.5 w-3.5" />}
                      label="Guarantees"
                      count={state.guarantees.length}
                      status={sectionStatus.guarOk ? "ok" : "dash"}
                      onClick={() => setTab("guarantees")}
                      active={tab === "guarantees"}
                    />
                  </CardContent>
                </Card>

                {/* Plan health */}
                <Card className="rounded-2xl shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      Plan health
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">
                          Completion
                        </span>
                        <span className="font-semibold tabular-nums">
                          {completion}%
                        </span>
                      </div>
                      <Progress value={completion} className="h-2" />
                    </div>

                    {validationErrors.length > 0 ? (
                      <div className="space-y-1.5">
                        {validationErrors.map((err, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1.5"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>{err}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span>No validation issues detected.</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Shortcuts */}
                <Card className="rounded-2xl shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Keyboard className="h-4 w-4 text-primary" />
                      Shortcuts
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-[11px]">
                    <CheatRow label="Save">
                      <KbdShortcut keys={["⌘", "S"]} />
                    </CheatRow>
                    <CheatRow label="Activate">
                      <KbdShortcut keys={["⌘", "↵"]} />
                    </CheatRow>
                    <CheatRow label="Switch tabs">
                      <KbdShortcut keys={["⌘", "1-5"]} />
                    </CheatRow>
                    <CheatRow label="Help">
                      <KbdShortcut keys={["?"]} />
                    </CheatRow>
                    <CheatRow label="Back">
                      <KbdShortcut keys={["Esc"]} />
                    </CheatRow>
                    <Separator className="my-2" />
                    <button
                      onClick={() => setHelpOpen(true)}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      View all
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </CardContent>
                </Card>
              </div>
            </aside>
          </div>
        </div>

        {/* Activate confirm */}
        <AlertDialog open={activateOpen} onOpenChange={setActivateOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5 text-emerald-600" />
                Activate "{plan.name}"?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Activating this plan will archive any currently active plan. All
                new deals will use these rules immediately.
                {isDirty && (
                  <span className="block mt-2 text-amber-700 dark:text-amber-300">
                    You have unsaved changes — please save before activating to
                    avoid losing them.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setActivateOpen(false);
                  void doActivate();
                }}
                disabled={isDirty}
              >
                Activate plan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete confirm */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{plan.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the draft plan and all of its
                configuration. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setDeleteOpen(false);
                  void doDelete();
                }}
              >
                Delete plan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ConfirmAlert state={confirm} setState={setConfirm} />
        <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </TooltipProvider>
  );
}

function SaveIndicator({
  status,
}: {
  status: "saved" | "dirty" | "saving";
}) {
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-700 dark:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-full px-2.5 py-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (status === "dirty") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1">
        <Circle className="h-2 w-2 fill-amber-500 stroke-none" />
        Unsaved changes
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
      <CheckCircle2 className="h-3 w-3" /> All saved
    </span>
  );
}

function TabTrigger({
  value,
  icon,
  label,
  status,
}: {
  value: TabKey;
  icon: React.ReactNode;
  label: string;
  status: "ok" | "warn" | "dash" | "neutral";
}) {
  return (
    <TabsTrigger
      value={value}
      className="data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-xs sm:text-sm h-9 px-3"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label.slice(0, 4)}</span>
      <StatusDot status={status} />
    </TabsTrigger>
  );
}

function StatusDot({
  status,
}: {
  status: "ok" | "warn" | "dash" | "neutral";
}) {
  if (status === "ok")
    return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
  if (status === "warn")
    return <Circle className="h-2 w-2 fill-amber-500 stroke-none" />;
  if (status === "dash") return <Minus className="h-3 w-3 text-muted-foreground" />;
  return null;
}

function SectionCard({
  icon,
  title,
  description,
  tooltip,
  actions,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tooltip: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {icon}
              {title}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="What is this?"
                  >
                    <Circle className="h-3 w-3 fill-muted stroke-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function SummaryRow({
  icon,
  label,
  count,
  status,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  status: "ok" | "warn" | "dash";
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
        active
          ? "bg-primary/10 text-foreground"
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="tabular-nums font-medium text-foreground">{count}</span>
        <StatusDot status={status} />
      </span>
    </button>
  );
}

function CheatRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      {children}
    </div>
  );
}
