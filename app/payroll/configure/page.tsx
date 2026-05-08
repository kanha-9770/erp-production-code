'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  SalaryStructureSection,
  StatutoryComplianceSection,
  OvertimePolicySection,
  DEFAULT_SALARY_STRUCTURE,
  DEFAULT_STATUTORY,
  DEFAULT_OVERTIME,
  type SalaryStructureConfig,
  type StatutoryConfig,
  type OvertimeConfig,
} from '@/components/payroll/payroll-enterprise-config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  salaryStructure: SalaryStructureConfig;
  statutory: StatutoryConfig;
  overtime: OvertimeConfig;
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
  const controlId = useId();
  const descriptionId = description ? `${controlId}-description` : undefined;

  const isValidValue = !value || fields.some(f => f.id === value);
  const displayValue = isValidValue ? (value ?? NONE) : NONE;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[200px_1fr] sm:items-center">
      <div>
        <label htmlFor={controlId} className="text-sm font-medium text-foreground">
          {label}
          {required && (
            <span className="ml-1 text-red-500" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> required</span>}
        </label>
        {description && (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <Select
        value={displayValue}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger
          id={controlId}
          aria-describedby={descriptionId}
          aria-invalid={required && !value ? true : undefined}
          className="h-9"
        >
          <SelectValue placeholder="Not mapped" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not mapped</SelectItem>
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

const FIELD_NAME_HINTS: Record<string, string[]> = {
  email: ['email', 'e-mail', 'mail'],
  employeeId: ['employee id', 'emp id', 'empid', 'employee code', 'staff id'],
  name: ['name', 'full name', 'employee name'],
  salary: ['salary', 'ctc', 'monthly salary', 'base salary', 'gross'],
  designation: ['designation', 'role', 'job title', 'position'],
  department: ['department', 'dept', 'division'],
  dateOfJoining: ['date of joining', 'doj', 'joining date', 'hire date', 'start date'],
  dateOfLeaving: ['date of leaving', 'dol', 'leaving date', 'exit date', 'end date'],
  date: ['date', 'attendance date', 'punch date', 'day'],
  checkInTime: ['check in', 'check-in', 'checkin', 'in time', 'login', 'punch in'],
  checkOutTime: ['check out', 'check-out', 'checkout', 'out time', 'logout', 'punch out'],
  startDate: ['start date', 'from date', 'leave start', 'from'],
  endDate: ['end date', 'to date', 'leave end', 'till', 'to'],
  leaveType: ['leave type', 'type of leave', 'category', 'leave category'],
  status: ['status', 'approval', 'state', 'approved'],
  halfDay: ['half day', 'half-day', 'halfday', 'is half'],
  days: ['days', 'no of days', 'no. of days', 'duration'],
};

function suggestFieldId(fields: FieldOption[], key: string): string | null {
  const hints = FIELD_NAME_HINTS[key] ?? [key.toLowerCase()];
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
        <span className="text-[11px] text-emerald-700 dark:text-emerald-400" aria-live="polite">
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
              : 'Nothing to fill. Fields are already mapped or names did not match.',
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

function ReadinessItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
      )}
      <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </li>
  );
}

