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
import { TrendingUp, User, Info, Lightbulb, ThumbsUp } from "lucide-react";
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
}

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
          <DetailFact label="Record ID" value={kaizen.id} mono />
        </DetailSection>

        <DetailSection
          title="Problem & Analysis"
          icon={<Lightbulb className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Description" value={kaizen.description} wide />
          <DetailFact label="Current state" value={kaizen.currentState} wide />
          <DetailFact label="Proposed state" value={kaizen.proposedState} wide />
        </DetailSection>

        {(beforeMedia || afterMedia) ? (
          <DetailSection
            title="Before / After"
            icon={<Info className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            {beforeMedia ? (
              <div className="sm:col-span-1">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Before
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={beforeMedia}
                  alt="Before"
                  className="rounded-md border w-full max-h-72 object-cover"
                />
              </div>
            ) : null}
            {afterMedia ? (
              <div className="sm:col-span-1">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  After
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={afterMedia}
                  alt="After"
                  className="rounded-md border w-full max-h-72 object-cover"
                />
              </div>
            ) : null}
          </DetailSection>
        ) : null}

        <DetailSection
          title="Benefits & Standards"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact
            label="Benefits"
            value={benefitLabels.length ? benefitLabels.join(", ") : null}
            wide
          />
          <DetailFact
            label="Standards updated"
            value={standardLabels.length ? standardLabels.join(", ") : null}
            wide
          />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
