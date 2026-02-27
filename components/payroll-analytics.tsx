'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PayrollRecord {
  employeeId: string;
  employeeName: string;
  email: string;
  workingDays: number;
  workingHours: number;
  baseSalary: number;
  hourlyRate: number;
  grossSalary: number;
  deductions: {
    pf: number;
    tax: number;
    insurance: number;
    other: number;
  };
  netSalary: number;
}

interface PayrollAnalyticsProps {
  payrolls: PayrollRecord[];
  month: string;
}

export default function PayrollAnalytics({ payrolls, month }: PayrollAnalyticsProps) {
  // Calculate summary metrics
  const totalGrossSalary = payrolls.reduce((sum, p) => sum + p.grossSalary, 0);
  const totalNetSalary = payrolls.reduce((sum, p) => sum + p.netSalary, 0);
  const totalDeductions = totalGrossSalary - totalNetSalary;
  const avgWorkingHours = (payrolls.reduce((sum, p) => sum + p.workingHours, 0) / payrolls.length).toFixed(1);

  // Data for employee salary comparison
  const salaryComparisonData = payrolls.map(p => ({
    name: p.employeeName.split(' ')[0],
    gross: p.grossSalary,
    net: p.netSalary,
    deductions: p.deductions.pf + p.deductions.tax + p.deductions.insurance + p.deductions.other,
  }));

  // Data for deduction breakdown
  const deductionData = [
    { name: 'PF', value: payrolls.reduce((sum, p) => sum + p.deductions.pf, 0) },
    { name: 'Tax', value: payrolls.reduce((sum, p) => sum + p.deductions.tax, 0) },
    { name: 'Insurance', value: payrolls.reduce((sum, p) => sum + p.deductions.insurance, 0) },
  ];

  const COLORS = ['#3b82f6', '#ef4444', '#f59e0b'];

  // Working hours distribution
  const workingHoursData = payrolls.map(p => ({
    name: p.employeeName.split(' ')[0],
    hours: parseFloat(p.workingHours.toFixed(1)),
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Gross Salary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">₹{(totalGrossSalary / 100000).toFixed(2)}L</p>
            <p className="text-xs text-muted-foreground mt-1">{payrolls.length} employees</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Net Salary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">₹{(totalNetSalary / 100000).toFixed(2)}L</p>
            <p className="text-xs text-muted-foreground mt-1">After deductions</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Deductions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">₹{(totalDeductions / 100000).toFixed(2)}L</p>
            <p className="text-xs text-muted-foreground mt-1">{((totalDeductions / totalGrossSalary) * 100).toFixed(1)}% of gross</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Working Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{avgWorkingHours} hrs</p>
            <p className="text-xs text-muted-foreground mt-1">Per employee</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Salary Comparison Chart */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Employee Salary Comparison</CardTitle>
            <CardDescription>Gross vs Net salary breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salaryComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--background)', 
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                  }} 
                />
                <Legend />
                <Bar dataKey="gross" fill="#3b82f6" name="Gross" />
                <Bar dataKey="net" fill="#10b981" name="Net" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Deduction Breakdown Pie Chart */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Deduction Breakdown</CardTitle>
            <CardDescription>Total deductions by type</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={deductionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ₹${(value / 100000).toFixed(2)}L`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {deductionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => `₹${(value as number / 100000).toFixed(2)}L`}
                  contentStyle={{ 
                    backgroundColor: 'var(--background)', 
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Working Hours Distribution */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">Working Hours Distribution</CardTitle>
          <CardDescription>Hours worked per employee</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={workingHoursData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" />
              <YAxis stroke="var(--muted-foreground)" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--background)', 
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="hours" 
                stroke="#3b82f6" 
                dot={{ fill: '#3b82f6' }} 
                name="Working Hours"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
