"use client";

/**
 * Slab Progress Card — what every agent sees about their own ladder
 * position: current slab rate, cumulative sales area, next slab gap,
 * and the full ladder so they understand what's ahead.
 *
 * Renders nothing when the org isn't on the slab engine (progress.enabled
 * is false) so legacy % orgs don't see an empty card.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Award, Target } from "lucide-react";
import { useGetMySlabQuery } from "@/lib/api/real-estate/finance";
import { formatCurrency } from "@/components/real-estate/constants";

const unitLabel = (u: string) => (u.toUpperCase() === "SQYD" ? "sq.yd" : u.toLowerCase());

function fmtArea(n: number, unit: string): string {
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${unitLabel(unit)}`;
}

export function SlabProgressCard() {
  const { data, isLoading } = useGetMySlabQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }
  const p = data?.data;
  if (!p || !p.enabled) return null;

  // Progress bar from current slab floor → next slab floor (or current ceiling).
  // Filled portion uses effective (team) area — that's what the engine reads to
  // determine the slab, so the bar matches the slab card above.
  const slabFloor = p.currentSlab?.minArea ?? 0;
  const slabCeiling =
    p.nextSlab?.minArea ??
    p.currentSlab?.maxArea ??
    (slabFloor + 1); // top open-ended slab — render as "complete"
  const span = Math.max(1, slabCeiling - slabFloor);
  const filled = Math.min(span, Math.max(0, p.teamCumulativeArea - slabFloor));
  const pct = Math.min(100, (filled / span) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          My Slab Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Headline tiles — primary number is the rolled-up total
            (personal + entire downline). For front-line agents with no
            downline this equals personal naturally, so the tile is correct
            for everyone. The "of which personal" sub-line keeps the slab
            math transparent. ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">
              {p.downlineAgentCount > 0 ? "Team area sold" : "Area sold"}
            </div>
            <div className="text-lg font-semibold">
              {fmtArea(p.teamCumulativeArea, p.areaUnit)}
            </div>
            {p.downlineAgentCount > 0 ? (
              <div className="text-xs text-muted-foreground">
                Personal {fmtArea(p.cumulativeArea, p.areaUnit)} ·{" "}
                Team {p.teamDealsCount} deal{p.teamDealsCount === 1 ? "" : "s"}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                {p.dealsCount} closed deal{p.dealsCount === 1 ? "" : "s"}
              </div>
            )}
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Current slab rate</div>
            <div className="text-lg font-semibold">
              {p.currentSlab
                ? `${formatCurrency(p.currentSlab.ratePerUnit)} / ${unitLabel(p.areaUnit)}`
                : "—"}
            </div>
            {p.currentSlab && (
              <div className="text-xs text-muted-foreground">
                {p.downlineAgentCount > 0
                  ? `Driven by team ${fmtArea(p.teamCumulativeArea, p.areaUnit)} (personal ${fmtArea(p.cumulativeArea, p.areaUnit)})`
                  : `Driven by ${fmtArea(p.cumulativeArea, p.areaUnit)} sold`}
              </div>
            )}
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">
              {p.downlineAgentCount > 0 ? "Team direct income" : "Direct income"}
            </div>
            <div className="text-lg font-semibold">
              {formatCurrency(p.teamDirectIncome)}
            </div>
            {p.downlineAgentCount > 0 ? (
              <div className="text-xs text-muted-foreground">
                Your share {formatCurrency(p.totalDirectIncome)}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">from your own sales</div>
            )}
          </div>
        </div>

        {/* ── Team detail strip (size of downline only — area/income are
            already in the headline tiles above) ───────────────────────── */}
        {p.downlineAgentCount > 0 && (
          <div className="rounded-md border border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/20 px-3 py-2 text-xs text-indigo-900 dark:text-indigo-200">
            Your team includes <strong>{p.downlineAgentCount}</strong> downline
            agent{p.downlineAgentCount === 1 ? "" : "s"}. Slab rate is driven by
            your group volume — every downline deal counts toward your next
            slab.
          </div>
        )}

        {/* ── Progress to next slab ─────────────────────────────── */}
        {p.nextSlab ? (
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" />
                Next slab: {formatCurrency(p.nextSlab.ratePerUnit)} / {unitLabel(p.areaUnit)}
              </span>
              <span className="font-medium">
                {fmtArea(p.nextSlab.areaToReach, p.areaUnit)} to go
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
              <span>{fmtArea(slabFloor, p.areaUnit)}</span>
              <span>{fmtArea(slabCeiling, p.areaUnit)}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            🏆 You're on the top slab — every deal earns the maximum rate.
          </div>
        )}

        {/* ── Designation / rank ─────────────────────────────────── */}
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Award className="h-4 w-4 text-amber-600" />
            Designation
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-base font-semibold">
                {p.currentDesignation?.name ?? "Not yet ranked"}
              </div>
              {p.currentDesignation && (
                <div className="text-xs text-muted-foreground">
                  Reward: {p.currentDesignation.rewardDescription}
                </div>
              )}
            </div>
            {p.nextDesignation && (
              <Badge variant="outline" className="text-xs">
                Next: {p.nextDesignation.name} · {fmtArea(p.nextDesignation.areaToReach, p.areaUnit)} away
              </Badge>
            )}
          </div>
        </div>

        {/* ── Full slab ladder ───────────────────────────────────── */}
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            See all {p.ladder.length} slabs
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-1.5 pr-3">#</th>
                  <th className="text-left py-1.5 pr-3">Min area</th>
                  <th className="text-left py-1.5 pr-3">Max area</th>
                  <th className="text-right py-1.5 pr-3">Rate / {unitLabel(p.areaUnit)}</th>
                  <th className="text-center py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {p.ladder.map((row) => (
                  <tr
                    key={row.sortOrder}
                    className={
                      "border-b last:border-0 " +
                      (row.isCurrent ? "bg-blue-50" : row.isCleared ? "" : "text-muted-foreground")
                    }
                  >
                    <td className="py-1.5 pr-3">{row.sortOrder + 1}</td>
                    <td className="py-1.5 pr-3">{fmtArea(row.minArea, p.areaUnit)}</td>
                    <td className="py-1.5 pr-3">{row.maxArea ? fmtArea(row.maxArea, p.areaUnit) : "& above"}</td>
                    <td className="py-1.5 pr-3 text-right">{formatCurrency(row.ratePerUnit)}</td>
                    <td className="py-1.5 text-center">
                      {row.isCurrent ? (
                        <Badge>You're here</Badge>
                      ) : row.isCleared ? (
                        <span className="text-xs text-emerald-600">Cleared</span>
                      ) : (
                        <span className="text-xs">Locked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
