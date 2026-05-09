"use client";

/**
 * Sales Dashboard — the brokerage's bottom-line view.
 *
 * Mirrors what an MLM admin template calls the "Business" dashboard, but
 * uses real-estate-appropriate terminology:
 *   - Sales Performance = revenue closed this period
 *   - Total Sales       = count of closed transactions
 *   - Total Expense     = commission paid out (the brokerage's largest variable cost)
 *   - Total Profit      = revenue − commission paid
 *   - Payouts           = released commissions agents have actually withdrawn
 *   - Balance           = unsettled commission liability (still on hold)
 *
 * Numbers come from the existing reports endpoints — no schema work.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGetSalesRegisterQuery, useGetCommissionRegisterQuery, useGetPayoutRegisterQuery }
  from "@/lib/api/real-estate/reports";
import { useGetTransactionsQuery } from "@/lib/api/real-estate/transactions";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  TrendingUp, TrendingDown, Receipt, Coins, Wallet as WalletIcon,
  PiggyBank, Banknote, Package, ArrowRight, Building2,
} from "lucide-react";
import {
  formatCurrency, formatDate,
  TRANSACTION_STATUS_LABEL, TRANSACTION_STATUS_VARIANT,
} from "@/components/real-estate/constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Period = "this_week" | "this_month" | "this_year" | "last_month" | "all_time";

function periodRange(period: Period): { from?: string; to?: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (period === "all_time") return {};

  if (period === "this_week") {
    const day = now.getDay() || 7;
    const monday = startOfDay(new Date(now.getTime() - (day - 1) * 86400000));
    return { from: monday.toISOString(), to: new Date().toISOString() };
  }
  if (period === "this_month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to: now.toISOString(),
    };
  }
  if (period === "last_month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString(),
    };
  }
  // this_year
  return {
    from: new Date(now.getFullYear(), 0, 1).toISOString(),
    to: now.toISOString(),
  };
}

const PERIOD_LABEL: Record<Period, string> = {
  this_week: "This Week",
  this_month: "This Month",
  last_month: "Last Month",
  this_year: "This Year",
  all_time: "All Time",
};

export default function SalesDashboardPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const range = useMemo(() => periodRange(period), [period]);

  const salesQ = useGetSalesRegisterQuery(range);
  const commQ = useGetCommissionRegisterQuery({ ...range, status: "RELEASED" });
  const payoutQ = useGetPayoutRegisterQuery({ ...range, status: "PAID" });
  const latestQ = useGetTransactionsQuery({ status: "CLOSED", limit: 8 });

  // Sliced summary maths.
  const revenue = salesQ.data?.summary.totalSales ?? 0;
  const txnCount = salesQ.data?.summary.count ?? 0;
  const commissionPaid = commQ.data?.summary.totalAmount ?? 0;
  const profit = revenue - commissionPaid;
  const payouts = payoutQ.data?.summary.totalPaid ?? 0;
  const onHoldLiability = (commQ.data?.summary.onHold ?? 0);
  const isLoading = salesQ.isLoading || commQ.isLoading || payoutQ.isLoading;

  // Top properties: bucket the latest 100 closed sales by property.
  const topProps = useMemo(() => {
    const rows = salesQ.data?.rows ?? [];
    const byProp = new Map<string, { id: string; title: string; code: string | null; city: string; count: number; revenue: number }>();
    for (const r of rows) {
      if (!r.property) continue;
      const cur = byProp.get(r.property.id);
      if (cur) {
        cur.count++;
        cur.revenue += r.salePrice;
      } else {
        byProp.set(r.property.id, {
          id: r.property.id,
          title: r.property.title,
          code: r.property.code ?? null,
          city: r.property.city,
          count: 1,
          revenue: r.salePrice,
        });
      }
    }
    return Array.from(byProp.values()).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [salesQ.data]);

  // Sales-over-view buckets — fetch all-time once, then bucket client-side.
  const allTimeQ = useGetSalesRegisterQuery({});
  const buckets = useMemo(() => {
    const rows = allTimeQ.data?.rows ?? [];
    const today = startOfToday();
    const startOfWeek = mondayOf(today);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfPastWeek = new Date(startOfWeek.getTime() - 7 * 86400000);
    const startOfPastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfPastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const buckets = { today: 0, week: 0, pastWeek: 0, month: 0, pastMonth: 0, year: 0 };
    for (const r of rows) {
      if (!r.closedAt) continue;
      const d = new Date(r.closedAt);
      if (d >= today) buckets.today += r.salePrice;
      if (d >= startOfWeek) buckets.week += r.salePrice;
      if (d >= startOfPastWeek && d < startOfWeek) buckets.pastWeek += r.salePrice;
      if (d >= startOfMonth) buckets.month += r.salePrice;
      if (d >= startOfPastMonth && d <= endOfPastMonth) buckets.pastMonth += r.salePrice;
      if (d >= startOfYear) buckets.year += r.salePrice;
    }
    return buckets;
  }, [allTimeQ.data]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Real Estate</span>
            <span>·</span>
            <span>Dashboards</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Sales Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Revenue, commission cost, and profitability for {PERIOD_LABEL[period].toLowerCase()}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs row 1 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Sales Performance"
          icon={<TrendingUp className="h-4 w-4" />}
          tint="emerald"
          loading={isLoading}
          primary={formatCurrency(revenue)}
          secondary={`${txnCount} closed deal${txnCount === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="Total Sales"
          icon={<Receipt className="h-4 w-4" />}
          tint="blue"
          loading={isLoading}
          primary={txnCount.toLocaleString()}
          secondary="closed transactions"
        />
        <KpiCard
          label="Total Expense"
          icon={<TrendingDown className="h-4 w-4" />}
          tint="amber"
          loading={isLoading}
          primary={formatCurrency(commissionPaid)}
          secondary="commission paid"
        />
        <KpiCard
          label="Total Profit"
          icon={<Coins className="h-4 w-4" />}
          tint="violet"
          loading={isLoading}
          primary={formatCurrency(profit)}
          secondary={`${revenue > 0 ? Math.round((profit / revenue) * 100) : 0}% margin`}
        />
      </div>

      {/* KPIs row 2 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Payouts"
          icon={<Banknote className="h-4 w-4" />}
          tint="emerald"
          loading={isLoading}
          primary={formatCurrency(payouts)}
          secondary="settled to agents"
        />
        <KpiCard
          label="On-Hold Liability"
          icon={<PiggyBank className="h-4 w-4" />}
          tint="amber"
          loading={isLoading}
          primary={formatCurrency(onHoldLiability)}
          secondary="commissions in hold period"
        />
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Sales Window
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <SmallStat label="From" value={range.from ? formatDate(range.from) : "—"} />
              <SmallStat label="To" value={range.to ? formatDate(range.to) : "—"} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales over view */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold">Sales Over View</h2>
          </div>
          <CardContent className="p-0">
            <ul className="divide-y text-sm">
              <SalesBucketRow label="Today"      sub={fmtBucket(startOfToday())}                  amount={buckets.today} />
              <SalesBucketRow label="This Week"  sub={`${fmtBucket(mondayOf(startOfToday()))} — ${fmtBucket(startOfToday())}`} amount={buckets.week} />
              <SalesBucketRow label="Past Week"  sub={fmtPastWeek()}                              amount={buckets.pastWeek} />
              <SalesBucketRow label="This Month" sub={fmtMonthRange(startOfToday())}              amount={buckets.month} />
              <SalesBucketRow label="Past Month" sub={fmtPastMonth()}                             amount={buckets.pastMonth} />
              <SalesBucketRow label="This Year"  sub={fmtYearRange(startOfToday())}               amount={buckets.year} />
            </ul>
          </CardContent>
        </Card>

        {/* Top selling properties */}
        <Card>
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Top Selling Properties</h2>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link href="/real-estate/reports">
                All reports <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
          <CardContent className="p-0">
            {salesQ.isLoading ? (
              <div className="p-4 space-y-2">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8" />)}
              </div>
            ) : topProps.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Building2 className="h-7 w-7 mx-auto mb-2 opacity-40" />
                No closed sales in this period.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left w-10">#</th>
                    <th className="px-3 py-2 text-left">Property</th>
                    <th className="px-3 py-2 text-right">Sold</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProps.map((p, idx) => (
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/real-estate/properties/${p.id}`} className="hover:underline">
                          <div className="font-medium truncate">{p.title}</div>
                          <div className="text-[11px] text-muted-foreground">{p.code ?? "—"} · {p.city}</div>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.count}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatCurrency(p.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Latest sales */}
      <Card>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Latest Sales</h2>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link href="/real-estate/transactions">
              All transactions <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
        <CardContent className="p-0">
          {latestQ.isLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : !latestQ.data?.data.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No closed transactions yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left w-10">#</th>
                  <th className="px-3 py-2 text-left">Buyer</th>
                  <th className="px-3 py-2 text-left">Property</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-right">Sale Price</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {latestQ.data.data.map((t, idx) => (
                  <tr key={t.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium truncate">{t.buyer?.name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {t.buyer?.email ?? t.buyer?.phone ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/real-estate/transactions/${t.id}`} className="hover:underline truncate">
                        {t.property?.title ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{t.code ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatCurrency(t.salePrice, t.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={TRANSACTION_STATUS_VARIANT[t.status]} className="text-[10px]">
                        {TRANSACTION_STATUS_LABEL[t.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function mondayOf(d: Date) {
  const day = d.getDay() || 7;
  return new Date(d.getTime() - (day - 1) * 86400000);
}
function fmtBucket(d: Date) {
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function fmtPastWeek() {
  const today = startOfToday();
  const monday = mondayOf(today);
  const start = new Date(monday.getTime() - 7 * 86400000);
  const end = new Date(monday.getTime() - 86400000);
  return `${fmtBucket(start)} — ${fmtBucket(end)}`;
}
function fmtMonthRange(today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return `${fmtBucket(start)} — ${fmtBucket(end)}`;
}
function fmtPastMonth() {
  const today = startOfToday();
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  return `${fmtBucket(start)} — ${fmtBucket(end)}`;
}
function fmtYearRange(today: Date) {
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);
  return `${fmtBucket(start)} — ${fmtBucket(end)}`;
}

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
          {loading ? (
            <Skeleton className="h-7 w-24 mt-1" />
          ) : (
            <div className="text-2xl font-bold tabular-nums mt-0.5 truncate">{primary}</div>
          )}
          <div className="text-xs text-muted-foreground mt-0.5">{secondary}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SmallStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function SalesBucketRow({ label, sub, amount }: { label: string; sub: string; amount: number }) {
  return (
    <li className="px-4 py-3 flex items-center gap-3">
      <div className="h-8 w-8 rounded-md bg-muted/60 flex items-center justify-center text-muted-foreground">
        <Coins className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">{sub}</div>
      </div>
      <div className="text-sm font-semibold tabular-nums">{formatCurrency(amount)}</div>
    </li>
  );
}
