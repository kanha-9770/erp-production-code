'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  FileText, CalendarCheck, Activity, LogIn, Building2,
  Clock, TrendingUp, ArrowUpRight, ChevronDown, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/analytics-constants';
import { cn } from '@/lib/utils';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  useGetDashboardSummaryQuery,
  useGetDashboardModulesQuery,
  useGetDashboardTimeSeriesQuery,
  useGetDashboardRecentActivityQuery,
} from '@/lib/api/dashboard';
import { AttendanceWidget } from '@/components/attendance/attendance-widget';
import { EmployeeProfileCard } from '@/components/dashboard/employee-profile-card';

// Each stat card uses a distinct accent tone so the row reads as four
// glanceable signals rather than four near-identical white tiles. The
// tones are kept inside the existing primary/emerald/amber/indigo palette
// so the page still feels coherent with the rest of the app — no candy
// colours. Each card links to the page that owns its detail data.
const statCards = [
  {
    key: 'mySubmissions',
    label: 'Submissions',
    icon: FileText,
    href: '/profile#overview',
    tint: 'from-blue-500/10 to-transparent',
    iconBg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    ring: 'hover:border-blue-400/50',
  },
  {
    key: 'myAttendance',
    label: 'Attendance',
    icon: CalendarCheck,
    href: '/attendance',
    tint: 'from-emerald-500/10 to-transparent',
    iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    ring: 'hover:border-emerald-400/50',
  },
  {
    key: 'myActivityCount',
    label: 'Activities',
    icon: Activity,
    href: '/profile#security',
    tint: 'from-amber-500/10 to-transparent',
    iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    ring: 'hover:border-amber-400/50',
  },
  {
    key: 'myLoginCount',
    label: 'Logins',
    icon: LogIn,
    href: '/settings/login-history',
    tint: 'from-indigo-500/10 to-transparent',
    iconBg: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
    ring: 'hover:border-indigo-400/50',
  },
] as const;

