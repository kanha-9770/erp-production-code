"use client";

/**
 * Payout Report — every withdrawal request the brokerage has received,
 * in the selected window. The payout *queue* (pending approvals) lives
 * at /real-estate/payouts; this page is the historical register.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGetPayoutRegisterQuery } from "@/lib/api/real-estate/reports";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Banknote } from "lucide-react";
import {
  formatCurrency, formatDate,
  WITHDRAWAL_STATUS_LABEL, WITHDRAWAL_STATUS_VARIANT,
} from "@/components/real-estate/constants";

type Period = "this_month" | "last_month" | "this_year" | "all_time" | "custom";
const PERIOD_LABEL: Record<Period, string> = {
  this_month: "This Month",
  last_month: "Last Month",
  this_year: "This Year",
  all_time: "All Time",
  custom: "Custom",
};

function periodRange(period: Period, custom: { from: string; to: string }) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  if (period === "all_time") return {};
  if (period === "this_month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  if (period === "last_month") {
    return {
      from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)),
    };
  }
  if (period === "this_year") return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
  return {
    from: custom.from ? iso(new Date(custom.from)) : undefined,
    to: custom.to ? iso(new Date(custom.to + "T23:59:59")) : undefined,
  };
}

export default function PayoutReportPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [status, setStatus] = useState<string>("");

  const range = useMemo(() => periodRange(period, { from: customFrom, to: customTo }), [period, customFrom, customTo]);
  const { data, isLoading } = useGetPayoutRegisterQuery({ ...range, status: status || undefined });

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href="/real-estate/reports" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">Real Estate · Reports</div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Banknote className="h-6 w-6 text-primary" />
              Payout Report
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Withdrawal requests by status — register of payments the brokerage has settled.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={status || "ALL"} onValueChange={(v) => setStatus(v === "ALL" ? "" : v)}>
            <SelectTrigger className="h-8 w-32 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {Object.entries(WITHDRAWAL_STATUS_LABEL).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
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

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Total requests" value={(summary?.count ?? 0).toLocaleString()} />
        <SummaryTile label="Requested" value={formatCurrency(summary?.totalRequested ?? 0)} />
        <SummaryTile label="Paid" value={formatCurrency(summary?.totalPaid ?? 0)} tone="emerald" />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No withdrawal records in this period.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-10">#</th>
                    <th className="px-3 py-2 text-left">Created</th>
                    <th className="px-3 py-2 text-left">Bank</th>
                    <th className="px-3 py-2 text-left">Account</th>
                    <th className="px-3 py-2 text-right">Requested</th>
                    <th className="px-3 py-2 text-right">Fee</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Paid</th>
                    <th className="px-3 py-2 text-left">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                        {formatDate(r.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.bankAccount?.bankName}</td>
                      <td className="px-3 py-2 text-xs font-mono">
                        ••••{r.bankAccount?.accountNumberLast4}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.amount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(r.fee)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(r.netAmount)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={WITHDRAWAL_STATUS_VARIANT[r.status]} className="text-[10px]">
                          {WITHDRAWAL_STATUS_LABEL[r.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                        {r.paidAt ? formatDate(r.paidAt) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground truncate max-w-xs">
                        {r.paymentReference ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "emerald" }) {
  const c = tone === "emerald" ? "text-emerald-700 dark:text-emerald-400" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className={`text-2xl font-bold tabular-nums mt-1 truncate ${c}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
