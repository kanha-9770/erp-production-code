"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  FileText,
  Layers,
  ShieldCheck,
  Users,
} from "lucide-react";
import type {
  CompPlan,
  CompPlanDesignation,
  CompPlanGuarantee,
  CompPlanOverrideLevel,
  CompPlanSlab,
} from "@/lib/api/real-estate/plans";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-IN");
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const REWARD_LABEL: Record<CompPlanDesignation["rewardType"], string> = {
  TRAVEL: "Travel",
  CASH: "Cash",
  SURPRISE: "Surprise",
  NONE: "—",
};

export function PlanPreviewDocument({ plan }: { plan: CompPlan }) {
  return (
    <article className="bg-white text-slate-900 shadow-sm rounded-2xl p-8 print:shadow-none print:rounded-none print:p-0 space-y-8">
      <HeaderBlock plan={plan} />
      <MetadataBlock plan={plan} />
      <SlabsBlock slabs={plan.slabs} areaUnit={plan.areaUnit} />
      <OverridesBlock
        levels={plan.overrideLevels}
        overrideMode={plan.overrideMode}
      />
      <DesignationsBlock
        designations={plan.designations}
        areaUnit={plan.areaUnit}
      />
      <GuaranteesBlock guarantees={plan.guarantees} />
      <FooterBlock plan={plan} />
    </article>
  );
}

export function PlanPreviewPrintStyles() {
  return (
    <style jsx global>{`
      @media print {
        @page {
          size: A4;
          margin: 14mm 14mm 16mm 14mm;
        }
        html,
        body {
          background: white !important;
        }
        .print\\:break-before {
          break-before: page;
        }
        .print\\:break-inside-avoid {
          break-inside: avoid;
        }
        .preview-section {
          break-inside: avoid;
        }
        .preview-table thead {
          display: table-header-group;
        }
      }
    `}</style>
  );
}

