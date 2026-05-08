"use client";

/**
 * Transactions list — sales register. Filter by status / property / agent.
 */

import Link from "next/link";
import { useState } from "react";
import { useGetTransactionsQuery } from "@/lib/api/real-estate/transactions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Receipt, Plus, Search, ImageOff } from "lucide-react";
import {
  TRANSACTION_STATUS_LABEL,
  TRANSACTION_STATUS_VARIANT,
  formatCurrency,
  formatDate,
} from "@/components/real-estate/constants";

export default function TransactionsListPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const { data, isLoading } = useGetTransactionsQuery({
    search: search || undefined,
    status: status || undefined,
    limit: 100,
  });
  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Receipt className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            Transactions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} sale{total === 1 ? "" : "s"}
          </p>
        </div>
        <Button asChild>
          <Link href="/real-estate/transactions/new">
            <Plus className="h-4 w-4 mr-2" /> New transaction
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2 flex gap-2">
            <Input
              placeholder="Code, property, buyer…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput.trim())}
            />
            <Button variant="outline" size="icon" onClick={() => setSearch(searchInput.trim())}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Select value={status || "ALL"} onValueChange={(v) => setStatus(v === "ALL" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {Object.entries(TRANSACTION_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No transactions yet.</p>
            <Button asChild variant="link">
              <Link href="/real-estate/transactions/new">Record your first sale</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Mobile */}
            <ul className="divide-y md:hidden">
              {items.map((t) => (
                <li key={t.id}>
                  <Link href={`/real-estate/transactions/${t.id}`} className="block p-3 hover:bg-muted/40">
                    <div className="flex gap-3">
                      <div className="h-12 w-12 rounded-md overflow-hidden bg-muted shrink-0">
                        {t.property?.primaryImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.property.primaryImageUrl} alt="" className="w-full h-full object-cover" />
                        ) : <div className="w-full h-full flex items-center justify-center"><ImageOff className="h-5 w-5 text-muted-foreground/40" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{t.property?.title ?? "—"}</span>
                          <Badge variant={TRANSACTION_STATUS_VARIANT[t.status]} className="text-[10px] shrink-0">
                            {TRANSACTION_STATUS_LABEL[t.status]}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(t.salePrice, t.currency)}
                          {t.code ? ` · ${t.code}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {t.closedAt ? formatDate(t.closedAt) : formatDate(t.createdAt)}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Tablet+ */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Property</th>
                    <th className="text-left p-3">Code</th>
                    <th className="text-left p-3">Buyer</th>
                    <th className="text-right p-3">Sale price</th>
                    <th className="text-right p-3">Commission</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-muted/40">
                      <td className="p-3">
                        <Link href={`/real-estate/transactions/${t.id}`} className="block">
                          <span className="font-medium">{t.property?.title ?? "—"}</span>
                          <span className="block text-xs text-muted-foreground">{t.property?.city}</span>
                        </Link>
                      </td>
                      <td className="p-3 font-mono text-xs">{t.code ?? "—"}</td>
                      <td className="p-3">{t.buyer?.name ?? "—"}</td>
                      <td className="p-3 text-right tabular-nums font-medium">
                        {formatCurrency(t.salePrice, t.currency)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {t.baseCommission != null
                          ? formatCurrency(t.baseCommission, t.currency)
                          : "—"}
                      </td>
                      <td className="p-3">
                        <Badge variant={TRANSACTION_STATUS_VARIANT[t.status]} className="text-[10px]">
                          {TRANSACTION_STATUS_LABEL[t.status]}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs tabular-nums">
                        {t.closedAt ? formatDate(t.closedAt) : formatDate(t.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
