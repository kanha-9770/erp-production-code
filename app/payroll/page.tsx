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
  Copy,
  Check,
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

interface PayrollBreakdown {
  daysInMonth: number;
  payableDays: number;
  presentDays: number;
  halfDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  holidayDays: number;
  weeklyOffDays: number;
  absentDays: number;
  outOfServiceDays: number;
  leaveByType: Record<string, number>;
}

interface PayrollEarnings {
  basic: number;
  hra: number;
  da: number;
  conveyance: number;
  medical: number;
  lta: number;
  food: number;
  telephone: number;
  education: number;
  fuel: number;
  books: number;
  uniform: number;
  specialAllowance: number;
  overtime: number;
}

interface PayrollDeductionsDetail {
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  lwf: number;
  nps: number;
}

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
  // Per-component breakdowns from the engine. The legacy 4-slot `deductions`
  // can't distinguish "PF off" from "PF = ₹0 on this employee", so the side
  // panel reads from these instead and hides rows whose value is zero —
  // disabled components simply vanish.
  earnings?: PayrollEarnings;
  deductionsDetail?: PayrollDeductionsDetail;
  netSalary: number;
  status: 'pending' | 'processed';
  month?: string;
  designation?: string;
  department?: string;
  generatedAt?: string;
  // Identifies which pay-rule profile the engine used for this row. The
  // detail panel surfaces this so the admin always sees which rules were
  // applied — and offers a dropdown to switch the employee to a different
  // profile.
  payrollProfileId?: string | null;
  payrollProfileName?: string | null;
  payrollProfileSource?: string | null;
  // Optional: present on records produced by the per-day classifier (post leave/holiday integration).
  // Older cached records may omit it, so all UI consumers must guard for undefined.
  breakdown?: PayrollBreakdown;
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

