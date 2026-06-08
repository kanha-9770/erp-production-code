"use client";

/**
 * Accounts dashboard — a read-only roll-up of the finance documents:
 *   - KPI tiles (receivables outstanding, invoiced, received, paid out, expenses)
 *   - Outstanding receivables (open invoices with their balance + aging)
 *   - Money out (payment vouchers + expenses)
 * Everything is derived live from the optimistic store, so it tracks edits.
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  FileText,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt as ReceiptIcon,
  AlertTriangle,
} from "lucide-react";
import { useAccounts } from "@/lib/accounts-system/store";
import { formatMoney, formatDate, resolveStatus } from "@/lib/accounts-system/format";
import { getSchema } from "@/lib/accounts-system/schema";
import type { AccountsRecord } from "@/lib/accounts-system/types";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

interface OpenInvoice {
  rec: AccountsRecord;
  total: number;
  received: number;
  balance: number;
  overdue: boolean;
}

export function AccountsReports() {
  const { ready, records } = useAccounts();

  const data = useMemo(() => {
    const receivedByInvoice = new Map<string, number>();
    for (const r of records.receipt) {
      const inv = String(r.invoiceRef ?? "").trim();
      if (inv) receivedByInvoice.set(inv, (receivedByInvoice.get(inv) ?? 0) + num(r.amount));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalInvoiced = 0;
    const open: OpenInvoice[] = [];
    for (const rec of records.salesInvoice) {
      if (rec.status === "CANCELLED") continue;
      const total = num(rec.total);
      totalInvoiced += total;
      const received = receivedByInvoice.get(String(rec.docNo ?? "").trim()) ?? 0;
      const balance = Math.max(0, total - received);
      if (balance <= 0) continue;
      const due = rec.dueDate ? new Date(rec.dueDate as string) : null;
      const overdue = !!due && !Number.isNaN(due.getTime()) && due < today;
      open.push({ rec, total, received, balance, overdue });
    }
    open.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.balance - a.balance);

    const receivablesOutstanding = open.reduce((s, o) => s + o.balance, 0);
    const overdueOutstanding = open.filter((o) => o.overdue).reduce((s, o) => s + o.balance, 0);
    const totalReceived = records.receipt.reduce((s, r) => s + num(r.amount), 0);
    const paymentsOut = records.paymentVoucher
      .filter((r) => r.status !== "CANCELLED")
      .reduce((s, r) => s + num(r.amount), 0);
    const expensesTotal = records.expense
      .filter((r) => r.status !== "REJECTED")
      .reduce((s, r) => s + num(r.total), 0);

    return {
      open,
      totalInvoiced,
      receivablesOutstanding,
      overdueOutstanding,
      totalReceived,
      paymentsOut,
      expensesTotal,
    };
  }, [records]);

  const invoiceSchema = getSchema("salesInvoice");
  const invoiceStatusField = invoiceSchema.fields.find((f) => f.key === "status");

  if (!ready) {
    return <div className="p-6 text-sm text-muted-foreground">Loading accounts…</div>;
  }

  const kpis = [
    { label: "Receivables Outstanding", value: data.receivablesOutstanding, icon: ArrowDownCircle, tone: "text-amber-600", sub: data.overdueOutstanding > 0 ? `${formatMoney(data.overdueOutstanding)} overdue` : "all current" },
    { label: "Total Invoiced", value: data.totalInvoiced, icon: FileText, tone: "text-blue-600" },
    { label: "Total Received", value: data.totalReceived, icon: TrendingUp, tone: "text-emerald-600" },
    { label: "Payments Out", value: data.paymentsOut, icon: ArrowUpCircle, tone: "text-rose-600" },
    { label: "Expenses", value: data.expensesTotal, icon: ReceiptIcon, tone: "text-purple-600" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 sm:px-6 py-4 border-b">
        <h1 className="text-lg font-semibold tracking-tight">Accounts Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Receivables, collections and money-out — rolled up live from your finance documents.
        </p>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <Card key={k.label} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{k.label}</span>
                  <Icon className={`h-4 w-4 ${k.tone}`} />
                </div>
                <div className="text-xl font-semibold tabular-nums">{formatMoney(k.value)}</div>
                {k.sub && <div className="text-[11px] text-muted-foreground">{k.sub}</div>}
              </Card>
            );
          })}
        </div>

        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <ArrowDownCircle className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold">Outstanding Receivables</h2>
            <Badge variant="secondary" className="ml-auto">
              {data.open.length} invoice{data.open.length === 1 ? "" : "s"}
            </Badge>
          </div>
          {data.open.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No outstanding invoices — everything is collected. 🎉
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left font-medium px-4 py-2">Invoice</th>
                    <th className="text-left font-medium px-4 py-2">Customer</th>
                    <th className="text-right font-medium px-4 py-2">Total</th>
                    <th className="text-right font-medium px-4 py-2">Received</th>
                    <th className="text-right font-medium px-4 py-2">Balance</th>
                    <th className="text-left font-medium px-4 py-2">Due</th>
                    <th className="text-left font-medium px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.open.map(({ rec, total, received, balance, overdue }) => {
                    const status = invoiceStatusField
                      ? resolveStatus(invoiceStatusField, rec.status)
                      : null;
                    return (
                      <tr key={rec.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2 font-mono text-xs">{String(rec.docNo)}</td>
                        <td className="px-4 py-2 truncate max-w-[180px]">{String(rec.customer ?? "—")}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMoney(total)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatMoney(received)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">{formatMoney(balance)}</td>
                        <td className="px-4 py-2">
                          <span className={overdue ? "text-destructive font-medium inline-flex items-center gap-1" : ""}>
                            {overdue && <AlertTriangle className="h-3 w-3" />}
                            {formatDate(rec.dueDate)}
                          </span>
                        </td>
                        <td className="px-4 py-2">{status && <Badge variant={status.variant}>{status.label}</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-rose-600" />
            <h2 className="text-sm font-semibold">Money Out — this book</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Vouchers ({records.paymentVoucher.length})</span>
              <span className="tabular-nums font-medium">{formatMoney(data.paymentsOut)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expenses ({records.expense.length})</span>
              <span className="tabular-nums font-medium">{formatMoney(data.expensesTotal)}</span>
            </div>
          </div>
          <Separator className="my-3" />
          <div className="flex justify-between text-sm font-semibold">
            <span>Total Out</span>
            <span className="tabular-nums">{formatMoney(data.paymentsOut + data.expensesTotal)}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
