'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Wallet,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  Sparkles,
  RefreshCw,
  FileText,
  Building2,
  IndianRupee,
  Settings,
} from 'lucide-react';
import PayrollEngine from '@/components/payroll/payroll-engine';
import PayrollAnalytics from '@/components/payroll/payroll-analytics';
import PayrollTable from '@/components/payroll/payroll-table';
import PayslipPreview from '@/components/payroll/payslip-preview';

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

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: 'emerald' | 'blue' | 'amber' | 'violet';
}) {
  const accentMap = {
    emerald: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 border-emerald-500/20',
    blue: 'from-blue-500/15 to-blue-500/5 text-blue-600 border-blue-500/20',
    amber: 'from-amber-500/15 to-amber-500/5 text-amber-600 border-amber-500/20',
    violet: 'from-violet-500/15 to-violet-500/5 text-violet-600 border-violet-500/20',
  } as const;

  return (
    <Card className={`overflow-hidden border bg-gradient-to-br ${accentMap[accent]}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="rounded-full bg-background/60 p-2 backdrop-blur">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PayrollPage() {
  const [mounted, setMounted] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadData = async (targetMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const [recordsRes, statsRes] = await Promise.all([
        fetch(`/api/payroll?month=${targetMonth}`, { cache: 'no-store' }),
        fetch(`/api/payroll/stats?month=${targetMonth}`, { cache: 'no-store' }),
      ]);
      const recordsJson = await recordsRes.json();
      const statsJson = await statsRes.json();
      setPayrolls(recordsJson?.payrolls ?? []);
      setStats(statsJson?.stats ?? null);
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
      if (!json.success) throw new Error(json.message || json.error || 'Generation failed');
      await loadData(month);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate payroll');
    } finally {
      setGenerating(false);
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

  const monthLabel = useMemo(() => {
    if (!month) return '';
    const [y, m] = month.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });
  }, [month]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading payroll system...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Payroll Management
              </h1>
              <Badge variant="secondary" className="ml-1">
                Smart Engine
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Automated payroll calculation with attendance, deductions, and payslip generation —{' '}
              <span className="font-medium text-foreground">{monthLabel}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Link href="/payroll/configure">
              <Button variant="outline" size="sm" className="gap-2">
                <Settings className="h-4 w-4" />
                Configure
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(month)}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={generate}
              disabled={generating}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className={`h-4 w-4 ${generating ? 'animate-pulse' : ''}`} />
              {generating ? 'Generating...' : 'Auto-Generate Payroll'}
            </Button>
          </div>
        </header>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {stats?.formsStatus && (
          (!stats.formsStatus.hasEmployeeForm ||
            !stats.formsStatus.hasCheckInForm ||
            !stats.formsStatus.hasCheckOutForm) && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
              <div className="flex items-start gap-2">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div className="space-y-1">
                  <p className="font-medium text-amber-900">HR forms detected:</p>
                  <ul className="list-inside list-disc text-amber-800">
                    <li>
                      Employee Profile:{' '}
                      {stats.formsStatus.hasEmployeeForm ? (
                        <span className="font-medium">found ({stats.formsStatus.employeeFormName})</span>
                      ) : (
                        <span className="font-medium text-red-700">missing — create a form named "Employee Profile"</span>
                      )}
                    </li>
                    <li>
                      Check-In:{' '}
                      {stats.formsStatus.hasCheckInForm ? (
                        <span className="font-medium">found ({stats.formsStatus.checkInFormName})</span>
                      ) : (
                        <span className="font-medium text-red-700">missing — create a form named "Check-In"</span>
                      )}
                    </li>
                    <li>
                      Check-Out:{' '}
                      {stats.formsStatus.hasCheckOutForm ? (
                        <span className="font-medium">found ({stats.formsStatus.checkOutFormName})</span>
                      ) : (
                        <span className="text-amber-800">optional — recommended for working-hour calculation</span>
                      )}
                    </li>
                  </ul>
                  <p className="pt-1 text-amber-900">
                    Or{' '}
                    <Link href="/payroll/configure" className="font-medium underline">
                      configure custom form mappings
                    </Link>{' '}
                    to use any existing forms.
                  </p>
                </div>
              </div>
            </div>
          )
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total Net Payroll"
            value={`₹${formatINR(stats?.totalPayrollExpense ?? 0)}`}
            hint={`${monthLabel}`}
            icon={IndianRupee}
            accent="emerald"
          />
          <KpiCard
            label="Employees Paid"
            value={`${stats?.processedPayrolls ?? 0} / ${stats?.totalEmployees ?? 0}`}
            hint={`${stats?.pendingPayslips ?? 0} pending`}
            icon={Users}
            accent="blue"
          />
          <KpiCard
            label="Average Net Salary"
            value={`₹${formatINR(stats?.averageSalary ?? 0)}`}
            hint="Per employee"
            icon={TrendingUp}
            accent="violet"
          />
          <KpiCard
            label="Total Work Hours"
            value={formatINR(stats?.totalWorkingHours ?? 0)}
            hint={`${formatINR(stats?.totalDeductions ?? 0)} deducted`}
            icon={Clock}
            accent="amber"
          />
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview" className="gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="run" className="gap-1">
              <Sparkles className="h-4 w-4" />
              Run Payroll
            </TabsTrigger>
            <TabsTrigger value="records" className="gap-1">
              <FileText className="h-4 w-4" />
              Records
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1">
              <TrendingUp className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2 border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Department Breakdown
                  </CardTitle>
                  <CardDescription>Net payroll by department for {monthLabel}</CardDescription>
                </CardHeader>
                <CardContent>
                  {departmentBreakdown.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Building2 className="h-10 w-10 text-muted-foreground/40" />
                      <p className="mt-3 text-sm font-medium text-foreground">
                        No payroll data yet
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Click <span className="font-medium">Auto-Generate Payroll</span> to start
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {departmentBreakdown.map((d) => {
                        const max = departmentBreakdown[0].total || 1;
                        const pct = (d.total / max) * 100;
                        return (
                          <div key={d.name} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium text-foreground">{d.name}</span>
                              <span className="tabular-nums text-muted-foreground">
                                ₹{formatINR(d.total)}{' '}
                                <span className="text-xs">({d.count})</span>
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Quick Status
                  </CardTitle>
                  <CardDescription>Current payroll cycle</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                    <span className="text-sm text-muted-foreground">Cycle</span>
                    <span className="text-sm font-semibold text-foreground">{monthLabel}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={payrolls.length > 0 ? 'default' : 'secondary'}>
                      {payrolls.length > 0 ? 'Generated' : 'Not generated'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                    <span className="text-sm text-muted-foreground">Total Gross</span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      ₹{formatINR(stats?.totalGross ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                    <span className="text-sm text-muted-foreground">Deductions</span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      ₹{formatINR(stats?.totalDeductions ?? 0)}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setActiveTab('records')}
                    disabled={payrolls.length === 0}
                  >
                    <FileText className="h-4 w-4" />
                    View All Records
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="run" className="mt-4">
            <PayrollEngine />
          </TabsContent>

          <TabsContent value="records" className="mt-4">
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Payroll Records — {monthLabel}</CardTitle>
                <CardDescription>
                  {payrolls.length} record{payrolls.length === 1 ? '' : 's'} for the selected month
                </CardDescription>
              </CardHeader>
              <CardContent>
                {payrolls.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground/40" />
                    <p className="mt-3 text-sm font-medium text-foreground">No records yet</p>
                    <p className="text-xs text-muted-foreground">
                      Generate payroll to populate this table
                    </p>
                    <Button onClick={generate} disabled={generating} className="mt-4 gap-2">
                      <Sparkles className="h-4 w-4" />
                      {generating ? 'Generating...' : 'Generate Now'}
                    </Button>
                  </div>
                ) : (
                  <PayrollTable
                    payrolls={payrolls}
                    onSelectPayroll={(p) => setSelectedPayroll(p as PayrollRecord)}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            {payrolls.length > 0 ? (
              <PayrollAnalytics payrolls={payrolls} month={month} />
            ) : (
              <Card className="border-border">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <TrendingUp className="h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-3 text-sm font-medium text-foreground">No analytics yet</p>
                  <p className="text-xs text-muted-foreground">
                    Generate payroll to view insights and charts
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {selectedPayroll && (
          <PayslipPreview
            payroll={selectedPayroll as any}
            processingMonth={month}
            onClose={() => setSelectedPayroll(null)}
          />
        )}
      </div>
    </div>
  );
}
