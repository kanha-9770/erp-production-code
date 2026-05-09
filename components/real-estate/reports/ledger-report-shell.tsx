"use client";

/**
 * Shared shell for the Fund Transfer + Point History reports. Both pages
 * are filtered views over the same admin ledger feed — they only differ
 * in which categories they show by default.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGetAdminLedgerQuery } from "@/lib/api/real-estate/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Search,
} from "lucide-react";
import {
  formatCurrency, formatDateTime, fullName, initials,
  LEDGER_CATEGORY_LABEL, LEDGER_STATUS_LABEL, LEDGER_STATUS_VARIANT,
  LEDGER_CATEGORY_OPTIONS,
} from "@/components/real-estate/constants";

export interface LedgerReportShellProps {
  pageTitle: string;
  pageSubtitle: string;
  pageIcon: React.ReactNode;
  /** When set, only entries with matching `category` are loaded. */
  defaultCategory?: string;
  /** Whether to expose the category filter to the user. */
  showCategoryFilter?: boolean;
}

const PAGE_SIZE = 50;

export function LedgerReportShell({
  pageTitle, pageSubtitle, pageIcon,
  defaultCategory, showCategoryFilter = true,
}: LedgerReportShellProps) {
  const [category, setCategory] = useState<string>(defaultCategory ?? "");
  const [status, setStatus] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading, isFetching } = useGetAdminLedgerQuery({
    category: category || undefined,
    status: status || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.beneficiary?.email ?? "").toLowerCase().includes(q) ||
        (r.beneficiary
          ? fullName({
              first_name: r.beneficiary.first_name,
              last_name: r.beneficiary.last_name,
            }).toLowerCase()
          : ""
        ).includes(q),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    let credits = 0;
    let debits = 0;
    for (const r of filtered) {
      if (r.type === "CREDIT") credits += r.amount;
      else debits += r.amount;
    }
    return { credits, debits, net: credits - debits };
  }, [filtered]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href="/real-estate/reports" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">Real Estate · Reports</div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              {pageIcon}
              {pageTitle}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{pageSubtitle}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {showCategoryFilter && (
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Category</label>
              <Select value={category || "ALL"} onValueChange={(v) => { setCategory(v === "ALL" ? "" : v); setPage(0); }}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All categories</SelectItem>
                  {LEDGER_CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</label>
            <Select value={status || "ALL"} onValueChange={(v) => { setStatus(v === "ALL" ? "" : v); setPage(0); }}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="ON_HOLD">On hold</SelectItem>
                <SelectItem value="RELEASED">Released</SelectItem>
                <SelectItem value="REVERSED">Reversed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">From</label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="mt-1 h-9" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">To</label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="mt-1 h-9" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Search</label>
            <div className="relative mt-1">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Description, agent…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryTile label="Entries" value={total.toLocaleString()} />
        <SummaryTile label="Credits" value={formatCurrency(totals.credits)} tone="emerald" />
        <SummaryTile label="Debits" value={formatCurrency(totals.debits)} tone="red" />
        <SummaryTile label="Net" value={formatCurrency(totals.net)} tone={totals.net >= 0 ? "emerald" : "red"} />
      </div>

      {/* Rows */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No ledger entries match these filters.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left w-10">#</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Beneficiary</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Type</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Balance after</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => {
                    const u = r.beneficiary;
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {page * PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {formatDateTime(r.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          {u ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar className="h-6 w-6 shrink-0">
                                <AvatarImage src={u.avatar ?? undefined} />
                                <AvatarFallback className="text-[9px]">{initials(u)}</AvatarFallback>
                              </Avatar>
                              <span className="truncate text-xs">{fullName(u)}</span>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px]">
                            {LEDGER_CATEGORY_LABEL[r.category]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs truncate max-w-xs">
                          {r.description ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant={r.type === "CREDIT" ? "default" : "destructive"} className="text-[10px]">
                            {r.type}
                          </Badge>
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.type === "CREDIT" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>
                          {r.type === "CREDIT" ? "+" : "−"}{formatCurrency(r.amount, r.currency)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                          {formatCurrency(r.balanceAfter, r.currency)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={LEDGER_STATUS_VARIANT[r.status]} className="text-[10px]">
                            {LEDGER_STATUS_LABEL[r.status]}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t bg-background/95 text-xs">
              <span className="text-muted-foreground tabular-nums">
                Page {page + 1} of {pages} · {total.toLocaleString()} entries
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0 || isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))} className="h-7">
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= pages || isFetching} onClick={() => setPage((p) => p + 1)} className="h-7">
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label, value, tone,
}: { label: string; value: React.ReactNode; tone?: "emerald" | "red" }) {
  const c = tone === "emerald" ? "text-emerald-700 dark:text-emerald-400" : tone === "red" ? "text-red-600 dark:text-red-400" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className={`text-2xl font-bold tabular-nums mt-1 truncate ${c}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
