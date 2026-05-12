"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCreatePlanMutation } from "@/lib/api/real-estate/plans";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  CircleDot,
  Eye,
  FileText,
  Info,
  Keyboard,
  Layers,
  Loader2,
  Plus,
  Rocket,
  Settings2,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";

interface FormState {
  name: string;
  description: string;
  areaUnit: "SQYD" | "SQFT" | "SQM";
  overrideMode: "DIFF_RATE" | "DIFF_FACTOR";
  companyResidualPercent: string;
  template: TemplateKey;
}

type TemplateKey = "EMPTY" | "SAMPLE" | "PRODUCTION";

const TEMPLATES: Record<
  TemplateKey,
  {
    title: string;
    blurb: string;
    icon: React.ReactNode;
    accent: string;
  }
> = {
  EMPTY: {
    title: "Empty plan",
    blurb: "Start from scratch — no slabs or overrides.",
    icon: <FileText className="h-4 w-4" />,
    accent: "border-border bg-background",
  },
  SAMPLE: {
    title: "Sample (5 slabs)",
    blurb: "Quick-start template for prototyping payouts.",
    icon: <Sparkles className="h-4 w-4" />,
    accent:
      "border-violet-200/60 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-900/50",
  },
  PRODUCTION: {
    title: "Production (14 slabs)",
    blurb: "Industry-standard ladder with full override levels.",
    icon: <Rocket className="h-4 w-4" />,
    accent:
      "border-emerald-200/60 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900/50",
  },
};

const EMPTY: FormState = {
  name: "",
  description: "",
  areaUnit: "SQYD",
  overrideMode: "DIFF_FACTOR",
  companyResidualPercent: "10",
  template: "EMPTY",
};

