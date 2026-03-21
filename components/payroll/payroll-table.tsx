'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

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
  status: 'pending' | 'processed';
}

interface Props {
  payrolls: PayrollRecord[];
  onSelectPayroll: (payroll: PayrollRecord) => void;
}

export default function PayrollTable({ payrolls, onSelectPayroll }: Props) {
  const totalDeductions = (deductions: PayrollRecord['deductions']) => 
    deductions.pf + deductions.tax + deductions.insurance + deductions.other;

  return (
    <div className="overflow-x-auto bg-background rounded-lg border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted border-b border-border">
            <th className="px-4 py-3 text-left font-bold text-foreground border-r border-border">Employee</th>
            <th className="px-4 py-3 text-left font-bold text-foreground border-r border-border">Email</th>
            <th className="px-4 py-3 text-center font-bold text-foreground border-r border-border">Days</th>
            <th className="px-4 py-3 text-center font-bold text-foreground border-r border-border">Hours</th>
            <th className="px-4 py-3 text-right font-bold text-foreground border-r border-border">Gross Salary</th>
            <th className="px-4 py-3 text-right font-bold text-foreground border-r border-border">PF (12%)</th>
            <th className="px-4 py-3 text-right font-bold text-foreground border-r border-border">Tax (5%)</th>
            <th className="px-4 py-3 text-right font-bold text-foreground border-r border-border">Insurance</th>
            <th className="px-4 py-3 text-right font-bold text-foreground border-r border-border">Total Deductions</th>
            <th className="px-4 py-3 text-right font-bold text-foreground bg-primary/10 border-r border-border">Net Salary</th>
            <th className="px-4 py-3 text-center font-bold text-foreground border-r border-border">Status</th>
            <th className="px-4 py-3 text-center font-bold text-foreground">Action</th>
          </tr>
        </thead>
        <tbody>
          {payrolls.map((payroll, idx) => (
            <tr key={idx} className="border-b border-border hover:bg-muted/50 transition-colors">
              <td className="px-4 py-3 font-medium text-foreground border-r border-border">{payroll.employeeName}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground border-r border-border">{payroll.email}</td>
              <td className="px-4 py-3 text-center text-foreground border-r border-border">{payroll.workingDays}</td>
              <td className="px-4 py-3 text-center text-foreground border-r border-border">{payroll.workingHours.toFixed(1)}</td>
              <td className="px-4 py-3 text-right font-semibold text-foreground border-r border-border">₹{payroll.grossSalary.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-foreground border-r border-border">₹{payroll.deductions.pf.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-foreground border-r border-border">₹{payroll.deductions.tax.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-foreground border-r border-border">₹{payroll.deductions.insurance.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-foreground border-r border-border">₹{totalDeductions(payroll.deductions).toLocaleString()}</td>
              <td className="px-4 py-3 text-right font-bold text-primary bg-primary/5">₹{payroll.netSalary.toLocaleString()}</td>
              <td className="px-4 py-3 text-center border-r border-border">
                <Badge variant={payroll.status === 'processed' ? 'default' : 'secondary'}>
                  {payroll.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectPayroll(payroll)}
                  className="gap-1"
                >
                  <FileText className="h-4 w-4" />
                  View
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
