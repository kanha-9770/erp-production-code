"use client";

/**
 * Commission rules admin (FR-5.11). Editing creates a NEW version row and
 * supersedes the previous one — closed transactions retain the rule version
 * they were stamped with at close time (BR-9).
 */

import { useState } from "react";
import Link from "next/link";
import {
  useGetCommissionRulesQuery,
  useCreateCommissionRuleMutation,
  useUpdateCommissionRuleMutation,
  useDeleteCommissionRuleMutation,
} from "@/lib/api/real-estate/transactions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Edit,
  Layers,
  Settings,
  X,
  Archive,
  History,
} from "lucide-react";
import {
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPE_OPTIONS,
} from "@/components/real-estate/constants";
import type { CommissionRule } from "@/lib/api/real-estate/types";

interface RuleFormState {
  name: string;
  description: string;
  propertyType: string;
  listingAgentPercent: string;
  sellingAgentPercent: string;
  brokeragePercent: string;
  overridePercents: string[];
  useRankOverrides: boolean;
  maxOverrideDepth: string;
  defaultBasePercent: string;
  holdPeriodDays: string;
  compressionRule: boolean;
}

const EMPTY: RuleFormState = {
  name: "",
  description: "",
  propertyType: "ALL",
  listingAgentPercent: "30",
  sellingAgentPercent: "30",
  brokeragePercent: "40",
  overridePercents: ["5", "3", "1"],
  useRankOverrides: false,
  maxOverrideDepth: "3",
  defaultBasePercent: "2",
  holdPeriodDays: "7",
  compressionRule: true,
};

function fromRule(r: CommissionRule): RuleFormState {
  return {
    name: r.name,
    description: r.description ?? "",
    propertyType: r.propertyType ?? "ALL",
    listingAgentPercent: String(r.listingAgentPercent),
    sellingAgentPercent: String(r.sellingAgentPercent),
    brokeragePercent: String(r.brokeragePercent),
    overridePercents: (r.overridePercents ?? []).map(String),
    useRankOverrides: r.useRankOverrides,
    maxOverrideDepth: String(r.maxOverrideDepth),
    defaultBasePercent: r.defaultBasePercent != null ? String(r.defaultBasePercent) : "",
    holdPeriodDays: String(r.holdPeriodDays),
    compressionRule: r.compressionRule,
  };
}

function toApiPayload(s: RuleFormState): Record<string, any> {
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    name: s.name.trim(),
    description: s.description.trim() || null,
    propertyType: s.propertyType === "ALL" ? null : s.propertyType,
    listingAgentPercent: Number(s.listingAgentPercent),
    sellingAgentPercent: Number(s.sellingAgentPercent),
    brokeragePercent: Number(s.brokeragePercent),
    overridePercents: s.overridePercents
      .map((v) => Number(v))
      .filter((n) => !Number.isNaN(n)),
    useRankOverrides: s.useRankOverrides,
    maxOverrideDepth: parseInt(s.maxOverrideDepth || "3", 10),
    defaultBasePercent: numOrNull(s.defaultBasePercent),
    holdPeriodDays: parseInt(s.holdPeriodDays || "7", 10),
    compressionRule: s.compressionRule,
  };
}

