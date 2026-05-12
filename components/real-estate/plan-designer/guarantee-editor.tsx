"use client";

import { useCallback, useMemo, useState } from "react";
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
}

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"];

function symbolFor(currency: string): string {
  switch (currency) {
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "AED":
      return "د.إ ";
    case "INR":
    default:
      return "₹";
  }
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

export function GuaranteeEditor({
  guarantees,
  designationCodes,
  onChange,
}: Props) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  const [draftCode, setDraftCode] = useState<string>("");
  const [draftAmount, setDraftAmount] = useState<string>("");
  const [draftCurrency, setDraftCurrency] = useState<string>("INR");

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
    () =>
      guarantees.filter(
        (g) => g.designationCode && !designationCodes.includes(g.designationCode),
      ),
    [guarantees, designationCodes],
  );

  const resetDraft = useCallback(() => {
    setDraftCode("");
    setDraftAmount("");
    setDraftCurrency("INR");
  }, []);

  const openAdd = useCallback(() => {
    resetDraft();
    setDraftCode(availableCodes[0] ?? "");
    setAddOpen(true);
  }, [availableCodes, resetDraft]);

  const handleAdd = useCallback(() => {
    const amount = Number(draftAmount);
    if (!draftCode) {
      toast({ title: "Pick a designation", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Enter a positive amount", variant: "destructive" });
      return;
    }
    onChange([
      ...guarantees,
      {
        designationCode: draftCode,
        monthlyAmount: amount,
        currency: draftCurrency || "INR",
      } as Guarantee,
    ]);
    setAddOpen(false);
    resetDraft();
    toast({
      title: "Guarantee added",
      description: `${draftCode}: ${symbolFor(draftCurrency)}${fmt(amount)}/mo`,
    });
  }, [draftAmount, draftCode, draftCurrency, guarantees, onChange, resetDraft, toast]);

  const handleEditSave = useCallback(
    (idx: number, patch: Partial<Guarantee>) => {
      onChange(guarantees.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
    },
    [guarantees, onChange],
  );

  const remove = useCallback(
    (idx: number) => {
      onChange(guarantees.filter((_, i) => i !== idx));
      toast({ title: "Guarantee removed" });
    },
    [guarantees, onChange, toast],
  );

  const noDesignations = designationCodes.length === 0;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* Summary banner */}
        <Card className="rounded-2xl border-muted/60 bg-gradient-to-br from-emerald-500/5 via-transparent to-sky-500/5 shadow-sm">
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <Shield className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Monthly liability if all qualify
              </div>
              <div className="text-2xl font-bold tabular-nums">
                {symbolFor(summaryCurrency)}
                {fmt(totalLiability)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / mo
                </span>
              </div>
            </div>
            <Separator orientation="vertical" className="hidden h-10 sm:block" />
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground">Active</div>
                <div className="text-sm font-semibold tabular-nums">
                  {guarantees.length}
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button"
                      onClick={openAdd}
                      disabled={noDesignations || availableCodes.length === 0}
                      className="rounded-xl"
                      aria-label="Add guarantee"
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add guarantee
                    </Button>
                  </span>
                </TooltipTrigger>
                {noDesignations && (
                  <TooltipContent>Add designations first.</TooltipContent>
                )}
                {!noDesignations && availableCodes.length === 0 && (
                  <TooltipContent>
                    Every designation already has a guarantee.
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </CardContent>
        </Card>

        {orphaned.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <span>
              {orphaned.length} guarantee
              {orphaned.length === 1 ? "" : "s"} reference designation code
              {orphaned.length === 1 ? "" : "s"} that no longer exist:{" "}
              <strong>
                {orphaned.map((g) => g.designationCode).join(", ")}
              </strong>
              .
            </span>
          </div>
        )}

        {/* Empty state */}
        {guarantees.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-sky-500/15">
                <Wallet className="h-7 w-7 text-emerald-600" />
              </div>
              <div>
                <div className="text-base font-semibold">No guarantees yet</div>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Set a monthly minimum income for high-ranking designations.
                  This is the floor — anything earned above it is paid as
                  normal.
                </p>
              </div>
              <Button
                onClick={openAdd}
                disabled={noDesignations}
                className="rounded-xl"
              >
                <Plus className="mr-1 h-4 w-4" /> Add your first guarantee
              </Button>
              {noDesignations && (
                <span className="text-[11px] text-muted-foreground">
                  Tip: create designations first.
                </span>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Guarantee cards */
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {guarantees.map((g, idx) => {
              const isOrphan =
                g.designationCode &&
                !designationCodes.includes(g.designationCode);
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
                      <div className="flex gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                        <Popover
                          open={editingIdx === idx}
                          onOpenChange={(open) =>
                            setEditingIdx(open ? idx : null)
                          }
                        >
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
                          <PopoverContent
                            className="w-72 space-y-3"
                            align="end"
                          >
                            <div className="text-sm font-semibold">
                              Edit {g.designationCode}
                            </div>
                            <div>
                              <Label className="text-[11px] text-muted-foreground">
                                Designation
                              </Label>
                              <Select
                                value={g.designationCode}
                                onValueChange={(v) =>
                                  handleEditSave(idx, { designationCode: v })
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {designationCodes.map((c) => (
                                    <SelectItem key={c} value={c}>
                                      {c}
                                    </SelectItem>
                                  ))}
                                  {!designationCodes.includes(
                                    g.designationCode,
                                  ) &&
                                    g.designationCode && (
                                      <SelectItem value={g.designationCode}>
                                        {g.designationCode} (orphan)
                                      </SelectItem>
                                    )}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-[11px] text-muted-foreground">
                                Monthly amount
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={g.monthlyAmount}
                                onChange={(e) =>
                                  handleEditSave(idx, {
                                    monthlyAmount: Number(e.target.value),
                                  })
                                }
                                className="h-9 tabular-nums"
                              />
                            </div>
                            <div>
                              <Label className="text-[11px] text-muted-foreground">
                                Currency
                              </Label>
                              <Select
                                value={g.currency || "INR"}
                                onValueChange={(v) =>
                                  handleEditSave(idx, { currency: v })
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CURRENCIES.map((c) => (
                                    <SelectItem key={c} value={c}>
                                      {c}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                onClick={() => setEditingIdx(null)}
                                className="rounded-lg"
                              >
                                Done
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
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
                        {sym}
                        {fmt(g.monthlyAmount || 0)}
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

        {/* Add popover hosted via dialog-like Popover trigger workaround: use AlertDialog as a modal-free panel */}
        <AlertDialog open={addOpen} onOpenChange={setAddOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Add guarantee</AlertDialogTitle>
              <AlertDialogDescription>
                Choose a designation and set a monthly floor amount.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">
                  Designation
                </Label>
                <Select value={draftCode} onValueChange={setDraftCode}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pick a designation" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCodes.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">
                    Monthly amount
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draftAmount}
                    onChange={(e) => setDraftAmount(e.target.value)}
                    placeholder="e.g. 35000"
                    className="h-9 tabular-nums"
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">
                    Currency
                  </Label>
                  <Select
                    value={draftCurrency}
                    onValueChange={setDraftCurrency}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
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

        {/* Delete confirm */}
        <AlertDialog
          open={confirmDeleteIdx != null}
          onOpenChange={(open) => !open && setConfirmDeleteIdx(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove guarantee?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the monthly floor for{" "}
                {confirmDeleteIdx != null &&
                  guarantees[confirmDeleteIdx]?.designationCode}
                . You can re-add it any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmDeleteIdx != null) remove(confirmDeleteIdx);
                  setConfirmDeleteIdx(null);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
