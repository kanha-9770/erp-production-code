'use client';

import { ArrowUpRight, Users, BarChart3, FileText, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface KPIMetricsProps {
  data: {
    totalUsers: number;
    activeUsers: number;
    totalFormSubmissions: number;
    auditLogEntries: number;
  };
}

export function KPIMetrics({ data }: KPIMetricsProps) {
  const metrics = [
    {
      title: 'Total Users',
      value: data.totalUsers.toLocaleString(),
      icon: Users,
      color: 'from-blue-600 to-blue-700',
      description: 'Active organization users',
    },
    {
      title: 'Active Users',
      value: data.activeUsers.toLocaleString(),
      icon: BarChart3,
      color: 'from-emerald-600 to-emerald-700',
      description: 'Users with recent activity',
    },
    {
      title: 'Form Submissions',
      value: data.totalFormSubmissions.toLocaleString(),
      icon: FileText,
      color: 'from-purple-600 to-purple-700',
      description: 'Total across all modules',
    },
    {
      title: 'Audit Log Entries',
      value: data.auditLogEntries.toLocaleString(),
      icon: History,
      color: 'from-amber-600 to-amber-700',
      description: 'System activity records',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card key={metric.title} className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-shadow">
            <div className={`absolute inset-0 bg-gradient-to-br ${metric.color} opacity-5`} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-foreground/80">
                {metric.title}
              </CardTitle>
              <div className={`bg-gradient-to-br ${metric.color} p-2 rounded-lg`}>
                <Icon className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl font-bold text-foreground">
                {metric.value}
              </div>
              <p className="text-xs text-foreground/60 mt-2">
                {metric.description}
              </p>
              <div className="mt-3 flex items-center text-xs text-emerald-600 font-medium">
                <ArrowUpRight className="h-3 w-3 mr-1" />
                Updated in real-time
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
