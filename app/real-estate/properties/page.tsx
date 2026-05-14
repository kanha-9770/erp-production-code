"use client";

/**
 * Properties — modern workspace.
 *
 * Layout: resizable list-and-preview shell. Click a row → preview slides in.
 * Persists pane sizes, column visibility/sort, and saved filter views per
 * user.
 *
 * Inline-edit: only `status` is editable from the list, since price change
 * requires a "reason" by FR-1 and that's a poor inline-edit fit. For the
 * full edit form, click "Open" in the preview pane.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetPropertiesQuery,
  useGetPropertyQuery,
  useUpdatePropertyMutation,
} from "@/lib/api/real-estate/properties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Building2, Plus, Search, MapPin, Bed, Bath, Maximize, ImageOff,
  ChevronLeft, ChevronRight, ExternalLink, Pencil, Calendar, Coins,
} from "lucide-react";
import {
  PROPERTY_STATUS_LABEL, PROPERTY_STATUS_OPTIONS, PROPERTY_STATUS_VARIANT,
  PROPERTY_TYPE_LABEL, PROPERTY_TYPE_OPTIONS,
  PROPERTY_SUBTYPE_LABEL, formatCurrency, formatDate,
} from "@/components/real-estate/constants";
import {
  WorkspaceShell, WorkspaceHeader,
  DataTable, type ColumnDef,
  FilterChips, ActiveFilterPills,
  ViewsBar, useSavedViews,
  InlineEditCell,
  AdvancedFilter, applyAdvancedFilters,
  type FilterField, type FilterCondition,
  ManageColumnsButton,
} from "@/components/real-estate/workspace";
import type { Property } from "@/lib/api/real-estate/types";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 50;

interface Filters {
  search: string;
  status: string;
  type: string;
  city: string;
  minPrice: string;
  maxPrice: string;
}

const EMPTY_FILTERS: Filters = {
  search: "", status: "", type: "", city: "", minPrice: "", maxPrice: "",
};

export default function PropertiesListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Multi-condition filter applied client-side on top of the server's
  // page slice. Persisted in localStorage so refresh doesn't lose it.
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const views = useSavedViews<Filters>("properties");

  // Load active view's filters when switched.
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

  const { data, isLoading, isFetching } = useGetPropertiesQuery({
    search: filters.search || undefined,
    type: filters.type || undefined,
    status: filters.status || undefined,
    city: filters.city || undefined,
    minPrice: filters.minPrice || undefined,
    maxPrice: filters.maxPrice || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const rawItems = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Filter the server-paginated page locally with the AdvancedFilter
  // conditions. `filterFields` is defined further down and is stable
  // (useMemo with `[]`), so this is cheap.

  const isDirty = useMemo(() => {
    if (views.activeId == null) {
      return Object.values(filters).some(Boolean);
    }
    const active = views.views.find((v) => v.id === views.activeId);
    if (!active) return true;
    return JSON.stringify(active.filters) !== JSON.stringify(filters);
  }, [filters, views.activeId, views.views]);

  const activeFilterPills = useMemo(() => {
    const pills: Array<{ key: string; label: React.ReactNode }> = [];
    if (filters.search) pills.push({ key: "search", label: <>Search: <strong>{filters.search}</strong></> });
    if (filters.status) pills.push({ key: "status", label: <>Status: <strong>{PROPERTY_STATUS_LABEL[filters.status as keyof typeof PROPERTY_STATUS_LABEL]}</strong></> });
    if (filters.type) pills.push({ key: "type", label: <>Type: <strong>{PROPERTY_TYPE_LABEL[filters.type as keyof typeof PROPERTY_TYPE_LABEL]}</strong></> });
    if (filters.city) pills.push({ key: "city", label: <>City: <strong>{filters.city}</strong></> });
    if (filters.minPrice) pills.push({ key: "minPrice", label: <>Min ₹{Number(filters.minPrice).toLocaleString()}</> });
    if (filters.maxPrice) pills.push({ key: "maxPrice", label: <>Max ₹{Number(filters.maxPrice).toLocaleString()}</> });
    return pills;
  }, [filters]);

  const [updateProperty] = useUpdatePropertyMutation();

  // Filter fields exposed to the AdvancedFilter popover. The id strings
  // line up with Property property names where possible so the default
  // `row[id]` accessor works; the `getValue` overrides handle derived
  // fields (price-as-number, etc).
  const filterFields: FilterField[] = useMemo(
    () => [
      { id: "title", label: "Title", type: "text" },
      { id: "code", label: "Code", type: "text" },
      {
        id: "status",
        label: "Status",
        type: "select",
        options: PROPERTY_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      },
      {
        id: "type",
        label: "Type",
        type: "select",
        options: PROPERTY_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      },
      { id: "city", label: "City", type: "text" },
      { id: "state", label: "State", type: "text" },
      {
        id: "listingPrice",
        label: "Price",
        type: "number",
        getValue: (p: Property) => Number(p.listingPrice ?? 0),
      },
      { id: "bedrooms", label: "Bedrooms", type: "number" },
      { id: "bathrooms", label: "Bathrooms", type: "number" },
      { id: "area", label: "Area", type: "number" },
      { id: "listedAt", label: "Listed on", type: "date" },
      { id: "expectedClosingAt", label: "Expected close", type: "date" },
    ],
    [],
  );

  // Final rows handed to DataTable — server-paginated slice with the
  // AdvancedFilter conditions applied on top.
  const items = useMemo(
    () => applyAdvancedFilters(rawItems, conditions, filterFields),
    [rawItems, conditions, filterFields],
  );

  const columns: ColumnDef<Property>[] = useMemo(() => [
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
      id: "title",
      header: "Property",
      width: 280,
      pinned: true,
      sortKey: "title",
      copyValue: (p) => p.code ? `${p.title} (${p.code})` : p.title,
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-medium truncate">{p.title}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {p.code ?? "—"} · {PROPERTY_TYPE_LABEL[p.type]}
            {p.subType ? ` · ${PROPERTY_SUBTYPE_LABEL[p.subType]}` : ""}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      width: 140,
      sortKey: "status",
      copyValue: (p) => PROPERTY_STATUS_LABEL[p.status],
      cell: (p) => (
        <InlineEditCell<typeof p.status>
          mode="select"
          value={p.status}
          stopRowClick
          options={PROPERTY_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          render={(v) => (
            <Badge variant={PROPERTY_STATUS_VARIANT[v]} className="text-[10px]">
              {PROPERTY_STATUS_LABEL[v]}
            </Badge>
          )}
          onSave={async (next) => {
            try {
              await updateProperty({ id: p.id, body: { status: next as any } }).unwrap();
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
      sortKey: "listingPrice",
      copyValue: (p) => String(p.listingPrice),
      cell: (p) => <span className="font-semibold">{formatCurrency(p.listingPrice, p.currency)}</span>,
    },
    {
      id: "city",
      header: "City",
      width: 140,
      sortKey: "city",
      copyValue: (p) => [p.city, p.state].filter(Boolean).join(", "),
      cell: (p) => (
        <span className="inline-flex items-center gap-1 text-sm">
          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="truncate">{p.city}{p.state ? `, ${p.state}` : ""}</span>
        </span>
      ),
    },
    {
      id: "specs",
      header: "Specs",
      width: 140,
      copyValue: (p) => [
        p.bedrooms != null ? `${p.bedrooms}BR` : null,
        p.bathrooms != null ? `${p.bathrooms}BA` : null,
        p.area != null ? `${p.area}${p.areaUnit ?? ""}` : null,
      ].filter(Boolean).join(" / "),
      cell: (p) => (
        <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
          {p.bedrooms != null && (
            <span className="inline-flex items-center gap-0.5"><Bed className="h-3 w-3" />{p.bedrooms}</span>
          )}
          {p.bathrooms != null && (
            <span className="inline-flex items-center gap-0.5"><Bath className="h-3 w-3" />{p.bathrooms}</span>
          )}
          {p.area != null && (
            <span className="inline-flex items-center gap-0.5">
              <Maximize className="h-3 w-3" />
              {p.area}{p.areaUnit ? ` ${p.areaUnit}` : ""}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "listedAt",
      header: "Listed",
      width: 110,
      // Default-hidden so the table opens with ~6 columns. User can flip
      // it on from the Columns popover.
      defaultHidden: true,
      sortKey: "listedAt",
      copyValue: (p) => formatDate(p.listedAt),
      cell: (p) => <span className="text-xs text-muted-foreground">{formatDate(p.listedAt)}</span>,
    },
    {
      id: "expectedClosing",
      header: "Expected close",
      width: 130,
      defaultHidden: true,
      copyValue: (p) => formatDate(p.expectedClosingAt),
      cell: (p) => <span className="text-xs text-muted-foreground">{formatDate(p.expectedClosingAt)}</span>,
    },
    {
      id: "commission",
      header: "Commission",
      width: 130,
      defaultHidden: true,
      align: "right",
      copyValue: (p) =>
        p.commissionTermType === "PERCENTAGE"
          ? `${p.commissionPercentage ?? 0}%`
          : String(p.commissionFlatFee ?? 0),
      cell: (p) =>
        p.commissionTermType === "PERCENTAGE"
          ? <span className="text-xs tabular-nums">{p.commissionPercentage ?? 0}%</span>
          : <span className="text-xs tabular-nums">{formatCurrency(p.commissionFlatFee ?? 0, p.currency)}</span>,
    },
    {
      id: "_count",
      header: "Activity",
      width: 110,
      defaultHidden: true,
      copyValue: (p) => `${p._count?.images ?? 0} images, ${p._count?.viewings ?? 0} viewings`,
      cell: (p) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {p._count?.images ?? 0}img · {p._count?.viewings ?? 0}views
        </span>
      ),
    },
  ], [updateProperty, toast]);

  return (
    <WorkspaceShell
      scope="properties"
      selectedId={selectedId}
      onCloseSelection={() => setSelectedId(null)}
      header={
        <>
          <WorkspaceHeader
            icon={<Building2 className="h-4 w-4" />}
            title="Properties"
            subtitle={`${total.toLocaleString()} listing${total === 1 ? "" : "s"}${isFetching ? " · syncing…" : ""}`}
          >
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search title, code, address…"
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
            <AdvancedFilter
              fields={filterFields}
              value={conditions}
              onChange={setConditions}
            />
            <ManageColumnsButton tableId="rebm-properties" columns={columns} />
            <Button asChild size="sm" className="h-8">
              <Link href="/real-estate/properties/new">
                <Plus className="h-3.5 w-3.5 mr-1" /> New listing
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
              options={PROPERTY_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <FilterChips
              label="Type"
              value={filters.type}
              onChange={(v) => updateFilter("type", v)}
              options={PROPERTY_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <div className="flex items-center gap-1">
              <Input
                placeholder="City"
                value={filters.city}
                onChange={(e) => updateFilter("city", e.target.value)}
                className="h-7 w-24 text-xs"
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
            </div>
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
            <DataTable<Property>
              tableId="rebm-properties"
              columns={columns}
              rows={items}
              rowId={(p) => p.id}
              isLoading={isLoading}
              selectedId={selectedId}
              onRowClick={(p) => setSelectedId(p.id)}
              emptyState={
                <div className="py-10">
                  <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p>No properties match these filters.</p>
                  <Button variant="link" size="sm" onClick={() => { setFilters(EMPTY_FILTERS); setSearchInput(""); }}>
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
      preview={selectedId ? <PropertyPreview id={selectedId} /> : null}
      previewHeader={selectedId ? <PreviewHeader id={selectedId} /> : null}
    />
  );
}

function PreviewHeader({ id }: { id: string }) {
  const { data } = useGetPropertyQuery(id);
  const p = data?.data;
  if (!p) return <Skeleton className="h-5 w-40" />;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Badge variant={PROPERTY_STATUS_VARIANT[p.status]} className="text-[10px] shrink-0">
        {PROPERTY_STATUS_LABEL[p.status]}
      </Badge>
      <span className="font-semibold truncate text-sm">{p.title}</span>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/real-estate/properties/${p.id}`} title="Open full page">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0">
        <Link href={`/real-estate/properties/${p.id}/edit`} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function PropertyPreview({ id }: { id: string }) {
  const { data, isLoading } = useGetPropertyQuery(id);
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

  return (
    <div className="p-4 sm:p-5 space-y-5 max-w-2xl mx-auto">
      <div className="aspect-[16/9] bg-muted rounded-lg overflow-hidden">
        {p.primaryImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.primaryImageUrl} alt={p.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff className="h-10 w-10 text-muted-foreground/40" />
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-bold">{p.title}</h2>
        <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
          <MapPin className="h-3.5 w-3.5" />
          {[p.addressLine1, p.city, p.state].filter(Boolean).join(", ")}
        </div>
        <div className="text-3xl font-bold tabular-nums mt-3">
          {formatCurrency(p.listingPrice, p.currency)}
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground tabular-nums">
          {p.bedrooms != null && <span className="flex items-center gap-1"><Bed className="h-4 w-4" />{p.bedrooms}</span>}
          {p.bathrooms != null && <span className="flex items-center gap-1"><Bath className="h-4 w-4" />{p.bathrooms}</span>}
          {p.area != null && <span className="flex items-center gap-1"><Maximize className="h-4 w-4" />{p.area}{p.areaUnit ? ` ${p.areaUnit}` : ""}</span>}
          {p.parkingSpots != null && <span>{p.parkingSpots} parking</span>}
        </div>
      </div>

      {/* Key details grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Type" value={`${PROPERTY_TYPE_LABEL[p.type]}${p.subType ? ` · ${PROPERTY_SUBTYPE_LABEL[p.subType]}` : ""}`} />
        <Fact label="Code" value={p.code ?? "—"} />
        <Fact label="Listed" icon={Calendar} value={formatDate(p.listedAt)} />
        <Fact label="Expected close" icon={Calendar} value={formatDate(p.expectedClosingAt)} />
        <Fact label="Commission" icon={Coins}
          value={p.commissionTermType === "PERCENTAGE"
            ? `${p.commissionPercentage ?? 0}%`
            : formatCurrency(p.commissionFlatFee ?? 0, p.currency)}
        />
        {p.yearBuilt != null && <Fact label="Year built" value={String(p.yearBuilt)} />}
      </div>

      {p.description && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Description</div>
          <p className="text-sm leading-relaxed whitespace-pre-line">{p.description}</p>
        </Card>
      )}

      {p.priceHistory.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Price history</div>
          <ul className="text-sm space-y-1.5">
            {p.priceHistory.slice(0, 5).map((h) => (
              <li key={h.id} className="flex items-center justify-between">
                <span className="text-muted-foreground">{formatDate(h.changedAt)}</span>
                <span className="tabular-nums">
                  {formatCurrency(h.oldPrice, p.currency)} → {formatCurrency(h.newPrice, p.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.viewings.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Recent viewings
          </div>
          <ul className="space-y-1 text-sm">
            {p.viewings.slice(0, 3).map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{v.lead.name}</span>
                <span className="text-muted-foreground tabular-nums shrink-0">{formatDate(v.scheduledAt)}</span>
              </li>
            ))}
          </ul>
        </div>
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
