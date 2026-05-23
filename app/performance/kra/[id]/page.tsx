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
import { Target, User, BarChart3, Info } from "lucide-react";

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
            {kra.status}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {kra.period} {kra.year}
          </Badge>
        </span>
      }
      subtitle={kra.objective}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailSection title="Employee" icon={<User className="h-3.5 w-3.5" />}>
          <DetailFact label="Name" value={kra.employee} />
          <DetailFact label="Employee ID" value={kra.employeeId} mono />
          <DetailFact label="Department" value={kra.department} />
          <DetailFact label="Engagement team" value={kra.employeeEngagementTeamName} />
        </DetailSection>

        <DetailSection title="Objective" icon={<Target className="h-3.5 w-3.5" />}>
          <DetailFact label="Period" value={`${kra.period} ${kra.year}`} />
          <DetailFact label="Weight" value={`${kra.weight}%`} />
          <DetailFact label="Status" value={kra.status} />
          <DetailFact label="Progress" value={`${kra.progress}%`} />
        </DetailSection>

        <DetailSection
          title="Goal & Result"
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Objective" value={kra.objective} wide />
          <DetailFact label="Target" value={kra.target} wide />
          <DetailFact label="Actual" value={kra.actual} wide />
        </DetailSection>

        <DetailSection
          title="Notes"
          icon={<Info className="h-3.5 w-3.5" />}
          className="lg:col-span-2"
        >
          <DetailFact label="Notes" value={kra.notes} wide />
          <DetailFact label="Record ID" value={kra.id} mono />
        </DetailSection>
      </div>
    </DetailShell>
  );
}
