'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, BarChart3, Brain, Calendar,
  ChevronDown, Clock, FileText, Flame, Layers, LogIn, Minus, Shield, TrendingUp,
  User, UserMinus, Users, Zap,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { usePermissionContext } from '@/context/PermissionContext';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie,
} from 'recharts';
import { formatNumber } from '@/lib/analytics-constants';
import {
  getExecutiveKPIs,
  getModuleUsageRanking,
  getFormUsageFrequency,
  getUserActivityHeatmap,
  getLiveActivityTimeline,
  getInactiveUsers,
  getRoleUsageAnalysis,
  getSmartAlerts,
  getImportExportAnalytics,
} from '@/app/actions/intelligence';

const TIME_RANGES = [
  { label: 'Today', value: 'today' },
  { label: '7 days', value: '7days' },
  { label: '30 days', value: '30days' },
  { label: '90 days', value: '90days' },
  { label: 'Year', value: 'year' },
];

const SEVERITY_STYLES = {
  critical: 'border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-400',
  warning: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400',
  info: 'border-blue-500/40 bg-blue-500/5 text-blue-700 dark:text-blue-400',
};

const SEVERITY_ICONS = {
  critical: AlertTriangle,
  warning: Flame,
  info: Zap,
};

const BAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

export default function IntelligencePage() {
  const { isAdmin } = usePermissionContext();
  const [dateRange, setDateRange] = useState('30days');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  const [kpis, setKpis] = useState<any>(null);
  const [moduleRanking, setModuleRanking] = useState<any[]>([]);
  const [formFrequency, setFormFrequency] = useState<any[]>([]);
  const [heatmap, setHeatmap] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [inactiveUsers, setInactiveUsers] = useState<any[]>([]);
  const [roleAnalysis, setRoleAnalysis] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [importExport, setImportExport] = useState<any>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [k, mr, ff, hm, tl, iu, ra, al, ie] = await Promise.all([
        getExecutiveKPIs(dateRange),
        getModuleUsageRanking(dateRange),
        getFormUsageFrequency(dateRange),
        getUserActivityHeatmap(dateRange),
        getLiveActivityTimeline(30),
        getInactiveUsers(30),
        getRoleUsageAnalysis(),
        getSmartAlerts(),
        getImportExportAnalytics(dateRange),
      ]);
      setKpis(k);
      setModuleRanking(mr);
      setFormFrequency(ff);
      setHeatmap(hm);
      setTimeline(tl);
      setInactiveUsers(iu);
      setRoleAnalysis(ra);
      setAlerts(al);
      setImportExport(ie);
    } catch (err) {
      console.error('Intelligence fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const GrowthIndicator = ({ value }: { value: number }) => {
    if (value === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" /> 0%</span>;
    const isUp = value > 0;
    return (
      <span className={`text-xs flex items-center gap-0.5 ${isUp ? 'text-emerald-600' : 'text-red-600'}`}>
        {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {Math.abs(value)}%
      </span>
    );
  };

  return (
    <div className="space-y-6 px-6 py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="h-6 w-6" />
            {isAdmin ? 'Executive Intelligence' : 'My Dashboard'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? 'Real-time organizational insights and smart alerts' : 'Your personal activity and usage insights'}
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Calendar className="h-4 w-4" />
              {TIME_RANGES.find((r) => r.value === dateRange)?.label}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2">
            {TIME_RANGES.map((r) => (
              <Button key={r.value} variant={dateRange === r.value ? 'default' : 'ghost'} size="sm" className="w-full justify-start" onClick={() => setDateRange(r.value)}>
                {r.label}
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* Smart Alerts */}
      {!loading && alerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {alerts.map((alert, i) => {
            const Icon = SEVERITY_ICONS[alert.severity as keyof typeof SEVERITY_ICONS] || Zap;
            return (
              <div key={i} className={`rounded-lg border p-3 ${SEVERITY_STYLES[alert.severity as keyof typeof SEVERITY_STYLES]}`}>
                <div className="flex items-start gap-2">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs opacity-80 mt-0.5">{alert.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* KPI Strip */}
      {loading ? (
        <div className={`grid grid-cols-2 md:grid-cols-4 ${isAdmin ? 'lg:grid-cols-7' : 'lg:grid-cols-4'} gap-3`}>
          {Array.from({ length: isAdmin ? 7 : 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : kpis ? (
        <div className={`grid grid-cols-2 md:grid-cols-4 ${isAdmin ? 'lg:grid-cols-7' : 'lg:grid-cols-4'} gap-3`}>
          {[
            ...(isAdmin ? [
              { label: 'Total Users', value: kpis.totalUsers, icon: Users, color: 'text-blue-600' },
              { label: 'Active Today', value: kpis.activeToday, icon: Zap, color: 'text-emerald-600' },
              { label: 'Active 7d', value: kpis.active7d, icon: TrendingUp, color: 'text-teal-600' },
            ] : []),
            { label: isAdmin ? 'Submissions' : 'My Submissions', value: kpis.totalSubmissions, icon: FileText, color: 'text-amber-600', growth: kpis.submissionGrowth },
            { label: isAdmin ? 'Pending' : 'My Pending', value: kpis.pendingApprovals, icon: Clock, color: 'text-orange-600' },
            { label: isAdmin ? 'Logins' : 'My Logins', value: kpis.loginSuccess, icon: LogIn, color: 'text-cyan-600', growth: kpis.loginGrowth },
            { label: 'Failure Rate', value: `${kpis.failureRate}%`, icon: Shield, color: 'text-red-600' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.label} className="border shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                    <span className="text-[11px] text-muted-foreground font-medium truncate">{item.label}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-xl font-bold text-foreground">{typeof item.value === 'number' ? formatNumber(item.value) : item.value}</p>
                    {item.growth !== undefined && <GrowthIndicator value={item.growth} />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'} mb-4`}>
          <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Usage</TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Activity</TabsTrigger>
          {isAdmin && <TabsTrigger value="security" className="gap-1.5"><Shield className="h-3.5 w-3.5" />Security</TabsTrigger>}
          <TabsTrigger value="system" className="gap-1.5"><Layers className="h-3.5 w-3.5" />System</TabsTrigger>
        </TabsList>

        {/* === USAGE TAB === */}
        <TabsContent value="overview" className="space-y-6">
          {loading ? (
            <div className="space-y-6">
              <Skeleton className="h-80 rounded-lg" />
              <Skeleton className="h-64 rounded-lg" />
            </div>
          ) : (
            <>
              {/* Module Usage Ranking */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{isAdmin ? 'Module Usage Ranking' : 'My Module Usage'}</CardTitle>
                  <CardDescription>{isAdmin ? 'Modules ranked by total records in selected period' : 'Your records across permitted modules'}</CardDescription>
                </CardHeader>
                <CardContent>
                  {moduleRanking.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(200, moduleRanking.length * 42)}>
                      <BarChart
                        data={moduleRanking.map((m) => ({
                          name: m.moduleName.length > 25 ? m.moduleName.slice(0, 25) + '...' : m.moduleName,
                          records: m.totalRecords,
                          users: m.uniqueUsers,
                        }))}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" width={160} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }} />
                        <Bar dataKey="records" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Records" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-12 text-sm">No module usage data</p>
                  )}
                </CardContent>
              </Card>

              {/* Module Details Table */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{isAdmin ? 'Module Details' : 'My Module Details'}</CardTitle>
                  <CardDescription>{isAdmin ? 'Usage metrics per module' : 'Your usage metrics per module'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Module</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Forms</TableHead>
                          <TableHead className="text-right">Records</TableHead>
                          <TableHead className="text-right">Unique Users</TableHead>
                          <TableHead className="text-right">Avg/User</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {moduleRanking.map((mod) => (
                          <TableRow key={mod.moduleId}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: mod.color || '#3b82f6', color: '#fff' }}>
                                  {mod.icon || mod.moduleName.charAt(0)}
                                </div>
                                <span className="text-sm font-medium">{mod.moduleName}</span>
                              </div>
                            </TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{mod.moduleType}</Badge></TableCell>
                            <TableCell className="text-right text-sm">{mod.formCount}</TableCell>
                            <TableCell className="text-right text-sm font-medium">{formatNumber(mod.totalRecords)}</TableCell>
                            <TableCell className="text-right text-sm">{mod.uniqueUsers}</TableCell>
                            <TableCell className="text-right text-sm">{mod.avgPerUser}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Form Frequency */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{isAdmin ? 'Form Usage Frequency' : 'My Form Submissions'}</CardTitle>
                  <CardDescription>{isAdmin ? 'All forms ranked by submission count' : 'Your submissions ranked by count'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Form</TableHead>
                          <TableHead>Module</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Records</TableHead>
                          <TableHead className="text-right">Last Submission</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {formFrequency.slice(0, 30).map((form) => (
                          <TableRow key={form.formId}>
                            <TableCell className="text-sm font-medium">{form.formName}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{form.moduleName}</Badge></TableCell>
                            <TableCell>
                              <Badge variant={form.isPublished ? 'default' : 'secondary'} className="text-xs">
                                {form.isPublished ? 'Published' : 'Draft'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">{formatNumber(form.totalRecords)}</TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {form.lastSubmission ? new Date(form.lastSubmission).toLocaleDateString() : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* === ACTIVITY TAB === */}
        <TabsContent value="activity" className="space-y-6">
          {loading ? (
            <div className="space-y-6">
              <Skeleton className="h-48 rounded-lg" />
              <Skeleton className="h-96 rounded-lg" />
            </div>
          ) : (
            <>
              {/* Heatmap */}
              {heatmap && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{isAdmin ? 'Activity Heatmap' : 'My Activity Heatmap'}</CardTitle>
                    <CardDescription>Peak hours: {heatmap.peakHour}:00 - {heatmap.peakHour + 1}:00 ({heatmap.totalEvents} total events)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <div className="min-w-[640px]">
                        <div className="flex items-center gap-1 mb-2 pl-10">
                          {Array.from({ length: 24 }).map((_, h) => (
                            <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground">{h}</div>
                          ))}
                        </div>
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                          const dayData = heatmap.heatmap.filter((d: any) => d.day === day);
                          const maxCount = Math.max(...heatmap.heatmap.map((d: any) => d.count), 1);
                          return (
                            <div key={day} className="flex items-center gap-1 mb-1">
                              <span className="w-8 text-right text-[10px] text-muted-foreground font-medium">{day}</span>
                              <div className="flex-1 flex gap-0.5">
                                {dayData.map((cell: any, i: number) => {
                                  const intensity = cell.count / maxCount;
                                  return (
                                    <div
                                      key={i}
                                      className="flex-1 h-5 rounded-[2px] transition-colors"
                                      style={{
                                        backgroundColor: cell.count === 0
                                          ? 'hsl(var(--muted))'
                                          : `rgba(59, 130, 246, ${0.15 + intensity * 0.85})`,
                                      }}
                                      title={`${day} ${cell.hour}:00 - ${cell.count} events`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-end gap-2 mt-3">
                          <span className="text-[10px] text-muted-foreground">Less</span>
                          {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
                            <div key={i} className="h-3 w-3 rounded-[2px]" style={{ backgroundColor: v === 0 ? 'hsl(var(--muted))' : `rgba(59, 130, 246, ${0.15 + v * 0.85})` }} />
                          ))}
                          <span className="text-[10px] text-muted-foreground">More</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Live Activity Timeline */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    Live Activity
                    <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>
                  </CardTitle>
                  <CardDescription>{isAdmin ? 'Most recent actions across your organization' : 'Your most recent actions'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[480px] overflow-y-auto">
                    {timeline.map((event) => (
                      <div key={`${event.type}-${event.id}`} className="flex items-start gap-3 py-2 border-b last:border-0">
                        <div className="h-7 w-7 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                          {event.type === 'login' ? <LogIn className="h-3.5 w-3.5" /> : event.type === 'audit' ? <Shield className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{event.user}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">{event.action}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{event.description}</p>
                        </div>
                        <time className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                          {formatTimeAgo(new Date(event.timestamp))}
                        </time>
                      </div>
                    ))}
                    {timeline.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* === SECURITY TAB (Admin Only) === */}
        {isAdmin && (
          <TabsContent value="security" className="space-y-6">
            {loading ? (
              <Skeleton className="h-80 rounded-lg" />
            ) : (
              <>
                {/* Login Security */}
                {kpis && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="border shadow-sm">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground font-medium">Successful Logins</p>
                        <p className="text-2xl font-bold text-emerald-600 mt-1">{formatNumber(kpis.loginSuccess)}</p>
                        <GrowthIndicator value={kpis.loginGrowth} />
                      </CardContent>
                    </Card>
                    <Card className="border shadow-sm">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground font-medium">Failed Logins</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">{formatNumber(kpis.loginFailed)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border shadow-sm">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground font-medium">Failure Rate</p>
                        <p className="text-2xl font-bold mt-1">{kpis.failureRate}%</p>
                      </CardContent>
                    </Card>
                    <Card className="border shadow-sm">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground font-medium">Audit Events</p>
                        <p className="text-2xl font-bold mt-1">{formatNumber(kpis.auditEntries)}</p>
                        <GrowthIndicator value={kpis.auditGrowth} />
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Inactive Users */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <UserMinus className="h-4 w-4" />
                      Inactive Users
                    </CardTitle>
                    <CardDescription>{inactiveUsers.length} users inactive for 30+ days</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {inactiveUsers.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>User</TableHead>
                              <TableHead>Role</TableHead>
                              <TableHead>Department</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Days Inactive</TableHead>
                              <TableHead>Last Login</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {inactiveUsers.slice(0, 20).map((u) => (
                              <TableRow key={u.id}>
                                <TableCell>
                                  <div>
                                    <p className="text-sm font-medium">{u.name}</p>
                                    <p className="text-xs text-muted-foreground">{u.email}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">{u.role}</TableCell>
                                <TableCell className="text-sm">{u.department}</TableCell>
                                <TableCell><Badge variant={u.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-xs">{u.status}</Badge></TableCell>
                                <TableCell className="text-right text-sm font-medium">
                                  {u.daysSinceLogin !== null ? `${u.daysSinceLogin}d` : 'Never'}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8 text-sm">All users are active</p>
                    )}
                  </CardContent>
                </Card>

                {/* Role Usage */}
                {roleAnalysis && (
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Role Usage Analysis</CardTitle>
                      <CardDescription>
                        {roleAnalysis.roles.length} roles configured
                        {roleAnalysis.unassignedUsers > 0 && ` - ${roleAnalysis.unassignedUsers} unassigned users`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {roleAnalysis.roles.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <ResponsiveContainer width="100%" height={Math.max(180, roleAnalysis.roles.length * 36)}>
                            <BarChart
                              data={roleAnalysis.roles.map((r: any) => ({ name: r.name, users: r.userCount, permissions: r.permissionCount }))}
                              layout="vertical"
                              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                              <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                              <YAxis dataKey="name" type="category" width={100} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }} />
                              <Bar dataKey="users" fill="#3b82f6" name="Users" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                          <div className="space-y-2">
                            {roleAnalysis.roles.map((role: any) => (
                              <div key={role.id} className="flex items-center justify-between border rounded-lg p-2.5">
                                <div className="flex items-center gap-2">
                                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-sm font-medium">{role.name}</span>
                                  {role.isAdmin && <Badge className="text-[10px]">Admin</Badge>}
                                </div>
                                <div className="flex gap-4 text-xs text-muted-foreground">
                                  <span>{role.userCount} users</span>
                                  <span>{role.permissionCount} perms</span>
                                </div>
                              </div>
                            ))}
                            {roleAnalysis.unassignedUsers > 0 && (
                              <div className="flex items-center gap-2 text-amber-600 text-sm p-2 border rounded-lg border-amber-500/30 bg-amber-500/5">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                {roleAnalysis.unassignedUsers} users without any role assignment
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-center text-muted-foreground py-8 text-sm">No roles configured</p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        )}

        {/* === SYSTEM TAB === */}
        <TabsContent value="system" className="space-y-6">
          {loading ? (
            <Skeleton className="h-80 rounded-lg" />
          ) : (
            <>
              {/* Import/Export Stats */}
              {importExport && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{isAdmin ? 'Import Jobs' : 'My Imports'}</CardTitle>
                      <CardDescription>{importExport.importStats.total} imports in period</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="rounded-md border p-3 text-center">
                          <p className="text-xl font-bold text-emerald-600">{importExport.importStats.completed}</p>
                          <p className="text-xs text-muted-foreground">Completed</p>
                        </div>
                        <div className="rounded-md border p-3 text-center">
                          <p className="text-xl font-bold text-red-600">{importExport.importStats.failed}</p>
                          <p className="text-xs text-muted-foreground">Failed</p>
                        </div>
                      </div>
                      {importExport.importStats.totalRows > 0 && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Row success rate</span>
                            <span>{importExport.importStats.totalRows > 0 ? Math.round((importExport.importStats.successRows / importExport.importStats.totalRows) * 100) : 0}%</span>
                          </div>
                          <Progress
                            value={importExport.importStats.totalRows > 0 ? (importExport.importStats.successRows / importExport.importStats.totalRows) * 100 : 0}
                            className="h-2"
                          />
                          <p className="text-xs text-muted-foreground">
                            {formatNumber(importExport.importStats.successRows)} / {formatNumber(importExport.importStats.totalRows)} rows
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{isAdmin ? 'Export Jobs' : 'My Exports'}</CardTitle>
                      <CardDescription>{importExport.exportStats.total} exports in period</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="rounded-md border p-3 text-center">
                          <p className="text-xl font-bold text-emerald-600">{importExport.exportStats.completed}</p>
                          <p className="text-xs text-muted-foreground">Completed</p>
                        </div>
                        <div className="rounded-md border p-3 text-center">
                          <p className="text-xl font-bold text-red-600">{importExport.exportStats.failed}</p>
                          <p className="text-xs text-muted-foreground">Failed</p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{formatNumber(importExport.exportStats.totalRecords)} total records exported</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Active Modules Overview */}
              {kpis && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{isAdmin ? 'System Overview' : 'My Overview'}</CardTitle>
                    <CardDescription>{isAdmin ? 'Auto-discovered from database schema' : 'Your accessible modules and activity'}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className={`grid grid-cols-2 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
                      <div className="rounded-md border p-4 text-center">
                        <Layers className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                        <p className="text-2xl font-bold">{kpis.totalModules}</p>
                        <p className="text-xs text-muted-foreground">{isAdmin ? 'Active Modules' : 'My Modules'}</p>
                      </div>
                      <div className="rounded-md border p-4 text-center">
                        <FileText className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
                        <p className="text-2xl font-bold">{formatNumber(formFrequency.length)}</p>
                        <p className="text-xs text-muted-foreground">{isAdmin ? 'Total Forms' : 'My Forms'}</p>
                      </div>
                      {isAdmin && (
                        <div className="rounded-md border p-4 text-center">
                          <Users className="h-5 w-5 mx-auto text-amber-600 mb-1" />
                          <p className="text-2xl font-bold">{kpis.totalUsers}</p>
                          <p className="text-xs text-muted-foreground">Total Users</p>
                        </div>
                      )}
                      <div className="rounded-md border p-4 text-center">
                        <Shield className="h-5 w-5 mx-auto text-red-600 mb-1" />
                        <p className="text-2xl font-bold">{formatNumber(kpis.auditEntries)}</p>
                        <p className="text-xs text-muted-foreground">{isAdmin ? 'Audit Events' : 'My Actions'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Module Distribution Pie */}
              {moduleRanking.length > 0 && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Record Distribution by Module</CardTitle>
                    <CardDescription>How records are distributed across modules</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col md:flex-row items-center gap-6">
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={moduleRanking.filter((m) => m.totalRecords > 0).map((m) => ({ name: m.moduleName, value: m.totalRecords }))}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                          >
                            {moduleRanking.filter((m) => m.totalRecords > 0).map((_, i) => (
                              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-2">
                        {moduleRanking.filter((m) => m.totalRecords > 0).map((mod, i) => (
                          <Badge key={mod.moduleId} variant="outline" className="gap-1.5 text-xs">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                            {mod.moduleName}: {formatNumber(mod.totalRecords)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}
