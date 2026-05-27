'use client';

/**
 * /leave/config — admin / HR page to edit Leave Rule fields without
 * touching the database directly.
 *
 * Reads /api/leave-rules and renders each LeaveRule as an editable card.
 * Fields exposed:
 *   • Name, Description
 *   • Min notice days, Max consecutive days
 *   • Deduction % (0–100)
 *   • Toggles: Paid, Requires approval, Affects attendance, Active
 *
 * Permissioned through the standard RoutePermission flow (path: /leave/config).
 * The PUT endpoint enforces admin-only server-side, so non-admin viewers see
 * the data but get a 403 toast if they try to save.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Save, ShieldAlert, Settings2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import PageBackLink from '@/components/shared/page-back-link';

interface LeaveRule {
  id: string;
  name: string;
  description: string | null;
  minNoticeDays: number | null;
  maxConsecutiveDays: number | null;
  deductionPercentage: number | string;
  isPaid: boolean;
  requiresApproval: boolean;
  affectsAttendance: boolean;
  isActive: boolean;
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  color: string | null;
  leaveRules: LeaveRule[];
}

interface RuleFormState {
  name: string;
  description: string;
  minNoticeDays: string;
  maxConsecutiveDays: string;
  deductionPercentage: string;
  isPaid: boolean;
  requiresApproval: boolean;
  affectsAttendance: boolean;
  isActive: boolean;
}

function ruleToForm(r: LeaveRule): RuleFormState {
  return {
    name: r.name,
    description: r.description ?? '',
    minNoticeDays: r.minNoticeDays == null ? '' : String(r.minNoticeDays),
    maxConsecutiveDays:
      r.maxConsecutiveDays == null ? '' : String(r.maxConsecutiveDays),
    deductionPercentage: String(r.deductionPercentage ?? 100),
    isPaid: r.isPaid,
    requiresApproval: r.requiresApproval,
    affectsAttendance: r.affectsAttendance,
    isActive: r.isActive,
  };
}

function isDirty(server: LeaveRule, form: RuleFormState): boolean {
  return (
    form.name.trim() !== server.name ||
    form.description.trim() !== (server.description ?? '') ||
    form.minNoticeDays !==
      (server.minNoticeDays == null ? '' : String(server.minNoticeDays)) ||
    form.maxConsecutiveDays !==
      (server.maxConsecutiveDays == null
        ? ''
        : String(server.maxConsecutiveDays)) ||
    Number(form.deductionPercentage) !== Number(server.deductionPercentage) ||
    form.isPaid !== server.isPaid ||
    form.requiresApproval !== server.requiresApproval ||
    form.affectsAttendance !== server.affectsAttendance ||
    form.isActive !== server.isActive
  );
}

export default function LeaveConfigPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [forms, setForms] = useState<Record<string, RuleFormState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leave-rules', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? 'Failed to load');
      }
      const types: LeaveType[] = json.leaveTypes ?? [];
      setLeaveTypes(types);
      setForms((prev) => {
        const next: Record<string, RuleFormState> = {};
        for (const t of types) {
          for (const r of t.leaveRules) {
            // Preserve any in-progress edits on a refresh after save.
            next[r.id] = prev[r.id] ?? ruleToForm(r);
          }
        }
        return next;
      });
    } catch (e: any) {
      toast({
        title: 'Failed to load leave rules',
        description: e?.message ?? 'Try again',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const ruleById = useMemo(() => {
    const m = new Map<string, LeaveRule>();
    for (const t of leaveTypes) for (const r of t.leaveRules) m.set(r.id, r);
    return m;
  }, [leaveTypes]);

  const updateForm = useCallback(
    (ruleId: string, patch: Partial<RuleFormState>) => {
      setForms((prev) => ({
        ...prev,
        [ruleId]: { ...prev[ruleId], ...patch },
      }));
    },
    [],
  );

  const reset = useCallback(
    (ruleId: string) => {
      const r = ruleById.get(ruleId);
      if (!r) return;
      setForms((prev) => ({ ...prev, [ruleId]: ruleToForm(r) }));
    },
    [ruleById],
  );

  const save = useCallback(
    async (ruleId: string) => {
      const form = forms[ruleId];
      if (!form) return;
      const minN = form.minNoticeDays.trim();
      const maxC = form.maxConsecutiveDays.trim();
      const pct = Number(form.deductionPercentage);
      if (!form.name.trim()) {
        toast({ title: 'Name cannot be empty', variant: 'destructive' });
        return;
      }
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        toast({
          title: 'Deduction % must be 0–100',
          variant: 'destructive',
        });
        return;
      }
      setSavingId(ruleId);
      try {
        const res = await fetch('/api/leave-rules', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: ruleId,
            name: form.name.trim(),
            description: form.description.trim() || null,
            minNoticeDays: minN === '' ? null : Number(minN),
            maxConsecutiveDays: maxC === '' ? null : Number(maxC),
            deductionPercentage: pct,
            isPaid: form.isPaid,
            requiresApproval: form.requiresApproval,
            affectsAttendance: form.affectsAttendance,
            isActive: form.isActive,
          }),
        });
        const json = await res.json();
        if (res.status === 403) {
          toast({
            title: 'Admin only',
            description: 'You need admin privileges to edit leave rules.',
            variant: 'destructive',
          });
          return;
        }
        if (!res.ok || !json?.success) {
          throw new Error(json?.error ?? 'Save failed');
        }
        const types: LeaveType[] = json.leaveTypes ?? [];
        setLeaveTypes(types);
        // Snap the form back to the saved server state so isDirty flips off.
        const fresh = types
          .flatMap((t) => t.leaveRules)
          .find((r) => r.id === ruleId);
        if (fresh) {
          setForms((prev) => ({ ...prev, [ruleId]: ruleToForm(fresh) }));
        }
        toast({ title: 'Leave rule saved' });
      } catch (e: any) {
        toast({
          title: 'Save failed',
          description: e?.message ?? 'Try again',
          variant: 'destructive',
        });
      } finally {
        setSavingId(null);
      }
    },
    [forms, toast],
  );

  if (forbidden) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium">Sign-in required</p>
            <p className="text-sm text-muted-foreground mt-1">
              You must be signed in to view leave configuration.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-3 sm:p-4 lg:p-6 space-y-4">
      <div className="space-y-2">
        <PageBackLink href="/leave" label="Leave" />
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Settings2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">
                Leave Configuration
              </h1>
              <div className="text-xs text-muted-foreground truncate">
                Edit notice days, consecutive-day caps, deduction and approval
                rules for every leave type.
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading leave rules…
        </div>
      ) : leaveTypes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No leave types configured yet. Run{' '}
            <code className="font-mono">scripts/seed-leave-types.ts</code> to
            seed the defaults.
          </CardContent>
        </Card>
      ) : (
        leaveTypes.map((t) => (
          <Card key={t.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                {t.color && (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                )}
                <CardTitle className="text-sm font-semibold">{t.name}</CardTitle>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">
                  {t.code}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {t.leaveRules.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No rules under this type yet.
                </p>
              ) : (
                t.leaveRules.map((r) => {
                  const form = forms[r.id];
                  if (!form) return null;
                  const dirty = isDirty(r, form);
                  const busy = savingId === r.id;
                  return (
                    <div
                      key={r.id}
                      className="rounded-lg border bg-card p-3 sm:p-4 space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor={`name-${r.id}`} className="text-xs">
                            Rule name
                          </Label>
                          <Input
                            id={`name-${r.id}`}
                            value={form.name}
                            onChange={(e) =>
                              updateForm(r.id, { name: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`desc-${r.id}`}
                            className="text-xs"
                          >
                            Description
                          </Label>
                          <Input
                            id={`desc-${r.id}`}
                            value={form.description}
                            placeholder="Shown to employees in the Apply form"
                            onChange={(e) =>
                              updateForm(r.id, { description: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label
                            htmlFor={`notice-${r.id}`}
                            className="text-xs"
                          >
                            Min notice days
                          </Label>
                          <Input
                            id={`notice-${r.id}`}
                            type="number"
                            min={0}
                            step={1}
                            placeholder="e.g. 2"
                            value={form.minNoticeDays}
                            onChange={(e) =>
                              updateForm(r.id, {
                                minNoticeDays: e.target.value,
                              })
                            }
                          />
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            Blank = no notice required.
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`max-${r.id}`}
                            className="text-xs"
                          >
                            Max consecutive days
                          </Label>
                          <Input
                            id={`max-${r.id}`}
                            type="number"
                            min={0}
                            step={1}
                            placeholder="e.g. 5"
                            value={form.maxConsecutiveDays}
                            onChange={(e) =>
                              updateForm(r.id, {
                                maxConsecutiveDays: e.target.value,
                              })
                            }
                          />
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            Blank = no cap.
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`pct-${r.id}`}
                            className="text-xs"
                          >
                            Deduction %
                          </Label>
                          <Input
                            id={`pct-${r.id}`}
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={form.deductionPercentage}
                            onChange={(e) =>
                              updateForm(r.id, {
                                deductionPercentage: e.target.value,
                              })
                            }
                          />
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            0 = fully paid · 100 = unpaid
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <ToggleField
                          id={`paid-${r.id}`}
                          label="Paid"
                          checked={form.isPaid}
                          onCheckedChange={(v) =>
                            updateForm(r.id, { isPaid: v })
                          }
                        />
                        <ToggleField
                          id={`approval-${r.id}`}
                          label="Requires approval"
                          checked={form.requiresApproval}
                          onCheckedChange={(v) =>
                            updateForm(r.id, { requiresApproval: v })
                          }
                        />
                        <ToggleField
                          id={`attendance-${r.id}`}
                          label="Affects attendance"
                          checked={form.affectsAttendance}
                          onCheckedChange={(v) =>
                            updateForm(r.id, { affectsAttendance: v })
                          }
                        />
                        <ToggleField
                          id={`active-${r.id}`}
                          label="Active"
                          checked={form.isActive}
                          onCheckedChange={(v) =>
                            updateForm(r.id, { isActive: v })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => reset(r.id)}
                          disabled={!dirty || busy}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                          Reset
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => save(r.id)}
                          disabled={!dirty || busy}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Save
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function ToggleField({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background px-2.5 py-1.5 gap-2">
      <Label htmlFor={id} className="text-xs cursor-pointer">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
