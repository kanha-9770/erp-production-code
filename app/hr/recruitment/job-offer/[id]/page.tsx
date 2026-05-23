"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGetJobOfferQuery } from "@/lib/api/job-offers";
import {
  DetailShell,
  DetailLoading,
  DetailNotFound,
  DetailSection,
  DetailFact,
  fmtDate,
} from "@/components/workspace/detail-shell";
import { Mail, FileSignature, Info, Briefcase, ExternalLink } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  SENT: "default",
  ACCEPTED: "default",
  REJECTED: "destructive",
  WITHDRAWN: "outline",
  EXPIRED: "outline",
};

const BACK = "/hr/recruitment/job-offer";

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
    : "—";

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Job Offers"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {o.applicantName}
          <Badge variant={STATUS_VARIANT[o.status]} className="text-[10px]">
            {STATUS_LABEL[o.status]}
          </Badge>
        </span>
      }
      subtitle={
        <>
          {o.applicantEmail || "—"}
          {o.offerCode ? <> · {o.offerCode}</> : null}
        </>
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
          <DetailFact label="Offer term" value={o.jobOfferTerm} wide />
        </DetailSection>

        {(o.jobApplication || o.jobOpening || o.staffingPlan) ? (
          <DetailSection
            title="Linked records"
            icon={<Briefcase className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            {o.jobApplication ? (
              <div className="sm:col-span-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/hr/recruitment/job-application/${o.jobApplication.id}`}>
                    Application: {o.jobApplication.applicantName}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            ) : null}
            {o.jobOpening ? (
              <div className="sm:col-span-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/hr/recruitment/job-opening/${o.jobOpening.id}`}>
                    Opening: {o.jobOpening.profileName}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            ) : null}
            {o.staffingPlan ? (
              <div className="sm:col-span-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/hr/recruitment/staffing-plan/${o.staffingPlan.id}`}>
                    Plan: {o.staffingPlan.profileName}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            ) : null}
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

        <DetailSection title="Audit" icon={<Info className="h-3.5 w-3.5" />} className="lg:col-span-2">
          <DetailFact label="Created by" value={creator} />
          <DetailFact label="Offer ID" value={o.id} mono />
          <DetailFact label="Created" value={fmtDate(o.createdAt)} />
          <DetailFact label="Updated" value={fmtDate(o.updatedAt)} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