export default function PayrollConfigurePage() {
  const router = useRouter();
  const defaultSalaryId = useId();
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
  const [autoConfigured, setAutoConfigured] = useState(false);

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
        if (currentFields[key]) continue;
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

  if (!mounted || (loading && forms.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading payroll settings...</span>
        </div>
      </div>
    );
  }

  const LinkedFormDisplay = ({ selectedId }: { selectedId: string | null }) => {
    const form = forms.find((f) => f.id === selectedId);
    if (!selectedId || !form) {
      return (
        <div className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            No form linked.
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
      <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
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
            {form.module.name}
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

  const checkInFormFullyMapped =
    !setup.checkIn.formId ||
    (!!setup.checkIn.fields.date && !!setup.checkIn.fields.checkInTime);
  const employeeFormReady = !!setup.employee.formId;
  const salarySourceReady = !!setup.employee.fields.salary || !!setup.defaultBaseSalary;
  const employeeMatchReady = !!setup.employee.fields.email || !!setup.employee.fields.employeeId;
  const requirementsMet =
    employeeFormReady &&
    salarySourceReady &&
    employeeMatchReady &&
    checkInFormFullyMapped;
  const requiredChecks = [
    { label: 'Employee form linked', done: employeeFormReady },
    { label: 'Salary source selected', done: salarySourceReady },
    { label: 'Employee match field mapped', done: employeeMatchReady },
    { label: 'Attendance source ready', done: checkInFormFullyMapped },
  ];
  const completedRequiredCount = requiredChecks.filter((item) => item.done).length;
  const progressPercent = Math.round((completedRequiredCount / requiredChecks.length) * 100);
  const optionalLinkedCount = [
    setup.checkIn.formId,
    setup.checkOut.formId,
    setup.leave.formId,
    setup.holiday.formId,
  ].filter(Boolean).length;
  const mappedCount = (fields: Record<string, string | null>) =>
    Object.values(fields).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Link
              href="/payroll"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Payroll
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Payroll Configuration
              </h1>
              <Badge variant={requirementsMet ? 'default' : 'secondary'}>
                {requirementsMet ? 'Ready' : 'Incomplete'}
              </Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Set employee salary mapping, attendance sources, leave and holiday sources,
              and pay rules in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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

        {autoConfigured && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              <strong>Form links detected.</strong> Review the mapped fields below or update the linked forms.
            </span>
          </div>
        )}

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
          <CardContent className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Setup readiness: {completedRequiredCount}/{requiredChecks.length} complete
                </p>
                <Badge variant={requirementsMet ? 'default' : 'secondary'}>
                  {requirementsMet ? 'Ready to generate' : 'Needs attention'}
                </Badge>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                aria-label="Payroll setup readiness"
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {requiredChecks.map((item) => (
                  <ReadinessItem key={item.label} done={item.done} label={item.label} />
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:min-w-[260px]">
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Optional forms</p>
                <p className="text-xl font-semibold text-foreground">{optionalLinkedCount}/4</p>
              </div>
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Employee fields</p>
                <p className="text-xl font-semibold text-foreground">
                  {mappedCount(setup.employee.fields)}/8
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="essentials" className="space-y-5">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-lg border bg-card p-1">
            <TabsTrigger value="essentials" className="gap-2">
              <User className="h-4 w-4" />
              Essentials
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-2">
              <LogIn className="h-4 w-4" />
              Attendance
            </TabsTrigger>
            <TabsTrigger value="leave" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              Leave & Holidays
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-2">
              <Briefcase className="h-4 w-4" />
              Pay Rules
            </TabsTrigger>
          </TabsList>

          <TabsContent value="essentials" className="m-0 space-y-5">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  Employee Profile Form
                </CardTitle>
                <CardDescription>
                  The form that holds employee master data: name, salary, and department.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Form</label>
                  <LinkedFormDisplay selectedId={setup.employee.formId} />
                </div>

                {setup.employee.formId && (
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="mappings" className="border rounded-lg bg-muted/10 overflow-hidden">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 data-[state=open]:bg-muted/20">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <LinkIcon className="h-4 w-4 text-muted-foreground" />
                          Advanced Field Mapping
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 pt-2">
                        <div className="flex items-center justify-between pb-4 border-b border-border/50 mb-4">
                          <p className="text-xs text-muted-foreground">Map form fields to standard payroll slots.</p>
                          <AutoFillButton section="employee" onAutoFill={autoFillSection} fieldsLoaded={employeeFields.length > 0} />
                        </div>
                        <div className="space-y-3">
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

                          <div className="grid grid-cols-1 gap-2 border-t border-border pt-4 mt-2 sm:grid-cols-[200px_1fr] sm:items-center">
                            <div>
                              <label htmlFor={defaultSalaryId} className="text-sm font-medium text-foreground">
                                Default Base Salary
                              </label>
                              <p className="text-xs text-muted-foreground">
                                Used when an employee has no mapped salary value.
                              </p>
                            </div>
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
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="attendance" className="m-0 space-y-5">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogIn className="h-5 w-5 text-primary" />
                  Check-In Form{' '}
                  <Badge variant="outline" className="ml-2 text-xs">
                    Optional
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Use a custom check-in form only when attendance is collected through a form.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Form</label>
                  <LinkedFormDisplay selectedId={setup.checkIn.formId} />
                  {!setup.checkIn.formId && (
                    <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                      No custom form linked. Built-in attendance remains available.
                    </p>
                  )}
                </div>

                {setup.checkIn.formId && (
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="mappings" className="border rounded-lg bg-muted/10 overflow-hidden">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 data-[state=open]:bg-muted/20">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <LinkIcon className="h-4 w-4 text-muted-foreground" />
                          Advanced Field Mapping
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 pt-2">
                        <div className="flex items-center justify-between pb-4 border-b border-border/50 mb-4">
                          <p className="text-xs text-muted-foreground">Map form fields to standard attendance slots.</p>
                          <AutoFillButton section="checkIn" onAutoFill={autoFillSection} fieldsLoaded={checkInFields.length > 0} />
                        </div>
                        <div className="space-y-3">
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
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogOut className="h-5 w-5 text-primary" />
                  Check-Out Form{' '}
                  <Badge variant="outline" className="ml-2 text-xs">
                    Optional
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Optional source for check-out time when your team uses a separate form.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Form</label>
                  <LinkedFormDisplay selectedId={setup.checkOut.formId} />
                  {!setup.checkOut.formId && (
                    <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                      No custom form linked. Built-in check-out time remains available.
                    </p>
                  )}
                </div>

                {setup.checkOut.formId && (
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="mappings" className="border rounded-lg bg-muted/10 overflow-hidden">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 data-[state=open]:bg-muted/20">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <LinkIcon className="h-4 w-4 text-muted-foreground" />
                          Advanced Field Mapping
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 pt-2">
                        <div className="flex items-center justify-between pb-4 border-b border-border/50 mb-4">
                          <p className="text-xs text-muted-foreground">Map form fields to standard attendance slots.</p>
                          <AutoFillButton section="checkOut" onAutoFill={autoFillSection} fieldsLoaded={checkOutFields.length > 0} />
                        </div>
                        <div className="space-y-3">
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
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leave" className="m-0 space-y-5">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarOff className="h-5 w-5 text-primary" />
                  Leave Application Form{' '}
                  <Badge variant="outline" className="ml-2 text-xs">
                    Optional
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Optional leave request form used for paid and unpaid leave deductions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Form</label>
                  <LinkedFormDisplay selectedId={setup.leave.formId} />
                </div>

                {setup.leave.formId && (
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="mappings" className="border rounded-lg bg-muted/10 overflow-hidden">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 data-[state=open]:bg-muted/20">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <LinkIcon className="h-4 w-4 text-muted-foreground" />
                          Advanced Field Mapping
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 pt-2">
                        <div className="flex items-center justify-between pb-4 border-b border-border/50 mb-4">
                          <p className="text-xs text-muted-foreground">Map form fields to standard leave slots.</p>
                          <AutoFillButton section="leave" onAutoFill={autoFillSection} fieldsLoaded={leaveFields.length > 0} />
                        </div>
                        <div className="space-y-3">
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
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  Holiday Calendar Form{' '}
                  <Badge variant="outline" className="ml-2 text-xs">
                    Optional
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Optional company holiday form used to keep holidays paid.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Form</label>
                  <LinkedFormDisplay selectedId={setup.holiday.formId} />
                </div>

                {setup.holiday.formId && (
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="mappings" className="border rounded-lg bg-muted/10 overflow-hidden">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 data-[state=open]:bg-muted/20">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <LinkIcon className="h-4 w-4 text-muted-foreground" />
                          Advanced Field Mapping
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 pt-2">
                        <div className="flex items-center justify-between pb-4 border-b border-border/50 mb-4">
                          <p className="text-xs text-muted-foreground">Map form fields to standard holiday slots.</p>
                          <AutoFillButton section="holiday" onAutoFill={autoFillSection} fieldsLoaded={holidayFields.length > 0} />
                        </div>
                        <div className="space-y-3">
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
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="m-0 space-y-5">
            <Accordion type="multiple" defaultValue={['salary-structure']} className="w-full space-y-4">
              <SalaryStructureSection
                config={setup.salaryStructure}
                onChange={(c) => setSetup((p) => ({ ...p, salaryStructure: c }))}
                defaultCTC={setup.defaultBaseSalary}
                statutory={setup.statutory}
              />

              <StatutoryComplianceSection
                config={setup.statutory}
                onChange={(c) => setSetup((p) => ({ ...p, statutory: c }))}
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
          </TabsContent>
        </Tabs>

        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-2 rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur sm:justify-end">
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
  );
}
