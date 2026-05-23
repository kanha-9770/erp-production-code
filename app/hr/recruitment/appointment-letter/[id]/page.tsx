"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useGetAppointmentLetterQuery,
  type AppointmentLetterStatus,
} from "@/lib/api/appointment-letters";
import {
  viewLetterDocument,
  printLetterDocument,
} from "@/lib/appointment-letter/letter-html";
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
  ExternalLink,
  Download,
  Printer,
  User,
  Briefcase,
} from "lucide-react";

const BACK = "/hr/recruitment/appointment-letter";

const STATUS_LABEL: Record<AppointmentLetterStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  SIGNED: "Signed",
  REVOKED: "Revoked",
};

const STATUS_VARIANT: Record<AppointmentLetterStatus, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  ISSUED: "default",
  SIGNED: "default",
  REVOKED: "destructive",
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

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
    : null;

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Appointment Letters"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => viewLetterDocument(l)}>
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            View Letter
          </Button>
          <Button size="sm" onClick={() => printLetterDocument(l)}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download PDF
          </Button>
        </>
      }
      title={
        <span className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
            {initialsOf(l.applicantName)}
          </span>
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
          {l.letterCode ? <> · <span className="font-mono">{l.letterCode}</span></> : null}
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
          <DetailFact label="Letter code" value={l.letterCode} mono />
          <DetailFact label="Template" value={l.templateName} />
          <DetailFact label="Appointment date" value={fmtDate(l.appointmentDate)} />
          <DetailFact label="Status" value={STATUS_LABEL[l.status]} />
          <DetailFact label="Signed date" value={fmtDate(l.signedDate)} />
        </DetailSection>

        {(l.jobOffer || l.jobApplication) ? (
          <DetailSection
            title="Linked Records"
            icon={<Briefcase className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              {l.jobOffer ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/hr/recruitment/job-offer/${l.jobOffer.id}`}>
                    Offer: {l.jobOffer.offerCode ?? l.jobOffer.id.slice(0, 8)}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              ) : null}
              {l.jobApplication ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/hr/recruitment/job-application/${l.jobApplication.id}`}>
                    Application: {l.jobApplication.applicantName}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              ) : null}
            </div>
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

        <DetailSection
          title="Audit"
          icon={<User className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Letter ID" value={l.id} mono />
          <DetailFact label="Created by" value={creator} />
          <DetailFact label="Created" value={fmtDate(l.createdAt)} />
          <DetailFact label="Updated" value={fmtDate(l.updatedAt)} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
