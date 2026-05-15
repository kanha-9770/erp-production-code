'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckCircle2,
  Save,
  Settings,
  AlertCircle,
  RefreshCw,
  Briefcase,
  ExternalLink,
  Sparkles,
  IndianRupee,
} from 'lucide-react';

interface Setup {
  defaultBaseSalary: number | null;
  employee: {
    formId: string | null;
    fields: {
      email: string | null;
      employeeId: string | null;
      name: string | null;
      salary: string | null;
      designation: string | null;
      department: string | null;
      dateOfJoining: string | null;
      dateOfLeaving: string | null;
    };
  };
  checkIn: {
    formId: string | null;
    fields: {
      email: string | null;
      employeeId: string | null;
      date: string | null;
      checkInTime: string | null;
    };
  };
  checkOut: {
    formId: string | null;
    fields: {
      email: string | null;
      employeeId: string | null;
      date: string | null;
      checkOutTime: string | null;
    };
  };
  leave: {
    formId: string | null;
    fields: {
      email: string | null;
      employeeId: string | null;
      leaveType: string | null;
      startDate: string | null;
      endDate: string | null;
      days: string | null;
      halfDay: string | null;
      status: string | null;
    };
  };
  holiday: {
    formId: string | null;
    fields: {
      date: string | null;
      name: string | null;
    };
  };
  salaryStructure: SalaryStructureConfig;
  statutory: StatutoryConfig;
  overtime: OvertimeConfig;
  bonus: BonusConfig;
  policy: {
    weeklyOffDays: number[];
    payableBasis: 'monthDays' | 'fixed26' | 'fixed30';
  };
}

const EMPTY_SETUP: Setup = {
  defaultBaseSalary: null,
  employee: {
    formId: null,
    fields: {
      email: null,
      employeeId: null,
      name: null,
      salary: null,
      designation: null,
      department: null,
      dateOfJoining: null,
      dateOfLeaving: null,
    },
  },
  checkIn: { formId: null, fields: { email: null, employeeId: null, date: null, checkInTime: null } },
  checkOut: { formId: null, fields: { email: null, employeeId: null, date: null, checkOutTime: null } },
  leave: {
    formId: null,
    fields: {
      email: null,
      employeeId: null,
      leaveType: null,
      startDate: null,
      endDate: null,
      days: null,
      halfDay: null,
      status: null,
    },
  },
  holiday: { formId: null, fields: { date: null, name: null } },
  salaryStructure: { ...DEFAULT_SALARY_STRUCTURE },
  statutory: { ...DEFAULT_STATUTORY },
  overtime: { ...DEFAULT_OVERTIME },
  bonus: { ...DEFAULT_BONUS },
  policy: { weeklyOffDays: [0], payableBasis: 'monthDays' },
};

const WEEKDAYS = [
  { v: 0, label: 'Sun' },
  { v: 1, label: 'Mon' },
  { v: 2, label: 'Tue' },
  { v: 3, label: 'Wed' },
  { v: 4, label: 'Thu' },
  { v: 5, label: 'Fri' },
  { v: 6, label: 'Sat' },
];

