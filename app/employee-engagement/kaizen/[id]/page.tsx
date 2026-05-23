"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Kaizen" icon={<TrendingUp className="h-3.5 w-3.5" />}>
          <DetailFact label="Title" value={kaizen.title} />
          <DetailFact label="Status" value={statusMeta.label} />
          <DetailFact label="Votes" value={kaizen.votes} />
          <DetailFact label="Submission date" value={fmtDate(kaizen.submissionDate)} />
        </DetailSection>

        <DetailSection title="Submitter" icon={<User className="h-3.5 w-3.5" />}>
          <DetailFact label="Employee ID" value={kaizen.employeeId} mono />
          <DetailFact label="User ID" value={kaizen.userId} mono />
        </DetailSection>

        <DetailSection
          title="Description"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Description" value={kaizen.description} wide />
        </DetailSection>

        <DetailSection
          title="Current State"
          icon={<Layout className="h-3.5 w-3.5" />}
          className="border-l-4 border-l-amber-500"
        >
          <DetailFact label="Current state" value={kaizen.currentState} wide />
        </DetailSection>

        <DetailSection
          title="Proposed State"
          icon={<Lightbulb className="h-3.5 w-3.5" />}
          className="border-l-4 border-l-blue-500"
        >
          <DetailFact label="Proposed state" value={kaizen.proposedState} wide />
        </DetailSection>

        {hasAnyMedia ? (
          <DetailSection
            title="Submitted Media"
            icon={<Paperclip className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
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
        ) : null}

        <DetailSection
          title="Benefits"
          icon={<Zap className="h-3.5 w-3.5" />}
          className="lg:col-span-2 border-l-4 border-l-emerald-500"
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

        {standardLabels.length > 0 ? (
          <DetailSection
            title="Standards Updated"
            icon={<FileText className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
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
        ) : null}

        <DetailSection
          title="Record"
          icon={<FileText className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Kaizen ID" value={kaizen.id} mono />
          <DetailFact label="Submission date" value={fmtDate(kaizen.submissionDate)} />
          <DetailFact label="Has voted" value={kaizen.hasVoted ? "Yes" : "No"} />
          <DetailFact label="Total votes" value={kaizen.votes} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
