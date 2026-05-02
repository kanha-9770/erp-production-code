'use client';

import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [formsRes, setupRes] = await Promise.all([
        fetch('/api/payroll/forms', { cache: 'no-store' }),
        fetch('/api/payroll/setup', { cache: 'no-store' }),
      ]);
      const formsJson = await formsRes.json();
      const setupJson = await setupRes.json();

      if (!formsRes.ok || !formsJson.success) {
        throw new Error(formsJson.error || 'Failed to load forms');
      }

      setForms(formsJson.forms ?? []);
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

  type Section = 'employee' | 'checkIn' | 'checkOut' | 'leave' | 'holiday';

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

  const handleFormSelect = async (section: Section, formId: string | null) => {
    setSetup((prev) => {
      const blankFields =
        section === 'employee'
          ? EMPTY_SETUP.employee.fields
          : section === 'checkIn'
            ? EMPTY_SETUP.checkIn.fields
            : section === 'checkOut'
              ? EMPTY_SETUP.checkOut.fields
              : section === 'leave'
                ? EMPTY_SETUP.leave.fields
                : EMPTY_SETUP.holiday.fields;
      return { ...prev, [section]: { formId, fields: { ...blankFields } as any } };
    });
    if (section === 'employee') setEmployeeFields([]);
    if (section === 'checkIn') setCheckInFields([]);
    if (section === 'checkOut') setCheckOutFields([]);
    if (section === 'leave') setLeaveFields([]);
    if (section === 'holiday') setHolidayFields([]);
    if (formId) await fetchFields(formId, section);
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

  const formsByModule = useMemo(() => {
    const map = new Map<string, FormOption[]>();
    forms.forEach((f) => {
      const k = f.module?.name ?? 'Other';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(f);
    });
    return Array.from(map.entries());
  }, [forms]);

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

  const FormPicker = ({
    section,
    selectedId,
  }: {
    section: Section;
    selectedId: string | null;
  }) => (
    <Select
      value={selectedId ?? NONE}
      onValueChange={(v) => handleFormSelect(section, v === NONE ? null : v)}
    >
      <SelectTrigger className="h-10">
        <SelectValue placeholder="-- select a form --" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>-- select a form --</SelectItem>
        {formsByModule.map(([moduleName, list]) => (
          <div key={moduleName}>
            <div className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">
              {moduleName}
            </div>
            {list.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );

  const requirementsMet =
    !!setup.employee.formId &&
    (!!setup.employee.fields.salary || !!setup.defaultBaseSalary) &&
    (!!setup.employee.fields.email || !!setup.employee.fields.employeeId) &&
    !!setup.checkIn.formId &&
    !!setup.checkIn.fields.date &&
    !!setup.checkIn.fields.checkInTime;

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
              <FormPicker section="employee" selectedId={setup.employee.formId} />
            </div>

            {setup.employee.formId && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Map fields
                </p>
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
              2. Check-In Form
            </CardTitle>
            <CardDescription>
              The form where employees record their daily check-in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Form</label>
              <FormPicker section="checkIn" selectedId={setup.checkIn.formId} />
            </div>

            {setup.checkIn.formId && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Map fields
                </p>
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
              Used to compute working hours. If skipped, an 8-hour day is assumed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Form</label>
              <FormPicker section="checkOut" selectedId={setup.checkOut.formId} />
            </div>

            {setup.checkOut.formId && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Map fields
                </p>
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
              <FormPicker section="leave" selectedId={setup.leave.formId} />
            </div>

            {setup.leave.formId && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Map fields
                </p>
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
              <FormPicker section="holiday" selectedId={setup.holiday.formId} />
            </div>

            {setup.holiday.formId && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Map fields
                </p>
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
                  Required: Employee form + Salary + (Email or Employee ID); Check-In form + Date + Check-In Time.
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
