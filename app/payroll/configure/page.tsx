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
}

const EMPTY_SETUP: Setup = {
  defaultBaseSalary: null,
  employee: {
    formId: null,
    fields: { email: null, employeeId: null, name: null, salary: null, designation: null, department: null },
  },
  checkIn: { formId: null, fields: { email: null, employeeId: null, date: null, checkInTime: null } },
  checkOut: { formId: null, fields: { email: null, employeeId: null, date: null, checkOutTime: null } },
};

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

  const fetchFields = async (
    formId: string,
    section: 'employee' | 'checkIn' | 'checkOut',
  ): Promise<void> => {
    try {
      const res = await fetch(`/api/payroll/form-fields?formId=${formId}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load form fields');
      const fields: FieldOption[] = json.fields ?? [];
      if (section === 'employee') setEmployeeFields(fields);
      if (section === 'checkIn') setCheckInFields(fields);
      if (section === 'checkOut') setCheckOutFields(fields);
    } catch (e) {
      console.error('[payroll-configure] fetchFields error', e);
    }
  };

  const handleFormSelect = async (
    section: 'employee' | 'checkIn' | 'checkOut',
    formId: string | null,
  ) => {
    setSetup((prev) => {
      const blankFields =
        section === 'employee'
          ? { email: null, employeeId: null, name: null, salary: null, designation: null, department: null }
          : section === 'checkIn'
            ? { email: null, employeeId: null, date: null, checkInTime: null }
            : { email: null, employeeId: null, date: null, checkOutTime: null };
      return { ...prev, [section]: { formId, fields: blankFields as any } };
    });
    if (section === 'employee') setEmployeeFields([]);
    if (section === 'checkIn') setCheckInFields([]);
    if (section === 'checkOut') setCheckOutFields([]);
    if (formId) await fetchFields(formId, section);
  };

  const updateMapping = (
    section: 'employee' | 'checkIn' | 'checkOut',
    field: string,
    value: string | null,
  ) => {
    setSetup((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        fields: { ...prev[section].fields, [field]: value },
      },
    }));
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
    section: 'employee' | 'checkIn' | 'checkOut';
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
