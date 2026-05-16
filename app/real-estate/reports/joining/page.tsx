"use client";

/**
 * Joining Report — agents who joined the brokerage in a given date range.
 * MLM-template equivalent: "Joining Report".
 *
 * Built without a new server endpoint: we pull the full agent list and
 * filter by `joinedAt` client-side. Cap the source at 1000 (FR-2.4
 * envelope) which matches every other admin tool.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGetAgentsQuery } from "@/lib/api/real-estate/agents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  UserPlus, ArrowLeft, Calendar, BarChart3, Sparkles,
} from "lucide-react";
import {
  AGENT_STATUS_LABEL, AGENT_STATUS_VARIANT,
  fullName, initials, formatDate,
} from "@/components/real-estate/constants";

type Period = "this_week" | "this_month" | "last_month" | "this_year" | "all_time" | "custom";

const PERIOD_LABEL: Record<Period, string> = {
  this_week: "This Week",
  this_month: "This Month",
  last_month: "Last Month",
  this_year: "This Year",
  all_time: "All Time",
  custom: "Custom",
};

function periodRange(period: Period, custom: { from: string; to: string }): { from: Date; to: Date } | null {
  const now = new Date();
  if (period === "all_time") return null;
  if (period === "this_week") {
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day - 1));
    monday.setHours(0, 0, 0, 0);
    return { from: monday, to: now };
  }
  if (period === "this_month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  }
  if (period === "last_month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
    };
  }
  if (period === "this_year") {
    return { from: new Date(now.getFullYear(), 0, 1), to: now };
  }
  // custom
  if (!custom.from && !custom.to) return null;
  return {
    from: custom.from ? new Date(custom.from) : new Date(0),
    to: custom.to ? new Date(custom.to + "T23:59:59") : new Date(),
  };
}

export default function JoiningReportPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { data, isLoading } = useGetAgentsQuery({ limit: 1000 });
  const agents = data?.data ?? [];

  // Memoize range — periodRange() calls `new Date()` so without this every
  // render produces a new object that busts the inRange useMemo below.
  const range = useMemo(
    () => periodRange(period, { from: customFrom, to: customTo }),
    [period, customFrom, customTo],
  );

  const inRange = useMemo(() => {
    if (!range) return agents.slice().sort((a, b) => +new Date(b.joinedAt) - +new Date(a.joinedAt));
    return agents
      .filter((a) => {
        const d = new Date(a.joinedAt);
        return d >= range.from && d <= range.to;
      })
      .sort((a, b) => +new Date(b.joinedAt) - +new Date(a.joinedAt));
  }, [agents, range]);

  // Bucket by month for the summary chart.
  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of inRange) {
      const d = new Date(a.joinedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [inRange]);

  // Bucket by sponsor for the breakdown.
  const bySponsor = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const a of inRange) {
      const sponsorName = a.sponsor?.user
        ? fullName({ first_name: a.sponsor.user.first_name, last_name: a.sponsor.user.last_name })
        : "Direct (no sponsor)";
      const key = a.sponsorId ?? "direct";
      const cur = m.get(key) ?? { name: sponsorName, count: 0 };
      cur.count++;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [inRange]);

  const total = inRange.length;
  const maxMonth = byMonth.reduce((m, [, c]) => Math.max(m, c), 0);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/real-estate/reports" className="hover:underline">Reports</Link>
            <span>·</span>
            <span>Joining Report</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-primary" />
            Joining Report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agents who joined the brokerage in this window. Useful for
            recruiting performance and onboarding-cohort analysis.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="h-8 w-32 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {period === "custom" && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 w-36 text-sm" />
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 w-36 text-sm" />
            </>
          )}
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href="/real-estate/reports">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Reports
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Total joined</div>
            <div className="text-3xl font-bold tabular-nums mt-1">{total.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">{PERIOD_LABEL[period]}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Active recruiters</div>
            <div className="text-3xl font-bold tabular-nums mt-1">{bySponsor.length}</div>
            <div className="text-xs text-muted-foreground mt-1">distinct sponsors who brought someone in</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Months covered</div>
            <div className="text-3xl font-bold tabular-nums mt-1">{byMonth.length}</div>
            <div className="text-xs text-muted-foreground mt-1">non-empty months in range</div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly trend bars */}
      <Card>
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Joined per month</h2>
        </div>
        <CardContent className="p-4">
          {byMonth.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No agents joined in this window.
            </div>
          ) : (
            <div className="space-y-1.5">
              {byMonth.map(([month, count]) => (
                <div key={month} className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground w-20 shrink-0">{month}</span>
                  <div className="flex-1 h-5 bg-muted/40 rounded relative overflow-hidden">
                    <div
                      className="h-full bg-primary/60"
                      style={{ width: `${(count / maxMonth) * 100}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-[11px] font-semibold tabular-nums">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sponsor breakdown */}
      <Card>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Top sponsors</h2>
          </div>
        </div>
        <CardContent className="p-0">
          {bySponsor.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No data.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left w-10">#</th>
                  <th className="px-3 py-2 text-left">Sponsor</th>
                  <th className="px-3 py-2 text-right">New recruits</th>
                </tr>
              </thead>
              <tbody>
                {bySponsor.map((s, i) => (
                  <tr key={s.name + i} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium truncate">{s.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Detail rows */}
      <Card>
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Recent joiners</h2>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : inRange.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No agents joined in this window.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left w-10">No</th>
                  <th className="px-3 py-2 text-left">Agent</th>
                  <th className="px-3 py-2 text-left">Sponsor</th>
                  <th className="px-3 py-2 text-left">Joined</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {inRange.slice(0, 100).map((a, idx) => {
                  const u = a.user;
                  return (
                    <tr key={a.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/real-estate/agents/${a.id}`} className="flex items-center gap-2 hover:underline">
                          <Avatar className="h-7 w-7">
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
          {inRange.length > 100 && (
            <div className="p-3 text-center text-xs text-muted-foreground border-t">
              Showing first 100 of {inRange.length}. Narrow the date range to see more.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
