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
  User,
  UserCheck,
  Award,
  Star,
  StarHalf,
  TrendingDown,
  MessageSquare,
  Calendar,
  Briefcase,
} from "lucide-react";

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

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  IN_REVIEW: "In Review",
  COMPLETED: "Completed",
  ACKNOWLEDGED: "Acknowledged",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  IN_REVIEW: "outline",
  COMPLETED: "default",
  ACKNOWLEDGED: "default",
};

function StarRating({ rating }: { rating: number }) {
  const stars: React.ReactNode[] = [];
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) {
      stars.push(<Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />);
    } else if (rating >= i - 0.5) {
      stars.push(<StarHalf key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />);
    } else {
      stars.push(<Star key={i} className="h-3.5 w-3.5 text-muted-foreground/30" />);
    }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="flex items-center gap-0.5">{stars}</span>
      <span className="text-xs font-medium ml-1">{rating.toFixed(1)} / 5</span>
    </span>
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
            {STATUS_LABEL[appraisal.status] ?? appraisal.status}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {appraisal.cycle} {appraisal.year}
          </Badge>
        </span>
      }
      subtitle={
        <span className="inline-flex items-center gap-1.5">
          <UserCheck className="h-3 w-3" />
          Reviewed by {appraisal.reviewer}
        </span>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Employee" icon={<User className="h-3.5 w-3.5" />}>
          <DetailFact label="Name" value={appraisal.employee} />
          <DetailFact label="Employee ID" value={appraisal.employeeId} mono />
          <DetailFact label="First name" value={appraisal.firstName} />
          <DetailFact label="Middle name" value={appraisal.middleName} />
          <DetailFact label="Last name" value={appraisal.lastName} />
          <DetailFact label="Department" value={appraisal.department} />
          <DetailFact label="Engagement team" value={appraisal.employeeEngagementTeamName} wide />
        </DetailSection>

        <DetailSection title="Review" icon={<UserCheck className="h-3.5 w-3.5" />}>
          <DetailFact label="Reviewer" value={appraisal.reviewer} />
          <DetailFact label="Reviewer ID" value={appraisal.reviewerId} mono />
          <DetailFact label="Cycle" value={appraisal.cycle} />
          <DetailFact label="Year" value={appraisal.year} />
          <DetailFact label="Status" value={STATUS_LABEL[appraisal.status] ?? appraisal.status} />
          <DetailFact label="Submitted" value={fmtDate(appraisal.submittedAt)} />
        </DetailSection>

        <DetailSection
          title="Overall Score"
          icon={<Award className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Rating" value={<StarRating rating={appraisal.rating} />} wide />
        </DetailSection>

        <DetailSection
          title="Strengths"
          icon={<Award className="h-3.5 w-3.5" />}
          className="lg:col-span-2 border-l-4 border-l-emerald-500"
        >
          <DetailFact
            label="Top strengths"
            value={appraisal.strengths || "No detailed observation recorded for this category."}
            wide
          />
        </DetailSection>

        <DetailSection
          title="Growth Areas"
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          className="lg:col-span-2 border-l-4 border-l-amber-500"
        >
          <DetailFact
            label="Areas to improve"
            value={appraisal.improvements || "No detailed observation recorded for this category."}
            wide
          />
        </DetailSection>

        <DetailSection
          title="Executive Summary"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          className="lg:col-span-2 border-l-4 border-l-blue-500"
        >
          <DetailFact
            label="Comments"
            value={appraisal.comments || "No detailed observation recorded for this category."}
            wide
          />
        </DetailSection>

        <DetailSection
          title="Record"
          icon={<Briefcase className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Appraisal ID" value={appraisal.id} mono />
          <DetailFact label="Submitted on" value={fmtDate(appraisal.submittedAt)} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
