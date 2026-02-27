"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Settings,
  BarChart3,
  Code2,
  FileText,
  Calendar,
  ChevronDown,
  RefreshCw,
  Mail,
  Printer,
  FileSpreadsheet,
} from "lucide-react";
import { PayrollConfigDialog } from "@/components/payroll/payroll-config-dialog";

interface PayrollMenuProps {
  isAdmin: boolean;
  filters: any;
  onFilterChange: (filters: any) => void;
  onExport: () => void;
  onProcessPayroll: () => void;
  onOpenAnalytics: () => void;
  onOpenCalculations: () => void;
  onOpenLeaveRules: () => void;
  processing?: boolean;
}

export function PayrollMenu({
  isAdmin,
  filters,
  onFilterChange,
  onExport,
  onProcessPayroll,
  onOpenAnalytics,
  onOpenCalculations,
  onOpenLeaveRules,
  processing = false,
}: PayrollMenuProps) {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    // TODO: Implement PDF export
    console.log("Exporting to PDF...");
  };

  const handleSendBulkEmails = () => {
    // TODO: Implement bulk email sending
    console.log("Sending bulk emails...");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm font-medium border-[#dadce0] hover:bg-[#f1f3f4] bg-transparent"
          >
            Actions
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>View & Export</DropdownMenuLabel>
          <DropdownMenuItem onClick={onOpenAnalytics}>
            <BarChart3 className="h-4 w-4 mr-2" />
            View Analytics
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExport}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export to CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-2" />
            Export to PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Report
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Data
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem onClick={handleSendBulkEmails}>
              <Mail className="h-4 w-4 mr-2" />
              Send Payslips
            </DropdownMenuItem>
          )}

          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Configuration</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setConfigDialogOpen(true)}>
                <Settings className="h-4 w-4 mr-2" />
                Field Mapping
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenCalculations}>
                <Code2 className="h-4 w-4 mr-2" />
                Custom Calculations
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenLeaveRules}>
                <Calendar className="h-4 w-4 mr-2" />
                Leave Rules
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {isAdmin && (
        <PayrollConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          onConfigSaved={() => {
            setConfigDialogOpen(false);
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
