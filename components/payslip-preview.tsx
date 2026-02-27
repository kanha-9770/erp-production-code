'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Download, Printer } from 'lucide-react';
import { useRef } from 'react';

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

interface PayslipPreviewProps {
  payroll?: PayrollRecord;
  processingMonth?: string;
  onClose?: () => void;
}

export default function PayslipPreview({ payroll, processingMonth = new Date().toISOString().slice(0, 7), onClose }: PayslipPreviewProps) {
  const slipRef = useRef<HTMLDivElement>(null);

  if (!payroll) return null;

  const totalDeductions = payroll.deductions.pf + payroll.deductions.tax + payroll.deductions.insurance + payroll.deductions.other;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const text = JSON.stringify(
      {
        payslip: payroll,
        month: processingMonth,
        generatedDate: new Date().toISOString(),
      },
      null,
      2
    );
    element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`);
    element.setAttribute('download', `payslip-${payroll.employeeName}-${processingMonth}.json`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-card border-b border-border">
          <div>
            <CardTitle>Payslip - {processingMonth}</CardTitle>
            <CardDescription>{payroll.employeeName}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1">
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1">
              <Download className="h-4 w-4" />
              Export
            </Button>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-6" ref={slipRef}>
          <div className="bg-background p-6 border border-border rounded-lg space-y-6">
            {/* Header */}
            <div className="text-center border-b border-border pb-4">
              <h2 className="text-2xl font-bold text-foreground">PAYSLIP</h2>
              <p className="text-sm text-muted-foreground mt-1">For the Month of {processingMonth}</p>
            </div>

            {/* Employee Info */}
            <div className="grid grid-cols-2 gap-4 py-4 border-b border-border">
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase">Employee Name</p>
                <p className="text-foreground font-medium">{payroll.employeeName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase">Employee ID</p>
                <p className="text-foreground font-medium">{payroll.employeeId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase">Email</p>
                <p className="text-foreground font-medium">{payroll.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase">Working Days</p>
                <p className="text-foreground font-medium">{payroll.workingDays}</p>
              </div>
            </div>

            {/* Earnings */}
            <div className="py-4 border-b border-border">
              <h3 className="text-sm font-bold text-foreground mb-3 uppercase">Earnings</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Basic Salary</span>
                  <span className="text-foreground font-medium">₹{payroll.baseSalary.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Working Hours</span>
                  <span className="text-foreground font-medium">{payroll.workingHours.toFixed(1)} hrs</span>
                </div>
                <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
                  <span className="font-semibold text-foreground">Gross Salary</span>
                  <span className="font-bold text-primary">₹{payroll.grossSalary.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div className="py-4 border-b border-border">
              <h3 className="text-sm font-bold text-foreground mb-3 uppercase">Deductions</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Provident Fund (PF)</span>
                  <span className="text-foreground font-medium">₹{payroll.deductions.pf.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Income Tax</span>
                  <span className="text-foreground font-medium">₹{payroll.deductions.tax.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Insurance</span>
                  <span className="text-foreground font-medium">₹{payroll.deductions.insurance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Other Deductions</span>
                  <span className="text-foreground font-medium">₹{payroll.deductions.other.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
                  <span className="font-semibold text-foreground">Total Deductions</span>
                  <span className="font-bold text-destructive">₹{totalDeductions.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Net Salary */}
            <div className="py-4 bg-muted p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-foreground">NET SALARY</span>
                <span className="text-2xl font-bold text-primary">₹{payroll.netSalary.toLocaleString()}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-muted-foreground border-t border-border pt-4">
              <p>This is an auto-generated payslip. For queries, contact HR.</p>
              <p className="mt-2">Generated on {new Date().toLocaleDateString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
