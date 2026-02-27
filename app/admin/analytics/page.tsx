'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart3,
  Calendar,
  ChevronDown,
  Download,
  Filter,
  Layers,
  Search,
  Shield,
  Users,
  FileText,
  Building,
  ChevronRight,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  getFormMetrics,
  getFormModules,
  getModuleDeepAnalytics,
  getSubmissionTimeSeries,
  getAuditTrail,
  getUserAnalytics,
  getOrganizationSetupMetrics,
  getActionBreakdown,
  getLoginAnalytics,
  getEmployeeAnalytics,
  getRolesAnalytics,
  globalSearch,
} from '@/app/actions/analytics';
import {
  exportToCSV,
  prepareAuditLogExport,
  prepareUserAnalyticsExport,
  prepareFormMetricsExport,
} from '@/lib/export-utils';
import { formatNumber, ACTION_TYPE_COLORS, getActionDisplayName } from '@/lib/analytics-constants';

const TIME_RANGES = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: '7days' },
  { label: 'Last 30 days', value: '30days' },
  { label: 'Last 90 days', value: '90days' },
  { label: 'This Year', value: 'year' },
];

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30days');
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('forms');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Data states
  const [formMetrics, setFormMetrics] = useState<any[]>([]);
  const [timeSeries, setTimeSeries] = useState<any[]>([]);
  const [auditTrail, setAuditTrail] = useState<any>(null);
  const [userAnalytics, setUserAnalytics] = useState<any[]>([]);
  const [setupMetrics, setSetupMetrics] = useState<any>(null);
  const [actionBreakdown, setActionBreakdown] = useState<any[]>([]);
  const [loginAnalytics, setLoginAnalytics] = useState<any>(null);
  const [employeeAnalytics, setEmployeeAnalytics] = useState<any>(null);
  const [rolesAnalytics, setRolesAnalytics] = useState<any>(null);
  const [selectedModuleDetail, setSelectedModuleDetail] = useState<any>(null);

  // Fetch modules on mount
  useEffect(() => {
    getFormModules().then((mods) => {
      setModules(mods);
      setSelectedModuleIds(mods.map((m: any) => m.id));
    });
  }, []);

  // Fetch data when date range or module selection changes
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const modIds = selectedModuleIds.length === modules.length ? undefined : selectedModuleIds;
      const results = await Promise.all([
        getFormMetrics(dateRange, modIds),
        getSubmissionTimeSeries(dateRange, modIds),
        getAuditTrail(dateRange, 50, 0),
        getUserAnalytics(dateRange),
        getOrganizationSetupMetrics(),
        getActionBreakdown(dateRange),
        getLoginAnalytics(dateRange),
        getEmployeeAnalytics(),
        getRolesAnalytics(),
      ]);
      setFormMetrics(results[0]);
      setTimeSeries(results[1]);
      setAuditTrail(results[2]);
      setUserAnalytics(results[3]);
      setSetupMetrics(results[4]);
      setActionBreakdown(results[5]);
      setLoginAnalytics(results[6]);
      setEmployeeAnalytics(results[7]);
      setRolesAnalytics(results[8]);
    } catch (error) {
      console.error('Analytics fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, selectedModuleIds, modules.length]);

  useEffect(() => {
    if (modules.length > 0) {
      fetchData();
    }
  }, [fetchData, modules.length]);

  // Global search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await globalSearch(searchQuery);
        setSearchResults(results);
      } catch {
        setSearchResults(null);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Module deep analytics
  const handleModuleClick = async (moduleId: string) => {
    if (selectedModuleDetail?.moduleId === moduleId) {
      setSelectedModuleDetail(null);
      return;
    }
    const detail = await getModuleDeepAnalytics(moduleId, dateRange);
    setSelectedModuleDetail(detail);
  };

  // Module toggle
  const toggleModule = (id: string) => {
    setSelectedModuleIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const toggleAllModules = () => {
    if (selectedModuleIds.length === modules.length) {
      setSelectedModuleIds([]);
    } else {
      setSelectedModuleIds(modules.map((m) => m.id));
    }
  };

  const handleExport = (type: string) => {
    const ts = new Date().toISOString().split('T')[0];
    try {
      if (type === 'audit' && auditTrail?.logs) {
        exportToCSV({ filename: `audit-trail-${ts}.csv`, data: prepareAuditLogExport(auditTrail.logs) });
      } else if (type === 'users' && userAnalytics) {
        exportToCSV({ filename: `user-analytics-${ts}.csv`, data: prepareUserAnalyticsExport(userAnalytics) });
      } else if (type === 'forms' && formMetrics) {
        exportToCSV({ filename: `form-metrics-${ts}.csv`, data: prepareFormMetricsExport(formMetrics) });
      }
    } catch (e) {
      console.error('Export error:', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Advanced Analytics
          </h1>
          <p className="text-muted-foreground mt-1">Detailed insights into your organization</p>
        </div>
      </div>

      {/* Toolbar */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  {TIME_RANGES.find((r) => r.value === dateRange)?.label}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2">
                {TIME_RANGES.map((range) => (
                  <Button
                    key={range.value}
                    variant={dateRange === range.value ? 'default' : 'ghost'}
                    className="w-full justify-start"
                    size="sm"
                    onClick={() => setDateRange(range.value)}
                  >
                    {range.label}
                  </Button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Module Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Modules ({selectedModuleIds.length}/{modules.length})
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Filter Modules</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={toggleAllModules}>
                    {selectedModuleIds.length === modules.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {modules.map((mod) => (
                    <div key={mod.id} className="flex items-center gap-2 py-1">
                      <Checkbox
                        id={`mod-${mod.id}`}
                        checked={selectedModuleIds.includes(mod.id)}
                        onCheckedChange={() => toggleModule(mod.id)}
                      />
                      <label htmlFor={`mod-${mod.id}`} className="text-sm cursor-pointer flex-1 truncate">
                        {mod.name}
                      </label>
                      <span className="text-xs text-muted-foreground">{mod.totalRecords}</span>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Global Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md ml-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users, modules, forms, audit..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
              {searchResults && searchQuery.length >= 2 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-card border rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
                  {searchResults.results.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No results found</p>
                  ) : (
                    searchResults.results.map((r: any, i: number) => (
                      <div key={i} className="px-3 py-2 hover:bg-accent/50 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs shrink-0">{r.type}</Badge>
                          <span className="text-sm font-medium truncate">{r.title}</span>
                        </div>
                        {r.subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.subtitle}</p>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-4">
          <TabsTrigger value="forms" className="gap-1.5"><Layers className="h-3.5 w-3.5" />Forms</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" />Users</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><Shield className="h-3.5 w-3.5" />Audit</TabsTrigger>
          <TabsTrigger value="org" className="gap-1.5"><Building className="h-3.5 w-3.5" />Organization</TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5"><Download className="h-3.5 w-3.5" />Export</TabsTrigger>
        </TabsList>

        {/* Forms Tab */}
        <TabsContent value="forms" className="space-y-6">
          {isLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-80 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          ) : (
            <>
              {/* Time Series Chart */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Submission Trend</CardTitle>
                  <CardDescription>Daily form submissions over selected period</CardDescription>
                </CardHeader>
                <CardContent>
                  {timeSeries.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={timeSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString('en', { weekday: 'short', month: 'long', day: 'numeric' })} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 13 }} />
                        <Area type="monotone" dataKey="submissions" stroke="#3b82f6" fill="url(#areaGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-16 text-sm">No submissions in this period</p>
                  )}
                </CardContent>
              </Card>

              {/* Module Metrics */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Module Performance</CardTitle>
                  <CardDescription>Click a module to see deep analytics</CardDescription>
                </CardHeader>
                <CardContent>
                  {formMetrics.length > 0 ? (
                    <div className="space-y-2">
                      {formMetrics.map((mod) => (
                        <div key={mod.moduleId}>
                          <button
                            onClick={() => handleModuleClick(mod.moduleId)}
                            className="w-full flex items-center gap-4 rounded-lg border p-3 hover:bg-accent/50 transition-colors text-left"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{mod.formModule}</span>
                                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selectedModuleDetail?.moduleId === mod.moduleId ? 'rotate-90' : ''}`} />
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{mod.totalSubmissions} submissions &middot; {mod.completionRate}% completion</p>
                            </div>
                            <div className="flex items-center gap-6 text-sm">
                              <div className="text-right">
                                <p className="font-semibold">{formatNumber(mod.totalSubmissions)}</p>
                                <p className="text-xs text-muted-foreground">total</p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-emerald-600">{formatNumber(mod.completed)}</p>
                                <p className="text-xs text-muted-foreground">done</p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-amber-600">{formatNumber(mod.pending)}</p>
                                <p className="text-xs text-muted-foreground">pending</p>
                              </div>
                            </div>
                          </button>

                          {/* Deep analytics detail */}
                          {selectedModuleDetail?.moduleId === mod.moduleId && (
                            <div className="ml-4 mt-2 mb-3 border-l-2 pl-4 space-y-3">
                              <p className="text-sm text-muted-foreground">{selectedModuleDetail.description || 'No description'}</p>
                              {selectedModuleDetail.forms.map((form: any) => (
                                <div key={form.formId} className="rounded-md border p-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-sm font-medium">{form.formName}</p>
                                      <p className="text-xs text-muted-foreground">{form.sections.length} sections &middot; {form.totalRecords} records</p>
                                    </div>
                                    <Badge variant={form.isPublished ? 'default' : 'secondary'}>
                                      {form.isPublished ? 'Published' : 'Draft'}
                                    </Badge>
                                  </div>
                                  {form.statusBreakdown.length > 0 && (
                                    <div className="flex gap-2 mt-2 flex-wrap">
                                      {form.statusBreakdown.map((s: any) => (
                                        <Badge key={s.status} variant="outline" className="text-xs">
                                          {s.status}: {s.count}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8 text-sm">No module data</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-80 w-full rounded-lg" />
          ) : (
            <>
              {/* Login Analytics */}
              {loginAnalytics && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium">Successful Logins</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">{formatNumber(loginAnalytics.successCount)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium">Failed Logins</p>
                      <p className="text-2xl font-bold text-red-600 mt-1">{formatNumber(loginAnalytics.failedCount)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium">Success Rate</p>
                      <p className="text-2xl font-bold mt-1">
                        {loginAnalytics.successCount + loginAnalytics.failedCount > 0
                          ? Math.round((loginAnalytics.successCount / (loginAnalytics.successCount + loginAnalytics.failedCount)) * 100)
                          : 0}%
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Users Table */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">User Activity</CardTitle>
                  <CardDescription>{userAnalytics.length} users</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead className="text-right">Logins</TableHead>
                          <TableHead className="text-right">Submissions</TableHead>
                          <TableHead className="text-right">Activity</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {userAnalytics.slice(0, 25).map((user: any) => (
                          <TableRow key={user.userId}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{user.name}</p>
                                <p className="text-xs text-muted-foreground">{user.email}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{user.role}</TableCell>
                            <TableCell className="text-sm">{user.department}</TableCell>
                            <TableCell className="text-right text-sm">{user.loginCount}</TableCell>
                            <TableCell className="text-right text-sm">{user.submissions}</TableCell>
                            <TableCell className="text-right text-sm">{user.activityCount}</TableCell>
                            <TableCell>
                              <Badge variant={user.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-xs">
                                {user.status}
                              </Badge>
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

        {/* Audit Tab */}
        <TabsContent value="audit" className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-80 w-full rounded-lg" />
          ) : (
            <>
              {/* Action Breakdown Pie */}
              {actionBreakdown.length > 0 && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Action Breakdown</CardTitle>
                    <CardDescription>Distribution of audit log actions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col md:flex-row items-center gap-6">
                      <ResponsiveContainer width={220} height={220}>
                        <PieChart>
                          <Pie data={actionBreakdown} dataKey="count" nameKey="action" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                            {actionBreakdown.map((_: any, i: number) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 13 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-2">
                        {actionBreakdown.map((item: any, i: number) => (
                          <Badge key={item.action} variant="outline" className="gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            {getActionDisplayName(item.action)}: {item.count}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Audit Logs Table */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Audit Trail</CardTitle>
                  <CardDescription>{auditTrail?.total || 0} total entries</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead>Module</TableHead>
                          <TableHead>Performed By</TableHead>
                          <TableHead>Record</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditTrail?.logs?.slice(0, 30).map((log: any) => (
                          <TableRow key={log.id}>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-xs ${ACTION_TYPE_COLORS[log.action?.toUpperCase()] || ''}`}
                              >
                                {getActionDisplayName(log.action)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{log.module || '-'}</TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium">{log.userName}</p>
                                <p className="text-xs text-muted-foreground">{log.userEmail}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{log.recordName || log.recordId || '-'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{log.timestamp}</TableCell>
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

        {/* Organization Tab */}
        <TabsContent value="org" className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-80 w-full rounded-lg" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Employee Breakdown */}
              {employeeAnalytics && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Employee Breakdown</CardTitle>
                    <CardDescription>{employeeAnalytics.totalEmployees} total employees</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {employeeAnalytics.departmentBreakdown.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={employeeAnalytics.departmentBreakdown} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="department" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                          <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                          <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-muted-foreground py-8 text-sm">No department data</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Roles Overview */}
              {rolesAnalytics && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Roles & Permissions</CardTitle>
                    <CardDescription>{rolesAnalytics.totalRoles} roles, {rolesAnalytics.totalPermissions} permissions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {rolesAnalytics.roles.length > 0 ? (
                      <div className="space-y-2">
                        {rolesAnalytics.roles.map((role: any) => (
                          <div key={role.id} className="flex items-center justify-between rounded-md border p-3">
                            <div>
                              <p className="text-sm font-medium flex items-center gap-2">
                                {role.name}
                                {role.isAdmin && <Badge variant="default" className="text-xs">Admin</Badge>}
                              </p>
                              <p className="text-xs text-muted-foreground">{role.description || 'No description'}</p>
                            </div>
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span>{role.userCount} users</span>
                              <span>{role.permissionCount} perms</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8 text-sm">No roles configured</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Setup Metrics */}
              {setupMetrics && (
                <Card className="border shadow-sm lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Organization Setup</CardTitle>
                    <CardDescription>{setupMetrics.completionPercentage}% complete</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="rounded-md border p-3 text-center">
                        <p className="text-2xl font-bold">{setupMetrics.teamMembers}</p>
                        <p className="text-xs text-muted-foreground">Team Members</p>
                      </div>
                      <div className="rounded-md border p-3 text-center">
                        <p className="text-2xl font-bold">{setupMetrics.formsCreated}</p>
                        <p className="text-xs text-muted-foreground">Forms</p>
                      </div>
                      <div className="rounded-md border p-3 text-center">
                        <p className="text-2xl font-bold">{setupMetrics.modulesCreated}</p>
                        <p className="text-xs text-muted-foreground">Modules</p>
                      </div>
                      <div className="rounded-md border p-3 text-center">
                        <p className="text-2xl font-bold">{formatNumber(setupMetrics.auditEntries)}</p>
                        <p className="text-xs text-muted-foreground">Audit Entries</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-6">
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-5 w-5" />
                Export Analytics Data
              </CardTitle>
              <CardDescription>Download filtered data as CSV files</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button
                  variant="outline"
                  className="gap-2 h-auto py-4 flex-col"
                  onClick={() => handleExport('forms')}
                  disabled={isLoading || !formMetrics.length}
                >
                  <FileText className="h-6 w-6" />
                  <span>Export Form Metrics</span>
                  <span className="text-xs text-muted-foreground">Module performance data</span>
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 h-auto py-4 flex-col"
                  onClick={() => handleExport('users')}
                  disabled={isLoading || !userAnalytics.length}
                >
                  <Users className="h-6 w-6" />
                  <span>Export User Analytics</span>
                  <span className="text-xs text-muted-foreground">User activity data</span>
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 h-auto py-4 flex-col"
                  onClick={() => handleExport('audit')}
                  disabled={isLoading || !auditTrail?.logs?.length}
                >
                  <Shield className="h-6 w-6" />
                  <span>Export Audit Trail</span>
                  <span className="text-xs text-muted-foreground">Audit log entries</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