export default function PayrollConfigurePage() {
  const router = useRouter();
  const defaultSalaryId = useId();
  const [mounted, setMounted] = useState(false);
  const [setup, setSetup] = useState<Setup>(EMPTY_SETUP);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [autoConfigured, setAutoConfigured] = useState(false);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const errorBannerRef = useRef<HTMLDivElement | null>(null);
  // Profile-status snapshot so this page can tell the admin where this
  // global config actually sits in the resolution chain. Without it, an
  // admin who's set up a default profile would have no clue that nothing
  // they edit here is being used.
  const [profilesStatus, setProfilesStatus] = useState<{
    profileCount: number;
    defaultProfileName: string | null;
    assignmentCount: number;
  } | null>(null);

  // Pay Rules apply statically to every employee, so the only thing we need
  // up-front is a non-zero default base salary the structure can be split
  // against. Employee/attendance/leave form mappings still live in the saved
  // setup (managed elsewhere) — we just don't surface them on this page.
  const validateSetup = (s: Setup): string[] => {
    const errs: string[] = [];
    if (!s.employee.fields.salary && !s.defaultBaseSalary) {
      errs.push('Set a Default Base Salary so the pay rules can be applied to every employee');
    }
    return errs;
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const integrationsPromise = fetch('/api/attendance/integrations', {
        cache: 'no-store',
        credentials: 'include',
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      // Profiles snapshot is best-effort — if the endpoint 404s on a fresh
      // checkout that hasn't run migrations yet, we just hide the banner.
      const profilesPromise = fetch('/api/payroll/profiles', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const [setupRes, integrationsJson, profilesJson] = await Promise.all([
        fetch('/api/payroll/setup', { cache: 'no-store' }),
        integrationsPromise,
        profilesPromise,
      ]);
      setAutoConfigured(!!integrationsJson?.autoConfigured);
      if (profilesJson?.success && Array.isArray(profilesJson.profiles)) {
        const list = profilesJson.profiles;
        const def = list.find((p: any) => p.isDefault);
        setProfilesStatus({
          profileCount: list.length,
          defaultProfileName: def?.name ?? null,
          assignmentCount: Array.isArray(profilesJson.assignments)
            ? profilesJson.assignments.length
            : 0,
        });
      } else {
        setProfilesStatus(null);
      }

      const setupJson = await setupRes.json();
      const loaded: Setup = setupJson.setup ?? EMPTY_SETUP;
      setSetup(loaded);

      const dropped: string[] = Array.isArray(setupJson.droppedFormIds) ? setupJson.droppedFormIds : [];
      if (dropped.length > 0) {
        setStaleNotice(
          `${dropped.length} previously-bound form${dropped.length === 1 ? '' : 's'} no longer exist in this organization. Re-bind them from Manage form links if needed.`,
        );
      } else {
        setStaleNotice(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted) loadAll();
  }, [mounted]);

  const toggleWeeklyOff = (day: number) => {
    setSetup((prev) => {
      const has = prev.policy.weeklyOffDays.includes(day);
      const next = has
        ? prev.policy.weeklyOffDays.filter((d) => d !== day)
        : [...prev.policy.weeklyOffDays, day].sort((a, b) => a - b);
      return { ...prev, policy: { ...prev.policy, weeklyOffDays: next } };
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const clientErrors = validateSetup(setup);
    if (clientErrors.length > 0) {
      setError(clientErrors.join('. '));
      setSaving(false);
      requestAnimationFrame(() => {
        errorBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }
    try {
      const res = await fetch('/api/payroll/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      setSuccess('Pay rules saved. These now apply to every employee in the next payroll run.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      requestAnimationFrame(() => {
        errorBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading pay rules...</span>
        </div>
      </div>
    );
  }

  const baseSalaryReady = !!setup.employee.fields.salary || !!setup.defaultBaseSalary;

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
                Payroll Configuration
              </h1>
              <Badge variant={baseSalaryReady ? 'default' : 'secondary'}>
                {baseSalaryReady ? 'Ready' : 'Set base salary'}
              </Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              These pay rules apply statically to every employee. Activate the components below —
              only enabled fields contribute to the salary calculation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/payroll/profiles">
                Pay rule profiles
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/attendance-config">
                Manage form links
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={loadAll} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Reload
            </Button>
          </div>
        </header>

        {/* Show the admin where this global config sits in the resolution
            chain. Three states matter:
              - No profiles at all → this config drives every employee.
              - Profiles exist, none default → this config drives every
                unassigned employee; assigned ones use their profile.
              - A default profile exists → this config is effectively unused;
                every unassigned employee routes to the default profile
                instead. The banner makes that visible so the admin doesn't
                edit dead config. */}
        {profilesStatus && profilesStatus.profileCount > 0 && (
          <div
            className={`flex flex-col gap-1 rounded-md border px-4 py-3 text-sm ${
              profilesStatus.defaultProfileName
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100'
                : 'border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-100'
            }`}
          >
            <p className="font-medium">
              {profilesStatus.defaultProfileName ? (
                <>
                  Heads up — this global config is currently <strong>unused</strong>.
                </>
              ) : (
                <>
                  This global config is the fallback for unassigned employees.
                </>
              )}
            </p>
            <p className="text-xs">
              {profilesStatus.profileCount} pay rule profile{profilesStatus.profileCount === 1 ? '' : 's'} exist
              {' · '}
              {profilesStatus.defaultProfileName ? (
                <>
                  default profile: <strong>{profilesStatus.defaultProfileName}</strong> (catches every
                  unassigned employee, so the rules below don't apply to anyone right now)
                </>
              ) : (
                <>no default profile set, so any employee without an explicit assignment uses these rules</>
              )}
              {' · '}
              {profilesStatus.assignmentCount} employee{profilesStatus.assignmentCount === 1 ? '' : 's'} explicitly assigned to a profile.
            </p>
            <p className="text-xs">
              <Link href="/payroll/profiles" className="font-medium underline">
                Manage pay rule profiles →
              </Link>
            </p>
          </div>
        )}

        {autoConfigured && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              <strong>Form links detected.</strong> Employee, attendance, and leave forms are wired up via{' '}
              <Link href="/settings/attendance-config" className="underline">Manage form links</Link>.
            </span>
          </div>
        )}

        {error && (
          <div
            ref={errorBannerRef}
            className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              {error.split('. ').filter(Boolean).map((msg, i) => (
                <p key={i}>{msg}</p>
              ))}
            </div>
          </div>
        )}
        {staleNotice && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{staleNotice}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="rounded-md bg-primary/10 p-1.5">
                <IndianRupee className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Default Base Salary</p>
                <p className="text-xs text-muted-foreground">
                  Monthly CTC used when an employee record has no salary value of its own.
                  The structure below is applied against this amount.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 pt-3 sm:grid-cols-[200px_1fr] sm:items-center">
              <label htmlFor={defaultSalaryId} className="text-sm font-medium text-foreground">
                Default Base Salary
              </label>
              <Input
                id={defaultSalaryId}
                className="h-9 w-full sm:w-64"
                type="number"
                min={0}
                placeholder="e.g. 30000"
                value={setup.defaultBaseSalary ?? ''}
                onChange={(e) =>
                  setSetup((p) => ({
                    ...p,
                    defaultBaseSalary: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>

        <Accordion type="multiple" defaultValue={['salary-structure']} className="w-full space-y-4">
          <SalaryStructureSection
            config={setup.salaryStructure}
            onChange={(c) => setSetup((p) => ({ ...p, salaryStructure: c }))}
            defaultCTC={setup.defaultBaseSalary}
            statutory={setup.statutory}
            bonus={setup.bonus}
          />

          <StatutoryComplianceSection
            config={setup.statutory}
            onChange={(c) => setSetup((p) => ({ ...p, statutory: c }))}
          />

          <BonusSection
            config={setup.bonus}
            onChange={(c) => setSetup((p) => ({ ...p, bonus: c }))}
          />

          <OvertimePolicySection
            config={setup.overtime}
            onChange={(c) => setSetup((p) => ({ ...p, overtime: c }))}
          />

          <AccordionItem value="working-days" className="border rounded-lg bg-card overflow-hidden">
            <AccordionTrigger className="px-5 hover:no-underline hover:bg-muted/50 data-[state=open]:bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-primary/10 p-1.5">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-base">Working Days Policy</div>
                  <div className="text-xs text-muted-foreground font-normal">Tells the calculator which days are paid weekly offs and how to convert a monthly salary into a daily rate.</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5 pt-2">
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Weekly off days</p>
                  <p className="text-xs text-muted-foreground">
                    Selected days are paid even without a check-in. Default: Sunday.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((d) => {
                      const active = setup.policy.weeklyOffDays.includes(d.v);
                      return (
                        <button
                          key={d.v}
                          type="button"
                          onClick={() => toggleWeeklyOff(d.v)}
                          aria-pressed={active}
                          aria-label={`${d.label} weekly off`}
                          className={`h-9 min-w-[3rem] rounded-md border px-3 text-sm font-medium transition-colors ${
                            active
                              ? 'border-primary/30 bg-primary/10 text-primary'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 border-t border-border pt-4 sm:grid-cols-[200px_1fr] sm:items-center">
                  <div>
                    <p className="text-sm font-medium text-foreground">Daily rate basis</p>
                    <p className="text-xs text-muted-foreground">
                      Divisor used to convert monthly salary into a per-day rate
                    </p>
                  </div>
                  <Select
                    value={setup.policy.payableBasis}
                    onValueChange={(v) =>
                      setSetup((p) => ({
                        ...p,
                        policy: { ...p.policy, payableBasis: v as Setup['policy']['payableBasis'] },
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 w-full sm:w-64">
                      <SelectValue placeholder="Select basis..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthDays">Actual days in the month (28–31)</SelectItem>
                      <SelectItem value="fixed26">Fixed 26 days</SelectItem>
                      <SelectItem value="fixed30">Fixed 30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <LiveSalaryPreview
          salary={setup.salaryStructure}
          statutory={setup.statutory}
          bonus={setup.bonus}
          defaultCTC={setup.defaultBaseSalary}
        />

        <div className="sticky bottom-4 z-10 space-y-2">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-700 shadow-md backdrop-blur">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Fix the issue{error.split('. ').filter(Boolean).length === 1 ? '' : 's'} above before saving.
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur sm:justify-end">
            <Button variant="ghost" onClick={() => router.push('/payroll')}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="gap-2 px-6">
              <Save className={`h-4 w-4 ${saving ? 'animate-pulse' : ''}`} />
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
