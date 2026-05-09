"use client";

/**
 * Transactions — modern workspace.
 *
 * Same shell as Properties/Agents/Leads. Inline-edit is intentionally limited:
 * status transitions for Transactions go through dedicated endpoints
 * (close/cancel/dispute) which the engine uses to write commission splits and
 * ledger entries. Status edits via this list would skip those side-effects, so
 * status is read-only here — open the detail page to act on a transaction.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetTransactionsQuery, useGetTransactionQuery,
} from "@/lib/api/real-estate/transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Receipt, Plus, Search, ImageOff, ChevronLeft, ChevronRight,
  ExternalLink, Calendar, Coins, FileText,
} from "lucide-react";
import {
  TRANSACTION_STATUS_LABEL, TRANSACTION_STATUS_VARIANT,
  COMMISSION_ROLE_LABEL, COMMISSION_STATUS_LABEL, COMMISSION_STATUS_VARIANT,
  formatCurrency, formatDate,
} from "@/components/real-estate/constants";
import {
  WorkspaceShell, WorkspaceHeader,
  DataTable, type ColumnDef,
  FilterChips, ActiveFilterPills,
  ViewsBar, useSavedViews,
} from "@/components/real-estate/workspace";
import type { Transaction } from "@/lib/api/real-estate/types";

const PAGE_SIZE = 50;

interface Filters {
  search: string;
  status: string;
}
const EMPTY_FILTERS: Filters = { search: "", status: "" };

export default function TransactionsListPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const views = useSavedViews<Filters>("transactions");

  const onSelectView = (id: string | null) => {
    views.select(id);
    if (id == null) {
      setFilters(EMPTY_FILTERS);
      setSearchInput("");
    } else {
      const v = views.views.find((x) => x.id === id);
      if (v) {
        setFilters(v.filters);
        setSearchInput(v.filters.search);
      }
    }
    setPage(0);
  };

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };

  const { data, isLoading, isFetching } = useGetTransactionsQuery({
    search: filters.search || undefined,
    status: filters.status || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const isDirty = useMemo(() => {
    if (views.activeId == null) return Object.values(filters).some(Boolean);
    const active = views.views.find((v) => v.id === views.activeId);
    return active ? JSON.stringify(active.filters) !== JSON.stringify(filters) : true;
  }, [filters, views.activeId, views.views]);

  const activeFilterPills = useMemo(() => {
    const pills: Array<{ key: string; label: React.ReactNode }> = [];
    if (filters.search) pills.push({ key: "search", label: <>Search: <strong>{filters.search}</strong></> });
    if (filters.status) pills.push({ key: "status", label: <>Status: <strong>{TRANSACTION_STATUS_LABEL[filters.status as keyof typeof TRANSACTION_STATUS_LABEL]}</strong></> });
    return pills;
  }, [filters]);

  const columns: ColumnDef<Transaction>[] = useMemo(() => [
    {
      id: "image",
      header: "",
      width: 56,
      pinned: true,
      copyValue: () => "",
      cell: (t) => (
        <div className="h-10 w-10 rounded bg-muted overflow-hidden shrink-0 relative">
          {t.property?.primaryImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.property.primaryImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageOff className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground/50" />
          )}
        </div>
      ),
    },
    {
      id: "property",
      header: "Property",
      width: 280,
      pinned: true,
      copyValue: (t) => `${t.property?.title ?? ""}${t.code ? ` (${t.code})` : ""}`,
      cell: (t) => (
        <div className="min-w-0">
          <div className="font-medium truncate">{t.property?.title ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {t.code ?? "—"} · {t.property?.city ?? "—"}
          </div>
        </div>
      ),
    },
    {
      id: "buyer",
      header: "Buyer",
      width: 160,
      copyValue: (t) => t.buyer?.name ?? "",
      cell: (t) => <span className="text-sm truncate">{t.buyer?.name ?? "—"}</span>,
    },
    {
      id: "salePrice",
      header: "Sale price",
      width: 140,
      align: "right",
      sortKey: "salePrice",
      copyValue: (t) => String(t.salePrice),
      cell: (t) => <span className="font-semibold">{formatCurrency(t.salePrice, t.currency)}</span>,
    },
    {
      id: "commission",
      header: "Commission",
      width: 140,
      align: "right",
      copyValue: (t) => t.baseCommission != null ? String(t.baseCommission) : "",
      cell: (t) => (
        <span className={"text-sm tabular-nums " + (t.baseCommission != null ? "" : "text-muted-foreground")}>
          {t.baseCommission != null ? formatCurrency(t.baseCommission, t.currency) : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      width: 130,
      sortKey: "status",
      copyValue: (t) => TRANSACTION_STATUS_LABEL[t.status],
      cell: (t) => (
        <Badge variant={TRANSACTION_STATUS_VARIANT[t.status]} className="text-[10px]">
          {TRANSACTION_STATUS_LABEL[t.status]}
        </Badge>
      ),
    },
    {
      id: "date",
      header: "Date",
      width: 110,
      sortKey: "createdAt",
      copyValue: (t) => formatDate(t.closedAt ?? t.createdAt),
      cell: (t) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {t.closedAt ? formatDate(t.closedAt) : formatDate(t.createdAt)}
        </span>
      ),
    },
    {
      id: "ruleVersion",
      header: "Rule v",
      width: 80,
      defaultHidden: true,
      align: "right",
      copyValue: (t) => t.commissionRuleVersion ? String(t.commissionRuleVersion) : "",
      cell: (t) => <span className="text-[11px] tabular-nums text-muted-foreground">v{t.commissionRuleVersion ?? "—"}</span>,
    },
    {
      id: "_count",
      header: "Splits",
      width: 80,
      defaultHidden: true,
      align: "right",
      copyValue: (t) => String(t._count?.commissionSplits ?? 0),
      cell: (t) => <span className="text-[11px] tabular-nums">{t._count?.commissionSplits ?? 0}</span>,
    },
  ], []);

  return (
    <WorkspaceShell
      scope="transactions"
      selectedId={selectedId}
      onCloseSelection={() => setSelectedId(null)}
      header={
        <>
          <WorkspaceHeader
            icon={<Receipt className="h-4 w-4" />}
            title="Transactions"
            subtitle={`${total.toLocaleString()} sale${total === 1 ? "" : "s"}${isFetching ? " · syncing…" : ""}`}
          >
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Code, property, buyer…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateFilter("search", searchInput.trim());
                  if (e.key === "Escape") { setSearchInput(""); updateFilter("search", ""); }
                }}
                className="pl-8 h-8 w-56 text-sm"
              />
            </div>
            <Button asChild size="sm" className="h-8">
              <Link href="/real-estate/transactions/new">
                <Plus className="h-3.5 w-3.5 mr-1" /> New transaction
              </Link>
            </Button>
          </WorkspaceHeader>

          <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-3">
            <ViewsBar
              views={views.views}
              activeId={views.activeId}
              onSelect={onSelectView}
              onSave={(name) => views.save(name, filters)}
              onRename={(id, name) => views.update(id, { name })}
              onDelete={views.remove}
              isDirty={isDirty}
              onSaveOver={() => views.activeId && views.update(views.activeId, { filters })}
            />
          </div>

          <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
            <FilterChips
              label="Status"
              value={filters.status}
              onChange={(v) => updateFilter("status", v)}
              options={Object.entries(TRANSACTION_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
            />
            <ActiveFilterPills
              filters={activeFilterPills}
              onClear={(k) => updateFilter(k as keyof Filters, "" as any)}
              onClearAll={() => { setFilters(EMPTY_FILTERS); setSearchInput(""); setPage(0); }}
            />
          </div>
        </>
      }
      list={
        <div className="flex flex-col h-full">
          <div className="flex-1 min-h-0">
            <DataTable<Transaction>
              tableId="rebm-transactions"
              columns={columns}
              rows={items}
              rowId={(t) => t.id}
              isLoading={isLoading}
              selectedId={selectedId}
              onRowClick={(t) => setSelectedId(t.id)}
              emptyState={
                <div className="py-10">
                  <Receipt className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p>No transactions match these filters.</p>
                  <Button asChild variant="link" size="sm">
                    <Link href="/real-estate/transactions/new">Record your first sale</Link>
                  </Button>
                </div>
              }
            />
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t bg-background/95 text-xs">
              <span className="text-muted-foreground tabular-nums">
                Page {page + 1} of {pages} · {total.toLocaleString()} total
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
        </div>
      }
      preview={selectedId ? <TransactionPreview id={selectedId} /> : null}
      previewHeader={selectedId ? <TransactionPreviewHeader id={selectedId} /> : null}
    />
  );
}

function TransactionPreviewHeader({ id }: { id: string }) {
  const { data } = useGetTransactionQuery(id);
  const t = data?.data;
  if (!t) return <Skeleton className="h-5 w-40" />;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Badge variant={TRANSACTION_STATUS_VARIANT[t.status]} className="text-[10px] shrink-0">
        {TRANSACTION_STATUS_LABEL[t.status]}
      </Badge>
      <span className="font-mono text-xs text-muted-foreground shrink-0">{t.code ?? t.id.slice(0, 8)}</span>
      <span className="font-semibold truncate text-sm">{t.property?.title ?? "—"}</span>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/real-estate/transactions/${t.id}`} title="Open full page">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function TransactionPreview({ id }: { id: string }) {
  const { data, isLoading } = useGetTransactionQuery(id);
  const t = data?.data;

  if (isLoading || !t) {
    return (
      <div className="p-4 sm:p-5 space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const isPending = t.status === "PENDING";

  return (
    <div className="p-4 sm:p-5 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-start gap-4">
        {t.property?.primaryImageUrl ? (
          <div className="h-20 w-20 rounded-lg overflow-hidden bg-muted shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.property.primaryImageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground tabular-nums font-mono">{t.code ?? t.id.slice(0, 8)}</div>
          <h2 className="text-lg font-bold truncate">{t.property?.title ?? "—"}</h2>
          <div className="text-sm text-muted-foreground">{t.property?.city}</div>
          <Badge variant={TRANSACTION_STATUS_VARIANT[t.status]} className="text-[10px] mt-2">
            {TRANSACTION_STATUS_LABEL[t.status]}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Sale price" value={formatCurrency(t.salePrice, t.currency)} />
        <Fact
          label="Commission"
          icon={Coins}
          value={t.baseCommission != null ? formatCurrency(t.baseCommission, t.currency) : "—"}
        />
        <Fact label="Buyer" value={t.buyer?.name ?? "—"} />
        <Fact label={t.closedAt ? "Closed" : "Created"} icon={Calendar}
          value={formatDate(t.closedAt ?? t.createdAt)} />
      </div>

      {t.paymentTerms && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Payment terms</div>
          <p className="text-sm leading-relaxed whitespace-pre-line">{t.paymentTerms}</p>
        </Card>
      )}

      {t.commissionSplits && t.commissionSplits.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Commission splits ({t.commissionSplits.length})
          </div>
          <Card>
            <ul className="divide-y text-sm">
              {t.commissionSplits.map((s) => (
                <li key={s.id} className="px-3 py-2 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {COMMISSION_ROLE_LABEL[s.role]}
                    {s.level != null ? ` L${s.level}` : ""}
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">{s.percent}%</span>
                  <span className="font-medium tabular-nums ml-auto">{formatCurrency(s.amount, t.currency)}</span>
                  <Badge variant={COMMISSION_STATUS_VARIANT[s.status]} className="text-[10px] shrink-0">
                    {COMMISSION_STATUS_LABEL[s.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {t.documents && t.documents.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Documents ({t.documents.length})
          </div>
          <ul className="space-y-1 text-sm">
            {t.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                  {d.name}
                </a>
                <span className="text-[11px] text-muted-foreground ml-auto">{d.type}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isPending && (
        <Card className="p-4 border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <div className="text-sm">
            <strong>Pending close.</strong> Open the full page to fire the commission engine ("Close & post commissions").
          </div>
          <Button asChild size="sm" className="mt-2">
            <Link href={`/real-estate/transactions/${t.id}`}>Open transaction <ExternalLink className="h-3 w-3 ml-1" /></Link>
          </Button>
        </Card>
      )}
    </div>
  );
}

function Fact({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: any }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
      <div className="font-medium flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        {value}
      </div>
    </div>
  );
}
