"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useGetJobApplicationQuery,
  type JobApplicationStatus,
  type ApplicantSource,
} from "@/lib/api/job-applications";
import { SOURCE_OPTIONS } from "@/components/job-application/job-application-form";
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
  Mail,
  FileText,
  Star,
  Briefcase,
  Info,
  ExternalLink,
  User,
} from "lucide-react";

const BACK = "/hr/recruitment/job-application";

const STATUS_LABEL: Record<JobApplicationStatus, string> = {
  NEW: "New",
  SCREENING: "Screening",
  INTERVIEWING: "Interviewing",
  SHORTLISTED: "Shortlisted",
  OFFERED: "Offered",
  HIRED: "Hired",
  ON_HOLD: "On Hold",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const STATUS_VARIANT: Record<JobApplicationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  NEW: "default",
  SCREENING: "secondary",
  INTERVIEWING: "secondary",
  SHORTLISTED: "outline",
  OFFERED: "outline",
  HIRED: "default",
  ON_HOLD: "outline",
  REJECTED: "destructive",
  WITHDRAWN: "destructive",
};

const SOURCE_LABEL: Record<ApplicantSource, string> = SOURCE_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.value]: o.label }),
  {} as Record<ApplicantSource, string>,
);

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export default function JobApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data, isLoading, isError } = useGetJobApplicationQuery(id as string, {
    skip: !id,
  });
  const a = data?.application;

  if (isLoading) return <DetailLoading />;
  if (isError || !a) return <DetailNotFound backHref={BACK} />;

  const creator = a.createdBy
    ? `${a.createdBy.first_name ?? ""} ${a.createdBy.last_name ?? ""}`.trim() ||
      a.createdBy.email
    : null;

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Job Applications"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
            {initialsOf(a.applicantName)}
          </span>
          {a.applicantName}
          <Badge variant={STATUS_VARIANT[a.status]} className="text-[10px]">
            {STATUS_LABEL[a.status]}
          </Badge>
          {a.applicantRating != null ? (
            <Badge variant="outline" className="text-[10px]">
              <Star className="h-3 w-3 mr-1" />
              {a.applicantRating}/5
            </Badge>
          ) : null}
        </span>
      }
      subtitle={
        <>
          {a.designation || "—"}
          {a.department ? <> · {a.department}</> : null}
          {a.applicationCode ? <> · <span className="font-mono">{a.applicationCode}</span></> : null}
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Applicant" icon={<Mail className="h-3.5 w-3.5" />}>
          <DetailFact label="Name" value={a.applicantName} />
          <DetailFact label="Email" value={a.applicantEmail} />
          <DetailFact label="Mobile" value={a.applicantMobile} mono />
          <DetailFact
            label="Source"
            value={a.applicantSource ? SOURCE_LABEL[a.applicantSource] ?? a.applicantSource : null}
          />
          <DetailFact label="Salary expectation" value={fmtMoney(a.salaryExpectation)} mono />
          <DetailFact label="Rating" value={a.applicantRating != null ? `${a.applicantRating}/5` : null} />
        </DetailSection>

        <DetailSection title="Role" icon={<Briefcase className="h-3.5 w-3.5" />}>
          <DetailFact label="Department" value={a.department} />
          <DetailFact label="Designation" value={a.designation} />
          <DetailFact label="Employment type" value={a.employmentType} />
          <DetailFact label="Application code" value={a.applicationCode} mono />
          <DetailFact label="Status" value={STATUS_LABEL[a.status]} />
        </DetailSection>

        {a.applicantResumeUrl ? (
          <DetailSection
            title="Resume"
            icon={<FileText className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            <div className="sm:col-span-2">
              <Button asChild variant="outline" size="sm">
                <a href={a.applicantResumeUrl} target="_blank" rel="noreferrer">
                  {a.applicantResumeName || "Open resume"}
                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                </a>
              </Button>
            </div>
            <DetailFact label="Skills" value={a.resumeSkills} wide />
            <DetailFact label="Total experience" value={a.resumeTotalExperience} />
            <DetailFact label="Education" value={a.resumeEducation} wide />
            <DetailFact label="Summary" value={a.resumeSummary} wide />
            <DetailFact label="Parsed at" value={fmtDate(a.resumeParsedAt)} />
          </DetailSection>
        ) : null}

        {(a.jobOpening || a.staffingPlan) ? (
          <DetailSection
            title="Linked Records"
            icon={<Briefcase className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              {a.jobOpening ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/hr/recruitment/job-opening/${a.jobOpening.id}`}>
                    Opening: {a.jobOpening.profileName}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              ) : null}
              {a.staffingPlan ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/hr/recruitment/staffing-plan/${a.staffingPlan.id}`}>
                    Plan: {a.staffingPlan.profileName}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </DetailSection>
        ) : null}

        <DetailSection
          title="Cover Letter & Notes"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Cover letter" value={a.coverLetter} wide />
          <DetailFact label="Job description (snapshot)" value={a.jobDescription} wide />
        </DetailSection>

        <DetailSection
          title="Audit"
          icon={<User className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Application ID" value={a.id} mono />
          <DetailFact label="Captured by" value={creator} />
          <DetailFact label="Created" value={fmtDate(a.createdAt)} />
          <DetailFact label="Updated" value={fmtDate(a.updatedAt)} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
