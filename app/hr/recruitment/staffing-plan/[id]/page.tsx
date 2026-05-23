"use client";

import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  useGetStaffingPlanQuery,
  type StaffingPlanStatus,
  type EmploymentType,
} from "@/lib/api/staffing-plans";
import {
  DetailShell,
  DetailLoading,
  DetailNotFound,
  DetailSection,
  DetailFact,
  fmtDate,
  fmtMoney,
} from "@/components/workspace/detail-shell";
import { Briefcase, Calculator, Info, User } from "lucide-react";

const BACK = "/hr/recruitment/staffing-plan";

const STATUS_LABEL: Record<StaffingPlanStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  ON_HOLD: "On Hold",
  FILLED: "Filled",
  CANCELLED: "Cancelled",
};

const STATUS_VARIANT: Record<StaffingPlanStatus, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  OPEN: "default",
  ON_HOLD: "outline",
  FILLED: "default",
  CANCELLED: "destructive",
};

const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
  TEMPORARY: "Temporary",
  CONSULTANT: "Consultant",
};

export default function StaffingPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data, isLoading, isError } = useGetStaffingPlanQuery(id as string, {
    skip: !id,
  });
  const p = data?.plan;

  if (isLoading) return <DetailLoading />;
  if (isError || !p) return <DetailNotFound backHref={BACK} />;

  const creator = p.createdBy
    ? `${p.createdBy.first_name ?? ""} ${p.createdBy.last_name ?? ""}`.trim() ||
      p.createdBy.email
    : null;

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Staffing Plans"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {p.profileName}
          <Badge variant={STATUS_VARIANT[p.status]} className="text-[10px]">
            {STATUS_LABEL[p.status]}
          </Badge>
        </span>
      }
      subtitle={
        <>
          {p.designation} · {p.department}
          {p.planCode ? <> · <span className="font-mono">{p.planCode}</span></> : null}
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Role" icon={<Briefcase className="h-3.5 w-3.5" />}>
          <DetailFact label="Profile name" value={p.profileName} />
          <DetailFact label="Plan code" value={p.planCode} mono />
          <DetailFact label="Department" value={p.department} />
          <DetailFact label="Designation" value={p.designation} />
          <DetailFact
            label="Employment type"
            value={EMPLOYMENT_TYPE_LABEL[p.employmentType] ?? p.employmentType}
          />
          <DetailFact label="Vacancies" value={p.vacancies} />
        </DetailSection>

        <DetailSection title="Cost" icon={<Calculator className="h-3.5 w-3.5" />}>
          <DetailFact
            label="Estimated cost per person"
            value={fmtMoney(p.estimatedCostPerPerson)}
            mono
          />
          <DetailFact
            label="Total estimated cost"
            value={fmtMoney(p.totalEstimatedCost)}
            mono
          />
          <DetailFact label="Vacancies" value={p.vacancies} />
          <DetailFact label="Status" value={STATUS_LABEL[p.status]} />
        </DetailSection>

        <DetailSection
          title="Notes"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Notes" value={p.notes} wide />
        </DetailSection>

        <DetailSection
          title="Audit"
          icon={<User className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Plan ID" value={p.id} mono />
          <DetailFact label="Created by" value={creator} />
          <DetailFact label="Created" value={fmtDate(p.createdAt)} />
          <DetailFact label="Updated" value={fmtDate(p.updatedAt)} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
