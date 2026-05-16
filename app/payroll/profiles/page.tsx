'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  SalaryStructureSection,
  StatutoryComplianceSection,
  OvertimePolicySection,
  BonusSection,
  LiveSalaryPreview,
  DEFAULT_SALARY_STRUCTURE,
  DEFAULT_STATUTORY,
  DEFAULT_OVERTIME,
  DEFAULT_BONUS,
  type SalaryStructureConfig,
  type StatutoryConfig,
  type OvertimeConfig,
  type BonusConfig,
} from '@/components/payroll/payroll-enterprise-config';
import PageBackLink from '@/components/shared/page-back-link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Accordion } from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Star,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  baseSalary: number | null;
  salaryStructure: SalaryStructureConfig;
  statutory: StatutoryConfig;
  bonus: BonusConfig;
  overtime: OvertimeConfig;
  policy: { weeklyOffDays: number[]; payableBasis: 'monthDays' | 'fixed26' | 'fixed30' };
  assignedCount?: number;
}

function blankProfile(name: string): Profile {
  return {
    id: '',
    name,
    description: null,
    isDefault: false,
    baseSalary: null,
    salaryStructure: { ...DEFAULT_SALARY_STRUCTURE },
    statutory: { ...DEFAULT_STATUTORY },
    bonus: { ...DEFAULT_BONUS },
    overtime: { ...DEFAULT_OVERTIME },
    policy: { weeklyOffDays: [0], payableBasis: 'monthDays' },
  };
}

function mergeProfile(p: any): Profile {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    isDefault: !!p.isDefault,
    baseSalary: p.baseSalary != null ? Number(p.baseSalary) : null,
    salaryStructure: { ...DEFAULT_SALARY_STRUCTURE, ...(p.salaryStructure || {}) },
    statutory: { ...DEFAULT_STATUTORY, ...(p.statutory || {}) },
    bonus: { ...DEFAULT_BONUS, ...(p.bonus || {}) },
    overtime: { ...DEFAULT_OVERTIME, ...(p.overtime || {}) },
    policy: {
      weeklyOffDays: Array.isArray(p.policy?.weeklyOffDays) ? p.policy.weeklyOffDays : [0],
      payableBasis: p.policy?.payableBasis ?? 'monthDays',
    },
    assignedCount: p.assignedCount,
  };
}

interface EmployeeRow {
  employeeId: string;
  employeeName: string;
  email: string;
  department: string | null;
  designation: string | null;
  currentProfileId: string | null;
  effectiveFrom: string | null;
}

type EffectiveMode = 'current' | 'next' | 'specific';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function nextMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
}

function resolveEffectiveFrom(mode: EffectiveMode, specific: string): string {
  if (mode === 'current') return currentMonth();
  if (mode === 'next') return nextMonth();
  return specific || currentMonth();
}

