'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Download, Zap, TrendingUp, Users } from 'lucide-react';
import PayrollTable from './payroll-table';
import PayslipPreview from './payslip-preview';
import PayrollAnalytics from './payroll-analytics';

interface PayrollRecord {
  employeeId: string;
  employeeName: string;
  email: string;
  totalSalary: number;
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
  month?: string;
}

export default function PayrollEngine() {
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollRecord | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [processingMonth, setProcessingMonth] = useState(new Date().toISOString().slice(0, 7));
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'table' | 'analytics'>('table');

  const generatePayrollForMonth = async () => {
    setLoading(true);
    setMessage(null);
    try {
      console.log('[v0] Starting auto-generate payroll for:', processingMonth);
      
      const response = await fetch('/api/payroll/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: processingMonth }),
      });

      const data = await response.json();
      console.log('[v0] Response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate payroll');
      }

      if (data.payrolls && data.payrolls.length > 0) {
        setPayrolls(data.payrolls);
        setMessage({ 
          type: 'success', 
          text: `✓ Payroll auto-generated successfully for ${data.payrolls.length} employees!` 
        });
      } else {
        setMessage({ 
          type: 'error', 
          text: 'No payroll data generated. Check if employees have attendance records for the selected month.' 
        });
      }
    } catch (error) {
      console.error('[v0] Error generating payroll:', error);
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Error generating payroll' 
      });
    }
    setLoading(false);
  };

  const exportPayroll = () => {
    const dataStr = JSON.stringify(payrolls, null, 2);
    const element = document.createElement('a');
    element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(dataStr)}`);
    element.setAttribute('download', `payroll-${processingMonth}.json`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const exportCSV = () => {
    const headers = ['Employee ID', 'Name', 'Email', 'Days', 'Hours', 'Gross', 'PF', 'Tax', 'Insurance', 'Net'];
    const rows = payrolls.map(p => [
      p.employeeId,
      p.employeeName,
      p.email,
      p.workingDays,
      p.workingHours.toFixed(1),
      p.grossSalary,
      p.deductions.pf,
      p.deductions.tax,
      p.deductions.insurance,
      p.netSalary,
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const element = document.createElement('a');
    element.setAttribute('href', `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`);
    element.setAttribute('download', `payroll-${processingMonth}.csv`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-6">
      {/* Generator Card */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Auto-Payroll Generator
          </CardTitle>
          <CardDescription>Auto-generate payroll from attendance & employee data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <div className={`p-3 rounded-md text-sm ${
              message.type === 'success' 
                ? 'bg-green-500/10 text-green-700 border border-green-500/20' 
                : 'bg-red-500/10 text-red-700 border border-red-500/20'
            }`}>
              {message.text}
            </div>
          )}
          
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-foreground mb-2">Processing Month</label>
              <input
                type="month"
                value={processingMonth}
                onChange={(e) => setProcessingMonth(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
              />
            </div>
            <Button
              onClick={generatePayrollForMonth}
              disabled={loading}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Zap className="h-4 w-4" />
              {loading ? 'Processing...' : 'Generate & Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Section */}
      {payrolls.length > 0 && (
        <>
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Payroll Summary - {processingMonth}</CardTitle>
                <CardDescription className="flex items-center gap-1 mt-1">
                  <Users className="h-4 w-4" />
                  {payrolls.length} employees processed
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCSV}
                  className="gap-1"
                >
                  <Download className="h-4 w-4" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportPayroll}
                  className="gap-1"
                >
                  <Download className="h-4 w-4" />
                  JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Tab Buttons */}
              <div className="flex gap-2 mb-4 border-b border-border">
                <button
                  onClick={() => setActiveTab('table')}
                  className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                    activeTab === 'table'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Detailed Table
                </button>
                <button
                  onClick={() => setActiveTab('analytics')}
                  className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-1 ${
                    activeTab === 'analytics'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <TrendingUp className="h-4 w-4" />
                  Analytics
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'table' && (
                <PayrollTable
                  payrolls={payrolls}
                  onSelectPayroll={(payroll) => {
                    setSelectedPayroll(payroll);
                    setShowPreview(true);
                  }}
                />
              )}

              {activeTab === 'analytics' && (
                <PayrollAnalytics payrolls={payrolls} month={processingMonth} />
              )}
            </CardContent>
          </Card>

          {/* Payslip Preview Modal */}
          {showPreview && selectedPayroll && (
            <PayslipPreview
              payroll={selectedPayroll}
              onClose={() => setShowPreview(false)}
              processingMonth={processingMonth}
            />
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && payrolls.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-foreground font-medium">No payroll records generated</p>
            <p className="text-sm text-muted-foreground mt-1">Generate payroll to see employee records and details</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
