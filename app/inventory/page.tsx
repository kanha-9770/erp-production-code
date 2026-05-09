"use client";

/**
 * Inventory product list — modern workspace layout (list + preview pane).
 * Reuses the REBM workspace primitives (DataTable, FilterChips, ViewsBar,
 * InlineEditCell) so the muscle memory carries over from the real-estate
 * module.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetInventoryProductsQuery,
  useGetInventoryProductQuery,
  useUpdateInventoryProductMutation,
} from "@/lib/api/inventory/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Boxes,
  Plus,
  Search,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  Layers,
} from "lucide-react";
import {
  PRODUCT_STATUS_LABEL,
  PRODUCT_STATUS_OPTIONS,
  PRODUCT_STATUS_VARIANT,
  formatMoney,
  formatDate,
} from "@/components/inventory/constants";
import {
  WorkspaceShell,
  WorkspaceHeader,
  DataTable,
  type ColumnDef,
  FilterChips,
  ActiveFilterPills,
  ViewsBar,
  useSavedViews,
  InlineEditCell,
} from "@/components/real-estate/workspace";
import { useToast } from "@/hooks/use-toast";
import type { InventoryProduct } from "@/lib/api/inventory/types";

const PAGE_SIZE = 50;

interface Filters {
  search: string;
  status: string;
  category: string;
  brand: string;
  minPrice: string;
  maxPrice: string;
}

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "",
  category: "",
  brand: "",
  minPrice: "",
  maxPrice: "",
};

export default function InventoryListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const views = useSavedViews<Filters>("inventory");

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

  const updateFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(0);
  };

  const { data, isLoading, isFetching } = useGetInventoryProductsQuery({
    search: filters.search || undefined,
    status: filters.status || undefined,
    category: filters.category || undefined,
    brand: filters.brand || undefined,
    minPrice: filters.minPrice || undefined,
    maxPrice: filters.maxPrice || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const isDirty = useMemo(() => {
    if (views.activeId == null) return Object.values(filters).some(Boolean);
    const a = views.views.find((v) => v.id === views.activeId);
    if (!a) return true;
    return JSON.stringify(a.filters) !== JSON.stringify(filters);
  }, [filters, views.activeId, views.views]);

  const activePills = useMemo(() => {
    const p: Array<{ key: string; label: React.ReactNode }> = [];
    if (filters.search) p.push({ key: "search", label: <>Search: <strong>{filters.search}</strong></> });
    if (filters.status)
      p.push({
        key: "status",
        label: <>Status: <strong>{PRODUCT_STATUS_LABEL[filters.status as keyof typeof PRODUCT_STATUS_LABEL]}</strong></>,
      });
    if (filters.category) p.push({ key: "category", label: <>Category: <strong>{filters.category}</strong></> });
    if (filters.brand) p.push({ key: "brand", label: <>Brand: <strong>{filters.brand}</strong></> });
    if (filters.minPrice) p.push({ key: "minPrice", label: <>Min ₹{Number(filters.minPrice).toLocaleString()}</> });
    if (filters.maxPrice) p.push({ key: "maxPrice", label: <>Max ₹{Number(filters.maxPrice).toLocaleString()}</> });
    return p;
  }, [filters]);

  const [updateProduct] = useUpdateInventoryProductMutation();

  const columns: ColumnDef<InventoryProduct>[] = useMemo(
    () => [
      {
        id: "image",
        header: "",
        width: 56,
        pinned: true,
        copyValue: () => "",
        cell: (p) => (
          <div className="h-10 w-10 rounded bg-muted relative overflow-hidden shrink-0">
            {p.primaryImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.primaryImageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImageOff className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground/50" />
            )}
          </div>
        ),
      },
      {
        id: "name",
        header: "Product",
        width: 280,
        pinned: true,
        sortKey: "name",
        copyValue: (p) => (p.sku ? `${p.name} (${p.sku})` : p.name),
        cell: (p) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{p.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {p.sku ?? "—"}
              {p.brand ? ` · ${p.brand}` : ""}
              {p.category ? ` · ${p.category}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 130,
        sortKey: "status",
        copyValue: (p) => PRODUCT_STATUS_LABEL[p.status],
        cell: (p) => (
          <InlineEditCell<typeof p.status>
            mode="select"
            value={p.status}
            stopRowClick
            options={PRODUCT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            render={(v) => (
              <Badge variant={PRODUCT_STATUS_VARIANT[v]} className="text-[10px]">
                {PRODUCT_STATUS_LABEL[v]}
              </Badge>
            )}
            onSave={async (next) => {
              try {
                await updateProduct({ id: p.id, body: { status: next as any } }).unwrap();
              } catch (e: any) {
                toast({ title: "Update failed", description: e?.data?.error ?? e?.message, variant: "destructive" });
                throw e;
              }
            }}
          />
        ),
      },
      {
        id: "price",
        header: "Price",
        width: 130,
        align: "right",
        sortKey: "price",
        copyValue: (p) => String(p.price),
        cell: (p) => <span className="font-semibold tabular-nums">{formatMoney(p.price, p.currency)}</span>,
      },
      {
        id: "stock",
        header: "Stock",
        width: 90,
        align: "right",
        copyValue: (p) => String(p.stockQty),
        cell: (p) => (
          <span
            className={
              "tabular-nums text-sm " +
              (p.trackStock && p.stockQty <= 0
                ? "text-destructive"
                : p.trackStock && p.lowStockThreshold != null && p.stockQty <= p.lowStockThreshold
                ? "text-amber-600"
                : "text-foreground")
            }
          >
            {p.stockQty}
          </span>
        ),
      },
      {
        id: "category",
        header: "Category",
        width: 140,
        copyValue: (p) => p.category ?? "",
        cell: (p) => <span className="text-sm text-muted-foreground">{p.category ?? "—"}</span>,
      },
      {
        id: "updated",
        header: "Updated",
        width: 110,
        sortKey: "updatedAt",
        copyValue: (p) => formatDate(p.updatedAt),
        cell: (p) => <span className="text-xs text-muted-foreground">{formatDate(p.updatedAt)}</span>,
      },
    ],
    [updateProduct, toast],
  );

  return (
    <WorkspaceShell
      scope="inventory"
      selectedId={selectedId}
      onCloseSelection={() => setSelectedId(null)}
      header={
        <>
          <WorkspaceHeader
            icon={<Boxes className="h-4 w-4" />}
            title="Products"
            subtitle={`${total.toLocaleString()} product${total === 1 ? "" : "s"}${isFetching ? " · syncing…" : ""}`}
          >
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, SKU, brand…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateFilter("search", searchInput.trim());
                  if (e.key === "Escape") {
                    setSearchInput("");
                    updateFilter("search", "");
                  }
                }}
                className="pl-8 h-8 w-56 text-sm"
              />
            </div>
            <Button asChild size="sm" className="h-8">
              <Link href="/inventory/new">
                <Plus className="h-3.5 w-3.5 mr-1" /> New product
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
              options={PRODUCT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <Input
              placeholder="Category"
              value={filters.category}
              onChange={(e) => updateFilter("category", e.target.value)}
              className="h-7 w-32 text-xs"
            />
            <Input
              placeholder="Brand"
              value={filters.brand}
              onChange={(e) => updateFilter("brand", e.target.value)}
              className="h-7 w-28 text-xs"
            />
            <Input
              type="number"
              placeholder="Min ₹"
              value={filters.minPrice}
              onChange={(e) => updateFilter("minPrice", e.target.value)}
              className="h-7 w-24 text-xs"
            />
            <Input
              type="number"
              placeholder="Max ₹"
              value={filters.maxPrice}
              onChange={(e) => updateFilter("maxPrice", e.target.value)}
              className="h-7 w-24 text-xs"
            />
            <ActiveFilterPills
              filters={activePills}
              onClear={(k) => updateFilter(k as keyof Filters, "" as any)}
              onClearAll={() => {
                setFilters(EMPTY_FILTERS);
                setSearchInput("");
                setPage(0);
              }}
            />
          </div>
        </>
      }
      list={
        <div className="flex flex-col h-full">
          <div className="flex-1 min-h-0">
            <DataTable<InventoryProduct>
              tableId="inventory-products"
              columns={columns}
              rows={items}
              rowId={(p) => p.id}
              isLoading={isLoading}
              selectedId={selectedId}
              onRowClick={(p) => setSelectedId(p.id)}
              emptyState={
                <div className="py-10">
                  <Boxes className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p>No products match these filters.</p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setFilters(EMPTY_FILTERS);
                      setSearchInput("");
                    }}
                  >
                    Clear filters
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
      preview={selectedId ? <ProductPreview id={selectedId} /> : null}
      previewHeader={selectedId ? <PreviewHeader id={selectedId} /> : null}
    />
  );
}

function PreviewHeader({ id }: { id: string }) {
  const { data } = useGetInventoryProductQuery(id);
  const p = data?.data;
  if (!p) return <Skeleton className="h-5 w-40" />;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Badge variant={PRODUCT_STATUS_VARIANT[p.status]} className="text-[10px] shrink-0">
        {PRODUCT_STATUS_LABEL[p.status]}
      </Badge>
      <span className="font-semibold truncate text-sm">{p.name}</span>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/storefront/products/${p.slug}`} target="_blank" title="Open storefront preview">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0">
        <Link href={`/inventory/${p.id}`} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function ProductPreview({ id }: { id: string }) {
  const { data, isLoading } = useGetInventoryProductQuery(id);
  const p = data?.data;
  if (isLoading || !p) {
    return (
      <div className="p-4 sm:p-5 space-y-3">
        <Skeleton className="aspect-[16/9]" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const blockCount = (p.pageLayout?.rows ?? []).reduce((n, r) => n + r.blocks.length, 0);

  return (
    <div className="p-4 sm:p-5 space-y-5 max-w-2xl mx-auto">
      <div className="aspect-[16/9] bg-muted rounded-lg overflow-hidden">
        {p.primaryImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.primaryImageUrl} alt={p.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff className="h-10 w-10 text-muted-foreground/40" />
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-bold">{p.name}</h2>
        <div className="text-3xl font-bold tabular-nums mt-3">
          {formatMoney(p.price, p.currency)}
          {p.compareAtPrice != null && p.compareAtPrice > p.price && (
            <span className="ml-3 text-base line-through text-muted-foreground">
              {formatMoney(p.compareAtPrice, p.currency)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {p.sku && <Badge variant="outline">SKU {p.sku}</Badge>}
          {p.brand && <Badge variant="secondary">{p.brand}</Badge>}
          {p.category && <Badge variant="secondary">{p.category}</Badge>}
          {p.trackStock && (
            <Badge variant={p.stockQty > 0 ? "default" : "destructive"}>
              {p.stockQty > 0 ? `${p.stockQty} in stock` : "Out of stock"}
            </Badge>
          )}
        </div>
      </div>

      <Card className="p-4 flex items-center gap-3">
        <Layers className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <div className="text-sm font-medium">Storefront page</div>
          <div className="text-xs text-muted-foreground">
            {blockCount > 0
              ? `${blockCount} block${blockCount === 1 ? "" : "s"} across ${p.pageLayout?.rows.length ?? 0} row${(p.pageLayout?.rows.length ?? 0) === 1 ? "" : "s"}`
              : "Not built yet — defaults will render"}
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/inventory/${p.id}?tab=builder`}>Open builder</Link>
        </Button>
      </Card>

      {p.shortDescription && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Short description
          </div>
          <p className="text-sm">{p.shortDescription}</p>
        </Card>
      )}
    </div>
  );
}
