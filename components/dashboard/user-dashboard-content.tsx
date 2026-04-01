'use client';

import {
  FileText, CalendarCheck, Activity, LogIn, Briefcase, Building2,
  Clock, TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/analytics-constants';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

interface UserDashboardContentProps {
  userData: {
    user: {
      name: string;
      email: string;
      department: string;
      designation: string;
      status: string;
      dateOfJoining: string;
      roles: Array<{ roleName: string; unitName: string }>;
    };
    stats: {
      mySubmissions: number;
      myAttendance: number;
      myActivityCount: number;
      myLoginCount: number;
    };
    modules: Array<{
      id: string;
      name: string;
      description: string | null;
      icon: string | null;
      color: string | null;
      moduleType: string;
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
    recentActivity: Array<{
      id: string;
      action: string;
      module: string | null;
      recordName: string | null;
      timestamp: string;
    }>;
  };
}

const statCards = [
  { key: 'mySubmissions', label: 'My Submissions', icon: FileText, color: 'text-blue-600' },
  { key: 'myAttendance', label: 'My Attendance', icon: CalendarCheck, color: 'text-emerald-600' },
  { key: 'myActivityCount', label: 'My Activities', icon: Activity, color: 'text-amber-600' },
  { key: 'myLoginCount', label: 'My Logins', icon: LogIn, color: 'text-indigo-600' },
] as const;

export function UserDashboardContent({ userData }: UserDashboardContentProps) {
  const { user, stats, modules, timeSeries, recentActivity } = userData;

  return (
    <div className="space-y-6 sm:space-y-8 py-4 px-6">
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
      </div>

      {/* My Submission Trend */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            My Submission Trend
          </CardTitle>
          <CardDescription>Your form submissions over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          {timeSeries.length > 0 ? (
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
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
              No submissions in this period
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modules + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Available Modules */}
        <div className="lg:col-span-2">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Available Modules
              </CardTitle>
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
                <p className="text-sm text-muted-foreground py-8 text-center">No modules available</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Recent Activity
            </CardTitle>
            <CardDescription>Your latest actions</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((item) => (
                  <div key={item.id} className="flex items-start gap-2 text-sm">
                    <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {item.action}
                        {item.module && <span className="text-muted-foreground"> in {item.module}</span>}
                      </p>
                      {item.recordName && (
                        <p className="text-xs text-muted-foreground truncate">{item.recordName}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{item.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
