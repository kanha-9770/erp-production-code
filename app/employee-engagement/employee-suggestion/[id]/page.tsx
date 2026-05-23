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
import { MessageSquare, User, Info, Tag } from "lucide-react";

const BACK = "/employee-engagement/employee-suggestion";

interface EmployeeSuggestion {
  id: string;
  title: string;
  suggestion: string;
  category: string;
  status: "submitted" | "under-review" | "accepted" | "rejected" | "implemented";
  submissionDate: string;
  feedback?: string;
  userId: string;
  employeeId: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  submitted: "default",
  "under-review": "secondary",
  accepted: "default",
  implemented: "default",
  rejected: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  "under-review": "Under Review",
  accepted: "Accepted",
  implemented: "Implemented",
  rejected: "Rejected",
};

const CATEGORY_LABEL: Record<string, string> = {
  general: "General",
  "hr-policy": "HR Policy",
  learning: "Learning & Development",
  facilities: "Office Facilities",
  benefits: "Employee Benefits",
  "team-building": "Team Building",
  process: "Internal Processes",
  other: "Other",
};

export default function EmployeeSuggestionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [suggestion, setSuggestion] = useState<EmployeeSuggestion | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch("/api/engagement/suggestions", {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json();
        if (json?.success && Array.isArray(json.suggestions)) {
          setSuggestion(json.suggestions.find((s: EmployeeSuggestion) => s.id === id) ?? null);
        }
      } catch {
        setSuggestion(null);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <DetailLoading />;
  if (!suggestion) return <DetailNotFound backHref={BACK} />;

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Employee Suggestions"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {suggestion.title}
          <Badge variant={STATUS_VARIANT[suggestion.status]} className="text-[10px]">
            {STATUS_LABEL[suggestion.status]}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            <Tag className="h-3 w-3 mr-1" />
            {CATEGORY_LABEL[suggestion.category] ?? suggestion.category}
          </Badge>
        </span>
      }
      subtitle={<>Submitted: {fmtDate(suggestion.submissionDate)}</>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Suggestion" icon={<MessageSquare className="h-3.5 w-3.5" />}>
          <DetailFact label="Title" value={suggestion.title} />
          <DetailFact label="Status" value={STATUS_LABEL[suggestion.status]} />
          <DetailFact label="Category" value={CATEGORY_LABEL[suggestion.category] ?? suggestion.category} />
          <DetailFact label="Submitted" value={fmtDate(suggestion.submissionDate)} />
        </DetailSection>

        <DetailSection title="Submitter" icon={<User className="h-3.5 w-3.5" />}>
          <DetailFact label="Employee ID" value={suggestion.employeeId} mono />
          <DetailFact label="User ID" value={suggestion.userId} mono />
        </DetailSection>

        <DetailSection
          title="Body"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Suggestion" value={suggestion.suggestion} wide />
          {suggestion.feedback ? (
            <DetailFact label="Feedback" value={suggestion.feedback} wide />
          ) : null}
          <DetailFact label="Record ID" value={suggestion.id} mono />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
