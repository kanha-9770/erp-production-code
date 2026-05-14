"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { CompPlanGuarantee } from "@/lib/api/real-estate/plans";
import {
  AlertTriangle,
  Banknote,
  Calendar,
  Loader2,
  Pencil,
  Plus,
  Shield,
  Trash2,
  Wallet,
} from "lucide-react";

type Guarantee = CompPlanGuarantee;

interface Props {
  guarantees: Guarantee[];
  designationCodes: string[];
  onChange: (g: Guarantee[]) => void;
  /** Optional: plan ID used to trigger monthly payouts from the editor */
  planId?: string;
}

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"];

const CURRENCY_LABELS: Record<string, string> = {
  INR: "₹ INR",
  USD: "$ USD",
  EUR: "€ EUR",
  GBP: "£ GBP",
  AED: "د.إ AED",
};

function symbolFor(currency: string): string {
  switch (currency) {
    case "USD": return "$";
    case "EUR": return "€";
    case "GBP": return "£";
    case "AED": return "د.إ ";
    default:    return "₹";
  }
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

function parseAmount(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ─── Edit-popover with locally-buffered draft state ──────────────────────────
// Keeps edits local until "Save" is pressed so the parent doesn't re-render
// on every keystroke — which was causing the "unresponsive" bug.

interface EditPopoverProps {
  guarantee: Guarantee;
  index: number;
  designationCodes: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (idx: number, updated: Guarantee) => void;
}

function EditPopover({
  guarantee,
  index,
  designationCodes,
  open,
  onOpenChange,
  onSave,
}: EditPopoverProps) {
  const { toast } = useToast();
  const [code, setCode]       = useState(guarantee.designationCode);
  const [amount, setAmount]   = useState(String(guarantee.monthlyAmount ?? ""));
  const [currency, setCurrency] = useState(guarantee.currency || "INR");

  // Re-sync draft when the popover opens or the upstream guarantee changes.
  useEffect(() => {
    if (open) {
      setCode(guarantee.designationCode);
      setAmount(String(guarantee.monthlyAmount ?? ""));
      setCurrency(guarantee.currency || "INR");
    }
  }, [open, guarantee]);

  const handleSave = () => {
    if (!code) {
      toast({ title: "Pick a designation", variant: "destructive" });
      return;
    }
    const n = parseAmount(amount);
    if (n === null || n <= 0) {
      toast({ title: "Enter a positive amount", variant: "destructive" });
      return;
    }
    onSave(index, { ...guarantee, designationCode: code, monthlyAmount: n, currency });
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Edit guarantee"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3 p-4" align="end">
        <div className="text-sm font-semibold">Edit guarantee</div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Designation</Label>
          <Select value={code} onValueChange={setCode}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {designationCodes.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
              {!designationCodes.includes(guarantee.designationCode) &&
                guarantee.designationCode && (
                  <SelectItem value={guarantee.designationCode}>
                    {guarantee.designationCode} (orphan)
                  </SelectItem>
                )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Monthly amount</Label>
          <div className="flex gap-2">
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="e.g. 35000"
              className="h-9 tabular-nums flex-1"
              autoFocus
            />
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-9 w-28 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-lg"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            className="rounded-lg"
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Run-payouts panel ────────────────────────────────────────────────────────

function RunPayoutsPanel({ planId }: { planId: string }) {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear]   = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [running, setRunning] = useState(false);

  const run = async () => {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || y < 2020 || y > 2100) {
      toast({ title: "Enter a valid year (2020–2100)", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      toast({ title: "Enter a valid month (1–12)", variant: "destructive" });
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/real-estate/guarantee/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ year: y, month: m }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");
      toast({
        title: "Payouts processed",
        description: `${json.data?.processed ?? 0} processed · ${json.data?.skipped ?? 0} skipped (already paid).`,
      });
    } catch (err: any) {
      toast({ title: "Run failed", description: err?.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const MONTHS = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec",
  ];

  return (
    <Card className="rounded-2xl border-dashed border-sky-500/40 bg-sky-500/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Calendar className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          Run monthly payouts
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Processes the guarantee floor for every eligible agent for a given
          month. Skips agents already paid. Idempotent — safe to re-run.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Year</Label>
            <Input
              type="number"
              min="2020"
              max="2100"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="h-8 w-24 tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {m} ({i + 1})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={run}
            disabled={running}
            className="h-8 border-sky-500/40 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300"
          >
            {running ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Running…</>
            ) : (
              <><Calendar className="h-3.5 w-3.5 mr-1.5" /> Run</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main editor ─────────────────────────────────────────────────────────────

export function GuaranteeEditor({ guarantees, designationCodes, onChange, planId }: Props) {
  const { toast } = useToast();

  // Add dialog state
  const [addOpen, setAddOpen]           = useState(false);
  const [draftCode, setDraftCode]       = useState<string>("");
  const [draftAmount, setDraftAmount]   = useState<string>("");
  const [draftCurrency, setDraftCurrency] = useState<string>("INR");

  // Which card's edit popover is open
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // Delete confirm
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

  const usedCodes = useMemo(
    () => new Set(guarantees.map((g) => g.designationCode)),
    [guarantees],
  );

  const availableCodes = useMemo(
    () => designationCodes.filter((c) => !usedCodes.has(c)),
    [designationCodes, usedCodes],
  );

  const totalLiability = useMemo(
    () => guarantees.reduce((acc, g) => acc + (g.monthlyAmount || 0), 0),
    [guarantees],
  );

  const summaryCurrency = guarantees[0]?.currency ?? "INR";

  const orphaned = useMemo(
    () => guarantees.filter(
      (g) => g.designationCode && !designationCodes.includes(g.designationCode),
    ),
    [guarantees, designationCodes],
  );

  const noDesignations = designationCodes.length === 0;

  const openAdd = useCallback(() => {
    setDraftCode(availableCodes[0] ?? "");
    setDraftAmount("");
    setDraftCurrency("INR");
    setAddOpen(true);
  }, [availableCodes]);

  const handleAdd = useCallback(() => {
    if (!draftCode) {
      toast({ title: "Pick a designation", variant: "destructive" });
      return;
    }
    const amount = parseAmount(draftAmount);
    if (amount === null || amount <= 0) {
      toast({ title: "Enter a positive amount", variant: "destructive" });
      return;
    }
    onChange([
      ...guarantees,
      { designationCode: draftCode, monthlyAmount: amount, currency: draftCurrency || "INR" } as Guarantee,
    ]);
    setAddOpen(false);
    toast({
      title: "Guarantee added",
      description: `${draftCode}: ${symbolFor(draftCurrency)}${fmt(amount)}/mo`,
    });
  }, [draftAmount, draftCode, draftCurrency, guarantees, onChange, toast]);

  const handleEditSave = useCallback(
    (idx: number, updated: Guarantee) => {
      onChange(guarantees.map((g, i) => (i === idx ? updated : g)));
      toast({
        title: "Guarantee updated",
        description: `${updated.designationCode}: ${symbolFor(updated.currency)}${fmt(updated.monthlyAmount)}/mo`,
      });
    },
    [guarantees, onChange, toast],
  );

  const remove = useCallback(
    (idx: number) => {
      onChange(guarantees.filter((_, i) => i !== idx));
      toast({ title: "Guarantee removed" });
    },
    [guarantees, onChange, toast],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">

        {/* ── Summary banner ─────────────────────────────────────────── */}
        <Card className="rounded-2xl border-muted/60 bg-gradient-to-br from-emerald-500/5 via-transparent to-sky-500/5 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <Shield className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Monthly liability if all qualify
                </div>
                <div className="text-2xl font-bold tabular-nums">
                  {symbolFor(summaryCurrency)}{fmt(totalLiability)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">/ mo</span>
                </div>
              </div>

              <Separator orientation="vertical" className="hidden h-10 sm:block" />

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[11px] text-muted-foreground">Active</div>
                  <div className="text-sm font-semibold tabular-nums">{guarantees.length}</div>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={-1}>
                      <Button
                        type="button"
                        onClick={openAdd}
                        disabled={noDesignations || availableCodes.length === 0}
                        className="rounded-xl"
                        aria-label="Add guarantee"
                      >
                        <Plus className="mr-1.5 h-4 w-4" /> Add guarantee
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {noDesignations ? (
                    <TooltipContent>Create designations (Plan 4) first.</TooltipContent>
                  ) : availableCodes.length === 0 ? (
                    <TooltipContent>Every designation already has a guarantee.</TooltipContent>
                  ) : null}
                </Tooltip>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Orphan warning ─────────────────────────────────────────── */}
        {orphaned.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {orphaned.length} guarantee{orphaned.length === 1 ? "" : "s"} reference
              designation code{orphaned.length === 1 ? "" : "s"} that no longer exist:{" "}
              <strong>{orphaned.map((g) => g.designationCode).join(", ")}</strong>.
            </span>
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────────────── */}
        {guarantees.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-sky-500/15">
                <Wallet className="h-7 w-7 text-emerald-600" />
              </div>
              <div>
                <div className="text-base font-semibold">No guarantees yet</div>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Set a monthly minimum income for high-ranking designations. This is
                  the floor — anything earned above it is paid as normal.
                </p>
              </div>
              <Button
                type="button"
                onClick={openAdd}
                disabled={noDesignations}
                className="rounded-xl"
              >
                <Plus className="mr-1 h-4 w-4" /> Add your first guarantee
              </Button>
              {noDesignations && (
                <span className="text-[11px] text-muted-foreground">
                  Tip: create designations (Plan 4) first.
                </span>
              )}
            </CardContent>
          </Card>
        ) : (
          /* ── Guarantee cards ─────────────────────────────────────── */
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {guarantees.map((g, idx) => {
              const isOrphan = g.designationCode && !designationCodes.includes(g.designationCode);
              const sym = symbolFor(g.currency || "INR");
              return (
                <Card
                  key={idx}
                  className={`group relative overflow-hidden rounded-2xl border-muted/60 shadow-sm transition-all hover:shadow-md hover:ring-2 hover:ring-emerald-500/30 ${
                    isOrphan ? "border-destructive/40" : ""
                  }`}
                >
                  <div className="pointer-events-none absolute -right-4 -top-4 opacity-10">
                    <Banknote className="h-24 w-24 text-emerald-500" />
                  </div>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant="secondary"
                        className="rounded-full font-mono tracking-wider"
                      >
                        {g.designationCode || "—"}
                      </Badge>
                      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {/* Edit popover — locally buffered, NOT live-propagated */}
                        <EditPopover
                          guarantee={g}
                          index={idx}
                          designationCodes={designationCodes}
                          open={editingIdx === idx}
                          onOpenChange={(open) => setEditingIdx(open ? idx : null)}
                          onSave={handleEditSave}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setConfirmDeleteIdx(idx)}
                          aria-label="Delete guarantee"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Monthly guarantee
                      </div>
                      <div className="text-3xl font-bold tabular-nums">
                        {sym}{fmt(g.monthlyAmount || 0)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {g.currency || "INR"} · per month
                      </div>
                    </div>

                    {isOrphan && (
                      <div className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Orphaned code
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Run payouts panel ──────────────────────────────────────── */}
        {planId && guarantees.length > 0 && (
          <RunPayoutsPanel planId={planId} />
        )}

        {/* ── Add dialog ─────────────────────────────────────────────── */}
        <AlertDialog open={addOpen} onOpenChange={setAddOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Add guarantee</AlertDialogTitle>
              <AlertDialogDescription>
                Choose a designation and set the monthly floor amount.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Designation</Label>
                <Select value={draftCode} onValueChange={setDraftCode}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pick a designation" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCodes.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-[1fr_130px] gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Monthly amount</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={draftAmount}
                    onChange={(e) => setDraftAmount(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    placeholder="e.g. 35000"
                    className="h-9 tabular-nums"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Currency</Label>
                  <Select value={draftCurrency} onValueChange={setDraftCurrency}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{CURRENCY_LABELS[c] ?? c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleAdd}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Delete confirm ─────────────────────────────────────────── */}
        <AlertDialog
          open={confirmDeleteIdx != null}
          onOpenChange={(open) => !open && setConfirmDeleteIdx(null)}
        >
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Remove guarantee?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the monthly floor for{" "}
                {confirmDeleteIdx != null && guarantees[confirmDeleteIdx]?.designationCode}.
                You can re-add it any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (confirmDeleteIdx != null) remove(confirmDeleteIdx);
                  setConfirmDeleteIdx(null);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </TooltipProvider>
  );
}
