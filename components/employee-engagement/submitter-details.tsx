"use client";

/**
 * Submitter details card shown at the top of every engagement-record preview
 * when the viewer is an admin. Looks the submitter up in the employee list
 * by `employeeId` (which is what each engagement record carries on the wire).
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserCircle, Mail, Phone, Building2, Briefcase, Users } from "lucide-react";
import type { EmployeeListItem } from "@/lib/api/employees";

interface SubmitterDetailsProps {
  employeeId: string;
  employees: EmployeeListItem[];
  isAdmin: boolean;
  submissionDate?: string;
}

export function SubmitterDetails({ employeeId, employees, isAdmin, submissionDate }: SubmitterDetailsProps) {
  if (!isAdmin) return null;

  const employee = employees.find(e => e.id === employeeId);

  if (!employee) {
    return (
      <Card className="p-4 bg-amber-50/40 border-amber-200">
        <div className="flex items-center gap-2 text-xs text-amber-800">
          <UserCircle className="h-4 w-4" />
          <span>Submitter (Employee ID: {employeeId || "unknown"}) not found in directory.</span>
        </div>
      </Card>
    );
  }

  const fullName = [employee.firstName, employee.lastName].filter(Boolean).join(" ") || employee.employeeName || "—";
  const initials = (employee.firstName?.[0] ?? "") + (employee.lastName?.[0] ?? "") || "?";

  return (
    <Card className="p-4 bg-blue-50/30 border-blue-100">
      <div className="flex items-center gap-2 mb-3">
        <UserCircle className="h-4 w-4 text-blue-700" />
        <h3 className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">Submitted By</h3>
        <Badge variant="outline" className="ml-auto text-[10px] bg-white">ADMIN VIEW</Badge>
      </div>

      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 uppercase">
          {initials}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <div className="font-semibold text-sm uppercase truncate">{fullName}</div>
            <div className="text-[11px] text-muted-foreground">
              {employee.id}{employee.designation ? ` · ${employee.designation}` : ""}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {employee.department && (
              <DetailRow icon={Building2} label="Department" value={employee.department} />
            )}
            {employee.employeeEngagementTeamName && (
              <DetailRow icon={Users} label="Engagement Team" value={employee.employeeEngagementTeamName} />
            )}
            {employee.designation && (
              <DetailRow icon={Briefcase} label="Designation" value={employee.designation} />
            )}
            {(employee.emailAddress2 || employee.emailAddress1) && (
              <DetailRow icon={Mail} label="Email" value={employee.emailAddress2 || employee.emailAddress1 || ""} />
            )}
            {employee.personalContact && (
              <DetailRow icon={Phone} label="Phone" value={employee.personalContact} />
            )}
            {employee.branch && (
              <DetailRow icon={Building2} label="Branch" value={employee.branch} />
            )}
          </div>

          {submissionDate && (
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-blue-100 mt-2">
              Submitted on {new Date(submissionDate).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}