function formatMonth(yyyymm: string | null | undefined): string {
  if (!yyyymm || !/^\d{4}-\d{2}$/.test(yyyymm)) return '';
  const [y, m] = yyyymm.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

export default function PayrollProfilesPage() {
  const [mounted, setMounted] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Employee picker (bulk assign) state.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerProfile, setPickerProfile] = useState<Profile | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());
  // Effective-from controls inside the picker: current / next / specific.
  // The specific-month value seeds with current month so the input is
  // pre-filled with something sensible the moment the user clicks the radio.
  const [effMode, setEffMode] = useState<EffectiveMode>('current');
  const [effSpecific, setEffSpecific] = useState<string>(currentMonth());
  // Create-profile dialog state. Replaces the browser prompt().
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  // Generic confirm dialog state. Replaces the browser confirm() so destructive
  // actions get a UI that matches the rest of the app. `onConfirm` is the
  // callback the user wants to run; `tone` toggles destructive vs neutral styling.
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    tone: 'destructive' | 'default';
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const askConfirm = (
    title: string,
    description: string,
    onConfirm: () => void | Promise<void>,
    opts: { confirmLabel?: string; tone?: 'destructive' | 'default' } = {},
  ) => {
    setConfirmState({
      title,
      description,
      onConfirm,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      tone: opts.tone ?? 'default',
    });
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = async (opts: { silent?: boolean } = {}) => {
    // Silent mode skips the full-screen "Loading pay rule profiles..." gate
    // so background refreshes after save/assign don't unmount the form the
    // user is interacting with. Initial mount stays non-silent so the gate
    // still shows on a cold load.
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/payroll/profiles', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load profiles');
      const ps: Profile[] = (json.profiles ?? []).map(mergeProfile);
      setProfiles(ps);
      if (ps.length > 0 && !selectedId) {
        const def = ps.find((p) => p.isDefault) ?? ps[0];
        setSelectedId(def.id);
        setEditing(def);
      } else if (selectedId) {
        const found = ps.find((p) => p.id === selectedId);
        // On a SILENT refresh we deliberately don't blow away the user's
        // in-flight edits in `editing` — they may have unsaved tweaks open.
        // Only the profile list + counts get the fresh values.
        if (found && !opts.silent) setEditing(found);
        else if (!found) {
          setSelectedId(ps[0]?.id ?? null);
          setEditing(ps[0] ?? null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profiles');
    } finally {
      if (!opts.silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted) load();
  }, [mounted]);

  const selectProfile = (p: Profile) => {
    setSelectedId(p.id);
    setEditing({ ...p });
    setSuccess(null);
    setError(null);
  };

  const openCreateDialog = () => {
    setCreateName('');
    setError(null);
    setSuccess(null);
    setCreateOpen(true);
  };

  const submitCreateProfile = async () => {
    const name = createName.trim();
    if (!name) {
      setError('Profile name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/payroll/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to create profile');
      // Optimistic insert — the create response already carries the new
      // profile, so we splice it into local state and switch to it. The
      // dialog can close right now; the background reload runs un-awaited
      // afterwards just to reconcile assignedCount and any server-side
      // defaults the client doesn't know about.
      const fresh = mergeProfile(json.profile);
      setProfiles((prev) => {
        // Avoid a flash of duplicate row if a parallel load already added it.
        if (prev.some((p) => p.id === fresh.id)) return prev;
        return [...prev, { ...fresh, assignedCount: 0 }];
      });
      setSelectedId(fresh.id);
      setEditing(fresh);
      setSuccess(`Profile "${json.profile.name}" created`);
      setCreateOpen(false);
      setCreateName('');
      // Fire-and-forget background reload.
      void load({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create profile');
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/payroll/profiles/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editing.name,
          description: editing.description,
          isDefault: editing.isDefault,
          baseSalary: editing.baseSalary,
          salaryStructure: editing.salaryStructure,
          statutory: editing.statutory,
          bonus: editing.bonus,
          overtime: editing.overtime,
          policy: editing.policy,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      setSuccess(`Profile "${editing.name}" saved. Next payroll run will use the updated rules.`);
      void load({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = (p: Profile) => {
    askConfirm(
      `Delete "${p.name}"?`,
      `Any employees assigned to this profile will fall back to the default profile (or to the global setup config if no default is set).`,
      async () => {
        setSaving(true);
        setError(null);
        try {
          const res = await fetch(`/api/payroll/profiles/${p.id}`, { method: 'DELETE' });
          const json = await res.json();
          if (!json.success) throw new Error(json.error || 'Delete failed');
          setSuccess(`Profile "${p.name}" deleted`);
          setSelectedId(null);
          setEditing(null);
          void load({ silent: true });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Delete failed');
        } finally {
          setSaving(false);
        }
      },
      { confirmLabel: 'Delete profile', tone: 'destructive' },
    );
  };

  const promote = (p: Profile) => {
    setEditing((prev) => (prev ? { ...prev, isDefault: true } : prev));
  };

  const openPicker = async (profile: Profile) => {
    setPickerProfile(profile);
    setPickerOpen(true);
    setPickerSearch('');
    setError(null);
    setSuccess(null);
    setEffMode('current');
    setEffSpecific(currentMonth());
    setEmployeesLoading(true);
    try {
      const res = await fetch('/api/payroll/employees', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load employees');
      const list: EmployeeRow[] = json.employees ?? [];
      setEmployees(list);
      // Pre-select employees already assigned to this profile so the dialog
      // shows current state instead of being a fresh canvas every open.
      setPickerSelection(new Set(list.filter((e) => e.currentProfileId === profile.id).map((e) => e.employeeId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load employees');
    } finally {
      setEmployeesLoading(false);
    }
  };

  const closePicker = () => {
    setPickerOpen(false);
    setPickerProfile(null);
    setPickerSelection(new Set());
    setPickerSearch('');
  };

  const togglePickerOne = (employeeId: string) => {
    setPickerSelection((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const filteredEmployees = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.employeeName.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.department ?? '').toLowerCase().includes(q) ||
        (e.designation ?? '').toLowerCase().includes(q),
    );
  }, [employees, pickerSearch]);

  const togglePickerVisible = (checked: boolean) => {
    setPickerSelection((prev) => {
      const next = new Set(prev);
      for (const e of filteredEmployees) {
        if (checked) next.add(e.employeeId);
        else next.delete(e.employeeId);
      }
      return next;
    });
  };

  const applyToAll = () => {
    if (!pickerProfile) return;
    const effectiveFrom = resolveEffectiveFrom(effMode, effSpecific);
    const profile = pickerProfile;
    askConfirm(
      `Apply "${profile.name}" to every employee?`,
      `This overwrites every existing assignment in the org. Effective from ${formatMonth(effectiveFrom)}.`,
      async () => {
        setSaving(true);
        setError(null);
        try {
          const res = await fetch('/api/payroll/profiles/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applyToAll: true, profileId: profile.id, effectiveFrom }),
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.error || 'Bulk assign failed');
          setSuccess(
            `Applied "${profile.name}" to ${json.assigned ?? json.total ?? 'all'} employee${(json.assigned ?? 1) === 1 ? '' : 's'} from ${formatMonth(effectiveFrom)}.`,
          );
          closePicker();
          void load({ silent: true });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Bulk assign failed');
        } finally {
          setSaving(false);
        }
      },
      { confirmLabel: 'Apply to all', tone: 'destructive' },
    );
  };

  const applyToSelected = async () => {
    if (!pickerProfile) return;
    const keys = Array.from(pickerSelection);
    if (keys.length === 0) {
      setError('Pick at least one employee or use "Apply to all".');
      return;
    }
    const effectiveFrom = resolveEffectiveFrom(effMode, effSpecific);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/payroll/profiles/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeKeys: keys, profileId: pickerProfile.id, effectiveFrom }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Bulk assign failed');
      setSuccess(
        `Applied "${pickerProfile.name}" to ${json.assigned ?? keys.length} employee${(json.assigned ?? keys.length) === 1 ? '' : 's'} from ${formatMonth(effectiveFrom)}.`,
      );
      closePicker();
      void load({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk assign failed');
    } finally {
      setSaving(false);
    }
  };

  const clearAssignmentsForProfile = () => {
    if (!pickerProfile) return;
    const profile = pickerProfile;
    const keys = employees.filter((e) => e.currentProfileId === profile.id).map((e) => e.employeeId);
    if (keys.length === 0) {
      setError(`No employees are currently assigned to "${profile.name}".`);
      return;
    }
    askConfirm(
      `Clear "${profile.name}" from ${keys.length} employee${keys.length === 1 ? '' : 's'}?`,
      `They'll fall back to the default profile (or the global setup config if no default is set).`,
      async () => {
        setSaving(true);
        setError(null);
        try {
          const res = await fetch('/api/payroll/profiles/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeKeys: keys, profileId: null }),
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.error || 'Clear failed');
          setSuccess(
            `Cleared ${json.count ?? keys.length} assignment${(json.count ?? keys.length) === 1 ? '' : 's'}.`,
          );
          closePicker();
          void load({ silent: true });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Clear failed');
        } finally {
          setSaving(false);
        }
      },
      { confirmLabel: 'Clear assignments', tone: 'destructive' },
    );
  };

  const hasProfiles = profiles.length > 0;
  const visibleAllSelected =
    filteredEmployees.length > 0 && filteredEmployees.every((e) => pickerSelection.has(e.employeeId));

  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading pay rule profiles...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <PageBackLink href="/payroll" label="Payroll" />
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Pay Rule Profiles
              </h1>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Create reusable pay rule bundles (e.g. Standard, Senior, Probation) and assign one
              to each employee.
              <br />
              <span className="text-xs">
                Resolution per employee: <strong>explicit assignment</strong> → <strong>default profile</strong> (if any) → <strong>global setup config</strong>.
                Marking a profile <em>default</em> applies it to every unassigned employee.{' '}
                {(() => {
                  const def = profiles.find((p) => p.isDefault);
                  if (!hasProfiles) return null;
                  return def ? (
                    <span className="font-medium">
                      Current fallback: profile <em>{def.name}</em> (the global setup config is bypassed).
                    </span>
                  ) : (
                    <span className="font-medium">
                      Current fallback:{' '}
                      <Link href="/payroll/configure" className="underline">
                        global setup config
                      </Link>
                      .
                    </span>
                  );
                })()}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/payroll/configure">Edit global config</Link>
            </Button>
            <Button size="sm" onClick={openCreateDialog} disabled={saving} className="gap-2">
              <Plus className="h-4 w-4" />
              New profile
            </Button>
          </div>
        </header>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {!hasProfiles ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
              <Users className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">No pay rule profiles yet</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Create your first profile to use per-employee pay rules. Until then, every
                employee is paid using the global setup config.
              </p>
              <Button onClick={openCreateDialog} className="gap-2">
                <Plus className="h-4 w-4" />
                Create first profile
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-2">
              {profiles.map((p) => {
                const active = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectProfile(p)}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                      active
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{p.name}</p>
                      {p.isDefault && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Star className="h-3 w-3" />
                          Default
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.assignedCount ?? 0} employee{(p.assignedCount ?? 0) === 1 ? '' : 's'} assigned
                    </p>
                  </button>
                );
              })}
            </div>

            {editing && (
              <div className="space-y-5">
                <Card>
                  <CardContent className="space-y-4 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Profile name
                        </label>
                        <Input
                          value={editing.name}
                          onChange={(e) =>
                            setEditing((p) => (p ? { ...p, name: e.target.value } : p))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Base Salary override (₹/mo, optional)
                        </label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="leave blank to use employee's own salary"
                          value={editing.baseSalary ?? ''}
                          onChange={(e) =>
                            setEditing((p) =>
                              p
                                ? {
                                    ...p,
                                    baseSalary: e.target.value ? Number(e.target.value) : null,
                                  }
                                : p,
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {editing.isDefault ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setEditing((p) => (p ? { ...p, isDefault: false } : p))
                          }
                          title="Stop applying this profile to unassigned employees"
                        >
                          <Star className="mr-2 h-4 w-4 fill-current" />
                          Unset default
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => promote(editing)}
                          title="Apply this profile to every unassigned employee"
                        >
                          <Star className="mr-2 h-4 w-4" />
                          Make default
                        </Button>
                      )}
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openPicker(editing)}
                        disabled={saving || !editing.id}
                      >
                        <UserCheck className="mr-2 h-4 w-4" />
                        Assign employees
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteProfile(editing)}
                        disabled={saving}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {editing.assignedCount ?? 0} employees use this profile
                      </span>
                    </div>
                    {editing.isDefault && (
                      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
                        <strong>Heads up:</strong> this profile is the default, so it applies to every
                        employee who isn't explicitly assigned to another profile — not just the ones
                        listed in <em>Assign employees</em>. Unset default if you only want it on the
                        assigned employees.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Accordion type="multiple" defaultValue={['salary-structure']} className="space-y-4">
                  <SalaryStructureSection
                    config={editing.salaryStructure}
                    onChange={(c) => setEditing((p) => (p ? { ...p, salaryStructure: c } : p))}
                    defaultCTC={editing.baseSalary}
                    statutory={editing.statutory}
                    bonus={editing.bonus}
                  />
                  <StatutoryComplianceSection
                    config={editing.statutory}
                    onChange={(c) => setEditing((p) => (p ? { ...p, statutory: c } : p))}
                  />
                  <BonusSection
                    config={editing.bonus}
                    onChange={(c) => setEditing((p) => (p ? { ...p, bonus: c } : p))}
                  />
                  <OvertimePolicySection
                    config={editing.overtime}
                    onChange={(c) => setEditing((p) => (p ? { ...p, overtime: c } : p))}
                  />
                </Accordion>

                <LiveSalaryPreview
                  salary={editing.salaryStructure}
                  statutory={editing.statutory}
                  bonus={editing.bonus}
                  defaultCTC={editing.baseSalary}
                />

                <div className="sticky bottom-4 z-10">
                  <div className="flex items-center justify-end gap-2 rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
                    <Button onClick={saveProfile} disabled={saving} className="gap-2 px-6">
                      <Save className={`h-4 w-4 ${saving ? 'animate-pulse' : ''}`} />
                      {saving ? 'Saving...' : 'Save profile'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bulk-assign dialog. Modal so users can't accidentally edit the
            profile config while the picker is open — would cause confusion
            about whether the saved profile or the in-flight edits apply. */}
        {pickerOpen && pickerProfile && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={closePicker}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-background shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2 border-b border-border p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Assign employees to{' '}
                    <span className="text-primary">{pickerProfile.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pick the employees that should use this pay rule profile, or apply it to everyone at once.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePicker}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2 border-b border-border bg-muted/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Effective from
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="eff-mode"
                      value="current"
                      checked={effMode === 'current'}
                      onChange={() => setEffMode('current')}
                      className="h-3.5 w-3.5"
                    />
                    Current month <span className="text-muted-foreground">({formatMonth(currentMonth())})</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="eff-mode"
                      value="next"
                      checked={effMode === 'next'}
                      onChange={() => setEffMode('next')}
                      className="h-3.5 w-3.5"
                    />
                    Next month <span className="text-muted-foreground">({formatMonth(nextMonth())})</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="eff-mode"
                      value="specific"
                      checked={effMode === 'specific'}
                      onChange={() => setEffMode('specific')}
                      className="h-3.5 w-3.5"
                    />
                    Specific month
                  </label>
                  {effMode === 'specific' && (
                    <input
                      type="month"
                      value={effSpecific}
                      onChange={(e) => setEffSpecific(e.target.value)}
                      className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                    />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Assignments dated in the future are silently ignored until the chosen month arrives — useful for scheduling promotions or grade-band changes.
                </p>
              </div>

              <div className="flex items-center gap-2 border-b border-border p-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search by name, email, department, designation..."
                  className="h-8"
                />
              </div>

              <div className="flex items-center justify-between gap-2 px-4 py-2 text-xs">
                <label className="inline-flex items-center gap-2 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={visibleAllSelected}
                    onChange={(e) => togglePickerVisible(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Select all visible ({filteredEmployees.length})
                </label>
                <span className="text-muted-foreground">
                  {pickerSelection.size} selected
                </span>
              </div>

              <div className="flex-1 overflow-y-auto">
                {employeesLoading ? (
                  <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading employees...
                  </div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {employees.length === 0
                      ? 'No payroll-visible employees yet.'
                      : 'No employees match your search.'}
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {filteredEmployees.map((e) => {
                      const checked = pickerSelection.has(e.employeeId);
                      const currentName =
                        e.currentProfileId && profiles.find((p) => p.id === e.currentProfileId)?.name;
                      const alreadyOnThisProfile = e.currentProfileId === pickerProfile.id;
                      return (
                        <li
                          key={e.employeeId}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePickerOne(e.employeeId)}
                            className="h-4 w-4"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {e.employeeName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {e.email}
                              {e.designation && ` · ${e.designation}`}
                              {e.department && ` · ${e.department}`}
                            </p>
                          </div>
                          {alreadyOnThisProfile ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                On this profile
                              </Badge>
                              {e.effectiveFrom && (
                                <span className="text-[10px] text-muted-foreground">
                                  from {formatMonth(e.effectiveFrom)}
                                </span>
                              )}
                            </div>
                          ) : currentName ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-[10px] text-muted-foreground">
                                currently: {currentName}
                              </span>
                              {e.effectiveFrom && (
                                <span className="text-[10px] text-muted-foreground">
                                  from {formatMonth(e.effectiveFrom)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">unassigned</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={applyToAll}
                    disabled={saving || employeesLoading || employees.length === 0}
                  >
                    Apply to ALL ({employees.length})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAssignmentsForProfile}
                    disabled={saving || employeesLoading}
                  >
                    Clear current assignments
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={closePicker} disabled={saving}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={applyToSelected}
                    disabled={saving || pickerSelection.size === 0}
                    className="gap-2"
                  >
                    <UserCheck className="h-4 w-4" />
                    {saving ? 'Applying...' : `Apply to ${pickerSelection.size} selected`}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create-profile dialog — replaces the browser prompt(). Enter
            submits, Escape cancels (handled by Radix Dialog). */}
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            if (!saving) {
              setCreateOpen(open);
              if (!open) setCreateName('');
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create pay rule profile</DialogTitle>
              <DialogDescription>
                Give this profile a short, descriptive name. You can edit the rules and assign employees after creating it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label htmlFor="profile-name" className="text-xs font-medium text-muted-foreground">
                Profile name
              </label>
              <Input
                id="profile-name"
                autoFocus
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && createName.trim()) {
                    e.preventDefault();
                    void submitCreateProfile();
                  }
                }}
                placeholder='e.g. "Standard", "Senior", "Probation"'
              />
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setCreateOpen(false);
                  setCreateName('');
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={submitCreateProfile}
                disabled={saving || !createName.trim()}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                {saving ? 'Creating...' : 'Create profile'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Generic confirm dialog — replaces every browser confirm() call.
            `tone="destructive"` styles the primary button red for delete /
            apply-to-all / clear-assignments actions. */}
        <Dialog
          open={!!confirmState}
          onOpenChange={(open) => {
            if (!confirmBusy && !open) setConfirmState(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{confirmState?.title}</DialogTitle>
              <DialogDescription>{confirmState?.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setConfirmState(null)}
                disabled={confirmBusy}
              >
                Cancel
              </Button>
              <Button
                variant={confirmState?.tone === 'destructive' ? 'destructive' : 'default'}
                onClick={async () => {
                  if (!confirmState) return;
                  setConfirmBusy(true);
                  try {
                    await confirmState.onConfirm();
                  } finally {
                    setConfirmBusy(false);
                    setConfirmState(null);
                  }
                }}
                disabled={confirmBusy}
              >
                {confirmBusy ? 'Working...' : (confirmState?.confirmLabel ?? 'Confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
