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
} from "@/components/workspace/detail-shell";
import {
  Target,
  User,
  BarChart3,
  Flag,
  Zap,
  Info,
  Briefcase,
  Percent,
} from "lucide-react";

const STORAGE_KEY = "performance-kra:v1";
const BACK = "/performance/kra";

interface Kra {
  id: string;
  employee: string;
  employeeId?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  department?: string;
  employeeEngagementTeamName?: string;
  objective: string;
  weight: number;
  target: string;
  actual: string;
  progress: number;
  period: string;
  year: number;
  status: string;
  notes: string;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ACHIEVED: "Achieved",
  AT_RISK: "At Risk",
  MISSED: "Missed",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  ACTIVE: "default",
  ACHIEVED: "default",
  AT_RISK: "outline",
  MISSED: "destructive",
};

export default function KraDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [kra, setKra] = useState<Kra | null>(null);

  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const items: Kra[] = raw ? JSON.parse(raw) : [];
      setKra(items.find((k) => k.id === id) ?? null);
    } catch {
      setKra(null);
    }
    setLoading(false);
  }, [id]);

  if (loading) return <DetailLoading />;
  if (!kra) return <DetailNotFound backHref={BACK} />;

  return (
    <DetailShell
      backHref={BACK}
      backLabel="Back to KRA"
      title={
        <span className="flex items-center gap-3 flex-wrap">
          {kra.employee}
          <Badge variant={STATUS_VARIANT[kra.status]} className="text-[10px]">
            {STATUS_LABEL[kra.status] ?? kra.status}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {kra.period} {kra.year}
          </Badge>
        </span>
      }
      subtitle={
        <span className="inline-flex items-center gap-1.5">
          <Percent className="h-3 w-3" />
          Weight: {kra.weight}% of total performance
        </span>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Employee" icon={<User className="h-3.5 w-3.5" />}>
          <DetailFact label="Name" value={kra.employee} />
          <DetailFact label="Employee ID" value={kra.employeeId} mono />
          <DetailFact label="First name" value={kra.firstName} />
          <DetailFact label="Middle name" value={kra.middleName} />
          <DetailFact label="Last name" value={kra.lastName} />
          <DetailFact label="Department" value={kra.department} />
          <DetailFact label="Engagement team" value={kra.employeeEngagementTeamName} wide />
        </DetailSection>

        <DetailSection title="Objective" icon={<Target className="h-3.5 w-3.5" />}>
          <DetailFact label="Period" value={kra.period} />
          <DetailFact label="Year" value={kra.year} />
          <DetailFact label="Weight" value={`${kra.weight}%`} />
          <DetailFact label="Status" value={STATUS_LABEL[kra.status] ?? kra.status} />
          <DetailFact label="Progress" value={`${kra.progress}%`} />
        </DetailSection>

        <DetailSection
          title="Goal & Result"
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Objective" value={kra.objective} wide />
          <DetailFact
            label="Target outcome"
            value={
              kra.target ? (
                <span className="inline-flex items-center gap-1.5">
                  <Flag className="h-3.5 w-3.5 text-blue-600" />
                  {kra.target}
                </span>
              ) : null
            }
          />
          <DetailFact
            label="Actual achievement"
            value={
              kra.actual ? (
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-emerald-600" />
                  {kra.actual}
                </span>
              ) : null
            }
          />
          <div className="sm:col-span-2">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Live progress
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.max(0, Math.min(100, kra.progress))}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{kra.progress}% complete</div>
          </div>
        </DetailSection>

        <DetailSection
          title="Notes"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Additional notes & context" value={kra.notes} wide />
        </DetailSection>

        <DetailSection
          title="Record"
          icon={<Briefcase className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="KRA ID" value={kra.id} mono />
          <DetailFact label="Cycle" value={`${kra.period} ${kra.year}`} />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
