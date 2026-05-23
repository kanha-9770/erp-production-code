"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useGetJobOfferQuery,
  type JobOfferStatus,
} from "@/lib/api/job-offers";
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
  FileSignature,
  Info,
  Briefcase,
  ExternalLink,
  User,
} from "lucide-react";

const BACK = "/hr/recruitment/job-offer";

const STATUS_LABEL: Record<JobOfferStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
};

const STATUS_VARIANT: Record<JobOfferStatus, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  SENT: "default",
  ACCEPTED: "default",
  REJECTED: "destructive",
  WITHDRAWN: "destructive",
  EXPIRED: "outline",
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export default function JobOfferDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data, isLoading, isError } = useGetJobOfferQuery(id as string, {
    skip: !id,
  });
  const o = data?.offer;

  if (isLoading) return <DetailLoading />;
  if (isError || !o) return <DetailNotFound backHref={BACK} />;

  const creator = o.createdBy
    ? `${o.createdBy.first_name ?? ""} ${o.createdBy.last_name ?? ""}`.trim() ||
      o.createdBy.email
    : null;

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Job Offers"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
            {initialsOf(o.applicantName)}
          </span>
          {o.applicantName}
          <Badge variant={STATUS_VARIANT[o.status]} className="text-[10px]">
            {STATUS_LABEL[o.status]}
          </Badge>
        </span>
      }
      subtitle={
        <span className="inline-flex items-center gap-3 flex-wrap">
          {o.applicantEmail ? (
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {o.applicantEmail}
            </span>
          ) : null}
          {o.offerCode ? (
            <span className="font-mono">{o.offerCode}</span>
          ) : null}
        </span>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Applicant" icon={<Mail className="h-3.5 w-3.5" />}>
          <DetailFact label="Name" value={o.applicantName} />
          <DetailFact label="Email" value={o.applicantEmail} />
        </DetailSection>

        <DetailSection title="Offer" icon={<FileSignature className="h-3.5 w-3.5" />}>
          <DetailFact label="Offer code" value={o.offerCode} mono />
          <DetailFact label="Offer date" value={fmtDate(o.offerDate)} />
          <DetailFact label="Status" value={STATUS_LABEL[o.status]} />
          <DetailFact label="Term" value={o.jobOfferTerm} wide />
        </DetailSection>

        {(o.jobApplication || o.jobOpening || o.staffingPlan) ? (
          <DetailSection
            title="Linked Records"
            icon={<Briefcase className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              {o.jobApplication ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/hr/recruitment/job-application/${o.jobApplication.id}`}>
                    Application: {o.jobApplication.applicantName}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              ) : null}
              {o.jobOpening ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/hr/recruitment/job-opening/${o.jobOpening.id}`}>
                    Opening: {o.jobOpening.profileName}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              ) : null}
              {o.staffingPlan ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/hr/recruitment/staffing-plan/${o.staffingPlan.id}`}>
                    Plan: {o.staffingPlan.profileName}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </DetailSection>
        ) : null}

        <DetailSection
          title="Compensation & Terms"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Value description" value={o.valueDescription} wide />
          <DetailFact label="Terms & conditions" value={o.termsAndConditions} wide />
        </DetailSection>

        <DetailSection
          title="Audit"
          icon={<User className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Offer ID" value={o.id} mono />
          <DetailFact label="Created by" value={creator} />
          <DetailFact label="Created" value={fmtDate(o.createdAt)} />
          <DetailFact label="Updated" value={fmtDate(o.updatedAt)} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
