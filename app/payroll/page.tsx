'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EmployeeManager from '@/components/employee-manager';
import PayslipPreview from '@/components/payslip-preview';
import Dashboard from '@/components/dashboard';
import PayrollEngine from '@/components/payroll-engine';

export default function PayrollPage() {
  const [] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading payroll system...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Payroll Management</h1>
          <p className="text-muted-foreground">Advanced payroll with auto-generation & database storage</p>
        </div>

        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
            <TabsTrigger value="payslips">Payslips</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4 mt-4">
            <Dashboard />
          </TabsContent>

          <TabsContent value="attendance" className="space-y-4 mt-4">
            <EmployeeManager />
          </TabsContent>

          <TabsContent value="payroll" className="space-y-4 mt-4">
            <PayrollEngine  />
          </TabsContent>

          <TabsContent value="payslips" className="space-y-4 mt-4">
            <PayslipPreview />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
