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
import { AlertTriangle, User, Info, Tag } from "lucide-react";

const BACK = "/employee-engagement/problem-registration";

interface ProblemRegistration {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  registrationDate: string;
  status: "open" | "in-review" | "resolved" | "closed";
  proposedSolution: string;
  userId: string;
  employeeId: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "default",
  "in-review": "secondary",
  resolved: "default",
  closed: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  "in-review": "In Review",
  resolved: "Resolved",
  closed: "Closed",
};

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};

const SEVERITY_LABEL: Record<string, string> = {
  low: "Low Impact",
  medium: "Medium Impact",
  high: "High Impact",
  critical: "Critical",
};

const CATEGORY_LABEL: Record<string, string> = {
  operational: "Operational",
  technical: "Technical",
  process: "Process",
  safety: "Safety",
  quality: "Quality",
  people: "People / HR",
  facility: "Facility",
};

export default function ProblemRegistrationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<ProblemRegistration | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch("/api/engagement/problems", {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json();
        if (json?.success && Array.isArray(json.problems)) {
          setProblem(json.problems.find((p: ProblemRegistration) => p.id === id) ?? null);
        }
      } catch {
        setProblem(null);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <DetailLoading />;
  if (!problem) return <DetailNotFound backHref={BACK} />;

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Problem Registration"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {problem.title}
          <Badge variant={STATUS_VARIANT[problem.status]} className="text-[10px]">
            {STATUS_LABEL[problem.status]}
          </Badge>
          <Badge variant={SEVERITY_VARIANT[problem.severity]} className="text-[10px]">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {SEVERITY_LABEL[problem.severity]}
          </Badge>
        </span>
      }
      subtitle={
        <>
          <Tag className="h-3 w-3 inline mr-1" />
          {CATEGORY_LABEL[problem.category] ?? problem.category} · {fmtDate(problem.registrationDate)}
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Problem" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
          <DetailFact label="Title" value={problem.title} />
          <DetailFact label="Severity" value={SEVERITY_LABEL[problem.severity]} />
          <DetailFact label="Category" value={CATEGORY_LABEL[problem.category] ?? problem.category} />
          <DetailFact label="Status" value={STATUS_LABEL[problem.status]} />
          <DetailFact label="Registered" value={fmtDate(problem.registrationDate)} />
        </DetailSection>

        <DetailSection title="Submitter" icon={<User className="h-3.5 w-3.5" />}>
          <DetailFact label="Employee ID" value={problem.employeeId} mono />
          <DetailFact label="User ID" value={problem.userId} mono />
        </DetailSection>

        <DetailSection
          title="Description"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Description" value={problem.description} wide />
          <DetailFact label="Proposed solution" value={problem.proposedSolution} wide />
          <DetailFact label="Record ID" value={problem.id} mono />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
