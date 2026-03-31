'use client';

import { Users, FileText, ShieldCheck, Building2, Briefcase, CalendarCheck, Layers, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatNumber } from '@/lib/analytics-constants';
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
  kpis: {
    totalUsers: number;
    activeUsers: number;
    totalFormSubmissions: number;
    auditLogEntries: number;
    totalEmployees: number;
    totalAttendances: number;
    totalModules: number;
  };
  modules: Array<{
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
    moduleType: string;
    level: number;
    parentId: string | null;
    childCount: number;
    forms: Array<{
      id: string;
      name: string;
      isPublished: boolean;
      totalRecords: number;
      sectionCount: number;
    }>;
    totalRecords: number;
  }>;
  timeSeries: Array<{ date: string; submissions: number }>;
  setupMetrics: {
    organizationName: string;
    teamMembers: number;
    formsCreated: number;
    modulesCreated: number;
    rolesCreated: number;
    unitsCreated: number;
    totalEmployees: number;
    auditEntries: number;
    setupItems: Array<{ name: string; completed: boolean }>;
    completionPercentage: number;
  };
}

const kpiConfig = [
  { key: 'totalUsers', label: 'Total Users', icon: Users, color: 'text-blue-600' },
  { key: 'activeUsers', label: 'Active Users', icon: TrendingUp, color: 'text-emerald-600' },
  { key: 'totalFormSubmissions', label: 'Form Submissions', icon: FileText, color: 'text-amber-600' },
  { key: 'auditLogEntries', label: 'Audit Entries', icon: ShieldCheck, color: 'text-red-600' },
  { key: 'totalEmployees', label: 'Employees', icon: Briefcase, color: 'text-cyan-600' },
  { key: 'totalAttendances', label: 'Attendances', icon: CalendarCheck, color: 'text-teal-600' },
  { key: 'totalModules', label: 'Active Modules', icon: Layers, color: 'text-indigo-600' },
] as const;

export function DashboardContent({ kpis, modules, timeSeries, setupMetrics }: DashboardContentProps) {
  const topModules = modules
    .sort((a, b) => b.totalRecords - a.totalRecords)
    .slice(0, 8);

  return (
    <div className="space-y-6 sm:space-y-8 py-4 px-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Overview of {setupMetrics.organizationName}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
        {kpiConfig.map((item) => {
          const Icon = item.icon;
          const value = kpis[item.key as keyof typeof kpis];
          return (
            <Card key={item.key} className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-4 w-4 ${item.color}`} />
                  <span className="text-xs text-muted-foreground font-medium truncate">{item.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{formatNumber(value)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Submission Trend */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Submission Trend</CardTitle>
            <CardDescription>Form submissions over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {timeSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={timeSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="submGrad" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#submGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                No submission data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Modules */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Modules by Records</CardTitle>
            <CardDescription>Form modules ranked by total records</CardDescription>
          </CardHeader>
          <CardContent>
            {topModules.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={topModules.map((m) => ({ name: m.name.length > 20 ? m.name.slice(0, 20) + '...' : m.name, records: m.totalRecords }))}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))' }} className="text-xs" />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fill: 'hsl(var(--muted-foreground))' }} className="text-xs" />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Bar dataKey="records" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                No modules found
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modules Grid + Setup Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Module List */}
        <div className="lg:col-span-2">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Form Modules</CardTitle>
              <CardDescription>{modules.length} active modules</CardDescription>
            </CardHeader>
            <CardContent>
              {modules.length > 0 ? (
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
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No active modules</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Setup Progress */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Setup Progress</CardTitle>
            <CardDescription>{setupMetrics.completionPercentage}% complete</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={setupMetrics.completionPercentage} className="h-2" />
            <div className="space-y-2">
              {setupMetrics.setupItems.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full shrink-0 ${item.completed ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                      }`}
                  />
                  <span className={`text-sm ${item.completed ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div>
                <p className="text-lg font-bold">{setupMetrics.teamMembers}</p>
                <p className="text-xs text-muted-foreground">Team Members</p>
              </div>
              <div>
                <p className="text-lg font-bold">{setupMetrics.formsCreated}</p>
                <p className="text-xs text-muted-foreground">Forms</p>
              </div>
              <div>
                <p className="text-lg font-bold">{setupMetrics.rolesCreated}</p>
                <p className="text-xs text-muted-foreground">Roles</p>
              </div>
              <div>
                <p className="text-lg font-bold">{setupMetrics.unitsCreated}</p>
                <p className="text-xs text-muted-foreground">Org Units</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