// Render fractional day counts compactly: 0 stays "0", whole numbers drop
// the decimal, halves render as "1.5". Used in dense table cells where
// "1.0" would look noisier than "1".
const fmtDays = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
};

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
      <CardContent className="relative p-3.5 sm:p-5">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="space-y-1 sm:space-y-1.5 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 truncate">
              {label}
            </p>
            {loading ? (
              <Skeleton className="h-6 sm:h-7 w-24 sm:w-32 bg-black/5" />
            ) : (
              <p className="text-lg sm:text-2xl font-bold text-gray-900 tabular-nums tracking-tight truncate">
                {value}
              </p>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              {delta !== undefined && !loading && <TrendBadge delta={delta ?? null} />}
              {hint && (
                <span className="text-[10px] sm:text-[11px] text-gray-500 truncate">{hint}</span>
              )}
            </div>
          </div>
          <div
            className="rounded-lg p-1.5 sm:p-2 shrink-0 ring-1 ring-black/5"
            style={{ backgroundColor: `${ACCENT}14` }}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: ACCENT }} />
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
  const [diagnoseCopied, setDiagnoseCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [lastGeneratedAt, setLastGeneratedAt] = useState<Date | null>(null);
  // Pay-rule profile catalog for the per-employee selector in the detail
  // panel. Loaded once when the page mounts; refreshed after every assign
  // so assignedCount badges stay in sync.
  const [profiles, setProfiles] = useState<
    { id: string; name: string; isDefault: boolean; assignedCount: number }[]
  >([]);
  const [profileAssigning, setProfileAssigning] = useState(false);
  // Effective-from mode for the per-employee dropdown. Defaults to the
  // current month so a quick reassignment "just works" without any extra
  // clicks; admins who need to schedule a future change pick "next" or
  // "specific" and provide a YYYY-MM.
  const [panelEffMode, setPanelEffMode] = useState<'current' | 'next' | 'specific'>('current');
  const [panelEffSpecific, setPanelEffSpecific] = useState<string>(
    new Date().toISOString().slice(0, 7),
  );

  const loadProfiles = async () => {
    try {
      const res = await fetch('/api/payroll/profiles', { cache: 'no-store' });
      const json = await res.json();
      if (json?.success && Array.isArray(json.profiles)) {
        setProfiles(
          json.profiles.map((p: any) => ({
            id: p.id,
            name: p.name,
            isDefault: !!p.isDefault,
            assignedCount: p.assignedCount ?? 0,
          })),
        );
      }
    } catch (e) {
      // Profiles are optional — failure here shouldn't block the page.
      console.warn('[payroll] failed to load profiles:', e);
    }
  };

  const computeEffectiveFrom = (): string => {
    if (panelEffMode === 'current') return new Date().toISOString().slice(0, 7);
    if (panelEffMode === 'next') {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      return d.toISOString().slice(0, 7);
    }
    return panelEffSpecific || new Date().toISOString().slice(0, 7);
  };

  const assignProfile = async (employeeKey: string, profileId: string | null) => {
    setProfileAssigning(true);
    try {
      const effectiveFrom = computeEffectiveFrom();
      const res = await fetch('/api/payroll/profiles/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeKey, profileId, effectiveFrom }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to assign profile');
      // Recompute payroll + refresh the catalog so counts and amounts both
      // pick up the new assignment.
      await Promise.all([loadData(month), loadProfiles()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign profile');
    } finally {
      setProfileAssigning(false);
    }
  };

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
      const nextPayrolls: PayrollRecord[] = recordsJson?.payrolls ?? [];
      setPayrolls(nextPayrolls);
      setStats(statsJson?.stats ?? null);
      setPrevStats(prevStatsJson?.stats ?? null);
      // If the detail panel is open, swap in the matching freshly-computed
      // record so toggling a profile updates the visible breakdown without
      // closing the drawer.
      setSelected((prev) => {
        if (!prev) return prev;
        const updated = nextPayrolls.find((p) => p.employeeId === prev.employeeId);
        return updated ?? prev;
      });
      const fetchedPayrolls: PayrollRecord[] = nextPayrolls;
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

  useEffect(() => {
    if (mounted) loadProfiles();
  }, [mounted]);

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

  // Build a human-readable text dump of the diagnose result for sharing.
  // Includes formsStatus + per-section counts + reasons + sample rows so a
  // single paste captures everything needed to debug the engine remotely.
  const formatDiagnoseReport = (): string => {
    if (!diagnoseReport) return '';
    const lines: string[] = [];
    const rule = '═'.repeat(56);
    const sub = '─'.repeat(56);

    lines.push(`PAYROLL DIAGNOSTIC — ${monthLabel}`);
    lines.push(rule);
    lines.push('');

    const fs = stats?.formsStatus;
    if (fs) {
      lines.push('Setup status:');
      lines.push(
        `  Employee Profile : ${
          fs.hasEmployeeForm ? `found (${fs.employeeFormName ?? '—'})` : 'MISSING'
        }`,
      );
      lines.push(
        `  Check-In         : ${
          fs.hasCheckInForm
            ? `form bound (${fs.checkInFormName ?? '—'})`
            : fs.hasNativeAttendance
              ? `widget rows (${fs.nativeAttendanceCount ?? 0} punches)`
              : 'MISSING — bind a form OR have employees punch in via /attendance'
        }`,
      );
      lines.push(
        `  Check-Out        : ${
          fs.hasCheckOutForm ? `form bound (${fs.checkOutFormName ?? '—'})` : 'optional, not configured'
        }`,
      );
      lines.push(
        `  Setup saved      : ${diagnoseReport.hasSavedSetup ? 'yes' : 'no'}`,
      );
      lines.push('');
    }

    const sections = [
      { key: 'employee', label: 'EMPLOYEE PROFILE', usableKey: 'parsedCount' },
      { key: 'checkIn', label: 'CHECK-IN', usableKey: 'parsedInMonth' },
      { key: 'checkOut', label: 'CHECK-OUT', usableKey: 'parsedInMonth' },
    ] as const;

    for (const s of sections) {
      const sec = diagnoseReport[s.key];
      if (!sec) continue;
      lines.push(sub);
      lines.push(s.label);
      lines.push(sub);
      if (!sec.found) {
        lines.push('  Form not found in this organization');
        lines.push('');
        continue;
      }
      lines.push(`  Form ID         : ${sec.formId ?? '—'}`);
      lines.push(`  Raw rows        : ${sec.rawCount ?? 0}`);
      lines.push(
        `  ${s.usableKey === 'parsedCount' ? 'Usable          ' : 'In selected month'} : ${
          sec[s.usableKey] ?? 0
        }`,
      );
      if (sec.reasons && Object.keys(sec.reasons).length > 0) {
        lines.push('  Reasons:');
        for (const [k, v] of Object.entries(sec.reasons)) {
          lines.push(`    ${k.padEnd(22)} ${v}`);
        }
      }
      if (sec.sample && sec.sample.length > 0) {
        lines.push(`  Sample rows (${sec.sample.length}):`);
        const sampleJson = JSON.stringify(sec.sample, null, 2);
        for (const ln of sampleJson.split('\n')) {
          lines.push(`    ${ln}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  };

  const handleCopyDiagnose = async () => {
    const text = formatDiagnoseReport();
    if (!text) return;
    try {
      // Modern Clipboard API. Requires HTTPS or localhost AND a user gesture
      // (the click that called this counts).
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts: hidden textarea + execCommand.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setDiagnoseCopied(true);
      setTimeout(() => setDiagnoseCopied(false), 2000);
    } catch (e) {
      console.error('[payroll-page] copy diagnose failed', e);
      // As a last resort, drop into a window prompt so the user can grab it.
      try {
        window.prompt('Copy the diagnostic report below:', text);
      } catch {
        // ignore
      }
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
      <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          <Skeleton className="h-10 sm:h-12 w-48 sm:w-72 bg-black/5" />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 sm:h-28 bg-black/5" />
            ))}
          </div>
          <Skeleton className="h-56 sm:h-64 bg-black/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
        {/* Sticky header — negative margin tracks the outer padding so the
            backdrop spans edge-to-edge at every breakpoint */}
        <header className="sticky top-0 z-20 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 py-3 sm:py-4 bg-gray-50/95 backdrop-blur-sm border-b border-black/10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <div
                  className="rounded-lg p-1.5 sm:p-2 ring-1 ring-black/5 shrink-0"
                  style={{ backgroundColor: `${ACCENT}14` }}
                >
                  <Wallet className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: ACCENT }} />
                </div>
                <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-gray-900 truncate">
                  Payroll
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-[12px] text-gray-500 pl-[36px] sm:pl-[44px]">
                <span className="font-medium text-gray-700">{monthLabel}</span>
                {lastGeneratedAt && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        Last generated{' '}
                        {lastGeneratedAt.toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Action row — month picker takes available width on mobile,
                secondary buttons collapse to icon-only below sm.
                Primary CTA stays labeled at every size. */}
            <div className="flex flex-wrap items-stretch gap-2">
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="Select month"
                className="h-9 min-w-0 flex-1 sm:flex-initial rounded-md border border-black/10 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#5a4d96]/30 focus:border-[#5a4d96]/40"
              />
              <Link href="/payroll/configure" className="shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Configure"
                  title="Configure"
                  className="h-9 px-2.5 sm:px-3 gap-2 border-black/10 bg-white hover:bg-black/5 text-gray-700"
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Configure</span>
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
                aria-label="Diagnose"
                title="Diagnose"
                className="h-9 px-2.5 sm:px-3 gap-2 border-black/10 bg-white hover:bg-black/5 text-gray-700 shrink-0"
              >
                <Stethoscope
                  className={cn('h-4 w-4 shrink-0', diagnoseLoading && 'animate-pulse')}
                />
                <span className="hidden sm:inline">Diagnose</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadData(month)}
                disabled={loading}
                aria-label="Refresh"
                title="Refresh"
                className="h-9 px-2.5 sm:px-3 gap-2 border-black/10 bg-white hover:bg-black/5 text-gray-700 shrink-0"
              >
                <RefreshCw className={cn('h-4 w-4 shrink-0', loading && 'animate-spin')} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button
                size="sm"
                onClick={generate}
                disabled={generating}
                aria-label={generating ? 'Generating' : 'Auto-Generate'}
                className="h-9 px-3 gap-2 text-white shadow-sm shrink-0"
                style={{ backgroundColor: ACCENT }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    '#6b5da8')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.backgroundColor = ACCENT)
                }
              >
                <Sparkles className={cn('h-4 w-4 shrink-0', generating && 'animate-pulse')} />
                <span className="whitespace-nowrap">
                  {generating ? 'Generating…' : (
                    <>
                      <span className="sm:hidden">Generate</span>
                      <span className="hidden sm:inline">Auto-Generate</span>
                    </>
                  )}
                </span>
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
            !stats.formsStatus.hasAnyCheckInSource ||
            (!stats.formsStatus.hasCheckOutForm && !stats.formsStatus.hasNativeAttendance)) && (
            <div className="rounded-md border border-black/10 bg-white px-4 py-3 text-sm">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <div className="space-y-1 flex-1">
                  <p className="font-semibold text-gray-900">HR data sources</p>
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
                          form bound ({stats.formsStatus.checkInFormName})
                        </span>
                      ) : stats.formsStatus.hasNativeAttendance ? (
                        <span className="font-medium text-emerald-700">
                          widget rows ({stats.formsStatus.nativeAttendanceCount ?? 0} punches)
                        </span>
                      ) : (
                        <span className="font-medium text-red-600">
                          missing — bind a form or have employees punch in via /attendance
                        </span>
                      )}
                    </li>
                    <li>
                      Check-Out:{' '}
                      {stats.formsStatus.hasCheckOutForm ? (
                        <span className="font-medium text-gray-800">
                          form bound ({stats.formsStatus.checkOutFormName})
                        </span>
                      ) : stats.formsStatus.hasNativeAttendance ? (
                        <span className="text-gray-500">optional — widget covers this</span>
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
              className="cursor-pointer select-none px-4 py-3 sm:px-6 sm:py-4"
              onClick={() => setDiagnoseOpen((v) => !v)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Stethoscope className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" style={{ color: ACCENT }} />
                  <CardTitle className="text-sm sm:text-base text-gray-900 truncate">
                    Payroll Diagnostic Report
                  </CardTitle>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Copy entire report to clipboard. Click stops propagation
                      so the card doesn't toggle open/closed. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={diagnoseCopied ? 'Report copied' : 'Copy diagnostic report'}
                    title={diagnoseCopied ? 'Copied!' : 'Copy report'}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyDiagnose();
                    }}
                    className={cn(
                      'h-7 px-2 gap-1.5 transition-colors',
                      diagnoseCopied
                        ? 'text-[#5a4d96] bg-[#5a4d96]/10 hover:bg-[#5a4d96]/15'
                        : 'text-gray-600 hover:bg-black/5 hover:text-gray-900',
                    )}
                  >
                    {diagnoseCopied ? (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="hidden sm:inline text-xs font-medium">
                      {diagnoseCopied ? 'Copied' : 'Copy'}
                    </span>
                  </Button>
                  {diagnoseOpen ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </div>
              <CardDescription className="text-gray-500 text-xs sm:text-sm">
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
              aria-label="Overview"
              className="gap-1 px-2 text-xs sm:text-sm text-gray-600 data-[state=active]:bg-[#5a4d96]/10 data-[state=active]:text-[#5a4d96] data-[state=active]:shadow-none"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger
              value="run"
              aria-label="Run Payroll"
              className="gap-1 px-2 text-xs sm:text-sm text-gray-600 data-[state=active]:bg-[#5a4d96]/10 data-[state=active]:text-[#5a4d96] data-[state=active]:shadow-none"
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Run Payroll</span>
            </TabsTrigger>
            <TabsTrigger
              value="records"
              aria-label="Records"
              className="gap-1 px-2 text-xs sm:text-sm text-gray-600 data-[state=active]:bg-[#5a4d96]/10 data-[state=active]:text-[#5a4d96] data-[state=active]:shadow-none"
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Records</span>
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              aria-label="Analytics"
              className="gap-1 px-2 text-xs sm:text-sm text-gray-600 data-[state=active]:bg-[#5a4d96]/10 data-[state=active]:text-[#5a4d96] data-[state=active]:shadow-none"
            >
              <TrendingUp className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2 border border-black/10 bg-white shadow-none">
                <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
                  <CardTitle className="flex items-center gap-2 text-gray-900 text-sm sm:text-base">
                    <Building2 className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" style={{ color: ACCENT }} />
                    Department Breakdown
                  </CardTitle>
                  <CardDescription className="text-gray-500 text-xs sm:text-sm">
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
                <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
                  <CardTitle className="flex items-center gap-2 text-gray-900 text-sm sm:text-base">
                    <Wallet className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" style={{ color: ACCENT }} />
                    Cost Composition
                  </CardTitle>
                  <CardDescription className="text-gray-500 text-xs sm:text-sm">
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
              <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
                <div className="min-w-0">
                  <CardTitle className="text-sm sm:text-base text-gray-900 truncate">
                    Top Earners
                  </CardTitle>
                  <CardDescription className="text-gray-500 text-xs sm:text-sm truncate">
                    Highest net salaries this month
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 shrink-0 text-gray-600 hover:bg-black/5 hover:text-gray-900"
                  onClick={() => setActiveTab('records')}
                >
                  <span className="hidden sm:inline">See all</span>
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
              <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <CardTitle className="text-gray-900 text-base truncate">
                      Payroll Records — {monthLabel}
                    </CardTitle>
                    <CardDescription className="text-gray-500">
                      {filteredPayrolls.length} of {payrolls.length} record
                      {payrolls.length === 1 ? '' : 's'}
                    </CardDescription>
                  </div>
                  {/* Search + status: each takes its share of the row on mobile */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <Input
                        type="search"
                        placeholder="Search name, email, dept…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9 pl-8 w-full sm:w-56 bg-white border-black/10 focus-visible:ring-2 focus-visible:ring-[#5a4d96]/30 focus-visible:border-[#5a4d96]/40"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9 w-full sm:w-36 bg-white border-black/10">
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
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
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
                  /*
                   * Responsive table strategy:
                   *  - Phone (< sm):       Employee | Net | Status | Action
                   *  - Tablet (sm – md):   + Department, Gross, Deductions
                   *  - Desktop (lg+):      everything (Days, Hours)
                   * The Employee cell shows Department under the name on
                   * mobile so users still see the department even though the
                   * column itself is hidden — no information is lost.
                   */
                  <div className="overflow-x-auto sidebar-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-black/10 bg-gray-50 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                          <th className="px-3 sm:px-4 py-2.5 sm:py-3">Employee</th>
                          <th className="hidden md:table-cell px-3 py-3">Department</th>
                          <th className="hidden lg:table-cell px-3 py-3 text-center">Days</th>
                          <th className="hidden lg:table-cell px-3 py-3 text-center">Hours</th>
                          {/* Compact attendance-mix column. Header uses
                              colour-coded letters so the row data stays
                              dense. Hidden below xl since the drawer is
                              the canonical place for the full breakdown. */}
                          <th
                            className="hidden xl:table-cell px-3 py-3 text-center"
                            title="Paid Leave / Holiday / Loss of Pay"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span style={{ color: ACCENT }}>L</span>
                              <span className="text-gray-300">·</span>
                              <span className="text-emerald-700">H</span>
                              <span className="text-gray-300">·</span>
                              <span className="text-red-600">LOP</span>
                            </span>
                          </th>
                          <th className="hidden md:table-cell px-3 py-3 text-right">Gross</th>
                          <th className="hidden md:table-cell px-3 py-3 text-right">Deductions</th>
                          <th className="px-3 py-3 text-right">Net</th>
                          <th className="hidden sm:table-cell px-3 py-3 text-center">Status</th>
                          <th className="px-2 sm:px-3 py-3 text-center">Action</th>
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
                              <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                  <div
                                    className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center text-[11px] font-semibold text-white ring-1 ring-black/5"
                                    style={{ backgroundColor: ACCENT }}
                                  >
                                    {initialsOf(p.employeeName)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-gray-900 truncate text-[13px] sm:text-sm">
                                      {p.employeeName}
                                    </p>
                                    <p className="text-[11px] text-gray-500 truncate">
                                      {p.email || p.employeeId}
                                    </p>
                                    {/* Show department + status inline on
                                        mobile since their dedicated columns
                                        are hidden below md/sm. */}
                                    <div className="md:hidden flex items-center gap-2 mt-1 flex-wrap">
                                      {p.department && (
                                        <span className="text-[10px] text-gray-500 truncate">
                                          {p.department}
                                        </span>
                                      )}
                                      <span className="sm:hidden">
                                        <StatusPill status={p.status} />
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="hidden md:table-cell px-3 py-3 text-gray-600">
                                {p.department || '—'}
                              </td>
                              <td className="hidden lg:table-cell px-3 py-3 text-center tabular-nums text-gray-700">
                                {p.workingDays}
                              </td>
                              <td className="hidden lg:table-cell px-3 py-3 text-center tabular-nums text-gray-700">
                                {p.workingHours.toFixed(1)}
                              </td>
                              <td className="hidden xl:table-cell px-3 py-3 text-center tabular-nums">
                                {p.breakdown ? (
                                  <span className="inline-flex items-center gap-1 text-[12px]">
                                    <span
                                      style={{ color: ACCENT }}
                                      title={`${p.breakdown.paidLeaveDays} day(s) paid leave`}
                                    >
                                      {fmtDays(p.breakdown.paidLeaveDays)}
                                    </span>
                                    <span className="text-gray-300">·</span>
                                    <span
                                      className="text-emerald-700"
                                      title={`${p.breakdown.holidayDays} holiday(s)`}
                                    >
                                      {fmtDays(p.breakdown.holidayDays)}
                                    </span>
                                    <span className="text-gray-300">·</span>
                                    <span
                                      className={
                                        p.breakdown.unpaidLeaveDays + p.breakdown.absentDays > 0
                                          ? 'text-red-600'
                                          : 'text-gray-400'
                                      }
                                      title={`${p.breakdown.unpaidLeaveDays} unpaid leave + ${p.breakdown.absentDays} absent`}
                                    >
                                      {fmtDays(p.breakdown.unpaidLeaveDays + p.breakdown.absentDays)}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="hidden md:table-cell px-3 py-3 text-right tabular-nums text-gray-700">
                                ₹{formatINR(p.grossSalary)}
                              </td>
                              <td className="hidden md:table-cell px-3 py-3 text-right tabular-nums text-gray-500">
                                ₹{formatINR(totalDed)}
                              </td>
                              <td className="px-3 py-2.5 sm:py-3 text-right tabular-nums font-bold text-gray-900 whitespace-nowrap">
                                ₹{formatINR(p.netSalary)}
                              </td>
                              <td className="hidden sm:table-cell px-3 py-3 text-center">
                                <StatusPill status={p.status} />
                              </td>
                              <td className="px-2 sm:px-3 py-2.5 sm:py-3 text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelected(p);
                                  }}
                                  aria-label="View details"
                                  className="gap-1 h-8 px-2 sm:px-2.5 text-gray-600 hover:bg-black/5 hover:text-gray-900"
                                >
                                  <Eye className="h-3.5 w-3.5 shrink-0" />
                                  <span className="hidden sm:inline">View</span>
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

        {/* Employee detail drawer.
            We deliberately keep `selected` set when opening the Payslip and
            instead derive the Sheet's `open` from `!showPayslip` — that way
            the drawer slides out before the Payslip fades in (no overlapping
            modals fighting for z-index) and re-appears as soon as the
            Payslip is dismissed. The onOpenChange guard prevents the Sheet's
            own close-driven cleanup from racing with that transition. */}
        <Sheet
          open={!!selected && !showPayslip}
          onOpenChange={(open) => {
            if (!open && !showPayslip) setSelected(null);
          }}
        >
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto sidebar-scroll bg-white px-4 sm:px-6">
            {selected && (
              <>
                <SheetHeader className="space-y-3 text-left">
                  <div className="flex items-start gap-3">
                    <div
                      className="h-10 w-10 sm:h-12 sm:w-12 rounded-md flex items-center justify-center text-sm sm:text-base font-semibold text-white ring-1 ring-black/5 shrink-0"
                      style={{ backgroundColor: ACCENT }}
                    >
                      {initialsOf(selected.employeeName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <SheetTitle className="truncate text-gray-900 text-base sm:text-lg">
                        {selected.employeeName}
                      </SheetTitle>
                      <SheetDescription className="flex items-center gap-1.5 text-xs text-gray-500 truncate">
                        <Briefcase className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {selected.designation || '—'} · {selected.department || 'Unassigned'}
                        </span>
                      </SheetDescription>
                    </div>
                    <div className="shrink-0">
                      <StatusPill status={selected.status} />
                    </div>
                  </div>
                  {selected.email && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 truncate">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{selected.email}</span>
                    </div>
                  )}
                </SheetHeader>

                <div className="mt-5 sm:mt-6 space-y-4 sm:space-y-5">
                  <div
                    className="rounded-md border border-black/10 p-3 sm:p-4"
                    style={{ backgroundColor: `${ACCENT}0d` }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                      Net Salary
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums mt-1 break-all">
                      ₹{formatINR(selected.netSalary)}
                    </p>
                    <p className="text-xs text-gray-500">for {monthLabel}</p>
                  </div>

                  {/* Per-employee pay rule selector. Switching the dropdown
                      hits /api/payroll/profiles/assign, invalidates the live
                      cache, and re-fetches /api/payroll so the breakdown
                      below updates without closing the drawer. */}
                  <div className="rounded-md border border-black/10 bg-white p-3 sm:p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                        Pay Rule Profile
                      </p>
                      <Link
                        href="/payroll/profiles"
                        className="text-[11px] font-medium text-gray-500 hover:text-gray-900 hover:underline"
                      >
                        Manage profiles
                      </Link>
                    </div>
                    {profiles.length === 0 ? (
                      <p className="text-xs text-gray-500">
                        No profiles yet.{' '}
                        <Link href="/payroll/profiles" className="font-medium text-gray-900 underline">
                          Create one
                        </Link>{' '}
                        to use per-employee pay rules. Until then this employee uses the global setup config.
                      </p>
                    ) : (
                      <>
                        <select
                          value={selected.payrollProfileId ?? ''}
                          disabled={profileAssigning}
                          onChange={(e) =>
                            assignProfile(selected.employeeId, e.target.value || null)
                          }
                          className="h-9 w-full rounded-md border border-black/10 bg-white px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
                        >
                          <option value="">— Use default profile —</option>
                          {profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.isDefault ? ' (default)' : ''}
                            </option>
                          ))}
                        </select>

                        {/* Effective-from controls. The radio + month input
                            apply to the very next assign action — selecting a
                            profile in the dropdown above immediately fires the
                            API with this value. */}
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                          <span className="font-semibold uppercase tracking-wider text-gray-500">
                            Apply from
                          </span>
                          <label className="inline-flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name="panel-eff"
                              checked={panelEffMode === 'current'}
                              onChange={() => setPanelEffMode('current')}
                              className="h-3 w-3"
                            />
                            Current month
                          </label>
                          <label className="inline-flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name="panel-eff"
                              checked={panelEffMode === 'next'}
                              onChange={() => setPanelEffMode('next')}
                              className="h-3 w-3"
                            />
                            Next month
                          </label>
                          <label className="inline-flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name="panel-eff"
                              checked={panelEffMode === 'specific'}
                              onChange={() => setPanelEffMode('specific')}
                              className="h-3 w-3"
                            />
                            Specific
                          </label>
                          {panelEffMode === 'specific' && (
                            <input
                              type="month"
                              value={panelEffSpecific}
                              onChange={(e) => setPanelEffSpecific(e.target.value)}
                              className="h-6 rounded-md border border-black/10 bg-white px-1.5 text-[11px]"
                            />
                          )}
                        </div>

                        <p className="text-[11px] text-gray-500">
                          {selected.payrollProfileName ? (
                            <>
                              Currently applied:{' '}
                              <span className="font-medium text-gray-700">
                                {selected.payrollProfileName}
                              </span>
                              {selected.payrollProfileSource === 'default-profile' && (
                                <span> (org default)</span>
                              )}
                              {selected.payrollProfileSource === 'profile' && (
                                <span> (assigned to employee)</span>
                              )}
                            </>
                          ) : selected.payrollProfileSource === 'global-setup' ? (
                            'Currently applied: global setup config (no profile assigned)'
                          ) : (
                            'Currently applied: built-in defaults'
                          )}
                        </p>
                      </>
                    )}
                  </div>

                  {(() => {
                    // Show every earned component the engine produced. Allowances
                    // disabled in Pay Rules emit 0 and drop off the list, so the
                    // visible rows match the active toggles exactly.
                    const e = selected.earnings;
                    const earnRows: { label: string; value: number }[] = e
                      ? [
                          { label: 'Basic Pay', value: e.basic },
                          { label: 'HRA', value: e.hra },
                          { label: 'DA (Dearness)', value: e.da },
                          { label: 'Conveyance', value: e.conveyance },
                          { label: 'Medical', value: e.medical },
                          { label: 'LTA', value: e.lta },
                          { label: 'Food / Meal', value: e.food },
                          { label: 'Telephone / Internet', value: e.telephone },
                          { label: 'Children’s Education', value: e.education },
                          { label: 'Fuel / Car', value: e.fuel },
                          { label: 'Books & Periodicals', value: e.books },
                          { label: 'Uniform', value: e.uniform },
                          { label: 'Special Allowance', value: e.specialAllowance },
                          { label: 'Overtime', value: e.overtime },
                        ]
                      : [];
                    const visible = earnRows.filter((r) => r.value > 0);
                    return (
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
                            label="Payable Days"
                            value={
                              selected.breakdown
                                ? `${fmtDays(selected.breakdown.payableDays)} of ${selected.breakdown.daysInMonth}`
                                : `${selected.workingDays}`
                            }
                            sub={`${selected.workingHours.toFixed(1)} hours total`}
                          />
                          {visible.map((r) => (
                            <Row key={r.label} label={r.label} value={`₹${formatINR(r.value)}`} />
                          ))}
                          <Row
                            label="Gross Salary"
                            value={`₹${formatINR(selected.grossSalary)}`}
                            emphasis
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Attendance breakdown — only renders when the current
                      record was produced by the per-day classifier. Older
                      cached records have no breakdown so we don't surface
                      half-built data. */}
                  {selected.breakdown && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-2">
                        Attendance Breakdown
                      </p>
                      <div className="rounded-md border border-black/10 divide-y divide-black/5 bg-white">
                        <Row
                          label="Present"
                          value={fmtDays(selected.breakdown.presentDays)}
                          sub="full-day check-ins"
                        />
                        <Row
                          label="Half-day"
                          value={fmtDays(selected.breakdown.halfDays)}
                          sub="partial attendance"
                        />
                        <Row
                          label="Paid Leave"
                          value={fmtDays(selected.breakdown.paidLeaveDays)}
                          sub={
                            (() => {
                              // Filter to only paid types for the sub-line.
                              // Best-effort: we list the names tracked by the
                              // calculator that contributed any days.
                              const types = Object.entries(selected.breakdown!.leaveByType ?? {})
                                .filter(([, v]) => v > 0)
                                .map(([k]) => k);
                              return types.length > 0 ? types.join(', ') : 'no leaves applied';
                            })()
                          }
                        />
                        <Row
                          label="Holidays"
                          value={fmtDays(selected.breakdown.holidayDays)}
                          sub="company calendar"
                        />
                        <Row
                          label="Weekly Off"
                          value={fmtDays(selected.breakdown.weeklyOffDays)}
                          sub="paid as per policy"
                        />
                        <Row
                          label="Unpaid Leave (LOP)"
                          value={fmtDays(selected.breakdown.unpaidLeaveDays)}
                          sub="leave without pay"
                        />
                        <Row
                          label="Absent (LOP)"
                          value={fmtDays(selected.breakdown.absentDays)}
                          sub="no record on file"
                        />
                        {selected.breakdown.outOfServiceDays > 0 && (
                          <Row
                            label="Out of Service"
                            value={fmtDays(selected.breakdown.outOfServiceDays)}
                            sub="before joining / after exit"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {(() => {
                    // Render only the deductions actually applied by the
                    // engine. A disabled component (e.g. PF off in Pay Rules)
                    // emits 0, so the row disappears entirely — making the
                    // effect of every toggle visible at a glance. Falls back
                    // to the legacy 4-slot view for older records that don't
                    // carry `deductionsDetail`.
                    const dd = selected.deductionsDetail;
                    const detailRows: { label: string; sub: string; value: number }[] = dd
                      ? [
                          { label: 'Provident Fund', sub: 'PF on Basic', value: dd.pf },
                          { label: 'Employee State Insurance', sub: 'ESI on gross', value: dd.esi },
                          { label: 'Professional Tax', sub: 'state slab', value: dd.pt },
                          { label: 'Income Tax (TDS)', sub: 'TDS on gross', value: dd.tds },
                          { label: 'Labour Welfare Fund', sub: 'LWF', value: dd.lwf },
                          { label: 'National Pension Scheme', sub: 'NPS on Basic', value: dd.nps },
                        ]
                      : [
                          { label: 'Provident Fund', sub: 'PF', value: selected.deductions.pf },
                          { label: 'Income Tax', sub: 'TDS', value: selected.deductions.tax },
                          { label: 'Insurance', sub: 'ESI', value: selected.deductions.insurance },
                          { label: 'Other', sub: 'PT + LWF + NPS', value: selected.deductions.other },
                        ];
                    const visible = detailRows.filter((r) => r.value > 0);
                    const totalDed = detailRows.reduce((s, r) => s + r.value, 0);
                    return (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-2">
                          Deductions
                        </p>
                        <div className="rounded-md border border-black/10 divide-y divide-black/5 bg-white">
                          {visible.length === 0 ? (
                            <Row
                              label="No deductions"
                              value="₹0"
                              sub="all statutory components disabled in Pay Rules"
                            />
                          ) : (
                            visible.map((r) => (
                              <Row
                                key={r.label}
                                label={r.label}
                                value={`₹${formatINR(r.value)}`}
                                sub={r.sub}
                              />
                            ))
                          )}
                          <Row
                            label="Total Deductions"
                            value={`₹${formatINR(totalDed)}`}
                            emphasis
                          />
                        </div>
                      </div>
                    );
                  })()}

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