export default function CommissionRulesPage() {
  const { toast } = useToast();
  const [showInactive, setShowInactive] = useState(false);
  const { data, isLoading } = useGetCommissionRulesQuery({
    includeInactive: showInactive,
  });
  const [create] = useCreateCommissionRuleMutation();
  const [update] = useUpdateCommissionRuleMutation();
  const [remove] = useDeleteCommissionRuleMutation();

  const rules = data?.data ?? [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CommissionRule | null>(null);
  const [form, setForm] = useState<RuleFormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const splitsTotal =
    Number(form.listingAgentPercent) +
    Number(form.sellingAgentPercent) +
    Number(form.brokeragePercent);
  const splitsValid = Math.abs(splitsTotal - 100) < 0.0001;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (r: CommissionRule) => {
    setEditing(r);
    setForm(fromRule(r));
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!splitsValid) {
      toast({
        title: `Splits must sum to 100% (got ${splitsTotal.toFixed(4)})`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const payload = toApiPayload(form);
      if (editing) {
        await update({ id: editing.id, body: payload as any }).unwrap();
        toast({ title: "Rule updated", description: "A new version was created." });
      } else {
        await create(payload as any).unwrap();
        toast({ title: "Rule created" });
      }
      setOpen(false);
    } catch (err: any) {
      toast({
        title: "Could not save",
        description: err?.data?.error || err?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const onArchive = async (r: CommissionRule) => {
    if (!confirm(`Deactivate rule "${r.name}"? Past transactions still reference it.`)) return;
    try {
      await remove(r.id).unwrap();
      toast({ title: "Rule deactivated" });
    } catch (err: any) {
      toast({
        title: "Could not deactivate",
        description: err?.data?.error || err?.message,
        variant: "destructive",
      });
    }
  };

  const setOverride = (idx: number, value: string) =>
    setForm((s) => ({
      ...s,
      overridePercents: s.overridePercents.map((v, i) => (i === idx ? value : v)),
    }));
  const addOverride = () =>
    setForm((s) => ({ ...s, overridePercents: [...s.overridePercents, "0"] }));
  const removeOverride = (idx: number) =>
    setForm((s) => ({
      ...s,
      overridePercents: s.overridePercents.filter((_, i) => i !== idx),
    }));

  // Group by propertyType so admins see one card per scope. Within each
  // group, the active row is on top and inactive history below.
  const grouped = rules.reduce((acc, r) => {
    const key = r.propertyType ?? "ALL";
    (acc[key] ??= []).push(r);
    return acc;
  }, {} as Record<string, CommissionRule[]>);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/real-estate" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
              <Settings className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
              Commission rules
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure splits, override percents and the hold period. Edits
              create a new version; closed transactions keep the rule version
              they were stamped with at close time (BR-9).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Show inactive
          </label>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New rule
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Settings className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No commission rules configured.</p>
            <Button variant="link" onClick={openCreate}>Create your first rule</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([scope, list]) => (
            <Card key={scope}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  {scope === "ALL"
                    ? "All property types (fallback)"
                    : PROPERTY_TYPE_LABEL[scope as keyof typeof PROPERTY_TYPE_LABEL] ?? scope}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {list.map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-md border p-3 ${
                      r.isActive
                        ? "bg-background"
                        : "bg-muted/30 opacity-70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{r.name}</span>
                          <Badge variant="secondary" className="text-[10px]">v{r.version}</Badge>
                          {r.isActive ? (
                            <Badge className="text-[10px]">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Inactive</Badge>
                          )}
                        </div>
                        {r.description && (
                          <div className="text-sm text-muted-foreground mt-1">
                            {r.description}
                          </div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs tabular-nums">
                          <Stat label="Listing" value={`${r.listingAgentPercent}%`} />
                          <Stat label="Selling" value={`${r.sellingAgentPercent}%`} />
                          <Stat label="Brokerage" value={`${r.brokeragePercent}%`} />
                          <Stat
                            label="Default base"
                            value={r.defaultBasePercent != null ? `${r.defaultBasePercent}%` : "—"}
                          />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-3">
                          <span>
                            Overrides:{" "}
                            {r.overridePercents.length === 0
                              ? "none"
                              : r.overridePercents.map((p) => `${p}%`).join(" / ")}
                            {r.useRankOverrides ? " (using rank ladder)" : ""}
                          </span>
                          <span>Max depth: {r.maxOverrideDepth}</span>
                          <span>Hold: {r.holdPeriodDays}d</span>
                          <span>{r.compressionRule ? "Compress on" : "Compress off"}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        {r.isActive && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                              <Edit className="h-3.5 w-3.5 mr-1" /> Edit (new version)
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => onArchive(r)}>
                              <Archive className="h-3.5 w-3.5 mr-1" /> Deactivate
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit rule (creates new version)" : "Create rule"}</DialogTitle>
            <DialogDescription>
              Splits must sum to 100. Override percents come out of the
              brokerage share and walk up the listing agent's tree.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name *">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Property type" hint="Leave as 'All' to apply as a fallback">
                <Select
                  value={form.propertyType}
                  onValueChange={(v) => setForm({ ...form, propertyType: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All (fallback)</SelectItem>
                    {PROPERTY_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                />
              </Field>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Splits (must sum to 100%)</div>
                <span
                  className={`text-xs tabular-nums ${
                    splitsValid ? "text-emerald-600" : "text-destructive"
                  }`}
                >
                  Total: {splitsTotal.toFixed(4)}%
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Listing agent %">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.listingAgentPercent}
                    onChange={(e) =>
                      setForm({ ...form, listingAgentPercent: e.target.value })
                    }
                  />
                </Field>
                <Field label="Selling agent %">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.sellingAgentPercent}
                    onChange={(e) =>
                      setForm({ ...form, sellingAgentPercent: e.target.value })
                    }
                  />
                </Field>
                <Field label="Brokerage %">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.brokeragePercent}
                    onChange={(e) =>
                      setForm({ ...form, brokeragePercent: e.target.value })
                    }
                  />
                </Field>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Override percents (per upline level)</div>
                <Button type="button" size="sm" variant="outline" onClick={addOverride}>
                  <Plus className="h-3 w-3 mr-1" /> Level
                </Button>
              </div>
              {form.overridePercents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No overrides — direct sales only.</p>
              ) : (
                <ul className="space-y-1.5">
                  {form.overridePercents.map((v, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0 tabular-nums">
                        Level {i + 1}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        value={v}
                        onChange={(e) => setOverride(i, e.target.value)}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOverride(i)}
                        aria-label="Remove level"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-3 sm:grid-cols-2 mt-3">
                <Field label="Max override depth">
                  <Input
                    type="number"
                    value={form.maxOverrideDepth}
                    onChange={(e) => setForm({ ...form, maxOverrideDepth: e.target.value })}
                  />
                </Field>
                <Field label="Use rank's ladder?" hint="When on, the agent's rank.overridePercents is used instead.">
                  <div className="flex items-center h-9 px-1">
                    <Switch
                      checked={form.useRankOverrides}
                      onCheckedChange={(v) => setForm({ ...form, useRankOverrides: v })}
                    />
                  </div>
                </Field>
              </div>
            </div>

            <div className="border-t pt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Default base %" hint="Used when property has no commissionPercentage">
                <Input
                  type="number"
                  step="0.01"
                  value={form.defaultBasePercent}
                  onChange={(e) => setForm({ ...form, defaultBasePercent: e.target.value })}
                />
              </Field>
              <Field label="Hold period (days)" hint="FR-5.12">
                <Input
                  type="number"
                  value={form.holdPeriodDays}
                  onChange={(e) => setForm({ ...form, holdPeriodDays: e.target.value })}
                />
              </Field>
              <Field label="Compression rule" hint="Skip suspended/terminated uplines (BR-8)">
                <div className="flex items-center h-9 px-1">
                  <Switch
                    checked={form.compressionRule}
                    onCheckedChange={(v) => setForm({ ...form, compressionRule: v })}
                  />
                </div>
              </Field>
            </div>

            {editing && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-xs flex items-start gap-2">
                <History className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Saving creates version {editing.version + 1} and deactivates
                  v{editing.version}. Closed transactions keep their stamped
                  version forever.
                </span>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !splitsValid}>
                {saving ? "Saving…" : editing ? "Save new version" : "Create rule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
