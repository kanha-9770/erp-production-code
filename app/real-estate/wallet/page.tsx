"use client";

/**
 * My Wallet — balance summary + ledger statement. Shows ON_HOLD vs RELEASED
 * separately so agents can see what's still in the hold period.
 */

import Link from "next/link";
import { useState } from "react";
import {
  useGetMyWalletQuery,
  useGetMyLedgerQuery,
} from "@/lib/api/real-estate/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet as WalletIcon,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  ShieldOff,
  Banknote,
  History,
} from "lucide-react";
import {
  LEDGER_CATEGORY_LABEL,
  LEDGER_CATEGORY_OPTIONS,
  LEDGER_STATUS_LABEL,
  LEDGER_STATUS_VARIANT,
  formatCurrency,
  formatDateTime,
} from "@/components/real-estate/constants";

export default function MyWalletPage() {
  const { data: walletResp, isLoading: walletLoading } = useGetMyWalletQuery();
  const wallet = walletResp?.data;

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const { data: ledgerResp, isLoading: ledgerLoading } = useGetMyLedgerQuery({
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    limit: 200,
  });
  const ledger = ledgerResp?.data ?? [];
  const total = ledgerResp?.meta.total ?? 0;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <WalletIcon className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            My wallet
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Commission earnings, hold balance, and ledger statement.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/real-estate/payouts">
              <Banknote className="h-4 w-4 mr-2" /> Payouts
            </Link>
          </Button>
        </div>
      </div>

      {/* Balance tiles */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
        {walletLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <BalanceTile
              icon={<ArrowDownCircle className="h-4 w-4" />}
              label="Available"
              value={wallet?.availableBalance ?? 0}
              currency={wallet?.currency ?? "INR"}
              tone={wallet?.isFrozen ? "destructive" : "default"}
              hint={wallet?.isFrozen ? "Wallet frozen" : "Withdraw-able"}
            />
            <BalanceTile
              icon={<Clock className="h-4 w-4" />}
              label="On hold (pending)"
              value={wallet?.pendingBalance ?? 0}
              currency={wallet?.currency ?? "INR"}
              tone="muted"
              hint="Released after the rule's hold period"
            />
            <BalanceTile
              icon={<History className="h-4 w-4" />}
              label="Lifetime"
              value={(wallet?.totalCredits ?? 0) - (wallet?.totalDebits ?? 0)}
              currency={wallet?.currency ?? "INR"}
              tone="muted"
              hint={`${formatCurrency(wallet?.totalCredits ?? 0, wallet?.currency)} credited, ${formatCurrency(wallet?.totalDebits ?? 0, wallet?.currency)} debited`}
            />
          </>
        )}
      </div>

      {wallet?.isFrozen && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <ShieldOff className="h-4 w-4 text-destructive" />
            <span>
              <strong>Wallet frozen:</strong> {wallet.freezeReason ?? "contact admin."}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Ledger */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Ledger ({total})</CardTitle>
          <div className="flex gap-2">
            <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-32 h-9 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All status</SelectItem>
                <SelectItem value="ON_HOLD">On hold</SelectItem>
                <SelectItem value="RELEASED">Released</SelectItem>
                <SelectItem value="REVERSED">Reversed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter || "ALL"} onValueChange={(v) => setCategoryFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-40 h-9 text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {LEDGER_CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ledgerLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : ledger.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No ledger entries match your filters.</p>
            </div>
          ) : (
            <>
              {/* Mobile */}
              <ul className="divide-y md:hidden">
                {ledger.map((e) => <LedgerCardRow key={e.id} entry={e} />)}
              </ul>
              {/* Tablet+ */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">When</th>
                      <th className="text-left p-3">Category</th>
                      <th className="text-left p-3">Description</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-right p-3">Balance after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((e) => (
                      <tr key={e.id} className="border-b">
                        <td className="p-3 text-xs tabular-nums whitespace-nowrap">
                          {formatDateTime(e.createdAt)}
                        </td>
                        <td className="p-3 text-xs">
                          {LEDGER_CATEGORY_LABEL[e.category]}
                        </td>
                        <td className="p-3 text-xs max-w-[280px] truncate" title={e.description ?? ""}>
                          {e.description ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3">
                          <Badge variant={LEDGER_STATUS_VARIANT[e.status]} className="text-[10px]">
                            {LEDGER_STATUS_LABEL[e.status]}
                          </Badge>
                        </td>
                        <td className="p-3 text-right tabular-nums font-medium">
                          <span className={e.type === "CREDIT" ? "text-emerald-600" : "text-amber-600"}>
                            {e.type === "CREDIT" ? "+" : "−"}
                            {formatCurrency(e.amount, e.currency)}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums text-xs text-muted-foreground">
                          {formatCurrency(e.balanceAfter, e.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BalanceTile({
  icon,
  label,
  value,
  currency,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  currency: string;
  tone: "default" | "muted" | "destructive";
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold tabular-nums ${
            tone === "destructive" ? "text-destructive" : ""
          }`}
        >
          {formatCurrency(value, currency)}
        </div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function LedgerCardRow({ entry }: { entry: any }) {
  return (
    <li className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm">
            {LEDGER_CATEGORY_LABEL[entry.category as keyof typeof LEDGER_CATEGORY_LABEL]}
          </div>
          {entry.description && (
            <div className="text-xs text-muted-foreground truncate">
              {entry.description}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
            {formatDateTime(entry.createdAt)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className={`font-semibold tabular-nums ${
              entry.type === "CREDIT" ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {entry.type === "CREDIT" ? "+" : "−"}
            {formatCurrency(entry.amount, entry.currency)}
          </div>
          <Badge variant={LEDGER_STATUS_VARIANT[entry.status as keyof typeof LEDGER_STATUS_VARIANT]} className="text-[10px] mt-0.5">
            {LEDGER_STATUS_LABEL[entry.status as keyof typeof LEDGER_STATUS_LABEL]}
          </Badge>
        </div>
      </div>
    </li>
  );
}
