"use client";

/**
 * Agent Slab History Card — admin/manager view of one agent's full
 * slab journey: current position, every deal, every slab upgrade, every
 * designation unlock, and every override earned from their downline.
 *
 * Used on /real-estate/agents/[id] (the agent profile page). The endpoint
 * is scope-gated on the server — a non-privileged caller can only fetch
 * themselves or descendants, and gets a 404 otherwise.
 */

import { useGetAgentSlabHistoryQuery } from "@/lib/api/real-estate/agents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  Award,
  ArrowUpRight,
  ListOrdered,
  GitBranch,
} from "lucide-react";
import {
  formatCurrency,
  formatDateTime,
} from "@/components/real-estate/constants";
import Link from "next/link";

const unitLabel = (u: string) => (u.toUpperCase() === "SQYD" ? "sq.yd" : u.toLowerCase());

function fmtArea(n: number, unit: string): string {
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${unitLabel(unit)}`;
}

export function AgentSlabHistoryCard({ agentId }: { agentId: string }) {
  const { data, isLoading, error } = useGetAgentSlabHistoryQuery(agentId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-64 w-full" /></CardContent>
      </Card>
    );
  }
  if (error || !data?.data) return null;
  const h = data.data;
  const p = h.progress;
  if (!p.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            Slab history
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground py-4">
          The slab engine isn't active for this org yet. Activate a comp plan
          from{" "}
          <Link
            href="/real-estate/admin/plan-designer"
            className="underline underline-offset-2"
          >
            Plan Designer
          </Link>{" "}
          to see slab progress here.
        </CardContent>
      </Card>
    );
  }

  // Top summary tiles — same shape as the MyWallet card but for this agent.
  const slabFloor = p.currentSlab?.minArea ?? 0;
  const slabCeiling =
    p.nextSlab?.minArea ??
    p.currentSlab?.maxArea ??
    (slabFloor + 1);
  const span = Math.max(1, slabCeiling - slabFloor);
  const filled = Math.min(span, Math.max(0, p.cumulativeArea - slabFloor));
  const pct = Math.min(100, (filled / span) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          Slab history
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Headline tiles — primary number is the rolled-up team total
            (personal + entire downline). For agents with no downline this
            equals personal, so the tile is correct for everyone. Slab rate
            is annotated with the personal cumulative so admins can see at a
            glance which number drove the rate. ────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">
              {p.downlineAgentCount > 0 ? "Team area sold" : "Area sold"}
            </div>
            <div className="text-base font-semibold">
              {fmtArea(p.teamCumulativeArea, p.areaUnit)}
            </div>
            {p.downlineAgentCount > 0 ? (
              <div className="text-[11px] text-muted-foreground">
                Personal {fmtArea(p.cumulativeArea, p.areaUnit)} ·{" "}
                {p.teamDealsCount} team deal{p.teamDealsCount === 1 ? "" : "s"}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                {p.dealsCount} deal{p.dealsCount === 1 ? "" : "s"}
              </div>
            )}
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Current rate</div>
            <div className="text-base font-semibold">
              {p.currentSlab
                ? `${formatCurrency(p.currentSlab.ratePerUnit)} / ${unitLabel(p.areaUnit)}`
                : "—"}
            </div>
            {p.currentSlab && (
              <div className="text-[11px] text-muted-foreground">
                Slab {p.currentSlab.sortOrder + 1} · driven by personal{" "}
                {fmtArea(p.cumulativeArea, p.areaUnit)}
              </div>
            )}
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">
              {p.downlineAgentCount > 0 ? "Team direct income" : "Direct income"}
            </div>
            <div className="text-base font-semibold">
              {formatCurrency(p.teamDirectIncome)}
            </div>
            {p.downlineAgentCount > 0 ? (
              <div className="text-[11px] text-muted-foreground">
                Personal share {formatCurrency(p.totalDirectIncome)}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                {p.dealsCount} deal{p.dealsCount === 1 ? "" : "s"}
              </div>
            )}
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Override earnings</div>
            <div className="text-base font-semibold">
              {formatCurrency(h.overrides.totalAmount)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              from downline ({h.overrides.rows.length})
            </div>
          </div>
        </div>

        {/* ── Team detail strip — explains the rollup model. Hidden for
            agents who have no downline (where team === personal). ─────── */}
        {p.downlineAgentCount > 0 && (
          <div className="rounded-md border border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/20 px-3 py-2 text-xs text-indigo-900 dark:text-indigo-200">
            Team includes <strong>{p.downlineAgentCount}</strong> downline
            agent{p.downlineAgentCount === 1 ? "" : "s"}. Cumulative area
            shown above rolls up every descendant; the slab rate stays tied
            to this agent's personal sales so differential overrides remain
            fair.
          </div>
        )}

        {/* ── Progress to next slab ────────────────────────────── */}
        {p.nextSlab ? (
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">
                Next slab: {formatCurrency(p.nextSlab.ratePerUnit)} /{" "}
                {unitLabel(p.areaUnit)}
              </span>
              <span className="font-medium">
                {fmtArea(p.nextSlab.areaToReach, p.areaUnit)} to go
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
              <span>{fmtArea(slabFloor, p.areaUnit)}</span>
              <span>{fmtArea(slabCeiling, p.areaUnit)}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-900">
            🏆 On the top slab — every deal earns the maximum rate.
          </div>
        )}

        {/* ── Slab upgrade timeline ────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
            Slab upgrades ({h.slabUpgrades.length})
          </div>
          {h.slabUpgrades.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">
              Still on the starting slab — no upgrades yet.
            </div>
          ) : (
            <ol className="relative border-l ml-2 pl-4 space-y-3">
              {h.slabUpgrades.map((u) => (
                <li key={u.triggeredByLedgerId}>
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-emerald-500" />
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(u.at)}
                  </div>
                  <div className="text-sm">
                    Slab <strong>{u.fromSlab.sortOrder + 1}</strong>{" "}
                    ({formatCurrency(u.fromSlab.ratePerUnit)}/{unitLabel(p.areaUnit)})
                    {" → "}
                    <strong>{u.toSlab.sortOrder + 1}</strong>{" "}
                    ({formatCurrency(u.toSlab.ratePerUnit)}/{unitLabel(p.areaUnit)})
                  </div>
                  <Link
                    href={`/real-estate/transactions/${u.triggeredByTransactionId}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    triggering deal →
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ── Designation unlocks ──────────────────────────────── */}
        {h.designationUnlocks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Award className="h-4 w-4 text-amber-600" />
              Designations unlocked ({h.designationUnlocks.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {h.designationUnlocks.map((d) => (
                <Badge key={d.code} variant="outline" className="gap-1 py-1">
                  <Award className="h-3 w-3 text-amber-600" />
                  <span className="font-medium">{d.name}</span>
                  <span className="text-muted-foreground">
                    · {fmtArea(d.minCumulativeArea, p.areaUnit)}
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* ── Deals table ──────────────────────────────────────── */}
        <details open={h.deals.length <= 5}>
          <summary className="cursor-pointer text-sm font-medium flex items-center gap-2 hover:text-foreground/80">
            <ListOrdered className="h-4 w-4" />
            Deals ({h.deals.length})
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-1.5 pr-3">#</th>
                  <th className="text-left py-1.5 pr-3">Date</th>
                  <th className="text-left py-1.5 pr-3">Property</th>
                  <th className="text-right py-1.5 pr-3">Area</th>
                  <th className="text-right py-1.5 pr-3">Rate</th>
                  <th className="text-right py-1.5 pr-3">Direct earn</th>
                  <th className="text-right py-1.5">Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {h.deals.map((d, i) => (
                  <tr key={d.ledgerId} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {d.closedAt ? formatDateTime(d.closedAt) : "—"}
                    </td>
                    <td className="py-1.5 pr-3 max-w-[280px] truncate">
                      <Link
                        href={`/real-estate/transactions/${d.transactionId}`}
                        className="hover:underline"
                      >
                        {d.propertyTitle ?? d.transactionCode ?? d.transactionId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {fmtArea(d.dealArea, p.areaUnit)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {formatCurrency(d.rateApplied)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-medium">
                      {formatCurrency(d.directIncome)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {fmtArea(d.cumulativeArea, p.areaUnit)}
                    </td>
                  </tr>
                ))}
                {h.deals.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-3 text-center text-muted-foreground"
                    >
                      No closed deals yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>

        {/* ── Override earnings from downline ──────────────────── */}
        <details>
          <summary className="cursor-pointer text-sm font-medium flex items-center gap-2 hover:text-foreground/80">
            <GitBranch className="h-4 w-4" />
            Override earnings ({h.overrides.rows.length}) ·{" "}
            {formatCurrency(h.overrides.totalAmount)}
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-1.5 pr-3">Date</th>
                  <th className="text-left py-1.5 pr-3">Closed by</th>
                  <th className="text-left py-1.5 pr-3">Property</th>
                  <th className="text-center py-1.5 pr-3">Level</th>
                  <th className="text-right py-1.5 pr-3">Amount</th>
                  <th className="text-center py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {h.overrides.rows.map((r) => (
                  <tr key={r.splitId} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {r.closedAt ? formatDateTime(r.closedAt) : "—"}
                    </td>
                    <td className="py-1.5 pr-3">{r.fromAgentName ?? "—"}</td>
                    <td className="py-1.5 pr-3 max-w-[240px] truncate">
                      <Link
                        href={`/real-estate/transactions/${r.transactionId}`}
                        className="hover:underline"
                      >
                        {r.propertyTitle ?? r.transactionCode ?? r.transactionId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-center">
                      L{r.level ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-medium">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="py-1.5 text-center">
                      <Badge
                        variant={r.status === "RELEASED" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {h.overrides.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-3 text-center text-muted-foreground"
                    >
                      No override earnings yet — downline hasn't closed any sales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
