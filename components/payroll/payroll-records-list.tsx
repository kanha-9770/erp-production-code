'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PayrollRecord {
  id: string;
  month: number;
  year: number;
  presentDays: number;
  leaveDays: number;
  halfDays: number;
  baseSalary: number | string;
  grossSalary: number | string;
  netSalary: number | string;
  deductions: number | string;
  status: string;
  createdAt: string;
}

interface Props {
  records: PayrollRecord[];
}

export default function PayrollRecordsList({ records }: Props) {
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getStatusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'processed':
        return 'default';
      case 'paid':
        return 'outline';
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month/Year</TableHead>
              <TableHead>Present Days</TableHead>
              <TableHead>Leave Days</TableHead>
              <TableHead>Gross Salary</TableHead>
              <TableHead>Deductions</TableHead>
              <TableHead>Net Salary</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id} className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  {months[record.month - 1]} {record.year}
                </TableCell>
                <TableCell>{record.presentDays}</TableCell>
                <TableCell>{record.leaveDays}</TableCell>
                <TableCell>₹ {Number(record.grossSalary).toLocaleString()}</TableCell>
                <TableCell>₹ {Number(record.deductions).toLocaleString()}</TableCell>
                <TableCell className="font-semibold">
                  ₹ {Number(record.netSalary).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(record.status)}>
                    {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => setSelectedRecord(record)}
                    className="text-primary hover:underline text-sm"
                  >
                    View
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detail View */}
      {selectedRecord && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {months[selectedRecord.month - 1]} {selectedRecord.year} - Payroll Details
            </h3>
            <button
              onClick={() => setSelectedRecord(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Present Days</p>
              <p className="text-lg font-semibold">{selectedRecord.presentDays}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Leave Days</p>
              <p className="text-lg font-semibold">{selectedRecord.leaveDays}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Half Days</p>
              <p className="text-lg font-semibold">{selectedRecord.halfDays}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Base Salary</p>
              <p className="text-lg font-semibold">₹ {Number(selectedRecord.baseSalary).toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Gross Salary</p>
              <p className="text-lg font-semibold">₹ {Number(selectedRecord.grossSalary).toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Deductions</p>
              <p className="text-lg font-semibold">₹ {Number(selectedRecord.deductions).toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Net Salary</p>
              <p className="text-lg font-semibold text-green-600">₹ {Number(selectedRecord.netSalary).toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={getStatusVariant(selectedRecord.status)}>
                {selectedRecord.status.charAt(0).toUpperCase() + selectedRecord.status.slice(1)}
              </Badge>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Created: {new Date(selectedRecord.createdAt).toLocaleDateString()}
          </p>
        </Card>
      )}
    </div>
  );
}
