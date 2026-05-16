"use client";

/**
 * Member Income Report — gross / net commission earned per agent in a date
 * range. Equivalent to the MLM-template "Member Income" report.
 *
 * Sourced from the existing commission register: we fetch all commission
 * splits in the window, then group by `beneficiaryUserId`. Gross = sum of
 * all credits, Reversed = sum of REVERSED amounts, Net = gross − reversed.
 *
 * Status filter pre-set to "RELEASED" so admins see actual paid-out income
 * by default; switch to "ALL" to include on-hold splits.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGetCommissionRegisterQuery } from "@/lib/api/real-estate/reports";
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
  Coins, ArrowLeft, BarChart3, ChevronDown,
} from "lucide-react";
import {
  formatCurrency, COMMISSION_ROLE_LABEL, COMMISSION_STATUS_LABEL,
  fullName, initials,
} from "@/components/real-estate/constants";
import { cn } from "@/lib/utils";

type Period = "this_week" | "this_month" | "last_month" | "this_year" | "all_time" | "custom";

const PERIOD_LABEL: Record<Period, string> = {
  this_week: "This Week",
  this_month: "This Month",
  last_month: "Last Month",
  this_year: "This Year",
  all_time: "All Time",
  custom: "Custom",
};

function periodRange(period: Period, custom: { from: string; to: string }): { from?: string; to?: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();

  if (period === "all_time") return {};
  if (period === "this_week") {
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day - 1));
    monday.setHours(0, 0, 0, 0);
    return { from: iso(monday), to: iso(now) };
  }
  if (period === "this_month") {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  }
  if (period === "last_month") {
    return {
      from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)),
    };
  }
  if (period === "this_year") {
    return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
  }
  // custom
  return {
    from: custom.from ? iso(new Date(custom.from)) : undefined,
    to: custom.to ? iso(new Date(custom.to + "T23:59:59")) : undefined,
  };
}

interface AgentRow {
  userId: string;
  agentId: string | null;
  user: { id: string; first_name: string | null; last_name: string | null; email: string; avatar?: string | null } | null;
  gross: number;
  reversed: number;
  net: number;
  count: number;
  byRole: Record<string, number>;
}

export default function MemberIncomeReportPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");

  // periodRange() calls `new Date()` to derive the "to" bound — without
  // memoization the result string differs by milliseconds on every render,
  // so RTK Query treats every render as a fresh cache key and refetches
  // forever (the "Loading…" never resolves). Pin it to a stable identity
  // keyed by the user-controlled inputs only.
  const range = useMemo(
    () => periodRange(period, { from: customFrom, to: customTo }),
    [period, customFrom, customTo],
  );
  const { data, isLoading } = useGetCommissionRegisterQuery(range);

  // Pull the org's agent roster so we can resolve `beneficiaryUserId` →
  // real name + avatar + agentId (for the profile link). 1000 covers the
  // documented FR-2.4 envelope; for orgs that grow past that, swap in a
  // dedicated bulk-by-userIds endpoint later.
  const { data: agentsData } = useGetAgentsQuery({ limit: 1000 });
  const userIdToAgent = useMemo(() => {
    const m = new Map<
      string,
      { agentId: string; user: AgentRow["user"] }
    >();
    for (const a of agentsData?.data ?? []) {
      if (!a.user) continue;
      m.set(a.user.id, { agentId: a.id, user: a.user as any });
    }
    return m;
  }, [agentsData]);

  const rows = data?.rows ?? [];

  const grouped = useMemo<AgentRow[]>(() => {
    const m = new Map<string, AgentRow>();
    for (const r of rows) {
      if (!r.beneficiaryUserId) continue;
      const lookup = userIdToAgent.get(r.beneficiaryUserId);
      const cur = m.get(r.beneficiaryUserId) ?? {
        userId: r.beneficiaryUserId,
        agentId: lookup?.agentId ?? null,
        user: lookup?.user ?? null,
        gross: 0,
        reversed: 0,
        net: 0,
        count: 0,
        byRole: {},
      };
      cur.count++;
      if (r.status === "REVERSED") {
        cur.reversed += Math.abs(r.amount);
      } else {
        cur.gross += r.amount;
      }
      cur.byRole[r.role] = (cur.byRole[r.role] ?? 0) + r.amount;
      m.set(r.beneficiaryUserId, cur);
    }
    for (const v of m.values()) v.net = v.gross - v.reversed;
    return Array.from(m.values()).sort((a, b) => b.net - a.net);
  }, [rows, userIdToAgent]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return grouped;
    return grouped.filter((g) => {
      if (g.userId.toLowerCase().includes(q)) return true;
      if (g.user) {
        const name = `${g.user.first_name ?? ""} ${g.user.last_name ?? ""} ${g.user.email}`.toLowerCase();
        if (name.includes(q)) return true;
      }
      return false;
    });
  }, [grouped, search]);

  const totals = useMemo(() => {
    let gross = 0, reversed = 0, net = 0;
    for (const r of filtered) {
      gross += r.gross;
      reversed += r.reversed;
      net += r.net;
    }
    return { gross, reversed, net };
  }, [filtered]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/real-estate/reports" className="hover:underline">Reports</Link>
            <span>·</span>
            <span>Member Income</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary" />
            Member Income Report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gross / reversed / net commissions per agent over the selected
            window. Sourced from the commission register.
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
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryTile label="Agents earning" value={filtered.length.toLocaleString()} />
        <SummaryTile label="Gross commission" value={formatCurrency(totals.gross)} />
        <SummaryTile label="Reversed" value={formatCurrency(totals.reversed)} tone="red" />
        <SummaryTile label="Net commission" value={formatCurrency(totals.net)} tone="emerald" />
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Filter by name, email, or user ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-xs text-sm"
        />
      </div>

      {/* Table */}
      <Card>
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Agents · sorted by net commission</h2>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No commissions paid in this window.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left w-10">#</th>
                  <th className="px-3 py-2 text-left">Agent</th>
                  <th className="px-3 py-2 text-right">Splits</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Reversed</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2 text-left">Roles</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <MemberIncomeRow key={r.userId} rank={idx + 1} row={r} />
                ))}
              </tbody>
              <tfoot className="bg-muted/30 font-semibold text-sm">
                <tr className="border-t">
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2">Total ({filtered.length} agents)</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {filtered.reduce((s, r) => s + r.count, 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(totals.gross)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600">
                    {formatCurrency(totals.reversed)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-600">
                    {formatCurrency(totals.net)}
                  </td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Status legend — REVERSED splits subtract from net; ON_HOLD splits
        contribute to gross but aren't yet in the agent's wallet (released
        after the rule's hold period).
      </p>
    </div>
  );
}

