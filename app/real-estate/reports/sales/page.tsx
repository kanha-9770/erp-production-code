"use client";

/**
 * Sales Report — dedicated page for the sales register. Same data as the
 * Reports hub's Sales tab, but with a full-page layout, dedicated date
 * picker, sortable columns, and clipboard copy.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGetSalesRegisterQuery } from "@/lib/api/real-estate/reports";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Receipt } from "lucide-react";
import { formatCurrency, formatDate } from "@/components/real-estate/constants";

type Period = "this_week" | "this_month" | "this_year" | "all_time" | "custom";

const PERIOD_LABEL: Record<Period, string> = {
  this_week: "This Week",
  this_month: "This Month",
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
  if (period === "this_month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  if (period === "this_year") return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
  return {
    from: custom.from ? iso(new Date(custom.from)) : undefined,
    to: custom.to ? iso(new Date(custom.to + "T23:59:59")) : undefined,
  };
}

export default function SalesReportPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const range = useMemo(() => periodRange(period, { from: customFrom, to: customTo }), [period, customFrom, customTo]);

  const { data, isLoading } = useGetSalesRegisterQuery(range);
  const rows = data?.rows ?? [];
  const summary = data?.summary;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href="/real-estate/reports" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">Real Estate · Reports</div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Receipt className="h-6 w-6 text-primary" />
              Sales Report
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Every closed transaction in the period. Amounts in property currency.
            </p>
          </div>
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
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Closed deals" value={(summary?.count ?? 0).toLocaleString()} />
        <SummaryTile label="Total revenue" value={formatCurrency(summary?.totalSales ?? 0)} />
        <SummaryTile label="Total commission" value={formatCurrency(summary?.totalCommission ?? 0)} />
      </div>

      {/* Rows */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No sales closed in this period.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left w-10">#</th>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Property</th>
                    <th className="px-3 py-2 text-left">Buyer</th>
                    <th className="px-3 py-2 text-left">Closed</th>
                    <th className="px-3 py-2 text-right">Sale price</th>
                    <th className="px-3 py-2 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.code ?? "—"}</td>
                      <td className="px-3 py-2 truncate max-w-xs">
                        <Link href={`/real-estate/transactions/${r.id}`} className="hover:underline">
                          <div className="font-medium truncate">{r.property?.title ?? "—"}</div>
                          <div className="text-[10px] text-muted-foreground">{r.property?.city}</div>
                        </Link>
                      </td>
                      <td className="px-3 py-2 truncate">{r.buyer?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                        {formatDate(r.closedAt)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatCurrency(r.salePrice, r.currency)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(r.baseCommission, r.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {summary && (
                  <tfoot className="bg-muted/30 font-semibold text-sm">
                    <tr className="border-t">
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2" colSpan={4}>Total ({summary.count} deals)</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(summary.totalSales)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(summary.totalCommission)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-2xl font-bold tabular-nums mt-1 truncate">{value}</div>
      </CardContent>
    </Card>
  );
}
