'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import PayrollForm from './payroll-form';
import PayrollRecordsList from './payroll-records-list';
import { useToast } from '@/hooks/use-toast';

interface EmployeeData {
  employeeName: string;
  employeeId: string;
  designation: string;
  department: string;
  status: string;
  dateOfJoining: string;
  totalSalary: number;
  givenSalary: number;
  bankName: string;
  bankAccountNo: string;
}

interface PayrollResponse {
  success: boolean;
  employee: EmployeeData;
  formRecord: {
    id: string;
    userId: string;
    submittedAt: string;
    status: string;
  };
  payrollRecords: any[];
}

export default function PayrollDashboard() {
  const [data, setData] = useState<PayrollResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPayrollData();
  }, []);

  const fetchPayrollData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/payroll');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Failed to fetch payroll data');
      }

      const result = await response.json();
      setData(result);
      console.log("[v0] Payroll data loaded for:", result.employee?.employeeName);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load payroll data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePayrollCreated = () => {
    fetchPayrollData();
    setShowForm(false);
    toast({
      title: 'Success',
      description: 'Payroll record created successfully',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading payroll data...</div>
      </div>
    );
  }

  if (!data?.employee) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center">No employee data found. Please ensure your employee form is submitted.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const employee = data.employee;
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const groupedByMonth: { [key: string]: any[] } = {};

  // Group payroll records by month-year
  data.payrollRecords.forEach(record => {
    const key = `${monthNames[record.month - 1]} ${record.year}`;
    if (!groupedByMonth[key]) {
      groupedByMonth[key] = [];
    }
    groupedByMonth[key].push(record);
  });

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Payroll Management</h1>
        <p className="text-lg text-muted-foreground">
          Monthly salary processing for <span className="font-semibold text-foreground">{employee.employeeName}</span>
        </p>
      </div>

      {/* Employee Information Card */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle>Employee Information</CardTitle>
          <CardDescription>Current employment details and compensation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Personal Details */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase">Personal Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Employee Name</p>
                <p className="text-base font-semibold">{employee.employeeName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Employee ID</p>
                <p className="text-base font-semibold">{employee.employeeId || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Designation</p>
                <p className="text-base font-semibold">{employee.designation || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Department</p>
                <p className="text-base font-semibold">{employee.department || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Salary & Compensation */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase">Salary & Compensation</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Salary (CTC)</p>
                <p className="text-lg font-bold text-green-600">₹{(employee.totalSalary || 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Given Salary</p>
                <p className="text-lg font-bold text-blue-600">₹{(employee.givenSalary || 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
                <p className="text-lg font-bold text-purple-600">{employee.status || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase">Bank Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bank Name</p>
                <p className="text-base font-semibold">{employee.bankName || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Number</p>
                <p className="text-base font-mono font-semibold">****{employee.bankAccountNo?.slice(-4) || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase">Employment Dates</h3>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Date of Joining</p>
              <p className="text-base font-semibold">
                {employee.dateOfJoining 
                  ? new Date(employee.dateOfJoining).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
                  : 'N/A'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Payroll Form Section */}
      {showForm && (
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Create Monthly Payroll Record</CardTitle>
            <CardDescription>Enter attendance and deduction details for this month</CardDescription>
          </CardHeader>
          <CardContent>
            <PayrollForm 
              formRecordId={data.formRecord.id}
              employeeName={employee.employeeName}
              employeeSalary={employee.givenSalary || 0}
              onSuccess={handlePayrollCreated}
            />
          </CardContent>
        </Card>
      )}

      {/* Payroll Records Section */}
      <Card className="border-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Payroll Records</CardTitle>
            <CardDescription>
              {data.payrollRecords.length} record(s) {data.payrollRecords.length > 0 ? 'created' : 'found'}
            </CardDescription>
          </div>
          <Button 
            onClick={() => setShowForm(!showForm)} 
            variant={showForm ? "outline" : "default"}
            size="lg"
          >
            {showForm ? 'Cancel' : '+ Create Payroll'}
          </Button>
        </CardHeader>
        <CardContent>
          {data.payrollRecords.length > 0 ? (
            <div className="space-y-6">
              {Object.entries(groupedByMonth).map(([monthYear, records]) => (
                <div key={monthYear} className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase">{monthYear}</h3>
                  <PayrollRecordsList records={records} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No payroll records created yet</p>
              <Button onClick={() => setShowForm(true)}>Create First Payroll</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