function HeaderBlock({ plan }: { plan: CompPlan }) {
  const statusColor =
    plan.status === "ACTIVE"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : plan.status === "DRAFT"
        ? "bg-amber-100 text-amber-800 border-amber-300"
        : "bg-slate-100 text-slate-700 border-slate-300";

  return (
    <header className="preview-section border-b pb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
            <FileText className="h-3.5 w-3.5" />
            Compensation Plan
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">{plan.name}</h1>
          {plan.description && (
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">
              {plan.description}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Badge className={`text-xs border ${statusColor}`}>
            {plan.status}
          </Badge>
          <span className="text-xs text-slate-500 tabular-nums">
            v{plan.version}
          </span>
        </div>
      </div>
    </header>
  );
}

function MetadataBlock({ plan }: { plan: CompPlan }) {
  const items: Array<{ label: string; value: string }> = [
    { label: "Area Unit", value: plan.areaUnit },
    { label: "Override Mode", value: plan.overrideMode },
    { label: "Slab Scope", value: plan.slabCounterScope },
    {
      label: "Compression",
      value: plan.compressionEnabled ? "Enabled" : "Disabled",
    },
    {
      label: "Company Residual",
      value: `${num(plan.companyResidualPercent)}%`,
    },
    { label: "Activated", value: fmtDate(plan.activatedAt) },
    { label: "Created", value: fmtDate(plan.createdAt) },
    { label: "Last updated", value: fmtDate(plan.updatedAt) },
  ];

  return (
    <section className="preview-section">
      <SectionTitle icon={<FileText className="h-4 w-4" />}>
        Plan Metadata
      </SectionTitle>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        {items.map((it) => (
          <div key={it.label}>
            <dt className="text-[11px] uppercase tracking-wider text-slate-500">
              {it.label}
            </dt>
            <dd className="font-medium mt-0.5">{it.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SlabsBlock({
  slabs,
  areaUnit,
}: {
  slabs: CompPlanSlab[];
  areaUnit: string;
}) {
  const sorted = useMemo(
    () =>
      [...slabs].sort(
        (a, b) =>
          num(a.sortOrder) - num(b.sortOrder) ||
          num(a.minArea) - num(b.minArea),
      ),
    [slabs],
  );

  return (
    <section className="preview-section">
      <SectionTitle icon={<Layers className="h-4 w-4" />}>
        Slabs ({sorted.length})
      </SectionTitle>
      {sorted.length === 0 ? (
        <EmptyRow text="No slabs defined." />
      ) : (
        <table className="preview-table w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-2 pr-3 font-medium w-12">#</th>
              <th className="py-2 pr-3 font-medium">Min area ({areaUnit})</th>
              <th className="py-2 pr-3 font-medium">Max area ({areaUnit})</th>
              <th className="py-2 pr-3 font-medium text-right">
                Rate / {areaUnit}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="py-2 pr-3 tabular-nums text-slate-500">
                  {i + 1}
                </td>
                <td className="py-2 pr-3 tabular-nums">
                  {fmtInt(num(s.minArea))}
                </td>
                <td className="py-2 pr-3 tabular-nums">
                  {s.maxArea == null ? "∞" : fmtInt(num(s.maxArea))}
                </td>
                <td className="py-2 pr-3 tabular-nums text-right font-medium">
                  ₹{fmtMoney(num(s.ratePerUnit))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function OverridesBlock({
  levels,
  overrideMode,
}: {
  levels: CompPlanOverrideLevel[];
  overrideMode: string;
}) {
  const sorted = useMemo(
    () => [...levels].sort((a, b) => num(a.level) - num(b.level)),
    [levels],
  );

  const totalFactor = useMemo(
    () => sorted.reduce((acc, r) => acc + num(r.factor), 0),
    [sorted],
  );

  const maxFactor = Math.max(...sorted.map((r) => num(r.factor)), 0.01);

  return (
    <section className="preview-section">
      <SectionTitle icon={<Activity className="h-4 w-4" />}>
        Override Levels ({sorted.length})
        <span className="ml-auto text-xs font-normal text-slate-500">
          Mode: <span className="font-medium">{overrideMode}</span> · Total
          factor:{" "}
          <span className="font-medium tabular-nums">
            {totalFactor.toFixed(2)}
          </span>
        </span>
      </SectionTitle>
      {sorted.length === 0 ? (
        <EmptyRow text="No override levels defined." />
      ) : (
        <>
          <div className="mb-3 flex h-16 items-end gap-1.5 rounded-md border bg-slate-50 p-2 print:bg-white">
            {sorted.map((r) => {
              const f = num(r.factor);
              const h = Math.max(4, (f / maxFactor) * 100);
              return (
                <div
                  key={r.id}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div
                    className="w-full rounded-sm bg-gradient-to-t from-indigo-600 to-sky-400"
                    style={{ height: `${h}%` }}
                  />
                </div>
              );
            })}
          </div>

          <table className="preview-table w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
                <th className="py-2 pr-3 font-medium w-16">Level</th>
                <th className="py-2 pr-3 font-medium">Factor</th>
                <th className="py-2 pr-3 font-medium">Percent</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const f = num(r.factor);
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">L{r.level}</td>
                    <td className="py-2 pr-3 tabular-nums">{f.toFixed(3)}</td>
                    <td className="py-2 pr-3 tabular-nums text-slate-600">
                      {(f * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function DesignationsBlock({
  designations,
  areaUnit,
}: {
  designations: CompPlanDesignation[];
  areaUnit: string;
}) {
  const sorted = useMemo(
    () =>
      [...designations].sort(
        (a, b) =>
          num(a.sortOrder) - num(b.sortOrder) ||
          num(a.minCumulativeArea) - num(b.minCumulativeArea),
      ),
    [designations],
  );

  return (
    <section className="preview-section print:break-before">
      <SectionTitle icon={<Users className="h-4 w-4" />}>
        Designations ({sorted.length})
      </SectionTitle>
      {sorted.length === 0 ? (
        <EmptyRow text="No designations defined." />
      ) : (
        <table className="preview-table w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-2 pr-3 font-medium w-12">#</th>
              <th className="py-2 pr-3 font-medium">Code</th>
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">
                Min cumulative ({areaUnit})
              </th>
              <th className="py-2 pr-3 font-medium">Reward</th>
              <th className="py-2 pr-3 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d, i) => (
              <tr key={d.id} className="border-b last:border-0 align-top">
                <td className="py-2 pr-3 tabular-nums text-slate-500">
                  {i + 1}
                </td>
                <td className="py-2 pr-3 font-mono text-xs">
                  {d.designationCode}
                </td>
                <td className="py-2 pr-3 font-medium">{d.designationName}</td>
                <td className="py-2 pr-3 tabular-nums">
                  {fmtInt(num(d.minCumulativeArea))}
                </td>
                <td className="py-2 pr-3">
                  <span className="text-xs">{REWARD_LABEL[d.rewardType]}</span>
                  {d.rewardDescription && (
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {d.rewardDescription}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3 tabular-nums text-right">
                  {d.rewardCashAmount != null
                    ? `₹${fmtMoney(num(d.rewardCashAmount))}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function GuaranteesBlock({
  guarantees,
}: {
  guarantees: CompPlanGuarantee[];
}) {
  return (
    <section className="preview-section">
      <SectionTitle icon={<ShieldCheck className="h-4 w-4" />}>
        Monthly Guarantees ({guarantees.length})
      </SectionTitle>
      {guarantees.length === 0 ? (
        <EmptyRow text="No guarantees defined." />
      ) : (
        <table className="preview-table w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-2 pr-3 font-medium">Designation</th>
              <th className="py-2 pr-3 font-medium">Currency</th>
              <th className="py-2 pr-3 font-medium text-right">
                Monthly amount
              </th>
            </tr>
          </thead>
          <tbody>
            {guarantees.map((g) => (
              <tr key={g.id} className="border-b last:border-0">
                <td className="py-2 pr-3 font-mono text-xs">
                  {g.designationCode}
                </td>
                <td className="py-2 pr-3 tabular-nums">{g.currency}</td>
                <td className="py-2 pr-3 tabular-nums text-right font-medium">
                  {g.currency === "INR" ? "₹" : ""}
                  {fmtMoney(num(g.monthlyAmount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FooterBlock({ plan }: { plan: CompPlan }) {
  return (
    <footer className="preview-section border-t pt-4 text-[11px] text-slate-500 flex items-center justify-between flex-wrap gap-2">
      <span>
        Plan ID: <span className="font-mono">{plan.id}</span>
      </span>
      <span>Generated {fmtDate(new Date().toISOString())}</span>
    </footer>
  );
}

function SectionTitle({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold mb-3 border-b pb-1.5">
      <span className="text-slate-500">{icon}</span>
      {children}
    </h2>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 italic border border-dashed rounded-md px-3 py-2">
      <AlertTriangle className="h-3.5 w-3.5" />
      {text}
    </div>
  );
}
