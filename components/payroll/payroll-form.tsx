'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

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

  const calculateSalaryComponents = () => {
    const totalDaysInMonth = 30;
    const workingDays = formData.presentDays + formData.halfDays * 0.5;
    const perDaySalary = employeeSalary / totalDaysInMonth;
    const grossSalary = perDaySalary * workingDays;
    const netSalary = grossSalary - formData.deductions;

    return {
      grossSalary: Math.round(grossSalary),
      netSalary: Math.round(netSalary),
      workingDays,
      perDaySalary: Math.round(perDaySalary),
    };
  };

  const salary = calculateSalaryComponents();

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
      const response = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create payroll record');
      }

      const result = await response.json();
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
            <span className="text-muted-foreground">Working Days</span>
            <span className="font-semibold">{salary.workingDays} days</span>
          </div>
          <div className="border-t border-green-200 dark:border-green-800 pt-3 flex justify-between items-center bg-white/50 dark:bg-black/20 px-3 py-2 rounded">
            <span className="font-medium">Gross Salary</span>
            <span className="text-lg font-bold text-green-700 dark:text-green-400">₹{salary.grossSalary.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-medium">Deductions</span>
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