export function UserDashboardContent() {
  // First-paint query — fires on mount, light enough to land in tens of ms.
  // Everything below the stat cards is gated behind explicit user intent so
  // first paint doesn't pay for data the user may never look at.
  const { data, isLoading } = useGetDashboardSummaryQuery();

  // Each detail panel has its own "load on click" state. RTK Query's `skip`
  // suppresses the fetch until the user toggles the panel open. Once open,
  // the cache keeps the data warm for ~5 minutes so re-opening is instant.
  const [showTrend, setShowTrend] = useState(false);
  const [showModules, setShowModules] = useState(false);
  const [showActivity, setShowActivity] = useState(false);

  if (isLoading || !data) {
    return <DashboardSkeleton />;
  }

  const { user, stats } = data;

  return (
    <div className="space-y-6 sm:space-y-8 py-4 px-3 sm:px-6 max-w-7xl mx-auto">
      {/* ── Profile ─────────────────────────────────────────────────────
          Social-media-style profile header: gradient cover, overlapping
          avatar, identity, a tenure/shift/hours/team stat strip, and a
          contact row. Renders instantly from the summary payload and
          enriches from /api/auth/me (avatar, shift, contact, etc.). */}
      <EmployeeProfileCard summary={user} />

      {/* ── Attendance ──────────────────────────────────────────────────
          Reuses the same `<AttendanceWidget />` the sidebar and mobile
          bottom-nav use — punch flow (face capture, geofence,
          holiday/leave gating) stays centralised. Card itself gets a
          slim primary border accent on the left so it reads as the
          page's active action. */}
      <Card className="border-l-4 border-l-primary shadow-sm overflow-visible">
        <CardHeader className="pb-3 flex-row items-start justify-between space-y-0 gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Today&apos;s attendance
            </CardTitle>
            <CardDescription className="mt-1">
              Tap to check in or out — shift, geofence, and leave status are handled automatically.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <AttendanceWidget className="w-full max-w-md" />
        </CardContent>
      </Card>

      {/* ── Stats row ───────────────────────────────────────────────────
          Four tinted tiles, one accent each. Per-card gradient lifts the
          row off the page so the four numbers read as "signals" rather
          than four identical white cards. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((item) => {
          const Icon = item.icon;
          const value = stats[item.key as keyof typeof stats];
          return (
            <Link
              key={item.key}
              href={item.href}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
              aria-label={`View ${item.label}`}
            >
              <Card
                className={cn(
                  'group relative overflow-hidden border shadow-sm transition-all',
                  'hover:shadow-md hover:-translate-y-0.5 cursor-pointer h-full',
                  'bg-gradient-to-br',
                  item.tint,
                  item.ring,
                )}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn('rounded-md p-2', item.iconBg)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground/70 transition-colors" />
                  </div>
                  <p className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-1 text-2xl sm:text-3xl font-bold tabular-nums">
                    {formatNumber(value)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* ── Submission trend (click-to-load) ────────────────────────── */}
      <CollapsibleSection
        title="Submission trend"
        description="Your form submissions over the last 30 days"
        icon={<TrendingUp className="h-4 w-4 text-primary" />}
        open={showTrend}
        onToggle={() => setShowTrend((v) => !v)}
      >
        {showTrend && <SubmissionTrendPanel />}
      </CollapsibleSection>

      {/* ── Modules + Recent activity (both click-to-load) ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2">
          <CollapsibleSection
            title="Available modules"
            description="Modules you have access to"
            icon={<Building2 className="h-4 w-4 text-primary" />}
            open={showModules}
            onToggle={() => setShowModules((v) => !v)}
          >
            {showModules && <ModulesPanel />}
          </CollapsibleSection>
        </div>

        <CollapsibleSection
          title="Recent activity"
          description="Your latest actions"
          icon={<Clock className="h-4 w-4 text-primary" />}
          open={showActivity}
          onToggle={() => setShowActivity((v) => !v)}
        >
          {showActivity && <RecentActivityPanel />}
        </CollapsibleSection>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsible shell — uniform "click to expand → fetch" wrapper.
// ─────────────────────────────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  description,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="border shadow-sm">
      <CardHeader
        className="pb-2 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-t-lg"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {icon}
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="shrink-0 h-7 px-2"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            />
            <span className="ml-1 text-xs">{open ? 'Hide' : 'Load'}</span>
          </Button>
        </div>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail panels — each triggers its own RTK query on mount.
// ─────────────────────────────────────────────────────────────────────────────

function SubmissionTrendPanel() {
  const { data, isLoading } = useGetDashboardTimeSeriesQuery();
  if (isLoading) return <PanelLoader label="Loading submission trend…" />;
  const timeSeries = data?.timeSeries ?? [];

  if (timeSeries.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
        No submissions in this period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={timeSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="userSubmGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          className="text-xs"
          tick={{ fill: 'hsl(var(--muted-foreground))' }}
        />
        <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
        <Tooltip
          labelFormatter={(v) => new Date(v).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
        />
        <Area
          type="monotone"
          dataKey="submissions"
          stroke="hsl(var(--chart-1))"
          fill="url(#userSubmGrad)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ModulesPanel() {
  const { data, isLoading } = useGetDashboardModulesQuery();
  if (isLoading) return <PanelLoader label="Loading modules…" />;
  const modules = data?.modules ?? [];

  if (modules.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No modules available</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {modules.slice(0, 12).map((mod) => (
        <div
          key={mod.id}
          className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors"
        >
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center text-xs font-bold shrink-0"
            style={{ backgroundColor: mod.color || '#3b82f6', color: '#fff' }}
          >
            {mod.icon || mod.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{mod.name}</p>
            <p className="text-xs text-muted-foreground">
              {mod.forms.length} forms &middot; {formatNumber(mod.totalRecords)} records
            </p>
          </div>
          <Badge variant={mod.totalRecords > 0 ? 'default' : 'secondary'} className="shrink-0 text-xs">
            {mod.moduleType}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function RecentActivityPanel() {
  const { data, isLoading } = useGetDashboardRecentActivityQuery();
  if (isLoading) return <PanelLoader label="Loading activity…" />;
  const activity = data?.activity ?? [];

  if (activity.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No recent activity</p>;
  }

  // Mobile-friendly rows: action wraps (no truncate) so a long record
  // name stays readable on a 360px screen; record-name and timestamp
  // stack on their own lines with break-words so URLs/long IDs don't
  // push the card horizontally and create a sideways scroll.
  return (
    <ul className="divide-y -mx-2 sm:mx-0">
      {activity.map((item) => (
        <li key={item.id} className="flex items-start gap-2 text-sm px-2 py-2.5">
          <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="font-medium break-words leading-snug">
              {item.action}
              {item.module && (
                <span className="text-muted-foreground"> in {item.module}</span>
              )}
            </p>
            {item.recordName && (
              <p className="text-xs text-muted-foreground break-words leading-snug">
                {item.recordName}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">{item.timestamp}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PanelLoader({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// First-paint skeleton — matches the rendered layout so there's no CLS.
// ─────────────────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 py-4 px-3 sm:px-6 max-w-7xl mx-auto">
      {/* Hero placeholder — avatar + greeting + name + chips */}
      <Skeleton className="h-36 sm:h-40 w-full rounded-xl" />
      {/* Attendance placeholder */}
      <Skeleton className="h-32 w-full rounded-xl" />
      {/* Four stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
