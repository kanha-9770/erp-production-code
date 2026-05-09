"use client";

/**
 * Ranks admin — table + create/edit dialog. Ranks gate override percents per
 * tree level and the rank-up bonus / team multiplier (FR-2.5 / FR-5.4 / FR-5.7).
 *
 * The override-percents field is a JSON array of decimals like [5, 3, 1] —
 * we render a row per index and let admins add/remove levels.
 */

import { useState } from "react";
import Link from "next/link";
import {
  useGetRanksQuery,
  useCreateRankMutation,
  useUpdateRankMutation,
  useDeleteRankMutation,
} from "@/lib/api/real-estate/agents";
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
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  Sparkles,
  Layers,
  X,
} from "lucide-react";
import type { Rank } from "@/lib/api/real-estate/types";

interface RankFormState {
  name: string;
  code: string;
  description: string;
  level: string;
  minPersonalSales: string;
  minTeamSize: string;
  minTeamRevenue: string;
  evaluationWindowDays: string;
  overridePercents: string[]; // string-edited; cast on save
  rankUpBonus: string;
  teamBonusPercent: string;
  isActive: boolean;
}

const EMPTY_FORM: RankFormState = {
  name: "",
  code: "",
  description: "",
  level: "0",
  minPersonalSales: "",
  minTeamSize: "",
  minTeamRevenue: "",
  evaluationWindowDays: "",
  overridePercents: ["5", "3", "1"],
  rankUpBonus: "",
  teamBonusPercent: "",
  isActive: true,
};

function fromRank(r: Rank): RankFormState {
  return {
    name: r.name,
    code: r.code,
    description: r.description ?? "",
    level: String(r.level),
    minPersonalSales: r.minPersonalSales != null ? String(r.minPersonalSales) : "",
    minTeamSize: r.minTeamSize != null ? String(r.minTeamSize) : "",
    minTeamRevenue: r.minTeamRevenue != null ? String(r.minTeamRevenue) : "",
    evaluationWindowDays:
      r.evaluationWindowDays != null ? String(r.evaluationWindowDays) : "",
    overridePercents: (r.overridePercents ?? []).map(String),
    rankUpBonus: r.rankUpBonus != null ? String(r.rankUpBonus) : "",
    teamBonusPercent:
      r.teamBonusPercent != null ? String(r.teamBonusPercent) : "",
    isActive: r.isActive,
  };
}

function toApiPayload(s: RankFormState): Record<string, any> {
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
  const intOrNull = (v: string) => (v.trim() === "" ? null : parseInt(v, 10));
  return {
    name: s.name.trim(),
    code: s.code.trim().toUpperCase(),
    description: s.description.trim() || null,
    level: intOrNull(s.level) ?? 0,
    minPersonalSales: intOrNull(s.minPersonalSales),
    minTeamSize: intOrNull(s.minTeamSize),
    minTeamRevenue: numOrNull(s.minTeamRevenue),
    evaluationWindowDays: intOrNull(s.evaluationWindowDays),
    overridePercents: s.overridePercents
      .map((v) => Number(v))
      .filter((n) => !Number.isNaN(n)),
    rankUpBonus: numOrNull(s.rankUpBonus),
    teamBonusPercent: numOrNull(s.teamBonusPercent),
    isActive: s.isActive,
  };
}

export default function RanksAdminPage() {
  const { toast } = useToast();
  const { data, isLoading } = useGetRanksQuery();
  const [create] = useCreateRankMutation();
  const [update] = useUpdateRankMutation();
  const [remove] = useDeleteRankMutation();

  const ranks = data?.data ?? [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rank | null>(null);
  const [form, setForm] = useState<RankFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (r: Rank) => {
    setEditing(r);
    setForm(fromRank(r));
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast({ title: "Name and code are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = toApiPayload(form);
      if (editing) {
        await update({ id: editing.id, body: payload }).unwrap();
        toast({ title: "Rank updated" });
      } else {
        await create(payload).unwrap();
        toast({ title: "Rank created" });
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

  const onDelete = async (r: Rank) => {
    if ((r._count?.agents ?? 0) > 0) {
      toast({
        title: "Cannot delete",
        description: `${r._count!.agents} agent(s) currently hold this rank.`,
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`Delete rank "${r.name}"?`)) return;
    try {
      await remove(r.id).unwrap();
      toast({ title: "Rank deleted" });
    } catch (err: any) {
      toast({ title: "Could not delete", description: err?.data?.error || err?.message, variant: "destructive" });
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

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/real-estate/agents" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
              <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
              Ranks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure agent ranks, promotion criteria, and override percents
              per tree depth.
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> New rank
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : ranks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No ranks configured yet.</p>
            <Button variant="link" onClick={openCreate}>Create your first rank</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {ranks.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{r.name}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">{r.code}</Badge>
                    <Badge variant="secondary" className="text-[10px]">Level {r.level}</Badge>
                    {!r.isActive && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                  </div>
                  {r.description && (
                    <div className="text-sm text-muted-foreground mt-1">{r.description}</div>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      Overrides: {r.overridePercents?.length ? r.overridePercents.map((p) => `${p}%`).join(" / ") : "—"}
                    </span>
                    {r.rankUpBonus != null && <span>Bonus: ₹{r.rankUpBonus.toLocaleString()}</span>}
                    {r.teamBonusPercent != null && <span>Team mult: {r.teamBonusPercent}%</span>}
                    <span>{r._count?.agents ?? 0} agents</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="icon" onClick={() => openEdit(r)} aria-label="Edit">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => onDelete(r)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit rank" : "Create rank"}</DialogTitle>
            <DialogDescription>
              Promotion criteria are evaluated by the rank-promotion job (auto)
              or applied manually from the agent profile.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name *">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Code *" hint="Uppercase identifier">
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="font-mono"
                />
              </Field>
              <Field label="Level" hint="Higher = more senior" className="sm:col-span-2">
                <Input
                  type="number"
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                />
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
              <div className="text-sm font-medium mb-2">Promotion criteria</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Min personal sales">
                  <Input
                    type="number"
                    value={form.minPersonalSales}
                    onChange={(e) => setForm({ ...form, minPersonalSales: e.target.value })}
                  />
                </Field>
                <Field label="Min team size">
                  <Input
                    type="number"
                    value={form.minTeamSize}
                    onChange={(e) => setForm({ ...form, minTeamSize: e.target.value })}
                  />
                </Field>
                <Field label="Min team revenue">
                  <Input
                    type="number"
                    value={form.minTeamRevenue}
                    onChange={(e) => setForm({ ...form, minTeamRevenue: e.target.value })}
                  />
                </Field>
                <Field label="Window (days)" hint="Empty = lifetime">
                  <Input
                    type="number"
                    value={form.evaluationWindowDays}
                    onChange={(e) => setForm({ ...form, evaluationWindowDays: e.target.value })}
                  />
                </Field>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Override percents by tree depth</div>
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
            </div>

            <div className="border-t pt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Rank-up bonus" hint="Credited on promotion">
                <Input
                  type="number"
                  value={form.rankUpBonus}
                  onChange={(e) => setForm({ ...form, rankUpBonus: e.target.value })}
                />
              </Field>
              <Field label="Team bonus %">
                <Input
                  type="number"
                  step="0.01"
                  value={form.teamBonusPercent}
                  onChange={(e) => setForm({ ...form, teamBonusPercent: e.target.value })}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Label className="text-sm">Active</Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create rank"}
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