function MemberIncomeRow({ rank, row }: { rank: number; row: AgentRow }) {
  const [expanded, setExpanded] = useState(false);
  const roleEntries = Object.entries(row.byRole).sort((a, b) => b[1] - a[1]);
  const displayName = row.user
    ? fullName(row.user as any) || row.user.email
    : `Unknown · ${row.userId.slice(0, 8)}…`;

  return (
    <>
      <tr className="border-t hover:bg-muted/30">
        <td className="px-3 py-2 tabular-nums text-muted-foreground">{rank}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-label={expanded ? "Collapse" : "Expand"}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", !expanded && "-rotate-90")}
              />
            </button>
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={row.user?.avatar ?? undefined} alt={displayName} />
              <AvatarFallback className="text-[10px]">
                {row.user ? initials(row.user as any) : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              {row.agentId ? (
                <Link
                  href={`/real-estate/agents/${row.agentId}`}
                  className="text-sm font-medium hover:underline truncate block"
                >
                  {displayName}
                </Link>
              ) : (
                <span className="text-sm font-medium truncate block">
                  {displayName}
                </span>
              )}
              {row.user?.email && (
                <div className="text-[11px] text-muted-foreground truncate">
                  {row.user.email}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.gross)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-red-600">
          {row.reversed > 0 ? formatCurrency(row.reversed) : "—"}
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
          {formatCurrency(row.net)}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {roleEntries.slice(0, 3).map(([role, amt]) => (
              <Badge key={role} variant="outline" className="text-[10px]">
                {COMMISSION_ROLE_LABEL[role as keyof typeof COMMISSION_ROLE_LABEL]}: {formatCurrency(amt)}
              </Badge>
            ))}
            {roleEntries.length > 3 && (
              <Badge variant="outline" className="text-[10px]">+{roleEntries.length - 3}</Badge>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td></td>
          <td colSpan={6} className="px-3 py-2 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {roleEntries.map(([role, amt]) => (
                <div key={role} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-background border text-xs">
                  <span className="text-muted-foreground">
                    {COMMISSION_ROLE_LABEL[role as keyof typeof COMMISSION_ROLE_LABEL]}
                  </span>
                  <span className="tabular-nums font-medium">{formatCurrency(amt)}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SummaryTile({
  label, value, tone,
}: { label: string; value: React.ReactNode; tone?: "red" | "emerald" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className={cn(
          "text-2xl font-bold tabular-nums mt-1 truncate",
          tone === "red" && "text-red-600 dark:text-red-400",
          tone === "emerald" && "text-emerald-700 dark:text-emerald-400",
        )}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
