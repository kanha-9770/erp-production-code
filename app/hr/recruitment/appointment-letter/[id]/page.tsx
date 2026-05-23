"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGetAppointmentLetterQuery } from "@/lib/api/appointment-letters";
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
  ScrollText,
  CheckCircle2,
  Info,
  Building2,
  ExternalLink,
} from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  SIGNED: "Signed",
  REVOKED: "Revoked",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  ISSUED: "default",
  SIGNED: "default",
  REVOKED: "destructive",
};

const BACK = "/hr/recruitment/appointment-letter";

export default function AppointmentLetterDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data, isLoading, isError } = useGetAppointmentLetterQuery(id as string, {
    skip: !id,
  });
  const l = data?.letter;

  if (isLoading) return <DetailLoading />;
  if (isError || !l) return <DetailNotFound backHref={BACK} />;

  const creator = l.createdBy
    ? `${l.createdBy.first_name ?? ""} ${l.createdBy.last_name ?? ""}`.trim() ||
      l.createdBy.email
    : "—";

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Appointment Letters"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {l.applicantName}
          <Badge variant={STATUS_VARIANT[l.status]} className="text-[10px]">
            {STATUS_LABEL[l.status]}
          </Badge>
          {l.signed ? (
            <Badge
              variant="outline"
              className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Signed
            </Badge>
          ) : null}
        </span>
      }
      subtitle={
        <>
          {l.title || "Appointment letter"}
          {l.letterCode ? <> · {l.letterCode}</> : null}
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Applicant" icon={<Mail className="h-3.5 w-3.5" />}>
          <DetailFact label="Name" value={l.applicantName} />
          <DetailFact label="Email" value={l.applicantEmail} />
          <DetailFact label="Company" value={l.company} />
        </DetailSection>

        <DetailSection title="Letter" icon={<ScrollText className="h-3.5 w-3.5" />}>
          <DetailFact label="Title" value={l.title} />
          <DetailFact label="Template" value={l.templateName} />
          <DetailFact label="Appointment date" value={fmtDate(l.appointmentDate)} />
          <DetailFact label="Signed date" value={fmtDate(l.signedDate)} />
        </DetailSection>

        {(l.jobOffer || l.jobApplication) ? (
          <DetailSection
            title="Linked records"
            icon={<Building2 className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            {l.jobOffer ? (
              <div className="sm:col-span-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/hr/recruitment/job-offer/${l.jobOffer.id}`}>
                    Offer: {l.jobOffer.offerCode ?? l.jobOffer.id}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            ) : null}
            {l.jobApplication ? (
              <div className="sm:col-span-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/hr/recruitment/job-application/${l.jobApplication.id}`}>
                    Application: {l.jobApplication.applicantName}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            ) : null}
          </DetailSection>
        ) : null}

        <DetailSection
          title="Body"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Introduction" value={l.introduction} wide />
          <DetailFact label="Description" value={l.description} wide />
          <DetailFact label="Closing notes" value={l.closingNotes} wide />
        </DetailSection>

        <DetailSection title="Audit" icon={<Info className="h-3.5 w-3.5" />} className="lg:col-span-2">
          <DetailFact label="Created by" value={creator} />
          <DetailFact label="Letter ID" value={l.id} mono />
          <DetailFact label="Created" value={fmtDate(l.createdAt)} />
          <DetailFact label="Updated" value={fmtDate(l.updatedAt)} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
