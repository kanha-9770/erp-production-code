'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, Shield, FileStack, CheckCircle2 } from 'lucide-react';

interface OrgSetupMetricsProps {
  data: {
    organizationalUnits: number;
    roles: number;
    permissions: number;
    formModules: number;
  };
}

export function OrgSetupMetrics({ data }: OrgSetupMetricsProps) {
  const metrics = [
    {
      title: 'Organization Units',
      value: data.organizationalUnits,
      icon: Building2,
      color: 'from-blue-600 to-blue-700',
      description: 'Hierarchical org structure',
    },
    {
      title: 'Roles Configured',
      value: data.roles,
      icon: Users,
      color: 'from-cyan-600 to-cyan-700',
      description: 'User role assignments',
    },
    {
      title: 'Permissions Defined',
      value: data.permissions,
      icon: Shield,
      color: 'from-violet-600 to-violet-700',
      description: 'Access control rules',
    },
    {
      title: 'Form Modules',
      value: data.formModules,
      icon: FileStack,
      color: 'from-pink-600 to-pink-700',
      description: 'Active form modules',
    },
  ];

  const completionPercentage = Math.round(
    ((data.organizationalUnits > 0 ? 25 : 0) +
      (data.roles > 0 ? 25 : 0) +
      (data.permissions > 0 ? 25 : 0) +
      (data.formModules > 0 ? 25 : 0)) /
      4 || 0
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.title} className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-shadow">
              <div className={`absolute inset-0 bg-gradient-to-br ${metric.color} opacity-5`} />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
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
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Setup Completion Status</CardTitle>
          <CardDescription>Organization configuration readiness</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Completion</span>
                <span className="text-lg font-bold text-primary">{completionPercentage}%</span>
              </div>
              <div className="w-full bg-foreground/10 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  label: 'Organization Units',
                  status: data.organizationalUnits > 0,
                  count: data.organizationalUnits,
                },
                {
                  label: 'Roles Setup',
                  status: data.roles > 0,
                  count: data.roles,
                },
                {
                  label: 'Permissions',
                  status: data.permissions > 0,
                  count: data.permissions,
                },
                {
                  label: 'Form Modules',
                  status: data.formModules > 0,
                  count: data.formModules,
                },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-foreground/5 hover:bg-foreground/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <CheckCircle2
                      className={`h-5 w-5 ${item.status ? 'text-emerald-600' : 'text-foreground/30'}`}
                    />
                    <span className="font-medium text-sm">{item.label}</span>
                  </div>
                  <span className="font-bold text-lg text-primary">{item.count}</span>
                </div>
              ))}
            </div>

            {completionPercentage === 100 ? (
              <div className="p-4 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-200">
                <p className="font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Organization fully configured
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200">
                <p className="font-medium">
                  {completionPercentage < 50 ? 'Organization configuration in progress' : 'Complete remaining setup steps'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
