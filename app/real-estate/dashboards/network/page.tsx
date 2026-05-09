"use client";

/**
 * Agent Network Dashboard — the brokerage's MLM cockpit.
 *
 * Mirrors the MLM admin "Network" dashboard but with real-estate terms:
 *   - Override Commissions (was "Network Bonus") = sum of OVERRIDE-role splits
 *   - Active Network Members                     = ACTIVE + COMPLIANT agents
 *   - Pending Onboarding (was "Holding Tank")    = PENDING_KYC agents
 *   - Latest Registrations                       = newest agent profiles
 *   - Recent Promotions                          = re_rank_promotions log
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGetCommissionRegisterQuery, useGetPayoutRegisterQuery } from "@/lib/api/real-estate/reports";
import { useGetAgentsQuery } from "@/lib/api/real-estate/agents";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, Network, ArrowRight, Sparkles, Banknote, Shield,
  UserPlus, Globe2, BarChart3,
} from "lucide-react";
import {
  formatCurrency, formatDate, fullName, initials,
  AGENT_STATUS_LABEL, AGENT_STATUS_VARIANT,
  AGENT_COMPLIANCE_LABEL, AGENT_COMPLIANCE_VARIANT,
} from "@/components/real-estate/constants";
import { cn } from "@/lib/utils";

type Period = "this_week" | "this_month" | "this_year" | "all_time";

function periodRange(period: Period): { from?: string; to?: string } {
  const now = new Date();
  if (period === "all_time") return {};
  if (period === "this_week") {
    const day = now.getDay() || 7;
    const monday = new Date(now.getTime() - (day - 1) * 86400000);
    monday.setHours(0, 0, 0, 0);
    return { from: monday.toISOString(), to: now.toISOString() };
  }
  if (period === "this_month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to: now.toISOString(),
    };
  }
  return {
    from: new Date(now.getFullYear(), 0, 1).toISOString(),
    to: now.toISOString(),
  };
}

const PERIOD_LABEL: Record<Period, string> = {
  this_week: "This Week",
  this_month: "This Month",
  this_year: "This Year",
  all_time: "All Time",
};

export default function NetworkDashboardPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const range = useMemo(() => periodRange(period), [period]);

  // Aggregations.
  const overrideQ = useGetCommissionRegisterQuery({ ...range });
  const payoutQ = useGetPayoutRegisterQuery({ ...range, status: "PAID" });

  // Member counts.
  const allMembersQ      = useGetAgentsQuery({ limit: 1 });
  const activeMembersQ   = useGetAgentsQuery({ status: "ACTIVE", compliance: "COMPLIANT", limit: 1 });
  const pendingMembersQ  = useGetAgentsQuery({ status: "PENDING_KYC", limit: 1 });
  const suspendedQ       = useGetAgentsQuery({ status: "SUSPENDED", limit: 1 });

  // Latest registrations (sorted by createdAt — defaults to API order).
  const latestQ = useGetAgentsQuery({ limit: 8 });

  // Distill the metric set from the commission register.
  const overrideRows = useMemo(
    () => (overrideQ.data?.rows ?? []).filter((r) => r.role === "OVERRIDE" || r.role === "RANK_BONUS"),
    [overrideQ.data],
  );
  const totalOverrides = useMemo(
    () => overrideRows.reduce((s, r) => s + r.amount, 0),
    [overrideRows],
  );
  const totalPayouts = payoutQ.data?.summary.totalPaid ?? 0;

  const isLoading = overrideQ.isLoading || allMembersQ.isLoading || latestQ.isLoading;

  // Top earners by override income — group commission rows by beneficiary.
  const topEarners = useMemo(() => {
    const m = new Map<string, { userId: string; total: number; count: number }>();
    for (const r of overrideRows) {
      if (!r.beneficiaryUserId) continue;
      const cur = m.get(r.beneficiaryUserId) ?? { userId: r.beneficiaryUserId, total: 0, count: 0 };
      cur.total += r.amount;
      cur.count++;
      m.set(r.beneficiaryUserId, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [overrideRows]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Real Estate</span>
            <span>·</span>
            <span>Dashboards</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Agent Network Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Override commissions, network growth, and recent activity for {PERIOD_LABEL[period].toLowerCase()}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="h-8 w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href="/real-estate/agents/tree">
              <Network className="h-3.5 w-3.5 mr-1" /> Hierarchy tree
            </Link>
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Override Commissions"
          icon={<Sparkles className="h-4 w-4" />}
          tint="violet"
          loading={overrideQ.isLoading}
          primary={formatCurrency(totalOverrides)}
          secondary={`${overrideRows.length} payouts`}
        />
        <KpiCard
          label="Total Payouts"
          icon={<Banknote className="h-4 w-4" />}
          tint="emerald"
          loading={payoutQ.isLoading}
          primary={formatCurrency(totalPayouts)}
          secondary={`${payoutQ.data?.summary.count ?? 0} settled withdrawals`}
        />
        <KpiCard
          label="Total Members"
          icon={<Users className="h-4 w-4" />}
          tint="blue"
          loading={isLoading}
          primary={(allMembersQ.data?.meta.total ?? 0).toLocaleString()}
          secondary="agents in network"
        />
        <KpiCard
          label="Active Network"
          icon={<Shield className="h-4 w-4" />}
          tint="emerald"
          loading={isLoading}
          primary={(activeMembersQ.data?.meta.total ?? 0).toLocaleString()}
          secondary="active + compliant"
        />
      </div>

      {/* Member breakdown + Recent activity */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Member ring */}
        <Card className="lg:col-span-1">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold">Members</h2>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link href="/real-estate/members/active">
                Manage <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
          <CardContent className="p-4">
            <MemberRing
              total={allMembersQ.data?.meta.total ?? 0}
              active={activeMembersQ.data?.meta.total ?? 0}
              pending={pendingMembersQ.data?.meta.total ?? 0}
              suspended={suspendedQ.data?.meta.total ?? 0}
              loading={isLoading}
            />
            <div className="mt-3 space-y-1.5 text-xs">
              <RingLegend tone="emerald" label="Active + compliant" value={activeMembersQ.data?.meta.total ?? 0} />
              <RingLegend tone="amber"   label="Pending KYC"        value={pendingMembersQ.data?.meta.total ?? 0} />
              <RingLegend tone="red"     label="Suspended"           value={suspendedQ.data?.meta.total ?? 0} />
            </div>
          </CardContent>
        </Card>

        {/* Latest registrations */}
        <Card className="lg:col-span-2">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Latest Registrations</h2>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link href="/real-estate/agents">
                All agents <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
          <CardContent className="p-0">
            {latestQ.isLoading ? (
              <div className="p-4 space-y-2">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : !latestQ.data?.data.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No agents yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left w-8">#</th>
                    <th className="px-3 py-2 text-left">Agent</th>
                    <th className="px-3 py-2 text-left">Sponsor</th>
                    <th className="px-3 py-2 text-left">Joined</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {latestQ.data.data.map((a, idx) => {
                    const u = a.user;
                    return (
                      <tr key={a.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <Link href={`/real-estate/agents/${a.id}`} className="flex items-center gap-2">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarImage src={u?.avatar ?? undefined} />
                              <AvatarFallback className="text-[10px]">{u ? initials(u) : "?"}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{u ? fullName(u) : "—"}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{u?.email}</div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-xs truncate">
                          {a.sponsor?.user
                            ? fullName({ first_name: a.sponsor.user.first_name, last_name: a.sponsor.user.last_name })
                            : <span className="text-muted-foreground">Direct</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                          {formatDate(a.joinedAt)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={AGENT_STATUS_VARIANT[a.status]} className="text-[10px]">
                            {AGENT_STATUS_LABEL[a.status]}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top earners */}
      <Card>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Top Earners by Override Income — {PERIOD_LABEL[period]}</h2>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link href="/real-estate/reports">
              Full leaderboard <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
        <CardContent className="p-0">
          {overrideQ.isLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : topEarners.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No override commissions paid in this period.
            </div>
          ) : (
            <ul className="divide-y">
              {topEarners.map((e, idx) => (
                <TopEarnerRow key={e.userId} rank={idx + 1} userId={e.userId} total={e.total} count={e.count} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Members map placeholder */}
      <Card>
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Members Map</h2>
        </div>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Geographic distribution of agents will appear here once an
          agent's <code>serviceAreas</code> are mapped to coordinates.
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/real-estate/agents">Browse agents by service area</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, icon, primary, secondary, loading, tint,
}: {
  label: string;
  icon: React.ReactNode;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  loading?: boolean;
  tint: "blue" | "violet" | "amber" | "emerald";
}) {
  const tintCls = {
    blue: "from-blue-500/10 text-blue-600 dark:text-blue-400",
    violet: "from-violet-500/10 text-violet-600 dark:text-violet-400",
    amber: "from-amber-500/10 text-amber-600 dark:text-amber-400",
    emerald: "from-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  }[tint];
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 relative">
        <div className={cn("absolute inset-0 bg-gradient-to-br to-transparent opacity-50 pointer-events-none", tintCls)} />
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <div className={cn("h-8 w-8 rounded-lg bg-background flex items-center justify-center shadow-sm", tintCls)}>
              {icon}
            </div>
          </div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
          {loading ? <Skeleton className="h-7 w-24 mt-1" /> : <div className="text-2xl font-bold tabular-nums mt-0.5 truncate">{primary}</div>}
          <div className="text-xs text-muted-foreground mt-0.5">{secondary}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MemberRing({
  total, active, pending, suspended, loading,
}: {
  total: number; active: number; pending: number; suspended: number; loading?: boolean;
}) {
  // Simple SVG donut — three arcs.
  const sum = Math.max(1, active + pending + suspended);
  const r = 50;
  const c = 2 * Math.PI * r;
  const segs = [
    { len: (active / sum) * c,    color: "#10b981" },
    { len: (pending / sum) * c,   color: "#f59e0b" },
    { len: (suspended / sum) * c, color: "#ef4444" },
  ];

  if (loading) {
    return <Skeleton className="h-32 w-32 rounded-full mx-auto" />;
  }

  let offset = 0;
  return (
    <div className="flex items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="14" />
        {segs.map((s, i) => {
          const dash = `${s.len} ${c - s.len}`;
          const dashOffset = -offset;
          offset += s.len;
          return (
            <circle
              key={i}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={dash}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 60 60)"
              strokeLinecap="butt"
            />
          );
        })}
        <text x="60" y="58" textAnchor="middle" className="fill-foreground" style={{ fontSize: 18, fontWeight: 700 }}>
          {total.toLocaleString()}
        </text>
        <text x="60" y="74" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
          total
        </text>
      </svg>
    </div>
  );
}

function RingLegend({ tone, label, value }: { tone: "emerald" | "amber" | "red"; label: string; value: number }) {
  const dot = { emerald: "#10b981", amber: "#f59e0b", red: "#ef4444" }[tone];
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
      <span className="flex-1 truncate">{label}</span>
      <span className="font-semibold tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

function TopEarnerRow({ rank, userId, total, count }: { rank: number; userId: string; total: number; count: number }) {
  return (
    <li className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/30">
      <span className="h-7 w-7 rounded-full bg-muted/60 flex items-center justify-center text-xs font-semibold tabular-nums shrink-0">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium font-mono truncate">{userId.slice(0, 16)}…</div>
        <div className="text-[11px] text-muted-foreground">{count} payout{count === 1 ? "" : "s"}</div>
      </div>
      <div className="text-sm font-semibold tabular-nums">{formatCurrency(total)}</div>
    </li>
  );
}
