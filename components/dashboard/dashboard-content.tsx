'use client';

/**
 * Admin Dashboard — Pulse band + Activity charts.
 *
 *   1. Pulse band — "X of Y present today" plus two action cards
 *      (pending leaves, new applicants) that link to the page where the
 *      admin can act on each.
 *   2. Activity — submissions trend over 30 days (with a vs-last-week
 *      delta chip) and top modules ranked by record volume.
 *
 * Single primary accent, monochrome icons, mobile-first grids that
 * collapse to one column.
 */

import {
  Users,
  CalendarOff,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Briefcase,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatNumber } from '@/lib/analytics-constants';
import { cn } from '@/lib/utils';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface DashboardContentProps {
  organizationName: string;
  pulse: {
    presentToday: number;
    onLeaveToday: number;
    totalEmployees: number;
    pendingLeaves: number;
    newApplications: number;
    submissionsThisWeek: number;
    submissionsPriorWeek: number;
  };
  modules: Array<{
    id: string;
    name: string;
    totalRecords: number;
  }>;
  timeSeries: Array<{ date: string; submissions: number }>;
}

// Compute percentage with a clean fallback when the denominator is zero
// (brand-new org with no employees yet → show "—" instead of NaN).
function pctSafe(numer: number, denom: number): number | null {
  if (!denom || denom <= 0) return null;
  return Math.round((numer / denom) * 100);
}

// Week-over-week delta, expressed as a signed percentage. Returns null
// when the prior week is zero (can't meaningfully compute "% change from
// nothing"); the UI renders that as a neutral state.
function weekDelta(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

export function DashboardContent({
  organizationName,
  pulse,
  modules,
  timeSeries,
}: DashboardContentProps) {
  const presentPct = pctSafe(pulse.presentToday, pulse.totalEmployees);
  const absentCount = Math.max(
    pulse.totalEmployees - pulse.presentToday - pulse.onLeaveToday,
    0,
  );
  const submissionsDelta = weekDelta(pulse.submissionsThisWeek, pulse.submissionsPriorWeek);

  const topModules = [...modules]
    .sort((a, b) => b.totalRecords - a.totalRecords)
    .slice(0, 6);

  return (
    <div className="space-y-6 sm:space-y-8 py-4 px-4 sm:px-6 max-w-7xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {organizationName} · {formatRelativeToday()}
        </p>
      </div>

      {/* ── Pulse band ──────────────────────────────────────────────── */}
      <section aria-labelledby="pulse-heading">
        <h2 id="pulse-heading" className="sr-only">
          Today's pulse
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Primary stat — Present today */}
          <Card className="lg:col-span-1 border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Present today
                  </p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-4xl font-bold tabular-nums">
                      {pulse.presentToday}
                    </span>
                    <span className="text-base text-muted-foreground tabular-nums">
                      / {pulse.totalEmployees}
                    </span>
                  </div>
                </div>
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Progress
                  value={presentPct ?? 0}
                  className="h-1.5"
                  aria-label={presentPct == null ? 'No employees' : `${presentPct}% present`}
                />
                <p className="text-xs text-muted-foreground">
                  {presentPct == null ? (
                    <span className="italic">No employees yet</span>
                  ) : (
                    <>
                      <span className="font-medium text-foreground tabular-nums">
                        {presentPct}%
                      </span>{' '}
                      checked in · {absentCount} absent ·{' '}
                      <span className="tabular-nums">{pulse.onLeaveToday}</span> on leave
                    </>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Action card — Pending leaves */}
          <ActionCard
            href="/leave?status=PENDING"
            label="Awaiting your decision"
            value={pulse.pendingLeaves}
            unit={pulse.pendingLeaves === 1 ? 'leave request' : 'leave requests'}
            icon={<CalendarOff className="h-4 w-4" />}
            tone={pulse.pendingLeaves > 0 ? 'amber' : 'neutral'}
          />

          {/* Action card — New applications */}
          <ActionCard
            href="/hr/recruitment/job-application"
            label="New applicants"
            value={pulse.newApplications}
            unit={pulse.newApplications === 1 ? 'application' : 'applications'}
            icon={<Briefcase className="h-4 w-4" />}
            tone="neutral"
          />
        </div>
      </section>

      {/* ── Activity — trend + top modules ──────────────────────────── */}
      <section aria-labelledby="activity-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="activity-heading" className="text-base font-semibold tracking-tight">
            Activity
          </h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">
              {formatNumber(pulse.submissionsThisWeek)}
            </span>{' '}
            submissions this week
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Submissions trend */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-sm font-semibold">Submissions, last 30 days</CardTitle>
                <CardDescription className="text-xs">
                  Form records across every active module
                </CardDescription>
              </div>
              <DeltaChip delta={submissionsDelta} />
            </CardHeader>
            <CardContent className="pt-2">
              {timeSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={timeSeries} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="submGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) =>
                        new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })
                      }
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                    />
                    <Tooltip
                      labelFormatter={(v) =>
                        new Date(v).toLocaleDateString('en', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })
                      }
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="submissions"
                      stroke="hsl(var(--primary))"
                      fill="url(#submGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label="No submissions in the last 30 days" />
              )}
            </CardContent>
          </Card>

          {/* Top modules */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Top modules</CardTitle>
              <CardDescription className="text-xs">
                Ranked by total records
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              {topModules.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={topModules.map((m) => ({
                      name: m.name.length > 18 ? m.name.slice(0, 18) + '…' : m.name,
                      records: m.totalRecords,
                    }))}
                    layout="vertical"
                    margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={110}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="records" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label="No module activity yet" />
              )}
            </CardContent>
          </Card>
        </div>
      </section>

    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface ActionCardProps {
  href: string;
  label: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  tone: 'amber' | 'neutral';
}

function ActionCard({ href, label, value, unit, icon, tone }: ActionCardProps) {
  const isAttention = tone === 'amber' && value > 0;
  const isAllClear = value === 0;
  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <Card
        className={cn(
          'h-full transition-colors',
          isAttention
            ? 'border-amber-300/60 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 group-hover:border-amber-400'
            : 'group-hover:border-foreground/20',
          'group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2',
        )}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={cn(
                    'text-4xl font-bold tabular-nums',
                    isAttention && 'text-amber-700 dark:text-amber-400',
                    isAllClear && 'text-muted-foreground/60',
                  )}
                >
                  {value}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {isAllClear ? 'all clear' : unit}
                </span>
              </div>
            </div>
            <div
              className={cn(
                'rounded-md p-2',
                isAttention
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {icon}
            </div>
          </div>
          <p className="mt-4 inline-flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            {isAllClear ? 'Open page' : 'Review'}
            <ChevronRight className="h-3 w-3" />
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta == null) {
    return (
      <Badge variant="secondary" className="font-normal text-[11px] gap-1">
        <Minus className="h-3 w-3" />
        no prior data
      </Badge>
    );
  }
  const positive = delta >= 0;
  return (
    <Badge
      variant="secondary"
      className={cn(
        'font-normal text-[11px] gap-1 tabular-nums',
        positive
          ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/10'
          : 'text-rose-700 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/10',
      )}
    >
      {positive ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {positive ? '+' : ''}
      {delta}% vs last week
    </Badge>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm italic">
      {label}
    </div>
  );
}

// Friendly "Tuesday, May 26" style label for the page header
function formatRelativeToday(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
