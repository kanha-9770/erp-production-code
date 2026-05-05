'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  CheckCircle2,
  Save,
  Settings,
  User,
  LogIn,
  LogOut,
  AlertCircle,
  RefreshCw,
  CalendarOff,
  CalendarDays,
  Briefcase,
  Link as LinkIcon,
  ExternalLink,
  Sparkles,
  Wand2,
} from 'lucide-react';

interface FormOption {
  id: string;
  name: string;
  description?: string | null;
  module: { name: string };
}

interface FieldOption {
  id: string;
  label: string;
  type: string;
}

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

const NONE = '__none__';

function FieldMappingRow({
  label,
  description,
  required,
  fields,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  required?: boolean;
  fields: FieldOption[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[200px_1fr] sm:items-center">
      <div>
        <p className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="-- not mapped --" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>-- not mapped --</SelectItem>
          {fields.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.label}{' '}
              <span className="text-xs text-muted-foreground">({f.type})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Heuristic "name → key" match used by the auto-fill buttons. The first hint
// that matches (case-insensitive substring) wins. Centralised so adding a new
// section field = one entry here, not a new branch in the auto-fill code.
const FIELD_NAME_HINTS: Record<string, string[]> = {
  // Employee
  email: ['email', 'e-mail', 'mail'],
  employeeId: ['employee id', 'emp id', 'empid', 'employee code', 'staff id'],
  name: ['name', 'full name', 'employee name'],
  salary: ['salary', 'ctc', 'monthly salary', 'base salary', 'gross'],
  designation: ['designation', 'role', 'job title', 'position'],
  department: ['department', 'dept', 'division'],
  dateOfJoining: ['date of joining', 'doj', 'joining date', 'hire date', 'start date'],
  dateOfLeaving: ['date of leaving', 'dol', 'leaving date', 'exit date', 'end date'],
  // Check-in / Check-out
  date: ['date', 'attendance date', 'punch date', 'day'],
  checkInTime: ['check in', 'check-in', 'checkin', 'in time', 'login', 'punch in'],
  checkOutTime: ['check out', 'check-out', 'checkout', 'out time', 'logout', 'punch out'],
  // Leave
  startDate: ['start date', 'from date', 'leave start', 'from'],
  endDate: ['end date', 'to date', 'leave end', 'till', 'to'],
  leaveType: ['leave type', 'type of leave', 'category', 'leave category'],
  status: ['status', 'approval', 'state', 'approved'],
  halfDay: ['half day', 'half-day', 'halfday', 'is half'],
  days: ['days', 'no of days', 'no. of days', 'duration'],
};

function suggestFieldId(fields: FieldOption[], key: string): string | null {
  const hints = FIELD_NAME_HINTS[key] ?? [key.toLowerCase()];
  // Exact match first, then substring.
  for (const hint of hints) {
    const exact = fields.find((f) => f.label.trim().toLowerCase() === hint);
    if (exact) return exact.id;
  }
  for (const hint of hints) {
    const fuzzy = fields.find((f) => f.label.toLowerCase().includes(hint));
    if (fuzzy) return fuzzy.id;
  }
  return null;
}

type Section = 'employee' | 'checkIn' | 'checkOut' | 'leave' | 'holiday';

function AutoFillButton({
  section,
  onAutoFill,
  fieldsLoaded,
}: {
  section: Section;
  onAutoFill: (section: Section) => number;
  fieldsLoaded: boolean;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {feedback && (
        <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
          {feedback}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!fieldsLoaded}
        onClick={() => {
          const filled = onAutoFill(section);
          setFeedback(
            filled > 0
              ? `Auto-filled ${filled} field${filled === 1 ? '' : 's'}`
              : 'Nothing to fill — already mapped or no name match',
          );
          setTimeout(() => setFeedback(null), 3500);
        }}
        className="h-7 gap-1.5 text-xs"
        title="Match field names to slots automatically. Won't overwrite values you've already set."
      >
        <Wand2 className="h-3 w-3" />
        Auto-fill
      </Button>
    </div>
  );
}

export default function PayrollConfigurePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [setup, setSetup] = useState<Setup>(EMPTY_SETUP);
  const [employeeFields, setEmployeeFields] = useState<FieldOption[]>([]);
  const [checkInFields, setCheckInFields] = useState<FieldOption[]>([]);
  const [checkOutFields, setCheckOutFields] = useState<FieldOption[]>([]);
  const [leaveFields, setLeaveFields] = useState<FieldOption[]>([]);
  const [holidayFields, setHolidayFields] = useState<FieldOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Set when the integrations endpoint auto-detected and bootstrapped form
  // bindings on this load. Surfaces an emerald "auto-configured" banner so
  // admins know where the values came from.
  const [autoConfigured, setAutoConfigured] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // Hit integrations FIRST. The GET handler there auto-detects forms with
      // recognisable names ("Check In", "Holiday Calendar", ...) and persists
      // them as bindings on first read — so by the time we load the payroll
      // setup below, the form ids are already in place. This means visiting
      // /payroll/configure for the first time is enough to start payroll
      // working; admins don't need to also visit /settings/attendance-config.
      const integrationsPromise = fetch('/api/attendance/integrations', {
        cache: 'no-store',
        credentials: 'include',
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      // Forms list is independent of the integrations bootstrap so we fetch
      // it in parallel.
      const [formsRes, integrationsJson] = await Promise.all([
        fetch('/api/payroll/forms', { cache: 'no-store' }),
        integrationsPromise,
      ]);
      const formsJson = await formsRes.json();

      if (!formsRes.ok || !formsJson.success) {
        throw new Error(formsJson.error || 'Failed to load forms');
      }
      setForms(formsJson.forms ?? []);
      setAutoConfigured(!!integrationsJson?.autoConfigured);

      // Now load the payroll setup — the integrations bootstrap may have just
      // written into the same `attendanceFieldMappings` row this reads from.
      const setupRes = await fetch('/api/payroll/setup', { cache: 'no-store' });
      const setupJson = await setupRes.json();
      const loaded: Setup = setupJson.setup ?? EMPTY_SETUP;
      setSetup(loaded);

      await Promise.all([
        loaded.employee.formId ? fetchFields(loaded.employee.formId, 'employee') : Promise.resolve(),
        loaded.checkIn.formId ? fetchFields(loaded.checkIn.formId, 'checkIn') : Promise.resolve(),
        loaded.checkOut.formId ? fetchFields(loaded.checkOut.formId, 'checkOut') : Promise.resolve(),
        loaded.leave?.formId ? fetchFields(loaded.leave.formId, 'leave') : Promise.resolve(),
        loaded.holiday?.formId ? fetchFields(loaded.holiday.formId, 'holiday') : Promise.resolve(),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const fetchFields = async (formId: string, section: Section): Promise<void> => {
    try {
      const res = await fetch(`/api/payroll/form-fields?formId=${formId}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load form fields');
      const fields: FieldOption[] = json.fields ?? [];
      if (section === 'employee') setEmployeeFields(fields);
      if (section === 'checkIn') setCheckInFields(fields);
      if (section === 'checkOut') setCheckOutFields(fields);
      if (section === 'leave') setLeaveFields(fields);
      if (section === 'holiday') setHolidayFields(fields);
    } catch (e) {
      console.error('[payroll-configure] fetchFields error', e);
    }
  };

  const updateMapping = (section: Section, field: string, value: string | null) => {
    setSetup((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] as any),
        fields: { ...(prev[section] as any).fields, [field]: value },
      },
    }));
  };

  // Auto-fill a section's field mappings by name-matching the form's fields
  // against FIELD_NAME_HINTS. Only fills slots that are currently empty so we
  // don't trample explicit admin choices. Returns the count of newly filled
  // slots so the UI can give a "filled N of M" toast.
  const autoFillSection = (section: Section): number => {
    const fieldList =
      section === 'employee'
        ? employeeFields
        : section === 'checkIn'
          ? checkInFields
          : section === 'checkOut'
            ? checkOutFields
            : section === 'leave'
              ? leaveFields
              : holidayFields;
    if (fieldList.length === 0) return 0;

    let filled = 0;
    setSetup((prev) => {
      const sectionState = prev[section] as any;
      const currentFields = { ...sectionState.fields };
      for (const key of Object.keys(currentFields)) {
        if (currentFields[key]) continue; // never overwrite a manual choice
        const guess = suggestFieldId(fieldList, key);
        if (guess) {
          currentFields[key] = guess;
          filled++;
        }
      }
      return {
        ...prev,
        [section]: { ...sectionState, fields: currentFields },
      };
    });
    return filled;
  };

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
    try {
      const res = await fetch('/api/payroll/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      setSuccess('Configuration saved. You can now generate payroll.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading configuration...</span>
        </div>
      </div>
    );
  }

  /**
   * Read-only display for forms that are linked centrally via Attendance
   * Configuration. The form choice itself is no longer editable on this page —
   * admins configure once at /settings/attendance-config and payroll, leave
   * management, and the attendance widget all read from the same record.
   * Field mappings remain editable here because they depend on which form
   * the admin picked.
   */
  const LinkedFormDisplay = ({ selectedId }: { selectedId: string | null }) => {
    const form = forms.find((f) => f.id === selectedId);
    if (!selectedId || !form) {
      return (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            Not linked yet — configure centrally for payroll, leave, and attendance to share it.
          </div>
          <Link
            href="/settings/attendance-config"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Link a form <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      );
    }
    return (
      <div className="rounded-md border border-border bg-muted/20 px-3 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <LinkIcon className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">{form.name}</span>
            <Badge
              variant="outline"
              className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"
            >
              Linked
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set in Attendance Configuration · {form.module.name}
          </p>
        </div>
        <Link
          href="/settings/attendance-config"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
        >
          Change <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    );
  };

  // Check-In form binding is OPTIONAL — payroll can also read attendance from
  // the native /attendance widget rows directly. We only require the Employee
  // form (it's the only place salary lives) and that some salary source is
  // resolvable (mapped column OR default fallback). If admins DO bind a check-
  // in form, they should map date + time too (otherwise the form can't be
  // parsed) — but with no form, the widget covers it without any mapping.
  const checkInFormFullyMapped =
    !setup.checkIn.formId ||
    (!!setup.checkIn.fields.date && !!setup.checkIn.fields.checkInTime);
  const requirementsMet =
    !!setup.employee.formId &&
    (!!setup.employee.fields.salary || !!setup.defaultBaseSalary) &&
    (!!setup.employee.fields.email || !!setup.employee.fields.employeeId) &&
    checkInFormFullyMapped;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <Link
              href="/payroll"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Payroll
            </Link>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Payroll Configuration
              </h1>
              <Badge variant={requirementsMet ? 'default' : 'secondary'}>
                {requirementsMet ? 'Ready' : 'Incomplete'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Tell payroll which forms hold your employees and attendance — and which fields
              contain salary, dates and check-in/check-out times.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadAll} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Reload
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={saving || loading}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Save className={`h-4 w-4 ${saving ? 'animate-pulse' : ''}`} />
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </header>

        {autoConfigured && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100 flex items-start gap-2">
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
            <div className="space-y-1">
              <p>
                <strong>Auto-configured.</strong> We detected forms with
                familiar names (Check In, Holiday Calendar, ...) in your
                workspace and bound them to the matching attendance slots.
                You can review the mappings below or change them in{' '}
                <Link
                  href="/settings/attendance-config"
                  className="underline font-medium hover:text-emerald-700"
                >
                  Attendance Configuration
                </Link>
                .
              </p>
            </div>
          </div>
        )}

        <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-900 dark:text-blue-100 flex items-start gap-2">
          <LinkIcon className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
          <div className="space-y-1">
            <p>
              <strong>Form bindings are shared.</strong> Employee, check-in,
              check-out, leave, and holiday forms are configured once in{' '}
              <Link
                href="/settings/attendance-config"
                className="underline font-medium hover:text-blue-700"
              >
                Attendance Configuration
              </Link>
              . Payroll, the attendance widget, and leave management all read
              from the same row — no duplicate setup needed here.
            </p>
            <p className="text-xs text-blue-800/80 dark:text-blue-200/80">
              Field mappings (which column = date, check-in time, etc.) stay
              editable below since they depend on the form's specific schema.
              Use the <strong>Auto-fill</strong> button on each section to
              match field names automatically.
            </p>
          </div>
        </div>

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

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              1. Employee Profile Form
            </CardTitle>
            <CardDescription>
              The form that holds your employee master data — name, salary, department.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Form</label>
              <LinkedFormDisplay selectedId={setup.employee.formId} />
            </div>

            {setup.employee.formId && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Map fields
                  </p>
                  <AutoFillButton section="employee" onAutoFill={autoFillSection} fieldsLoaded={employeeFields.length > 0} />
                </div>
                <FieldMappingRow
                  label="Salary (CTC)"
                  description="Monthly base salary; falls back to default below if blank"
                  fields={employeeFields}
                  value={setup.employee.fields.salary}
                  onChange={(v) => updateMapping('employee', 'salary', v)}
                />
                <FieldMappingRow
                  label="Email"
                  description="Required if Employee ID is not mapped"
                  fields={employeeFields}
                  value={setup.employee.fields.email}
                  onChange={(v) => updateMapping('employee', 'email', v)}
                />
                <FieldMappingRow
                  label="Employee ID"
                  description="Required if Email is not mapped"
                  fields={employeeFields}
                  value={setup.employee.fields.employeeId}
                  onChange={(v) => updateMapping('employee', 'employeeId', v)}
                />
                <FieldMappingRow
                  label="Employee Name"
                  fields={employeeFields}
                  value={setup.employee.fields.name}
                  onChange={(v) => updateMapping('employee', 'name', v)}
                />
                <FieldMappingRow
                  label="Designation"
                  fields={employeeFields}
                  value={setup.employee.fields.designation}
                  onChange={(v) => updateMapping('employee', 'designation', v)}
                />
                <FieldMappingRow
                  label="Department"
                  fields={employeeFields}
                  value={setup.employee.fields.department}
                  onChange={(v) => updateMapping('employee', 'department', v)}
                />
                <FieldMappingRow
                  label="Date of Joining"
                  description="Optional — enables pro-rata for new joiners"
                  fields={employeeFields}
                  value={setup.employee.fields.dateOfJoining}
                  onChange={(v) => updateMapping('employee', 'dateOfJoining', v)}
                />
                <FieldMappingRow
                  label="Date of Leaving"
                  description="Optional — enables pro-rata for exits / F&F"
                  fields={employeeFields}
                  value={setup.employee.fields.dateOfLeaving}
                  onChange={(v) => updateMapping('employee', 'dateOfLeaving', v)}
                />

                <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-[200px_1fr] sm:items-center">
                  <div>
                    <p className="text-sm font-medium text-foreground">Default Base Salary</p>
                    <p className="text-xs text-muted-foreground">
                      Used when an employee has no salary value (₹/month)
                    </p>
                  </div>
                  <input
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
                    className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogIn className="h-5 w-5 text-primary" />
              2. Check-In Form{' '}
              <Badge variant="outline" className="ml-2 text-xs">
                Optional
              </Badge>
            </CardTitle>
            <CardDescription>
              <span className="block">
                Bind a custom form here only if your team records check-ins on a
                form you built. If you skip this, payroll automatically reads
                from the built-in <code className="text-xs">/attendance</code>{' '}
                widget — no setup required.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Form</label>
              <LinkedFormDisplay selectedId={setup.checkIn.formId} />
              {!setup.checkIn.formId && (
                <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  No form linked — payroll will use the static{' '}
                  <code className="text-xs">attendance_records</code> table
                  populated by the attendance widget.
                </p>
              )}
            </div>

            {setup.checkIn.formId && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Map fields
                  </p>
                  <AutoFillButton section="checkIn" onAutoFill={autoFillSection} fieldsLoaded={checkInFields.length > 0} />
                </div>
                <FieldMappingRow
                  label="Date"
                  description="The attendance date"
                  required
                  fields={checkInFields}
                  value={setup.checkIn.fields.date}
                  onChange={(v) => updateMapping('checkIn', 'date', v)}
                />
                <FieldMappingRow
                  label="Check-In Time"
                  description="Time the employee checked in"
                  required
                  fields={checkInFields}
                  value={setup.checkIn.fields.checkInTime}
                  onChange={(v) => updateMapping('checkIn', 'checkInTime', v)}
                />
                <FieldMappingRow
                  label="Email"
                  description="Used to match employees; falls back to submitter user"
                  fields={checkInFields}
                  value={setup.checkIn.fields.email}
                  onChange={(v) => updateMapping('checkIn', 'email', v)}
                />
                <FieldMappingRow
                  label="Employee ID"
                  description="Alternative match if email is not stored on check-ins"
                  fields={checkInFields}
                  value={setup.checkIn.fields.employeeId}
                  onChange={(v) => updateMapping('checkIn', 'employeeId', v)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-primary" />
              3. Check-Out Form{' '}
              <Badge variant="outline" className="ml-2 text-xs">
                Optional
              </Badge>
            </CardTitle>
            <CardDescription>
              Used to compute working hours. Skip this and the built-in
              attendance widget's check-out timestamps cover it; if neither is
              available, an 8-hour day is assumed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Form</label>
              <LinkedFormDisplay selectedId={setup.checkOut.formId} />
              {!setup.checkOut.formId && (
                <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  No form linked — payroll uses{' '}
                  <code className="text-xs">attendance_records.check_out_at</code>{' '}
                  from the attendance widget if available.
                </p>
              )}
            </div>

            {setup.checkOut.formId && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Map fields
                  </p>
                  <AutoFillButton section="checkOut" onAutoFill={autoFillSection} fieldsLoaded={checkOutFields.length > 0} />
                </div>
                <FieldMappingRow
                  label="Date"
                  fields={checkOutFields}
                  value={setup.checkOut.fields.date}
                  onChange={(v) => updateMapping('checkOut', 'date', v)}
                />
                <FieldMappingRow
                  label="Check-Out Time"
                  fields={checkOutFields}
                  value={setup.checkOut.fields.checkOutTime}
                  onChange={(v) => updateMapping('checkOut', 'checkOutTime', v)}
                />
                <FieldMappingRow
                  label="Email"
                  fields={checkOutFields}
                  value={setup.checkOut.fields.email}
                  onChange={(v) => updateMapping('checkOut', 'email', v)}
                />
                <FieldMappingRow
                  label="Employee ID"
                  fields={checkOutFields}
                  value={setup.checkOut.fields.employeeId}
                  onChange={(v) => updateMapping('checkOut', 'employeeId', v)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarOff className="h-5 w-5 text-primary" />
              4. Leave Application Form{' '}
              <Badge variant="outline" className="ml-2 text-xs">
                Optional
              </Badge>
            </CardTitle>
            <CardDescription>
              The form where employees submit leave requests. Leave Type values are matched
              (case-insensitive) against rules under <strong>Leave Rules</strong> to decide
              paid vs. unpaid and any deduction percentage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Form</label>
              <LinkedFormDisplay selectedId={setup.leave.formId} />
            </div>

            {setup.leave.formId && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Map fields
                  </p>
                  <AutoFillButton section="leave" onAutoFill={autoFillSection} fieldsLoaded={leaveFields.length > 0} />
                </div>
                <FieldMappingRow
                  label="Start Date"
                  description="First day of the leave"
                  required
                  fields={leaveFields}
                  value={setup.leave.fields.startDate}
                  onChange={(v) => updateMapping('leave', 'startDate', v)}
                />
                <FieldMappingRow
                  label="End Date"
                  description="Last day of the leave (defaults to start date if blank on a row)"
                  fields={leaveFields}
                  value={setup.leave.fields.endDate}
                  onChange={(v) => updateMapping('leave', 'endDate', v)}
                />
                <FieldMappingRow
                  label="Leave Type"
                  description="Free-text or dropdown that names the rule (e.g. 'Sick Leave', 'Casual Leave')"
                  required
                  fields={leaveFields}
                  value={setup.leave.fields.leaveType}
                  onChange={(v) => updateMapping('leave', 'leaveType', v)}
                />
                <FieldMappingRow
                  label="Status"
                  description="If mapped, only rows marked 'approved' / 'yes' / 'true' are counted"
                  fields={leaveFields}
                  value={setup.leave.fields.status}
                  onChange={(v) => updateMapping('leave', 'status', v)}
                />
                <FieldMappingRow
                  label="Half Day"
                  description="Optional boolean — counts the leave as 0.5 days"
                  fields={leaveFields}
                  value={setup.leave.fields.halfDay}
                  onChange={(v) => updateMapping('leave', 'halfDay', v)}
                />
                <FieldMappingRow
                  label="Days"
                  description="Optional override; ignored if start/end dates are present"
                  fields={leaveFields}
                  value={setup.leave.fields.days}
                  onChange={(v) => updateMapping('leave', 'days', v)}
                />
                <FieldMappingRow
                  label="Email"
                  description="Used to match the employee — falls back to the submitter user"
                  fields={leaveFields}
                  value={setup.leave.fields.email}
                  onChange={(v) => updateMapping('leave', 'email', v)}
                />
                <FieldMappingRow
                  label="Employee ID"
                  fields={leaveFields}
                  value={setup.leave.fields.employeeId}
                  onChange={(v) => updateMapping('leave', 'employeeId', v)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              5. Holiday Calendar Form{' '}
              <Badge variant="outline" className="ml-2 text-xs">
                Optional
              </Badge>
            </CardTitle>
            <CardDescription>
              One row per company holiday. Listed days are paid for everyone and are not
              counted against leave or attendance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Form</label>
              <LinkedFormDisplay selectedId={setup.holiday.formId} />
            </div>

            {setup.holiday.formId && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Map fields
                  </p>
                  <AutoFillButton section="holiday" onAutoFill={autoFillSection} fieldsLoaded={holidayFields.length > 0} />
                </div>
                <FieldMappingRow
                  label="Date"
                  description="The holiday date"
                  required
                  fields={holidayFields}
                  value={setup.holiday.fields.date}
                  onChange={(v) => updateMapping('holiday', 'date', v)}
                />
                <FieldMappingRow
                  label="Name"
                  description="Optional — surfaced in the payslip breakdown"
                  fields={holidayFields}
                  value={setup.holiday.fields.name}
                  onChange={(v) => updateMapping('holiday', 'name', v)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              6. Working Days Policy
            </CardTitle>
            <CardDescription>
              Tells the calculator which days are paid weekly offs and how to convert a
              monthly salary into a daily rate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-[200px_1fr] sm:items-center">
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
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthDays">Actual days in the month (28–31)</SelectItem>
                  <SelectItem value="fixed26">Fixed 26 days</SelectItem>
                  <SelectItem value="fixed30">Fixed 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-muted/30">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              {requirementsMet ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {requirementsMet
                    ? 'All required mappings are in place'
                    : 'Required mappings missing'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Required: Employee form + Salary (or Default Base Salary) +
                  (Email or Employee ID). Check-in/check-out forms are
                  optional — payroll falls back to the{' '}
                  <code className="text-xs">attendance_records</code> table
                  populated by the built-in widget.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push('/payroll')}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving} className="gap-2">
                <Save className={`h-4 w-4 ${saving ? 'animate-pulse' : ''}`} />
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
