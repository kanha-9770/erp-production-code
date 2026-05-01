'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Wallet,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Sparkles,
  RefreshCw,
  FileText,
  Building2,
  IndianRupee,
  Settings,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  Search,
  Eye,
  Briefcase,
  CalendarDays,
  Mail,
  ArrowRight,
  Minus,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import PayrollEngine from '@/components/payroll/payroll-engine';
import PayrollAnalytics from '@/components/payroll/payroll-analytics';
import PayslipPreview from '@/components/payroll/payslip-preview';
import { cn } from '@/lib/utils';

interface PayrollRecord {
  employeeId: string;
  employeeName: string;
  email: string;
  totalSalary: number;
  workingDays: number;
  workingHours: number;
  baseSalary: number;
  hourlyRate: number;
  grossSalary: number;
  deductions: { pf: number; tax: number; insurance: number; other: number };
  netSalary: number;
  status: 'pending' | 'processed';
  month?: string;
  designation?: string;
  department?: string;
  generatedAt?: string;
}

interface FormsStatus {
  hasEmployeeForm: boolean;
  hasCheckInForm: boolean;
  hasCheckOutForm: boolean;
  employeeFormName?: string;
  checkInFormName?: string;
  checkOutFormName?: string;
}

interface Stats {
  totalEmployees: number;
  processedPayrolls: number;
  pendingPayslips: number;
  totalPayrollExpense: number;
  totalGross: number;
  totalDeductions: number;
  averageSalary: number;
  totalWorkingHours: number;
  formsStatus?: FormsStatus;
}

const formatINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

const ACCENT = "#5a4d96";

function TrendBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-500">
        <Minus className="h-3 w-3" />
        no prior data
      </span>
    );
  }
  const positive = delta > 0;
  const Icon = positive ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        positive
          ? "text-gray-700 bg-black/5"
          : delta < 0
            ? "text-gray-700 bg-black/5"
            : "text-gray-500 bg-black/5",
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  delta,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  delta?: number | null;
  loading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden border border-black/10 bg-white shadow-none transition-shadow hover:shadow-sm">
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              {label}
            </p>
            {loading ? (
              <Skeleton className="h-7 w-32 bg-black/5" />
            ) : (
              <p className="text-2xl font-bold text-gray-900 tabular-nums tracking-tight">
                {value}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              {delta !== undefined && !loading && <TrendBadge delta={delta ?? null} />}
              {hint && (
                <span className="text-[11px] text-gray-500 truncate">{hint}</span>
              )}
            </div>
          </div>
          <div
            className="rounded-lg p-2 shrink-0 ring-1 ring-black/5"
            style={{ backgroundColor: `${ACCENT}14` }}
          >
            <Icon className="h-5 w-5" style={{ color: ACCENT }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  // Single tonal scheme — accent for "active" states, gray for the rest.
  // Stays inside the sidebar's palette while keeping states distinguishable.
  const map: Record<string, { bg: string; fg: string }> = {
    paid: { bg: `${ACCENT}1a`, fg: ACCENT },
    processed: { bg: `${ACCENT}14`, fg: ACCENT },
    pending: { bg: "rgba(0,0,0,0.06)", fg: "#374151" },
  };
  const tone = map[status] ?? { bg: "rgba(0,0,0,0.06)", fg: "#374151" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: tone.bg,
        color: tone.fg,
        borderColor: "rgba(0,0,0,0.08)",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: tone.fg }}
      />
      {status}
    </span>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

// Charts use tonal variations of the accent so the page stays inside the
// sidebar palette. Recharts can fall back through these for distinct slices.
const DEDUCTION_COLORS = ['#5a4d96', '#7d6fb5', '#9c8fcc', '#bcb1e0'];
const COMPOSITION_COLORS = ['#5a4d96', '#7d6fb5', '#9c8fcc', '#bcb1e0', '#d4cce8'];

export default function PayrollPage() {
  const [mounted, setMounted] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [prevStats, setPrevStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<PayrollRecord | null>(null);
  const [showPayslip, setShowPayslip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [diagnoseReport, setDiagnoseReport] = useState<any>(null);
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [diagnoseOpen, setDiagnoseOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [lastGeneratedAt, setLastGeneratedAt] = useState<Date | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadData = async (targetMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const prev = previousMonth(targetMonth);
      const [recordsRes, statsRes, prevStatsRes] = await Promise.all([
        fetch(`/api/payroll?month=${targetMonth}`, { cache: 'no-store' }),
        fetch(`/api/payroll/stats?month=${targetMonth}`, { cache: 'no-store' }),
        fetch(`/api/payroll/stats?month=${prev}`, { cache: 'no-store' }),
      ]);
      const recordsJson = await recordsRes.json();
      const statsJson = await statsRes.json();
      const prevStatsJson = await prevStatsRes.json();
      setPayrolls(recordsJson?.payrolls ?? []);
      setStats(statsJson?.stats ?? null);
      setPrevStats(prevStatsJson?.stats ?? null);
      const fetchedPayrolls: PayrollRecord[] = recordsJson?.payrolls ?? [];
      let earliest: string | null = null;
      for (const p of fetchedPayrolls) {
        if (!p.generatedAt) continue;
        if (!earliest || p.generatedAt > earliest) earliest = p.generatedAt;
      }
      setLastGeneratedAt(earliest ? new Date(earliest) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    loadData(month);
  }, [mounted, month]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/payroll/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const json = await res.json();
      if (!json.success) {
        await runDiagnose();
        setDiagnoseOpen(true);
        throw new Error(json.message || json.error || 'Generation failed');
      }
      await loadData(month);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate payroll');
    } finally {
      setGenerating(false);
    }
  };

  const runDiagnose = async () => {
    setDiagnoseLoading(true);
    try {
      const res = await fetch(`/api/payroll/diagnose?month=${month}`, { cache: 'no-store' });
      const json = await res.json();
      setDiagnoseReport(json.report ?? null);
    } catch (e) {
      console.error('[payroll-page] diagnose error', e);
    } finally {
      setDiagnoseLoading(false);
    }
  };

  const departmentBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    payrolls.forEach((p) => {
      const dept = p.department || 'Unassigned';
      const cur = map.get(dept) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += p.netSalary;
      map.set(dept, cur);
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [payrolls]);

  const compositionData = useMemo(() => {
    if (!stats || stats.totalGross <= 0) return [];
    const pf = payrolls.reduce((s, p) => s + p.deductions.pf, 0);
    const tax = payrolls.reduce((s, p) => s + p.deductions.tax, 0);
    const ins = payrolls.reduce((s, p) => s + p.deductions.insurance, 0);
    const other = payrolls.reduce((s, p) => s + p.deductions.other, 0);
    return [
      { name: 'Net Pay', value: stats.totalPayrollExpense },
      { name: 'PF', value: pf },
      { name: 'Tax', value: tax },
      { name: 'Insurance', value: ins },
      { name: 'Other', value: other },
    ].filter((d) => d.value > 0);
  }, [stats, payrolls]);

  const monthLabel = useMemo(() => {
    if (!month) return '';
    const [y, m] = month.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });
  }, [month]);

  const filteredPayrolls = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payrolls.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.employeeName?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.employeeId?.toLowerCase().includes(q) ||
        p.department?.toLowerCase().includes(q) ||
        p.designation?.toLowerCase().includes(q)
      );
    });
  }, [payrolls, search, statusFilter]);

  const deltas = useMemo(() => {
    if (!stats || !prevStats) {
      return { payroll: null, employees: null, average: null, hours: null };
    }
    return {
      payroll: deltaPercent(stats.totalPayrollExpense, prevStats.totalPayrollExpense),
      employees: deltaPercent(stats.processedPayrolls, prevStats.processedPayrolls),
      average: deltaPercent(stats.averageSalary, prevStats.averageSalary),
      hours: deltaPercent(stats.totalWorkingHours, prevStats.totalWorkingHours),
    };
  }, [stats, prevStats]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-72" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Sticky header */}
        <header className="sticky top-0 z-20 -mx-6 px-6 py-4 bg-gray-50/95 backdrop-blur-sm border-b border-black/10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div
                  className="rounded-lg p-2 ring-1 ring-black/5"
                  style={{ backgroundColor: `${ACCENT}14` }}
                >
                  <Wallet className="h-5 w-5" style={{ color: ACCENT }} />
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-gray-900">
                  Payroll
                </h1>
              </div>
              <div className="flex items-center gap-2 text-[12px] text-gray-500 pl-[44px]">
                <span className="font-medium text-gray-700">{monthLabel}</span>
                {lastGeneratedAt && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      Last generated{' '}
                      {lastGeneratedAt.toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-9 rounded-md border border-black/10 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#5a4d96]/30 focus:border-[#5a4d96]/40"
              />
              <Link href="/payroll/configure">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-black/10 bg-white hover:bg-black/5 text-gray-700"
                >
                  <Settings className="h-4 w-4" />
                  Configure
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  runDiagnose();
                  setDiagnoseOpen(true);
                }}
                disabled={diagnoseLoading}
                className="gap-2 border-black/10 bg-white hover:bg-black/5 text-gray-700"
              >
                <Stethoscope
                  className={cn('h-4 w-4', diagnoseLoading && 'animate-pulse')}
                />
                Diagnose
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadData(month)}
                disabled={loading}
                className="gap-2 border-black/10 bg-white hover:bg-black/5 text-gray-700"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={generate}
                disabled={generating}
                className="gap-2 text-white shadow-sm"
                style={{ backgroundColor: ACCENT }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    '#6b5da8')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.backgroundColor = ACCENT)
                }
              >
                <Sparkles className={cn('h-4 w-4', generating && 'animate-pulse')} />
                {generating ? 'Generating…' : 'Auto-Generate'}
              </Button>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {stats?.formsStatus &&
          (!stats.formsStatus.hasEmployeeForm ||
            !stats.formsStatus.hasCheckInForm ||
            !stats.formsStatus.hasCheckOutForm) && (
            <div className="rounded-md border border-black/10 bg-white px-4 py-3 text-sm">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <div className="space-y-1 flex-1">
                  <p className="font-semibold text-gray-900">HR forms detected</p>
                  <ul className="list-inside list-disc text-gray-600">
                    <li>
                      Employee Profile:{' '}
                      {stats.formsStatus.hasEmployeeForm ? (
                        <span className="font-medium text-gray-800">
                          found ({stats.formsStatus.employeeFormName})
                        </span>
                      ) : (
                        <span className="font-medium text-red-600">missing</span>
                      )}
                    </li>
                    <li>
                      Check-In:{' '}
                      {stats.formsStatus.hasCheckInForm ? (
                        <span className="font-medium text-gray-800">
                          found ({stats.formsStatus.checkInFormName})
                        </span>
                      ) : (
                        <span className="font-medium text-red-600">missing</span>
                      )}
                    </li>
                    <li>
                      Check-Out:{' '}
                      {stats.formsStatus.hasCheckOutForm ? (
                        <span className="font-medium text-gray-800">
                          found ({stats.formsStatus.checkOutFormName})
                        </span>
                      ) : (
                        <span className="text-gray-500">optional</span>
                      )}
                    </li>
                  </ul>
                  <Link
                    href="/payroll/configure"
                    className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                    style={{ color: ACCENT }}
                  >
                    Configure custom mappings <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          )}

        {diagnoseReport && (
          <Card className="border border-black/10 bg-white shadow-none">
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setDiagnoseOpen((v) => !v)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5" style={{ color: ACCENT }} />
                  <CardTitle className="text-base text-gray-900">
                    Payroll Diagnostic Report
                  </CardTitle>
                </div>
                {diagnoseOpen ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </div>
              <CardDescription className="text-gray-500">
                What the engine actually finds in your forms
              </CardDescription>
            </CardHeader>
            {diagnoseOpen && (
              <CardContent className="space-y-4 text-sm">
                {(['employee', 'checkIn', 'checkOut'] as const).map((key) => {
                  const sec = diagnoseReport[key];
                  const label =
                    key === 'employee' ? 'Employee Profile' : key === 'checkIn' ? 'Check-In' : 'Check-Out';
                  if (!sec.found) {
                    return (
                      <div
                        key={key}
                        className="rounded-md border border-dashed border-black/15 bg-gray-50 p-3"
                      >
                        <p className="font-semibold text-gray-700">
                          {label}: form not found
                        </p>
                      </div>
                    );
                  }
                  const reasons = sec.reasons || {};
                  const ok = reasons.ok ?? 0;
                  return (
                    <div
                      key={key}
                      className="rounded-md border border-black/10 bg-gray-50 p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-gray-900">{label}</p>
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          <span className="inline-flex items-center rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
                            Raw rows: {sec.rawCount}
                          </span>
                          <span
                            className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                            style={{
                              backgroundColor: ok > 0 ? `${ACCENT}14` : 'rgba(0,0,0,0.04)',
                              color: ok > 0 ? ACCENT : '#6b7280',
                              borderColor: 'rgba(0,0,0,0.08)',
                            }}
                          >
                            Usable: {ok}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 sm:grid-cols-3">
                        {Object.entries(reasons).map(([k, v]) => (
                          <div key={k} className="flex justify-between">
                            <span>{k}</span>
                            <span className="tabular-nums text-gray-800">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                      {sec.sample && sec.sample.length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                            Sample rows ({sec.sample.length})
                          </summary>
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-white border border-black/10 p-2 text-[11px] text-gray-700">
                            {JSON.stringify(sec.sample, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total Net Payroll"
            value={`₹${formatINR(stats?.totalPayrollExpense ?? 0)}`}
            hint={`vs ${monthLabel}`}
            icon={IndianRupee}
            delta={deltas.payroll}
            loading={loading}
          />
          <KpiCard
            label="Employees Paid"
            value={`${stats?.processedPayrolls ?? 0} / ${stats?.totalEmployees ?? 0}`}
            hint={`${stats?.pendingPayslips ?? 0} pending`}
            icon={Users}
            delta={deltas.employees}
            loading={loading}
          />
          <KpiCard
            label="Average Net Salary"
            value={`₹${formatINR(stats?.averageSalary ?? 0)}`}
            hint="Per employee"
            icon={TrendingUp}
            delta={deltas.average}
            loading={loading}
          />
          <KpiCard
            label="Total Work Hours"
            value={formatINR(stats?.totalWorkingHours ?? 0)}
            hint={`₹${formatINR(stats?.totalDeductions ?? 0)} deducted`}
            icon={Clock}
            delta={deltas.hours}
            loading={loading}
          />
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid bg-white border border-black/10 p-1 rounded-md">
            <TabsTrigger
              value="overview"
              className="gap-1 text-gray-600 data-[state=active]:bg-[#5a4d96]/10 data-[state=active]:text-[#5a4d96] data-[state=active]:shadow-none"
            >
              <CheckCircle2 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="run"
              className="gap-1 text-gray-600 data-[state=active]:bg-[#5a4d96]/10 data-[state=active]:text-[#5a4d96] data-[state=active]:shadow-none"
            >
              <Sparkles className="h-4 w-4" />
              Run Payroll
            </TabsTrigger>
            <TabsTrigger
              value="records"
              className="gap-1 text-gray-600 data-[state=active]:bg-[#5a4d96]/10 data-[state=active]:text-[#5a4d96] data-[state=active]:shadow-none"
            >
              <FileText className="h-4 w-4" />
              Records
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="gap-1 text-gray-600 data-[state=active]:bg-[#5a4d96]/10 data-[state=active]:text-[#5a4d96] data-[state=active]:shadow-none"
            >
              <TrendingUp className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2 border border-black/10 bg-white shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-gray-900 text-base">
                    <Building2 className="h-5 w-5" style={{ color: ACCENT }} />
                    Department Breakdown
                  </CardTitle>
                  <CardDescription className="text-gray-500">
                    Net payroll by department for {monthLabel}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-24 bg-black/5" />
                            <Skeleton className="h-4 w-16 bg-black/5" />
                          </div>
                          <Skeleton className="h-2 w-full bg-black/5" />
                        </div>
                      ))}
                    </div>
                  ) : departmentBreakdown.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Building2 className="h-10 w-10 text-gray-300" />
                      <p className="mt-3 text-sm font-medium text-gray-700">
                        No payroll data yet
                      </p>
                      <p className="text-xs text-gray-500">
                        Click <span className="font-medium">Auto-Generate</span> to start
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {departmentBreakdown.map((d, i) => {
                        const max = departmentBreakdown[0].total || 1;
                        const pct = (d.total / max) * 100;
                        return (
                          <div key={d.name} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium text-gray-800 flex items-center gap-2">
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{
                                    backgroundColor:
                                      COMPOSITION_COLORS[i % COMPOSITION_COLORS.length],
                                  }}
                                />
                                {d.name}
                                <span className="text-xs text-gray-500">({d.count})</span>
                              </span>
                              <span className="tabular-nums font-semibold text-gray-900">
                                ₹{formatINR(d.total)}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-black/5">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor:
                                    COMPOSITION_COLORS[i % COMPOSITION_COLORS.length],
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-black/10 bg-white shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-gray-900 text-base">
                    <Wallet className="h-5 w-5" style={{ color: ACCENT }} />
                    Cost Composition
                  </CardTitle>
                  <CardDescription className="text-gray-500">
                    How the payroll splits
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-56 w-full rounded-full bg-black/5" />
                  ) : compositionData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Wallet className="h-10 w-10 text-gray-300" />
                      <p className="mt-3 text-xs text-gray-500">No data</p>
                    </div>
                  ) : (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={compositionData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={2}
                          >
                            {compositionData.map((_, i) => (
                              <Cell key={i} fill={COMPOSITION_COLORS[i % COMPOSITION_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v: any) => `₹${formatINR(Number(v))}`}
                            contentStyle={{
                              backgroundColor: '#ffffff',
                              border: '1px solid rgba(0,0,0,0.1)',
                              borderRadius: '6px',
                              fontSize: '12px',
                            }}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                            wrapperStyle={{ fontSize: '11px' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border border-black/10 bg-white shadow-none">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base text-gray-900">Top Earners</CardTitle>
                  <CardDescription className="text-gray-500">
                    Highest net salaries this month
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-gray-600 hover:bg-black/5 hover:text-gray-900"
                  onClick={() => setActiveTab('records')}
                >
                  See all
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 bg-black/5" />
                    ))}
                  </div>
                ) : payrolls.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">
                    No records yet
                  </p>
                ) : (
                  <div className="divide-y divide-black/5">
                    {[...payrolls]
                      .sort((a, b) => b.netSalary - a.netSalary)
                      .slice(0, 5)
                      .map((p) => (
                        <button
                          key={p.employeeId + p.email}
                          onClick={() => setSelected(p)}
                          className="w-full flex items-center justify-between gap-3 py-3 px-2 rounded-md hover:bg-black/[0.03] transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="h-9 w-9 shrink-0 rounded-md flex items-center justify-center text-xs font-semibold text-white ring-1 ring-black/5"
                              style={{ backgroundColor: ACCENT }}
                            >
                              {initialsOf(p.employeeName)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {p.employeeName}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {p.designation || '—'} · {p.department || 'Unassigned'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold tabular-nums text-gray-900">
                              ₹{formatINR(p.netSalary)}
                            </p>
                            <StatusPill status={p.status} />
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="run" className="mt-4">
            <PayrollEngine />
          </TabsContent>

          <TabsContent value="records" className="mt-4">
            <Card className="border border-black/10 bg-white shadow-none">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-gray-900 text-base">
                      Payroll Records — {monthLabel}
                    </CardTitle>
                    <CardDescription className="text-gray-500">
                      {filteredPayrolls.length} of {payrolls.length} record
                      {payrolls.length === 1 ? '' : 's'}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <Input
                        type="search"
                        placeholder="Search name, email, dept…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9 pl-8 w-56 bg-white border-black/10 focus-visible:ring-2 focus-visible:ring-[#5a4d96]/30 focus-visible:border-[#5a4d96]/40"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9 w-36 bg-white border-black/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="processed">Processed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 bg-black/5" />
                    ))}
                  </div>
                ) : filteredPayrolls.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FileText className="h-10 w-10 text-gray-300" />
                    <p className="mt-3 text-sm font-medium text-gray-700">
                      {payrolls.length === 0 ? 'No records yet' : 'No matches'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {payrolls.length === 0
                        ? 'Generate payroll to populate this table'
                        : 'Try a different search or status filter'}
                    </p>
                    {payrolls.length === 0 && (
                      <Button
                        onClick={generate}
                        disabled={generating}
                        className="mt-4 gap-2 text-white"
                        style={{ backgroundColor: ACCENT }}
                      >
                        <Sparkles className="h-4 w-4" />
                        {generating ? 'Generating…' : 'Generate Now'}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-black/10 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                          <th className="px-4 py-3">Employee</th>
                          <th className="px-3 py-3">Department</th>
                          <th className="px-3 py-3 text-center">Days</th>
                          <th className="px-3 py-3 text-center">Hours</th>
                          <th className="px-3 py-3 text-right">Gross</th>
                          <th className="px-3 py-3 text-right">Deductions</th>
                          <th className="px-3 py-3 text-right">Net</th>
                          <th className="px-3 py-3 text-center">Status</th>
                          <th className="px-3 py-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {filteredPayrolls.map((p, idx) => {
                          const totalDed =
                            p.deductions.pf +
                            p.deductions.tax +
                            p.deductions.insurance +
                            p.deductions.other;
                          return (
                            <tr
                              key={`${p.employeeId}-${p.email}-${idx}`}
                              className="hover:bg-black/[0.03] transition-colors cursor-pointer"
                              onClick={() => setSelected(p)}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center text-xs font-semibold text-white ring-1 ring-black/5"
                                    style={{ backgroundColor: ACCENT }}
                                  >
                                    {initialsOf(p.employeeName)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-gray-900 truncate">
                                      {p.employeeName}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">
                                      {p.email || p.employeeId}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-gray-600">
                                {p.department || '—'}
                              </td>
                              <td className="px-3 py-3 text-center tabular-nums text-gray-700">
                                {p.workingDays}
                              </td>
                              <td className="px-3 py-3 text-center tabular-nums text-gray-700">
                                {p.workingHours.toFixed(1)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                                ₹{formatINR(p.grossSalary)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                                ₹{formatINR(totalDed)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums font-bold text-gray-900">
                                ₹{formatINR(p.netSalary)}
                              </td>
                              <td className="px-3 py-3 text-center">
                                <StatusPill status={p.status} />
                              </td>
                              <td className="px-3 py-3 text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelected(p);
                                  }}
                                  className="gap-1 h-8 text-gray-600 hover:bg-black/5 hover:text-gray-900"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  View
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            {payrolls.length > 0 ? (
              <PayrollAnalytics payrolls={payrolls} month={month} />
            ) : (
              <Card className="border border-black/10 bg-white shadow-none">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <TrendingUp className="h-10 w-10 text-gray-300" />
                  <p className="mt-3 text-sm font-medium text-gray-700">
                    No analytics yet
                  </p>
                  <p className="text-xs text-gray-500">
                    Generate payroll to view insights and charts
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Employee detail drawer */}
        <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
          <SheetContent className="sm:max-w-lg overflow-y-auto bg-white">
            {selected && (
              <>
                <SheetHeader className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-12 w-12 rounded-md flex items-center justify-center text-base font-semibold text-white ring-1 ring-black/5"
                      style={{ backgroundColor: ACCENT }}
                    >
                      {initialsOf(selected.employeeName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <SheetTitle className="truncate text-gray-900">
                        {selected.employeeName}
                      </SheetTitle>
                      <SheetDescription className="flex items-center gap-2 text-xs text-gray-500">
                        <Briefcase className="h-3 w-3" />
                        {selected.designation || '—'} · {selected.department || 'Unassigned'}
                      </SheetDescription>
                    </div>
                    <StatusPill status={selected.status} />
                  </div>
                  {selected.email && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Mail className="h-3 w-3" />
                      {selected.email}
                    </div>
                  )}
                </SheetHeader>

                <div className="mt-6 space-y-5">
                  <div
                    className="rounded-md border border-black/10 p-4"
                    style={{ backgroundColor: `${ACCENT}0d` }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                      Net Salary
                    </p>
                    <p className="text-3xl font-bold text-gray-900 tabular-nums mt-1">
                      ₹{formatINR(selected.netSalary)}
                    </p>
                    <p className="text-xs text-gray-500">for {monthLabel}</p>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-2">
                      Earnings
                    </p>
                    <div className="rounded-md border border-black/10 divide-y divide-black/5 bg-white">
                      <Row label="Base Salary (CTC)" value={`₹${formatINR(selected.baseSalary)}`} />
                      <Row
                        label="Hourly Rate"
                        value={`₹${selected.hourlyRate.toFixed(2)}`}
                        sub="based on 22 days × 8h"
                      />
                      <Row
                        label="Working Days"
                        value={`${selected.workingDays}`}
                        sub={`${selected.workingHours.toFixed(1)} hours total`}
                      />
                      <Row
                        label="Gross Salary"
                        value={`₹${formatINR(selected.grossSalary)}`}
                        emphasis
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-2">
                      Deductions
                    </p>
                    <div className="rounded-md border border-black/10 divide-y divide-black/5 bg-white">
                      <Row
                        label="Provident Fund"
                        value={`₹${formatINR(selected.deductions.pf)}`}
                        sub="12% of gross"
                      />
                      <Row
                        label="Income Tax"
                        value={`₹${formatINR(selected.deductions.tax)}`}
                        sub="5% of taxable"
                      />
                      <Row
                        label="Insurance"
                        value={`₹${formatINR(selected.deductions.insurance)}`}
                        sub="fixed monthly"
                      />
                      <Row
                        label="Other"
                        value={`₹${formatINR(selected.deductions.other)}`}
                      />
                      <Row
                        label="Total Deductions"
                        value={`₹${formatINR(
                          selected.deductions.pf +
                            selected.deductions.tax +
                            selected.deductions.insurance +
                            selected.deductions.other,
                        )}`}
                        emphasis
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 gap-2 border-black/10 bg-white hover:bg-black/5 text-gray-700"
                      onClick={() => setShowPayslip(true)}
                    >
                      <FileText className="h-4 w-4" />
                      View Payslip
                    </Button>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {showPayslip && selected && (
          <PayslipPreview
            payroll={selected as any}
            processingMonth={month}
            onClose={() => setShowPayslip(false)}
          />
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-3 py-2.5',
        emphasis && 'bg-gray-50',
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm',
            emphasis ? 'font-semibold text-gray-900' : 'text-gray-600',
          )}
        >
          {label}
        </p>
        {sub && <p className="text-[10px] text-gray-500">{sub}</p>}
      </div>
      <p
        className={cn(
          'tabular-nums shrink-0',
          emphasis ? 'text-base font-bold text-gray-900' : 'text-sm font-semibold text-gray-900',
        )}
      >
        {value}
      </p>
    </div>
  );
}
