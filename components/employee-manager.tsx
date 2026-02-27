'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Clock, MapPin } from 'lucide-react';
import { parseApiResponse, calculateDailyPayroll } from '@/lib/payroll-utils';

interface DailyRecord {
  employeeName: string;
  email: string;
  date: string;
  checkInTime: string;
  checkOutTime?: string;
  workingHours: number;
  location: string;
  dailyPayroll?: {
    grossSalary: number;
    netSalary: number;
    deductions: {
      pf: number;
      tax: number;
      insurance: number;
    };
  };
}

export default function EmployeeManager() {
  const [employees, setEmployees] = useState<Map<string, DailyRecord[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadAttendance();
  }, []);

  const loadAttendance = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('http://localhost:3000/api/forms/testing');
            console.log('Fetching attendance data for stats calculation',response);

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      const dailyAttendance = parseApiResponse(data);
      const dailyPayrolls = calculateDailyPayroll(dailyAttendance);

      const employeeMap = new Map<string, DailyRecord[]>();

      dailyAttendance.forEach((attendance) => {
        const payroll = dailyPayrolls.find(
          (p) => p.email === attendance.email && p.date === attendance.date
        );

        const record: DailyRecord = {
          employeeName: attendance.employeeName,
          email: attendance.email,
          date: attendance.date,
          checkInTime: attendance.checkInTime,
          checkOutTime: attendance.checkOutTime,
          workingHours: attendance.workingHours,
          location: attendance.location,
          dailyPayroll: payroll ? {
            grossSalary: payroll.grossSalary,
            netSalary: payroll.netSalary,
            deductions: payroll.deductions,
          } : undefined,
        };

        if (!employeeMap.has(attendance.email)) {
          employeeMap.set(attendance.email, []);
        }
        employeeMap.get(attendance.email)?.push(record);
      });

      setEmployees(employeeMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance');
    }
    setLoading(false);
  };

  const calculateTotalHours = (records: DailyRecord[]) => {
    return records.reduce((total, r) => total + r.workingHours, 0).toFixed(1);
  };

  const calculateTotalEarnings = (records: DailyRecord[]) => {
    return records.reduce((total, r) => total + (r.dailyPayroll?.netSalary || 0), 0);
  };

  if (error) {
    return (
      <Card className="border-red-500/50">
        <CardContent className="pt-6">
          <p className="text-red-600">{error}</p>
          <Button onClick={loadAttendance} className="mt-4">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Loading attendance data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Employee Attendance & Daily Payroll
          </CardTitle>
          <CardDescription>View employee attendance with auto-generated daily payroll</CardDescription>
        </CardHeader>
        <CardContent>
          {employees.size === 0 ? (
            <p className="text-muted-foreground">No attendance records found</p>
          ) : (
            <div className="space-y-2">
              {Array.from(employees.entries()).map(([email, records]) => (
                <div key={email} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedEmployee(expandedEmployee === email ? null : email)}
                    className="w-full px-4 py-3 bg-muted hover:bg-muted/80 text-left font-medium text-foreground flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Users className="h-4 w-4" />
                      <span>{records[0]?.employeeName}</span>
                      <span className="text-xs text-muted-foreground">({records.length} days)</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm font-normal">
                      <span>{calculateTotalHours(records)} hrs</span>
                      <span className="text-primary font-semibold">₹{calculateTotalEarnings(records).toFixed(0)}</span>
                    </div>
                  </button>

                  {expandedEmployee === email && (
                    <div className="p-4 space-y-3 bg-background">
                      {records.map((record, idx) => (
                        <div key={idx} className="p-3 border border-border rounded bg-card">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-medium text-foreground">{record.date}</span>
                            <div className="flex gap-2">
                              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                                {record.checkInTime}
                              </span>
                              {record.checkOutTime && (
                                <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                                  {record.checkOutTime}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              {record.workingHours.toFixed(1)} hours
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-4 w-4" />
                              {record.location}
                            </div>
                          </div>

                          {record.dailyPayroll && (
                            <div className="p-2 bg-primary/5 rounded text-xs space-y-1">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Gross:</span>
                                <span className="font-semibold">₹{record.dailyPayroll.grossSalary}</span>
                              </div>
                              <div className="flex justify-between text-muted-foreground text-xs gap-2">
                                <span>PF: ₹{record.dailyPayroll.deductions.pf}</span>
                                <span>Tax: ₹{record.dailyPayroll.deductions.tax}</span>
                                <span>Insurance: ₹{record.dailyPayroll.deductions.insurance}</span>
                              </div>
                              <div className="flex justify-between font-semibold text-primary pt-1 border-t border-primary/20">
                                <span>Net Pay:</span>
                                <span>₹{record.dailyPayroll.netSalary}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