const AREA_UNIT_LABEL: Record<FormState["areaUnit"], string> = {
  SQYD: "Sq. Yard",
  SQFT: "Sq. Foot",
  SQM: "Sq. Metre",
};

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
            Move quickly while creating a new plan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 text-sm">
          <ShortcutRow label="Submit form">
            <KbdShortcut keys={["⌘", "↵"]} />
          </ShortcutRow>
          <ShortcutRow label="Open this help">
            <KbdShortcut keys={["?"]} />
          </ShortcutRow>
          <ShortcutRow label="Close dialog">
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
    <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default function NewPlanPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [create, { isLoading }] = useCreatePlanMutation();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [helpOpen, setHelpOpen] = useState(false);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
  }, []);

  const residualNum = Number(form.companyResidualPercent);
  const errors = useMemo(() => {
    const e: { name?: string; residual?: string } = {};
    if (!form.name.trim()) e.name = "Name is required.";
    if (
      form.companyResidualPercent === "" ||
      Number.isNaN(residualNum) ||
      residualNum < 0 ||
      residualNum > 100
    )
      e.residual = "Must be between 0 and 100.";
    return e;
  }, [form.name, form.companyResidualPercent, residualNum]);

  const canSubmit = Object.keys(errors).length === 0 && !isLoading;

  const onSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!canSubmit) {
        toast({
          title: "Please fix the highlighted fields",
          variant: "destructive",
        });
        return;
      }
      try {
        const res = await create({
          name: form.name.trim(),
          description: form.description.trim() || null,
          areaUnit: form.areaUnit,
          overrideMode: form.overrideMode,
          companyResidualPercent: residualNum,
        }).unwrap();
        toast({
          title: "Plan created",
          description:
            form.template !== "EMPTY"
              ? `Add slabs from the "${TEMPLATES[form.template].title}" template next.`
              : "Configure slabs, overrides, designations and guarantees next.",
        });
        router.push(`/real-estate/admin/plan-designer/${res.data.id}`);
      } catch (err) {
        const e2 = err as { data?: { error?: string }; message?: string };
        toast({
          title: "Could not create plan",
          description: e2?.data?.error || e2?.message,
          variant: "destructive",
        });
      }
    },
    [canSubmit, create, form, residualNum, router, toast],
  );

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
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void onSubmit();
        return;
      }
      if (!isTyping && e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [helpOpen, onSubmit]);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="container mx-auto p-4 sm:p-6 max-w-5xl space-y-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-background ring-1 ring-border/40 shadow-sm">
          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative p-5 sm:p-6 flex items-start gap-3 sm:gap-4">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="shrink-0 mt-0.5"
            >
              <Link
                href="/real-estate/admin/plan-designer"
                aria-label="Back to Plan Designer"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="shrink-0 rounded-full bg-primary/10 text-primary p-2.5 sm:p-3 ring-1 ring-primary/20">
              <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Create a new compensation plan
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Start as a draft, then add slabs, override levels, designations
                and guarantees. Drafts are safe — no payouts are computed until
                you activate.
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setHelpOpen(true)}
                  aria-label="Open keyboard shortcuts"
                  className="shrink-0 hidden sm:inline-flex"
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Shortcuts <KbdShortcut keys={["?"]} />
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <form onSubmit={onSubmit} className="grid gap-6 md:grid-cols-5">
          {/* Form column */}
          <div className="md:col-span-3 space-y-6">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CircleDot className="h-4 w-4 text-primary" />
                  Identity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field
                  label="Name"
                  required
                  hint="Shown to admins. Use a clear, dated name like 'Standard 2025'."
                  error={errors.name}
                >
                  <Input
                    autoFocus
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Standard 2025 Plan"
                    aria-invalid={!!errors.name}
                    className="h-10"
                  />
                </Field>

                <Field
                  label="Description"
                  hint="Optional. A short summary of what this plan changes."
                >
                  <Textarea
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={3}
                    placeholder="What is different about this plan?"
                  />
                </Field>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  Engine config
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Area unit"
                    hint="The unit used for slab boundaries."
                  >
                    <Select
                      value={form.areaUnit}
                      onValueChange={(v) =>
                        set("areaUnit", v as FormState["areaUnit"])
                      }
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SQYD">Sq. Yard (sq.yd)</SelectItem>
                        <SelectItem value="SQFT">Sq. Foot (sq.ft)</SelectItem>
                        <SelectItem value="SQM">Sq. Metre (sq.m)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field
                    label="Override mode"
                    hint="DIFF_FACTOR multiplies seller rate. DIFF_RATE subtracts from it."
                  >
                    <Select
                      value={form.overrideMode}
                      onValueChange={(v) =>
                        set("overrideMode", v as FormState["overrideMode"])
                      }
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DIFF_FACTOR">
                          Diff Factor (multiplier)
                        </SelectItem>
                        <SelectItem value="DIFF_RATE">
                          Diff Rate (subtraction)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field
                  label="Company residual %"
                  required
                  hint="Percentage retained by the company after all payouts."
                  error={errors.residual}
                >
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.companyResidualPercent}
                      onChange={(e) =>
                        set("companyResidualPercent", e.target.value)
                      }
                      aria-invalid={!!errors.residual}
                      className="h-10 pr-8 tabular-nums"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                </Field>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  Quick-start template
                  <Badge variant="secondary" className="text-[10px] ml-1">
                    Applied after creation
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Pick a starting point. After the plan is created you can pre-fill
                  slabs and overrides from this template on the editor page.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(TEMPLATES) as TemplateKey[]).map((key) => {
                    const t = TEMPLATES[key];
                    const active = form.template === key;
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => set("template", key)}
                        aria-pressed={active}
                        className={`text-left rounded-xl border p-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          active
                            ? "ring-2 ring-primary border-primary shadow-sm"
                            : `${t.accent} hover:shadow-sm`
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <span className="rounded-md bg-background border p-1">
                            {t.icon}
                          </span>
                          {t.title}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                          {t.blurb}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Separator />

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
              <Button type="button" variant="outline" asChild className="sm:w-auto">
                <Link href="/real-estate/admin/plan-designer">Cancel</Link>
              </Button>
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="hidden sm:inline text-[11px] text-muted-foreground">
                  Press <KbdShortcut keys={["⌘", "↵"]} /> to submit
                </span>
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="min-w-[140px]"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Create Plan
                </Button>
              </div>
            </div>
          </div>

          {/* Live preview */}
          <aside className="md:col-span-2">
            <div className="md:sticky md:top-6 space-y-4">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" /> Live preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                      Plan name
                    </div>
                    <div
                      className={`text-xl font-bold leading-tight mt-0.5 ${
                        form.name.trim() ? "" : "text-muted-foreground italic"
                      }`}
                    >
                      {form.name.trim() || "Untitled plan"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge className="bg-amber-100 text-amber-800 border border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50 text-[10px]">
                      DRAFT (after creation)
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {AREA_UNIT_LABEL[form.areaUnit]}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {form.overrideMode}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      <span className="tabular-nums">
                        {residualNum || 0}%
                      </span>{" "}
                      residual
                    </Badge>
                  </div>

                  {form.description.trim() && (
                    <div className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3">
                      {form.description.trim()}
                    </div>
                  )}

                  <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
                    <div className="flex items-center gap-2 font-medium">
                      <Layers className="h-3.5 w-3.5 text-primary" />
                      Initial template
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      {TEMPLATES[form.template].icon}
                      <span className="font-medium text-foreground">
                        {TEMPLATES[form.template].title}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {TEMPLATES[form.template].blurb}
                    </p>
                  </div>

                  <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                    <Zap className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                    After creating, you can add slabs, override levels,
                    designations, and guarantees on the editor page.
                  </p>
                </CardContent>
              </Card>
            </div>
          </aside>
        </form>

        <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </TooltipProvider>
  );
}

function Field({
  label,
  hint,
  children,
  required,
  error,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : (
        hint && <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
