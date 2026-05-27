"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DetailShell,
  DetailLoading,
  DetailNotFound,
  DetailSection,
  DetailFact,
  fmtDate,
} from "@/components/workspace/detail-shell";
import {
  TrendingUp,
  User,
  Info,
  Lightbulb,
  Layout,
  ThumbsUp,
  Zap,
  FileText,
  Paperclip,
  Printer,
  Pencil,
  Camera,
  Award,
} from "lucide-react";
import {
  BENEFIT_OPTIONS,
  STANDARD_UPDATED_OPTIONS,
  decodeBenefits,
  getStatusMeta,
} from "@/lib/constants/engagement";

const BACK = "/employee-engagement/kaizen";

interface Kaizen {
  id: string;
  title: string;
  description: string;
  currentState: string;
  proposedState: string;
  benefits: string;
  status: string;
  submissionDate: string;
  votes: number;
  hasVoted: boolean;
  employeeId: string;
  beforeMedia?: string | null;
  afterMedia?: string | null;
  referenceImage?: string | null;
  userId?: string;
  // Submitter identity (from the form).
  firstName?: string;
  middleName?: string;
  lastName?: string;
  department?: string;
  employeeEngagementTeamName?: string;
  kaizenArea?: string;
  // Result + approval payload.
  employeeContributor?: string;
  signature?: string | null;
  selfie?: string | null;
  employeeEngagementPoints?: number;
}

const isImg = (s: string | null | undefined): s is string =>
  !!s &&
  (s.startsWith("data:image/") ||
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("/"));

