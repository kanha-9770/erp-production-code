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
import { Star, User, MessageSquare, Info, UserCheck } from "lucide-react";

const STORAGE_KEY = "performance-appraisal:v1";
const BACK = "/performance/appraisal";

interface Appraisal {
  id: string;
  employee: string;
  employeeId?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  department?: string;
  employeeEngagementTeamName?: string;
  reviewer: string;
  reviewerId?: string;
  cycle: string;
  year: number;
  rating: number;
  strengths: string;
  improvements: string;
  comments: string;
  status: string;
  submittedAt: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  IN_REVIEW: "outline",
  COMPLETED: "default",
  ACKNOWLEDGED: "default",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            rating >= i
              ? "fill-amber-400 text-amber-400"
              : rating >= i - 0.5
                ? "fill-amber-400/50 text-amber-400"
                : "text-muted-foreground/30"
          }`}
        />
      ))}
      <span className="ml-1.5 text-sm font-medium">{rating.toFixed(1)}</span>
    </div>
  );
}

export default function AppraisalDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [appraisal, setAppraisal] = useState<Appraisal | null>(null);

  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const items: Appraisal[] = raw ? JSON.parse(raw) : [];
      setAppraisal(items.find((a) => a.id === id) ?? null);
    } catch {
      setAppraisal(null);
    }
    setLoading(false);
  }, [id]);

  if (loading) return <DetailLoading />;
  if (!appraisal) return <DetailNotFound backHref={BACK} />;

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Appraisals"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {appraisal.employee}
          <Badge variant={STATUS_VARIANT[appraisal.status]} className="text-[10px]">
            {appraisal.status}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {appraisal.cycle} {appraisal.year}
          </Badge>
        </span>
      }
      subtitle={<>Reviewed by {appraisal.reviewer}</>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Employee" icon={<User className="h-3.5 w-3.5" />}>
          <DetailFact label="Name" value={appraisal.employee} />
          <DetailFact label="Employee ID" value={appraisal.employeeId} mono />
          <DetailFact label="Department" value={appraisal.department} />
          <DetailFact label="Engagement team" value={appraisal.employeeEngagementTeamName} />
        </DetailSection>

        <DetailSection title="Review" icon={<UserCheck className="h-3.5 w-3.5" />}>
          <DetailFact label="Reviewer" value={appraisal.reviewer} />
          <DetailFact label="Cycle" value={`${appraisal.cycle} ${appraisal.year}`} />
          <DetailFact label="Rating" value={<StarRating rating={appraisal.rating} />} />
          <DetailFact label="Submitted" value={fmtDate(appraisal.submittedAt)} />
        </DetailSection>

        <DetailSection
          title="Feedback"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Strengths" value={appraisal.strengths} wide />
          <DetailFact label="Areas to improve" value={appraisal.improvements} wide />
          <DetailFact label="Comments" value={appraisal.comments} wide />
        </DetailSection>

        <DetailSection title="System" icon={<Info className="h-3.5 w-3.5" />} className="lg:col-span-2">
          <DetailFact label="Record ID" value={appraisal.id} mono />
          <DetailFact label="Status" value={appraisal.status} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
