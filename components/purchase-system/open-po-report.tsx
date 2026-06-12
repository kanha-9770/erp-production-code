"use client";

/**
 * Open POs · Pending Balances — a read-only report listing every Purchase Order
 * with an outstanding quantity (not started or partially received) across all
 * GRNs, so buyers can chase the remaining deliveries. Derived live from PO and
 * GRN records via the provider.
 */

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ClipboardList, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePurchase } from "@/lib/purchase-system/store";
import { formatMoney, formatNumber, formatDate } from "@/lib/purchase-system/format";

export function OpenPoReport() {
  const { ready, getPendingPoBalances } = usePurchase();
  const [search, setSearch] = useState("");

  const all = ready ? getPendingPoBalances() : [];

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) =>
      `${r.poNo} ${r.supplier ?? ""} ${r.itemName ?? ""} ${r.prRef ?? ""} ${r.invoiceNos.join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [all, search]);

  const totals = useMemo(() => {
    const partial = all.filter((r) => r.status === "PARTIAL").length;
    const pending = all.filter((r) => r.status === "PENDING").length;
    const value = all.reduce((s, r) => s + r.pendingValue, 0);
    return { open: all.length, partial, pending, value };
  }, [all]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 sm:px-6 py-4 border-b shrink-0 space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Open POs · Pending Balances</h1>
            <p className="text-xs text-muted-foreground">
              Purchase orders with a quantity still to receive across all GRNs.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Open POs" value={String(totals.open)} />
          <Stat label="Partially received" value={String(totals.partial)} />
          <Stat label="Not started" value={String(totals.pending)} />
          <Stat label="Pending value" value={formatMoney(totals.value)} />
        </div>

        <div className="relative max-w-xs">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search PO, supplier, item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {!ready ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No open balances</p>
            <p className="text-sm text-muted-foreground">
              {all.length === 0 ? "Every PO has been fully received." : "No matches for your search."}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
              <tr className="text-left text-xs text-muted-foreground">
                <Th>PO No.</Th>
                <Th>Supplier</Th>
                <Th>Item</Th>
                <Th>PR No.</Th>
                <Th>Invoice</Th>
                <Th right>Requested Qty</Th>
                <Th right>Invoiced Qty</Th>
                <Th right>Received</Th>
                <Th right>Balance</Th>
                <Th right>% Recd</Th>
                <Th right>Pending Value</Th>
                <Th>Last Receipt</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.orderedQty > 0 ? Math.round((r.received / r.orderedQty) * 100) : 0;
                return (
                  <tr key={r.poNo} className="border-b hover:bg-muted/30">
                    <Td className="font-mono">{r.poNo}</Td>
                    <Td>{r.supplier ?? "—"}</Td>
                    <Td className="max-w-[200px] truncate">{r.itemName ?? "—"}</Td>
                    <Td className="font-mono">{r.prRef ?? "—"}</Td>
                    <Td className="font-mono max-w-[160px] truncate">
                      {r.invoiceNos.length > 0 ? r.invoiceNos.join(", ") : "—"}
                    </Td>
                    <Td right>{formatNumber(r.orderedQty)}</Td>
                    <Td right>{r.invoicedQty > 0 ? formatNumber(r.invoicedQty) : "—"}</Td>
                    <Td right>{formatNumber(r.received)}</Td>
                    <Td right className="font-medium">{formatNumber(r.balance)}</Td>
                    <Td right>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-12 rounded-full bg-muted overflow-hidden hidden sm:inline-block">
                          <span
                            className={cn("block h-full", pct >= 100 ? "bg-primary" : "bg-amber-500")}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </span>
                        {pct}%
                      </span>
                    </Td>
                    <Td right>{formatMoney(r.pendingValue)}</Td>
                    <Td>{r.lastReceiptDate ? formatDate(r.lastReceiptDate) : "—"}</Td>
                    <Td>
                      <Badge variant={r.status === "PARTIAL" ? "outline" : "secondary"}>
                        {r.status === "PARTIAL" ? "Partial" : "Not started"}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-3 py-2">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn("px-3 py-2 font-medium whitespace-nowrap", right && "text-right")}>{children}</th>
  );
}
function Td({
  children,
  right,
  className,
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={cn("px-3 py-2 whitespace-nowrap tabular-nums", right && "text-right", className)}>
      {children}
    </td>
  );
}
