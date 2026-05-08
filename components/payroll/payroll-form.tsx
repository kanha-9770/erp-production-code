'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useCreatePayrollMutation } from '@/lib/api/payroll';

interface PreviewResponse {
  baseSalary: number;
  payableDays: number;
  daysInMonth: number;
  perDay: number;
  hourlyRate: number;
  monthlyGross: number;
  grossSalary: number;
  netSalary: number;
  totalDeductions: number;
  cappedOtHours: number;
  earnings: {
    basic: number;
    hra: number;
    da: number;
    conveyance: number;
    medical: number;
    lta: number;
    specialAllowance: number;
    overtime: number;
  };
  deductionsDetail: {
    pf: number;
    esi: number;
    pt: number;
    tds: number;
    lwf: number;
    nps: number;
  };
}

interface PayrollFormProps {
  formRecordId: string;
  employeeName: string;
  employeeSalary: number;
  onSuccess: () => void;
}

export default function PayrollForm({ 
  formRecordId, 
  employeeName, 
  employeeSalary, 
  onSuccess 
}: PayrollFormProps) {
  const [loading, setLoading] = useState(false);
  const [createPayroll] = useCreatePayrollMutation();
  const currentDate = new Date();
  
  const [formData, setFormData] = useState({
    month: currentDate.getMonth() + 1,
    year: currentDate.getFullYear(),
    presentDays: 20,
    leaveDays: 0,
    halfDays: 0,
    shortLeaves: 0,
    overtimeHours: 0,
    deductions: 0,
    notes: '',
  });

  const { toast } = useToast();

  // Live preview from the engine. Falls back to a local quick estimate when
  // the API hasn't responded yet so the card never renders blank.
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const previewKey = useMemo(
    () =>
      [
        formData.year,
        formData.month,
        formData.presentDays,
        formData.halfDays,
        formData.leaveDays,
        formData.overtimeHours,
        employeeSalary,
      ].join('|'),
    [formData.year, formData.month, formData.presentDays, formData.halfDays, formData.leaveDays, formData.overtimeHours, employeeSalary],
  );

  useEffect(() => {
    if (!employeeSalary || employeeSalary <= 0) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        setPreviewError(null);
        const res = await fetch('/api/payroll/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseSalary: employeeSalary,
            year: formData.year,
            month: formData.month,
            presentDays: formData.presentDays,
            halfDays: formData.halfDays,
            leaveDays: formData.leaveDays,
            overtimeHours: { weekday: formData.overtimeHours, weekend: 0, holiday: 0 },
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Preview failed');
        setPreview(data.preview);
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        setPreviewError(err instanceof Error ? err.message : 'Preview unavailable');
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [previewKey, employeeSalary, formData.year, formData.month, formData.presentDays, formData.halfDays, formData.leaveDays, formData.overtimeHours]);

  // Local fallback used until the first preview lands. Mirrors the engine's
  // basic gross math without statutory deductions.
  const fallback = useMemo(() => {
    const totalDaysInMonth = new Date(formData.year, formData.month, 0).getDate();
    const workingDays = formData.presentDays + formData.halfDays * 0.5 + formData.leaveDays;
    const perDaySalary = employeeSalary / totalDaysInMonth;
    const grossSalary = perDaySalary * workingDays;
    return {
      workingDays,
      perDaySalary: Math.round(perDaySalary),
      grossSalary: Math.round(grossSalary),
      netSalary: Math.round(grossSalary - formData.deductions),
    };
  }, [formData.year, formData.month, formData.presentDays, formData.halfDays, formData.leaveDays, formData.deductions, employeeSalary]);

  const salary = preview
    ? {
        workingDays: preview.payableDays,
        perDaySalary: Math.round(preview.perDay),
        grossSalary: preview.grossSalary,
        netSalary: Math.max(0, preview.netSalary - formData.deductions),
      }
    : fallback;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'notes' ? value : Number(value),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      const result = await createPayroll(formData).unwrap();
      console.log("[v0] Payroll record created for", employeeName);
      
      const monthName = new Date(2000, formData.month - 1).toLocaleString('en-US', { month: 'long' });
      toast({
        title: 'Success',
        description: `Payroll for ${monthName} ${formData.year} created successfully`,
      });

      onSuccess();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create payroll record',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      
      {/* Month and Year Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Month</label>
          <select
            name="month"
            value={formData.month}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            required
          >
            {months.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Year</label>
          <input
            type="number"
            name="year"
            value={formData.year}
            onChange={handleChange}
            min="2020"
            max={currentDate.getFullYear() + 1}
            className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            required
          />
        </div>
      </div>

      {/* Attendance Details */}
      <Card className="bg-muted/50 p-4 space-y-4">
        <h3 className="font-semibold text-sm uppercase tracking-wide">Attendance Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Present Days</label>
            <input
              type="number"
              name="presentDays"
              value={formData.presentDays}
              onChange={handleChange}
              min="0"
              max="31"
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Leave Days</label>
            <input
              type="number"
              name="leaveDays"
              value={formData.leaveDays}
              onChange={handleChange}
              step="0.5"
              min="0"
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Half Days</label>
            <input
              type="number"
              name="halfDays"
              value={formData.halfDays}
              onChange={handleChange}
              min="0"
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Short Leaves</label>
            <input
              type="number"
              name="shortLeaves"
              value={formData.shortLeaves}
              onChange={handleChange}
              min="0"
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Overtime Hours</label>
            <input
              type="number"
              name="overtimeHours"
              value={formData.overtimeHours}
              onChange={handleChange}
              step="0.5"
              min="0"
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            />
          </div>
        </div>
      </Card>

      {/* Deductions & Notes */}
      <Card className="bg-muted/50 p-4 space-y-4">
        <h3 className="font-semibold text-sm uppercase tracking-wide">Deductions & Remarks</h3>
        <div>
          <label className="block text-sm font-medium mb-2">Deductions (₹)</label>
          <input
            type="number"
            name="deductions"
            value={formData.deductions}
            onChange={handleChange}
            min="0"
            className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Notes / Remarks</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            placeholder="Add any additional notes or remarks..."
          />
        </div>
      </Card>

      {/* Salary Calculation Summary */}
      <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800 p-4 space-y-4">
        <h3 className="font-bold text-sm uppercase tracking-wide">Salary Calculation Summary</h3>
        {previewError && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Live preview unavailable ({previewError}); showing local estimate.
          </p>
        )}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Monthly Salary</span>
            <span className="font-semibold">₹{employeeSalary.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Per Day Rate</span>
            <span className="font-semibold">₹{salary.perDaySalary.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Payable Days</span>
            <span className="font-semibold">{salary.workingDays} days</span>
          </div>

          {preview && (
            <div className="rounded border border-green-200/50 dark:border-green-800/50 bg-white/40 dark:bg-black/10 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Earnings breakdown</p>
              {([
                ['Basic', preview.earnings.basic],
                ['HRA', preview.earnings.hra],
                ['DA', preview.earnings.da],
                ['Conveyance', preview.earnings.conveyance],
                ['Medical', preview.earnings.medical],
                ['LTA', preview.earnings.lta],
                ['Special', preview.earnings.specialAllowance],
                ['Overtime', preview.earnings.overtime],
              ] as Array<[string, number]>)
                .filter(([, v]) => v > 0)
                .map(([label, v]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span>₹{v.toLocaleString('en-IN')}</span>
                  </div>
                ))}
            </div>
          )}

          <div className="border-t border-green-200 dark:border-green-800 pt-3 flex justify-between items-center bg-white/50 dark:bg-black/20 px-3 py-2 rounded">
            <span className="font-medium">Gross Salary</span>
            <span className="text-lg font-bold text-green-700 dark:text-green-400">₹{salary.grossSalary.toLocaleString('en-IN')}</span>
          </div>

          {preview && (
            <div className="rounded border border-rose-200/50 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/10 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Statutory deductions</p>
              {([
                ['PF', preview.deductionsDetail.pf],
                ['ESI', preview.deductionsDetail.esi],
                ['Professional Tax', preview.deductionsDetail.pt],
                ['TDS', preview.deductionsDetail.tds],
                ['LWF', preview.deductionsDetail.lwf],
                ['NPS', preview.deductionsDetail.nps],
              ] as Array<[string, number]>)
                .filter(([, v]) => v > 0)
                .map(([label, v]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-red-600">−₹{v.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              <div className="flex justify-between text-xs border-t border-rose-200/40 dark:border-rose-900/40 pt-1 mt-1 font-semibold">
                <span>Statutory total</span>
                <span className="text-red-600">−₹{preview.totalDeductions.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="font-medium">Manual deductions</span>
            <span className="font-semibold text-red-600">-₹{formData.deductions.toLocaleString('en-IN')}</span>
          </div>
          <div className="border-t border-green-200 dark:border-green-800 pt-3 flex justify-between items-center bg-white/50 dark:bg-black/20 px-3 py-2 rounded">
            <span className="font-bold uppercase">Net Salary</span>
            <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">₹{salary.netSalary.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={loading} className="w-full" size="lg">
        {loading ? 'Creating Payroll Record...' : 'Create Payroll Record'}
      </Button>
    </form>
  );
}
