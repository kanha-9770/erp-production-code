'use client';

import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartLegend } from '@/components/ui/chart';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

interface SubmissionChartProps {
  data: Array<{
    date: string;
    submissions: number;
  }>;
  title?: string;
}

export function SubmissionTrendChart({ data, title = 'Form Submissions Trend' }: SubmissionChartProps) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Daily submissions over the selected period</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSubmissions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" />
              <XAxis 
                dataKey="date" 
                className="text-xs fill-foreground/60"
                tick={{ fontSize: 12 }}
              />
              <YAxis className="text-xs fill-foreground/60" />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                }}
                cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
              />
              <Area 
                type="monotone" 
                dataKey="submissions" 
                stroke="#3b82f6" 
                fillOpacity={1} 
                fill="url(#colorSubmissions)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

interface FormModuleMetrics {
  formModule: string;
  totalSubmissions: number;
  dailyBreakdown: Array<{ date: string; submissions: number }>;
}

interface FormMetricsChartProps {
  data: FormModuleMetrics[];
}

export function FormModulesChart({ data }: FormMetricsChartProps) {
  const chartData = data.map(item => ({
    name: item.formModule.replace('Form Module ', 'Form '),
    submissions: item.totalSubmissions,
  }));

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle>Form Module Performance</CardTitle>
        <CardDescription>Submissions by form module</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" />
              <XAxis 
                dataKey="name" 
                className="text-xs fill-foreground/60"
                tick={{ fontSize: 12 }}
              />
              <YAxis className="text-xs fill-foreground/60" />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                }}
              />
              <Bar dataKey="submissions" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

interface UserStatusData {
  status: string;
  count: number;
}

interface UserStatusChartProps {
  data: UserStatusData[];
}

export function UserStatusChart({ data }: UserStatusChartProps) {
  const statusColors: Record<string, string> = {
    ACTIVE: '#10b981',
    INACTIVE: '#6b7280',
    SUSPENDED: '#ef4444',
    PENDING: '#f59e0b',
    PENDING_VERIFICATION: '#8b5cf6',
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle>User Status Distribution</CardTitle>
        <CardDescription>Organization users by status</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full h-80 flex justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                formatter={(value) => <span className="text-sm">{value}</span>}
              />
              <Pie
                data={data}
                cx="50%"
                cy="45%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="count"
                nameKey="status"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={statusColors[entry.status] || COLORS[index]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

interface ComparisonMetrics {
  label: string;
  value: number;
}

interface ComparisonChartProps {
  data: ComparisonMetrics[];
  title?: string;
  description?: string;
}

export function ComparisonChart({ data, title = 'Setup Metrics', description = 'Organization configuration overview' }: ComparisonChartProps) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={data}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-foreground/10" />
              <XAxis type="number" className="text-xs fill-foreground/60" />
              <YAxis 
                type="category" 
                dataKey="label" 
                className="text-xs fill-foreground/60"
                width={140}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                }}
              />
              <Bar dataKey="value" fill="#8b5cf6" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
