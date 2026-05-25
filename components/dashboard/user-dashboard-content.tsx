'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  FileText, CalendarCheck, Activity, LogIn, Briefcase, Building2,
  Clock, TrendingUp, ArrowUpRight, ChevronDown, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/analytics-constants';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  useGetDashboardSummaryQuery,
  useGetDashboardModulesQuery,
  useGetDashboardTimeSeriesQuery,
  useGetDashboardRecentActivityQuery,
} from '@/lib/api/dashboard';

// Each card links to the page that owns its detail data — heavy queries
// (submission history, attendance log, audit trail, login history) stay
// out of the dashboard payload and only run when the user actually opens
// the relevant page.
const statCards = [
  { key: 'mySubmissions', label: 'My Submissions', icon: FileText, color: 'text-blue-600', href: '/profile#overview' },
  { key: 'myAttendance', label: 'My Attendance', icon: CalendarCheck, color: 'text-emerald-600', href: '/attendance' },
  { key: 'myActivityCount', label: 'My Activities', icon: Activity, color: 'text-amber-600', href: '/profile#security' },
  { key: 'myLoginCount', label: 'My Logins', icon: LogIn, color: 'text-indigo-600', href: '/settings/login-history' },
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
    <div className="space-y-6 sm:space-y-8 py-4 px-3 sm:px-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">
          Welcome, {user.name}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Here&apos;s your personal dashboard overview
        </p>
      </div>

      {/* User Profile Card + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Profile Card */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              My Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Department</p>
                <p className="font-medium">{user.department}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Designation</p>
                <p className="font-medium">{user.designation}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant={user.status === 'active' ? 'default' : 'secondary'} className="text-xs mt-0.5">
                  {user.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Joined</p>
                <p className="font-medium">{user.dateOfJoining}</p>
              </div>
            </div>
            {user.roles.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Roles</p>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((r, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {r.roleName} — {r.unitName}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 content-start">
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
                <Card className="group border shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 cursor-pointer h-full">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-4 w-4 ${item.color}`} />
                      <span className="text-xs text-muted-foreground font-medium truncate flex-1">{item.label}</span>
                      <ArrowUpRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">{formatNumber(value)}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Submission Trend — click to load */}
      <CollapsibleSection
        title="My Submission Trend"
        description="Your form submissions over the last 30 days"
        icon={<TrendingUp className="h-4 w-4 text-primary" />}
        open={showTrend}
        onToggle={() => setShowTrend((v) => !v)}
      >
        {showTrend && <SubmissionTrendPanel />}
      </CollapsibleSection>

      {/* Modules + Recent Activity — both click to load */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2">
          <CollapsibleSection
            title="Available Modules"
            description="Modules you have access to"
            icon={<Building2 className="h-4 w-4 text-primary" />}
            open={showModules}
            onToggle={() => setShowModules((v) => !v)}
          >
            {showModules && <ModulesPanel />}
          </CollapsibleSection>
        </div>

        <CollapsibleSection
          title="Recent Activity"
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
    <div className="space-y-6 sm:space-y-8 py-4 px-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Skeleton className="h-56" />
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    </div>
  );
}
