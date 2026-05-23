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
import { Target, User, Info, Zap } from "lucide-react";

const BACK = "/employee-engagement/self-target";

interface SelfTarget {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  status: "not-started" | "in-progress" | "completed";
  progress: number;
  createdAt: string;
  userId: string;
  employeeId: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  "not-started": "secondary",
  "in-progress": "default",
  completed: "default",
};

const STATUS_LABEL: Record<string, string> = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  completed: "Completed",
};

export default function SelfTargetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<SelfTarget | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch("/api/engagement/targets", {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json();
        if (json?.success && Array.isArray(json.targets)) {
          setTarget(json.targets.find((t: SelfTarget) => t.id === id) ?? null);
        }
      } catch {
        setTarget(null);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <DetailLoading />;
  if (!target) return <DetailNotFound backHref={BACK} />;

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to Self Targets"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {target.title}
          <Badge variant={STATUS_VARIANT[target.status]} className="text-[10px]">
            {STATUS_LABEL[target.status]}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            <Zap className="h-3 w-3 mr-1" />
            {target.progress}%
          </Badge>
        </span>
      }
      subtitle={<>Target date: {fmtDate(target.targetDate)}</>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Target" icon={<Target className="h-3.5 w-3.5" />}>
          <DetailFact label="Title" value={target.title} />
          <DetailFact label="Status" value={STATUS_LABEL[target.status]} />
          <DetailFact label="Target date" value={fmtDate(target.targetDate)} />
          <DetailFact label="Progress" value={`${target.progress}%`} />
        </DetailSection>

        <DetailSection title="Submitter" icon={<User className="h-3.5 w-3.5" />}>
          <DetailFact label="Employee ID" value={target.employeeId} mono />
          <DetailFact label="User ID" value={target.userId} mono />
          <DetailFact label="Created" value={fmtDate(target.createdAt)} />
        </DetailSection>

        <DetailSection
          title="Description"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Description" value={target.description} wide />
          <DetailFact label="Record ID" value={target.id} mono />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
