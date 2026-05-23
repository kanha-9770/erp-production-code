"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useGetJobOpeningQuery,
  type JobOpeningStatus,
} from "@/lib/api/job-openings";
import type { EmploymentType } from "@/lib/api/staffing-plans";
import {
  DetailShell,
  DetailLoading,
  DetailNotFound,
  DetailSection,
  DetailFact,
  fmtDate,
  fmtMoney,
} from "@/components/workspace/detail-shell";
import {
  Briefcase,
  Calculator,
  Globe,
  Info,
  FileText,
  ExternalLink,
  User,
} from "lucide-react";

const BACK = "/hr/recruitment/job-opening";

const STATUS_LABEL: Record<JobOpeningStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  ON_HOLD: "On Hold",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const STATUS_VARIANT: Record<JobOpeningStatus, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  OPEN: "default",
  ON_HOLD: "outline",
  CLOSED: "outline",
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

export default function JobOpeningDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data, isLoading, isError } = useGetJobOpeningQuery(id as string, {
    skip: !id,
  });
  const o = data?.opening;

  if (isLoading) return <DetailLoading />;
  if (isError || !o) return <DetailNotFound backHref={BACK} />;

  const creator = o.createdBy
    ? `${o.createdBy.first_name ?? ""} ${o.createdBy.last_name ?? ""}`.trim() ||
      o.createdBy.email
    : null;

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Job Openings"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {o.profileName}
          <Badge variant={STATUS_VARIANT[o.status]} className="text-[10px]">
            {STATUS_LABEL[o.status]}
          </Badge>
          {o.publishOnWebsite ? (
            <Badge
              variant="outline"
              className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
            >
              <Globe className="h-3 w-3 mr-1" />
              On career page
            </Badge>
          ) : null}
        </span>
      }
      subtitle={
        <>
          {o.designation} · {o.department}
          {o.jobCode ? <> · <span className="font-mono">{o.jobCode}</span></> : null}
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Role" icon={<Briefcase className="h-3.5 w-3.5" />}>
          <DetailFact label="Profile name" value={o.profileName} />
          <DetailFact label="Job code" value={o.jobCode} mono />
          <DetailFact label="Department" value={o.department} />
          <DetailFact label="Designation" value={o.designation} />
          <DetailFact
            label="Employment type"
            value={EMPLOYMENT_TYPE_LABEL[o.employmentType] ?? o.employmentType}
          />
          <DetailFact label="Vacancies" value={o.vacancies} />
        </DetailSection>

        <DetailSection title="Compensation" icon={<Calculator className="h-3.5 w-3.5" />}>
          <DetailFact label="Approx salary" value={fmtMoney(o.salaryApprox)} mono />
          <DetailFact label="Publish on website" value={o.publishOnWebsite ? "Yes" : "No"} />
          <DetailFact label="Status" value={STATUS_LABEL[o.status]} />
        </DetailSection>

        {o.staffingPlan ? (
          <DetailSection
            title="Linked Staffing Plan"
            icon={<FileText className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            <DetailFact label="Plan name" value={o.staffingPlan.profileName} />
            <DetailFact label="Plan code" value={o.staffingPlan.planCode} mono />
            <div className="sm:col-span-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/hr/recruitment/staffing-plan/${o.staffingPlan.id}`}>
                  Open staffing plan
                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          </DetailSection>
        ) : null}

        <DetailSection
          title="Job Description"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Description" value={o.jobDescription} wide />
        </DetailSection>

        <DetailSection
          title="Audit"
          icon={<User className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Opening ID" value={o.id} mono />
          <DetailFact label="Created by" value={creator} />
          <DetailFact label="Created" value={fmtDate(o.createdAt)} />
          <DetailFact label="Updated" value={fmtDate(o.updatedAt)} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
