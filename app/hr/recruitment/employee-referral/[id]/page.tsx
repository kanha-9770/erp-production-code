"use client";

import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useGetEmployeeReferralQuery,
  type EmployeeReferralStatus,
} from "@/lib/api/employee-referrals";
import {
  DetailShell,
  DetailLoading,
  DetailNotFound,
  DetailSection,
  DetailFact,
  fmtDate,
} from "@/components/workspace/detail-shell";
import {
  Mail,
  FileText,
  UserPlus,
  Info,
  ExternalLink,
  User,
} from "lucide-react";

const BACK = "/hr/recruitment/employee-referral";

const STATUS_LABEL: Record<EmployeeReferralStatus, string> = {
  NEW: "New",
  REVIEWED: "Reviewed",
  INTERVIEWING: "Interviewing",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

const STATUS_VARIANT: Record<EmployeeReferralStatus, "default" | "secondary" | "destructive" | "outline"> = {
  NEW: "default",
  REVIEWED: "secondary",
  INTERVIEWING: "secondary",
  HIRED: "default",
  REJECTED: "destructive",
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export default function EmployeeReferralDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data, isLoading, isError } = useGetEmployeeReferralQuery(id as string, {
    skip: !id,
  });
  const r = data?.referral;

  if (isLoading) return <DetailLoading />;
  if (isError || !r) return <DetailNotFound backHref={BACK} />;

  const creator = r.createdBy
    ? `${r.createdBy.first_name ?? ""} ${r.createdBy.last_name ?? ""}`.trim() ||
      r.createdBy.email
    : null;

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Employee Referrals"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
            {initialsOf(r.applicantName)}
          </span>
          {r.applicantName}
          <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">
            {STATUS_LABEL[r.status]}
          </Badge>
        </span>
      }
      subtitle={
        <>
          {r.designation || "—"}
          {r.referralCode ? <> · <span className="font-mono">{r.referralCode}</span></> : null}
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Applicant" icon={<Mail className="h-3.5 w-3.5" />}>
          <DetailFact label="Name" value={r.applicantName} />
          <DetailFact label="Email" value={r.applicantEmail} />
          <DetailFact label="Mobile" value={r.applicantMobile} mono />
          <DetailFact label="Designation (target)" value={r.designation} />
        </DetailSection>

        <DetailSection title="Referred by" icon={<UserPlus className="h-3.5 w-3.5" />}>
          <DetailFact
            label="Referrer"
            value={r.referringEmployee?.employeeName ?? r.referrerFirstName}
          />
          <DetailFact label="Department" value={r.referrerDepartment} />
          <DetailFact label="Referrer email" value={r.referringEmployee?.emailAddress1} />
          <DetailFact label="Referral date" value={fmtDate(r.referralDate)} />
        </DetailSection>

        {r.applicantResumeUrl ? (
          <DetailSection
            title="Resume"
            icon={<FileText className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            <div className="sm:col-span-2">
              <Button asChild variant="outline" size="sm">
                <a href={r.applicantResumeUrl} target="_blank" rel="noreferrer">
                  {r.applicantResumeName || "Open resume"}
                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                </a>
              </Button>
            </div>
          </DetailSection>
        ) : null}

        <DetailSection
          title="Remark"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Remark" value={r.remark} wide />
        </DetailSection>

        <DetailSection
          title="Audit"
          icon={<User className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Referral ID" value={r.id} mono />
          <DetailFact label="Captured by" value={creator} />
          <DetailFact label="Created" value={fmtDate(r.createdAt)} />
          <DetailFact label="Updated" value={fmtDate(r.updatedAt)} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