export default function KaizenDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [kaizen, setKaizen] = useState<Kaizen | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch("/api/engagement/kaizens", {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json();
        if (json?.success && Array.isArray(json.kaizens)) {
          setKaizen(json.kaizens.find((k: Kaizen) => k.id === id) ?? null);
        }
      } catch {
        setKaizen(null);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <DetailLoading />;
  if (!kaizen) return <DetailNotFound backHref={BACK} />;

  const decoded = decodeBenefits(kaizen.benefits);
  const benefitLabels = decoded.checked
    .map((v: string) => BENEFIT_OPTIONS.find((o) => o.value === v)?.label)
    .filter(Boolean) as string[];
  const standardLabels = decoded.standards
    .map((v: string) => STANDARD_UPDATED_OPTIONS.find((o) => o.value === v)?.label)
    .filter(Boolean) as string[];
  const statusMeta = getStatusMeta(kaizen.status);

  const beforeMedia = kaizen.beforeMedia ?? kaizen.referenceImage ?? null;
  const afterMedia = kaizen.afterMedia ?? null;
  const hasAnyMedia = !!(beforeMedia || afterMedia);

  const fullName = [kaizen.firstName, kaizen.middleName, kaizen.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const hasSignature = isImg(kaizen.signature);
  const hasSelfie = isImg(kaizen.selfie);

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Kaizen"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {kaizen.title}
          <Badge variant="outline" className={`text-[10px] uppercase ${statusMeta.className}`}>
            {statusMeta.label}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            <ThumbsUp className="h-3 w-3 mr-1" />
            {kaizen.votes} votes
          </Badge>
        </span>
      }
      subtitle={<>Submitted: {fmtDate(kaizen.submissionDate)}</>}
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.print()}
          className="h-8 print:hidden"
        >
          <Printer className="h-3.5 w-3.5 mr-1.5" />
          Download / Print
        </Button>
      }
    >
      {/* Print-only stylesheet — hide nav chrome and force the detail
          card grid to a single column so it fits on A4 without wrapping
          weirdly. The browser's "Save as PDF" picks this up automatically. */}
      <style jsx global>{`
        @media print {
          body { background: #fff !important; }
          .print\\:hidden { display: none !important; }
          /* Stretch sections to full width so two-column blocks don't
             squeeze on the printed page. */
          .print\\:col-span-2 { grid-column: span 2 / span 2 !important; }
          /* Avoid breaking a section across two pages where possible. */
          [data-detail-section] { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:grid-cols-2">
        <div data-detail-section className="contents">
          <DetailSection title="Kaizen" icon={<TrendingUp className="h-3.5 w-3.5" />}>
            <DetailFact label="Title" value={kaizen.title} />
            <DetailFact label="Status" value={statusMeta.label} />
            <DetailFact label="Area" value={kaizen.kaizenArea || "—"} />
            <DetailFact label="Votes" value={kaizen.votes} />
            <DetailFact label="Submission date" value={fmtDate(kaizen.submissionDate)} />
            <DetailFact
              label="Engagement points"
              value={
                kaizen.employeeEngagementPoints && kaizen.employeeEngagementPoints > 0
                  ? kaizen.employeeEngagementPoints
                  : "—"
              }
            />
          </DetailSection>
        </div>

        <div data-detail-section className="contents">
          <DetailSection title="Submitter" icon={<User className="h-3.5 w-3.5" />}>
            <DetailFact label="Employee ID" value={kaizen.employeeId} mono />
            <DetailFact label="Name" value={fullName || "—"} />
            <DetailFact label="Department" value={kaizen.department || "—"} />
            <DetailFact
              label="Engagement team"
              value={kaizen.employeeEngagementTeamName || "—"}
            />
            <DetailFact label="User ID" value={kaizen.userId} mono />
          </DetailSection>
        </div>

        <div data-detail-section className="contents">
          <DetailSection
            title="Description"
            icon={<Info className="h-3.5 w-3.5" />}
            className="lg:col-span-2 print:col-span-2"
          >
            <DetailFact label="Description" value={kaizen.description} wide />
          </DetailSection>
        </div>

        <div data-detail-section className="contents">
          <DetailSection
            title="Current State"
            icon={<Layout className="h-3.5 w-3.5" />}
            className="border-l-4 border-l-amber-500"
          >
            <DetailFact label="Current state" value={kaizen.currentState} wide />
          </DetailSection>
        </div>

        <div data-detail-section className="contents">
          <DetailSection
            title="Proposed State"
            icon={<Lightbulb className="h-3.5 w-3.5" />}
            className="border-l-4 border-l-blue-500"
          >
            <DetailFact label="Proposed state" value={kaizen.proposedState} wide />
          </DetailSection>
        </div>

        {hasAnyMedia ? (
          <div data-detail-section className="contents">
            <DetailSection
              title="Submitted Media"
              icon={<Paperclip className="h-3.5 w-3.5" />}
              className="lg:col-span-2 print:col-span-2"
            >
              <div className="sm:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { label: "Before", value: beforeMedia },
                  { label: "After", value: afterMedia },
                ].map((m) => (
                  <div key={m.label} className="rounded-md border bg-muted/30 p-2 space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {m.label}
                    </div>
                    {!m.value ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-1 py-3">
                        <Paperclip className="h-3.5 w-3.5" /> Not provided
                      </div>
                    ) : isImg(m.value) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.value}
                        alt={`${m.label} for ${kaizen.title}`}
                        className="max-h-[320px] w-full rounded border bg-white object-contain"
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-sm">
                        <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="font-mono text-xs truncate" title={m.value}>
                          {m.value}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </DetailSection>
          </div>
        ) : null}

        <div data-detail-section className="contents">
          <DetailSection
            title="Benefits"
            icon={<Zap className="h-3.5 w-3.5" />}
            className="lg:col-span-2 print:col-span-2 border-l-4 border-l-emerald-500"
          >
            <div className="sm:col-span-2 space-y-2">
              {benefitLabels.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {benefitLabels.map((b) => (
                    <Badge key={b} variant="outline" className="text-[10px]">
                      {b}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {decoded.freeText ? (
                <p className="text-sm whitespace-pre-wrap">{decoded.freeText}</p>
              ) : null}
              {benefitLabels.length === 0 && !decoded.freeText ? (
                <p className="text-sm text-muted-foreground italic">No benefits recorded.</p>
              ) : null}
            </div>
          </DetailSection>
        </div>

        {standardLabels.length > 0 ? (
          <div data-detail-section className="contents">
            <DetailSection
              title="Standards Updated"
              icon={<FileText className="h-3.5 w-3.5" />}
              className="lg:col-span-2 print:col-span-2"
            >
              <div className="sm:col-span-2">
                <div className="flex flex-wrap gap-1.5">
                  {standardLabels.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px]">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </DetailSection>
          </div>
        ) : null}

        {/* Employee contributor + awarded engagement points. */}
        <div data-detail-section className="contents">
          <DetailSection
            title="Result &amp; Recognition"
            icon={<Award className="h-3.5 w-3.5" />}
            className="lg:col-span-2 print:col-span-2"
          >
            <DetailFact
              label="Employee contributor"
              value={kaizen.employeeContributor || "—"}
              wide
            />
            <DetailFact
              label="Engagement points awarded"
              value={
                kaizen.employeeEngagementPoints && kaizen.employeeEngagementPoints > 0
                  ? kaizen.employeeEngagementPoints
                  : "—"
              }
            />
          </DetailSection>
        </div>

        {/* Signature + selfie panel — only renders when at least one of
            the two is present so we don't show empty boxes on submissions
            from before this field was added. */}
        {(hasSignature || hasSelfie) && (
          <div data-detail-section className="contents">
            <DetailSection
              title="Signature &amp; Selfie"
              icon={<Pencil className="h-3.5 w-3.5" />}
              className="lg:col-span-2 print:col-span-2"
            >
              <div className="sm:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-md border bg-muted/30 p-2 space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Pencil className="h-3 w-3" /> Signature
                  </div>
                  {hasSignature ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={kaizen.signature!}
                      alt="Signature"
                      className="max-h-40 w-full rounded border bg-white object-contain"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No signature provided.
                    </p>
                  )}
                </div>
                <div className="rounded-md border bg-muted/30 p-2 space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Camera className="h-3 w-3" /> Selfie
                  </div>
                  {hasSelfie ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={kaizen.selfie!}
                      alt="Selfie"
                      className="max-h-40 w-full rounded border bg-white object-contain"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No selfie provided.
                    </p>
                  )}
                </div>
              </div>
            </DetailSection>
          </div>
        )}

        <div data-detail-section className="contents">
          <DetailSection
            title="Record"
            icon={<FileText className="h-3.5 w-3.5" />}
            className="lg:col-span-2 print:col-span-2"
          >
            <DetailFact label="Kaizen ID" value={kaizen.id} mono />
            <DetailFact label="Submission date" value={fmtDate(kaizen.submissionDate)} />
            <DetailFact label="Has voted" value={kaizen.hasVoted ? "Yes" : "No"} />
            <DetailFact label="Total votes" value={kaizen.votes} />
          </DetailSection>
        </div>
      </div>
    </DetailShell>
  );
}
