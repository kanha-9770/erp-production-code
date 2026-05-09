"use client";

/**
 * Top Earners — full-page leaderboard. Same data as the Reports hub's
 * Leaderboard tab; this page exposes the date range as URL state and
 * gives the table room to breathe.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGetLeaderboardQuery } from "@/lib/api/real-estate/reports";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Trophy, Medal } from "lucide-react";
import { formatCurrency, fullName, initials } from "@/components/real-estate/constants";

type Period = "this_month" | "this_quarter" | "this_year" | "all_time" | "custom";
const PERIOD_LABEL: Record<Period, string> = {
  this_month: "This Month",
  this_quarter: "This Quarter",
  this_year: "This Year",
  all_time: "All Time",
  custom: "Custom",
};

function quarterStart(d: Date) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
}

function periodRange(period: Period, custom: { from: string; to: string }) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  if (period === "all_time") return {};
  if (period === "this_month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  if (period === "this_quarter") return { from: iso(quarterStart(now)), to: iso(now) };
  if (period === "this_year") return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
  return {
    from: custom.from ? iso(new Date(custom.from)) : undefined,
    to: custom.to ? iso(new Date(custom.to + "T23:59:59")) : undefined,
  };
}

const MEDAL_COLORS = ["text-yellow-500", "text-slate-400", "text-amber-700"];

export default function TopEarnersPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [topN, setTopN] = useState<number>(20);

  const range = useMemo(() => periodRange(period, { from: customFrom, to: customTo }), [period, customFrom, customTo]);
  const { data, isLoading } = useGetLeaderboardQuery({ ...range, topN });
  const rows = data?.rows ?? [];

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href="/real-estate/reports" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">Real Estate · Reports</div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              Top Earners
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Highest-grossing agents in the period. Ranked by commission earned.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(topN)} onValueChange={(v) => setTopN(Number(v))}>
            <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">Top 10</SelectItem>
              <SelectItem value="20">Top 20</SelectItem>
              <SelectItem value="50">Top 50</SelectItem>
              <SelectItem value="100">Top 100</SelectItem>
            </SelectContent>
          </Select>
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
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Trophy className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No earnings in this period.
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((r, idx) => {
                const medalCls = MEDAL_COLORS[idx];
                return (
                  <li key={r.user.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30">
                    <div className="w-8 flex items-center justify-center shrink-0">
                      {medalCls ? (
                        <Medal className={`h-5 w-5 ${medalCls}`} />
                      ) : (
                        <span className="text-sm font-semibold tabular-nums text-muted-foreground">{idx + 1}</span>
                      )}
                    </div>
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={r.user.avatar ?? undefined} />
                      <AvatarFallback className="text-xs">{initials(r.user as any)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{fullName(r.user as any)}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{r.user.email}</div>
                    </div>
                    <div className="hidden sm:flex items-center gap-4 text-sm tabular-nums text-muted-foreground shrink-0">
                      <span>{r.sales} {r.sales === 1 ? "sale" : "sales"}</span>
                      <span>·</span>
                      <span>{formatCurrency(r.revenue)} revenue</span>
                    </div>
                    <div className="text-base font-bold tabular-nums shrink-0 text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(r.commission)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
