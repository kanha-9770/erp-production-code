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
import { Lightbulb, User, Info, Tag, Calendar, CheckCircle2 } from "lucide-react";

const BACK = "/employee-engagement/self-initiative";

interface SelfInitiative {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: string;
  category: string;
  createdAt: string;
  userId: string;
  employeeId: string;
}

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  "in-progress": "In Progress",
  completed: "Completed",
  "on-hold": "On Hold",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  planning: "secondary",
  "in-progress": "default",
  completed: "default",
  "on-hold": "outline",
};

const CATEGORY_LABEL: Record<string, string> = {
  learning: "Skill Learning",
  mentoring: "Mentoring Others",
  "process-improvement": "Process Improvement",
  "team-building": "Team Building",
  innovation: "Product Innovation",
  other: "Other",
};

export default function SelfInitiativeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [initiative, setInitiative] = useState<SelfInitiative | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch("/api/engagement/initiatives", {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json();
        if (json?.success && Array.isArray(json.initiatives)) {
          setInitiative(json.initiatives.find((i: SelfInitiative) => i.id === id) ?? null);
        }
      } catch {
        setInitiative(null);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <DetailLoading />;
  if (!initiative) return <DetailNotFound backHref={BACK} />;

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Self Initiatives"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {initiative.title}
          <Badge variant={STATUS_VARIANT[initiative.status]} className="text-[10px]">
            {STATUS_LABEL[initiative.status] ?? initiative.status}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            <Tag className="h-3 w-3 mr-1" />
            {CATEGORY_LABEL[initiative.category] ?? initiative.category}
          </Badge>
        </span>
      }
      subtitle={
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3 w-3" />
          {fmtDate(initiative.startDate)} → {fmtDate(initiative.endDate)}
        </span>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Initiative" icon={<Lightbulb className="h-3.5 w-3.5" />}>
          <DetailFact label="Title" value={initiative.title} />
          <DetailFact
            label="Status"
            value={STATUS_LABEL[initiative.status] ?? initiative.status}
          />
          <DetailFact
            label="Category"
            value={CATEGORY_LABEL[initiative.category] ?? initiative.category}
          />
          <DetailFact label="Start date" value={fmtDate(initiative.startDate)} />
          <DetailFact label="End date" value={fmtDate(initiative.endDate)} />
        </DetailSection>

        <DetailSection title="Submitter" icon={<User className="h-3.5 w-3.5" />}>
          <DetailFact label="Employee ID" value={initiative.employeeId} mono />
          <DetailFact label="User ID" value={initiative.userId} mono />
          <DetailFact label="Created" value={fmtDate(initiative.createdAt)} />
        </DetailSection>

        <DetailSection
          title="Description"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Description" value={initiative.description} wide />
        </DetailSection>

        <DetailSection
          title="Record"
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Initiative ID" value={initiative.id} mono />
          <DetailFact label="Created" value={fmtDate(initiative.createdAt)} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
