"use client";

/**
 * Leads — modern workspace.
 *
 * Two view modes:
 *   - "list"   — workspace shell with resizable list+preview (default)
 *   - "kanban" — pipeline columns (FR-3.10), grouped by stage
 *
 * Inline-edit: status, score, and assignment-source are common quick-edits.
 * The full edit form lives at /real-estate/leads/[id]/edit.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetLeadsQuery, useGetLeadQuery, useUpdateLeadMutation,
} from "@/lib/api/real-estate/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox, Plus, Search, LayoutGrid, List, Phone, Mail,
  Calendar, Flame, Snowflake, Sun, ChevronLeft, ChevronRight,
  ExternalLink, Pencil, Building2,
} from "lucide-react";
import {
  LEAD_PIPELINE, LEAD_STATUS_LABEL, LEAD_STATUS_OPTIONS, LEAD_STATUS_TINT,
  LEAD_STATUS_VARIANT, LEAD_SCORE_LABEL, LEAD_SCORE_VARIANT,
  LEAD_SOURCE_LABEL, LEAD_SOURCE_OPTIONS,
  formatCurrency, formatDate,
} from "@/components/real-estate/constants";
import type { Lead, LeadStatus } from "@/lib/api/real-estate/types";
import {
  WorkspaceShell, WorkspaceHeader,
  DataTable, type ColumnDef,
  FilterChips, ActiveFilterPills,
  ViewsBar, useSavedViews,
  InlineEditCell,
  useLocalStorage,
} from "@/components/real-estate/workspace";

const PAGE_SIZE = 50;

interface Filters {
  search: string;
  status: string;
  score: string;
  source: string;
}
const EMPTY_FILTERS: Filters = { search: "", status: "", score: "", source: "" };

export default function LeadsListPage() {
  const [viewMode, setViewMode] = useLocalStorage<"list" | "kanban">("rebm:leads:view", "list");
  return viewMode === "kanban"
    ? <KanbanView setViewMode={setViewMode} />
    : <ListView setViewMode={setViewMode} />;
}

// ─── List view (workspace shell) ─────────────────────────────────────────────

function ListView({ setViewMode }: { setViewMode: (m: "list" | "kanban") => void }) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const views = useSavedViews<Filters>("leads");

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

  const { data, isLoading, isFetching } = useGetLeadsQuery({
    search: filters.search || undefined,
    status: filters.status || undefined,
    score: filters.score || undefined,
    source: filters.source || undefined,
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
    if (filters.status) pills.push({ key: "status", label: <>Status: <strong>{LEAD_STATUS_LABEL[filters.status as LeadStatus]}</strong></> });
    if (filters.score) pills.push({ key: "score", label: <>Score: <strong>{LEAD_SCORE_LABEL[filters.score as keyof typeof LEAD_SCORE_LABEL]}</strong></> });
    if (filters.source) pills.push({ key: "source", label: <>Source: <strong>{LEAD_SOURCE_LABEL[filters.source as keyof typeof LEAD_SOURCE_LABEL]}</strong></> });
    return pills;
  }, [filters]);

  const [updateLead] = useUpdateLeadMutation();

  const columns: ColumnDef<Lead>[] = useMemo(() => [
    {
      id: "score",
      header: "",
      width: 36,
      pinned: true,
      copyValue: (l) => LEAD_SCORE_LABEL[l.score],
      cell: (l) => <ScoreBadge score={l.score} />,
    },
    {
      id: "name",
      header: "Lead",
      width: 240,
      pinned: true,
      sortKey: "name",
      copyValue: (l) => l.name,
      cell: (l) => (
        <div className="min-w-0">
          <div className="font-medium truncate">{l.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {l.email ?? "—"} · {l.phone ?? "—"}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Stage",
      width: 170,
      sortKey: "status",
      copyValue: (l) => LEAD_STATUS_LABEL[l.status],
      cell: (l) => (
        <InlineEditCell<LeadStatus>
          mode="select"
          value={l.status}
          stopRowClick
          options={LEAD_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          render={(v) => (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: LEAD_STATUS_TINT[v] }} />
              <Badge variant={LEAD_STATUS_VARIANT[v]} className="text-[10px]">
                {LEAD_STATUS_LABEL[v]}
              </Badge>
            </span>
          )}
          onSave={async (next) => {
            try {
              await updateLead({ id: l.id, body: { status: next as any } }).unwrap();
            } catch (e: any) {
              toast({ title: "Update failed", description: e?.data?.error ?? e?.message, variant: "destructive" });
              throw e;
            }
          }}
        />
      ),
    },
    {
      id: "budget",
      header: "Budget",
      width: 160,
      align: "right",
      copyValue: (l) => l.budgetMin && l.budgetMax
        ? `${l.budgetMin}-${l.budgetMax}`
        : l.budgetMax ? `<=${l.budgetMax}`
        : l.budgetMin ? `>=${l.budgetMin}` : "",
      cell: (l) => (
        <span className="text-xs tabular-nums">
          {l.budgetMin && l.budgetMax
            ? `${formatCurrency(l.budgetMin)} – ${formatCurrency(l.budgetMax)}`
            : l.budgetMax ? `≤${formatCurrency(l.budgetMax)}`
            : l.budgetMin ? `≥${formatCurrency(l.budgetMin)}`
            : "—"}
        </span>
      ),
    },
    {
      id: "city",
      header: "City",
      width: 140,
      copyValue: (l) => l.preferredCities[0] ?? "",
      cell: (l) => (
        <span className="text-xs truncate">{l.preferredCities[0] ?? "—"}</span>
      ),
    },
    {
      id: "source",
      header: "Source",
      width: 110,
      defaultHidden: false,
      copyValue: (l) => LEAD_SOURCE_LABEL[l.source],
      cell: (l) => <Badge variant="outline" className="text-[10px]">{LEAD_SOURCE_LABEL[l.source]}</Badge>,
    },
    {
      id: "followup",
      header: "Follow-up",
      width: 120,
      sortKey: "nextFollowUpAt",
      copyValue: (l) => formatDate(l.nextFollowUpAt),
      cell: (l) => {
        if (!l.nextFollowUpAt) return <span className="text-xs text-muted-foreground">—</span>;
        const due = new Date(l.nextFollowUpAt);
        const overdue = due < new Date();
        return (
          <span className={"text-xs tabular-nums " + (overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
            <Calendar className="h-3 w-3 inline mr-0.5" />
            {formatDate(l.nextFollowUpAt)}
          </span>
        );
      },
    },
    {
      id: "lastContacted",
      header: "Last contact",
      width: 120,
      defaultHidden: true,
      copyValue: (l) => formatDate(l.lastContactedAt),
      cell: (l) => <span className="text-xs text-muted-foreground">{formatDate(l.lastContactedAt)}</span>,
    },
    {
      id: "createdAt",
      header: "Created",
      width: 110,
      defaultHidden: true,
      sortKey: "createdAt",
      copyValue: (l) => formatDate(l.createdAt),
      cell: (l) => <span className="text-xs text-muted-foreground">{formatDate(l.createdAt)}</span>,
    },
  ], [updateLead, toast]);

  return (
    <WorkspaceShell
      scope="leads"
      selectedId={selectedId}
      onCloseSelection={() => setSelectedId(null)}
      header={
        <>
          <WorkspaceHeader
            icon={<Inbox className="h-4 w-4" />}
            title="Leads"
            subtitle={`${total.toLocaleString()} lead${total === 1 ? "" : "s"}${isFetching ? " · syncing…" : ""}`}
          >
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Name, email, phone…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateFilter("search", searchInput.trim());
                  if (e.key === "Escape") { setSearchInput(""); updateFilter("search", ""); }
                }}
                className="pl-8 h-8 w-56 text-sm"
              />
            </div>
            <div className="flex border rounded-md p-0.5 bg-muted/30">
              <Button
                variant={"secondary"}
                size="sm"
                className="h-7 px-2"
                aria-pressed
                disabled
              >
                <List className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewMode("kanban")}>
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button asChild size="sm" className="h-8">
              <Link href="/real-estate/leads/new"><Plus className="h-3.5 w-3.5 mr-1" /> Capture lead</Link>
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
              label="Stage"
              value={filters.status}
              onChange={(v) => updateFilter("status", v)}
              options={LEAD_STATUS_OPTIONS.map((o) => ({
                value: o.value, label: o.label, tint: LEAD_STATUS_TINT[o.value as LeadStatus],
              }))}
            />
            <FilterChips
              label="Score"
              value={filters.score}
              onChange={(v) => updateFilter("score", v)}
              options={[
                { value: "HOT", label: "Hot" },
                { value: "WARM", label: "Warm" },
                { value: "COLD", label: "Cold" },
              ]}
            />
            <Select value={filters.source || "ALL"} onValueChange={(v) => updateFilter("source", v === "ALL" ? "" : v)}>
              <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All sources</SelectItem>
                {LEAD_SOURCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <DataTable<Lead>
              tableId="rebm-leads"
              columns={columns}
              rows={items}
              rowId={(l) => l.id}
              isLoading={isLoading}
              selectedId={selectedId}
              onRowClick={(l) => setSelectedId(l.id)}
              emptyState={
                <div className="py-10">
                  <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p>No leads match these filters.</p>
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
      preview={selectedId ? <LeadPreview id={selectedId} /> : null}
      previewHeader={selectedId ? <LeadPreviewHeader id={selectedId} /> : null}
    />
  );
}

function ScoreBadge({ score }: { score: Lead["score"] }) {
  const Icon = score === "HOT" ? Flame : score === "WARM" ? Sun : Snowflake;
  const cls = score === "HOT" ? "text-destructive" : score === "WARM" ? "text-amber-500" : "text-sky-500";
  return (
    <div className="h-7 w-7 rounded-full bg-muted/60 flex items-center justify-center">
      <Icon className={"h-3.5 w-3.5 " + cls} aria-label={LEAD_SCORE_LABEL[score]} />
    </div>
  );
}

function LeadPreviewHeader({ id }: { id: string }) {
  const { data } = useGetLeadQuery(id);
  const l = data?.data;
  if (!l) return <Skeleton className="h-5 w-40" />;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <ScoreBadge score={l.score} />
      <span className="font-semibold truncate text-sm">{l.name}</span>
      <Badge variant={LEAD_STATUS_VARIANT[l.status]} className="text-[10px] shrink-0">
        {LEAD_STATUS_LABEL[l.status]}
      </Badge>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/real-estate/leads/${l.id}`} title="Open full page">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0">
        <Link href={`/real-estate/leads/${l.id}/edit`} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function LeadPreview({ id }: { id: string }) {
  const { data, isLoading } = useGetLeadQuery(id);
  const l = data?.data;

  if (isLoading || !l) {
    return (
      <div className="p-4 sm:p-5 space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 space-y-5 max-w-2xl mx-auto">
      <div>
        <h2 className="text-xl font-bold">{l.name}</h2>
        <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
          {l.email && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {l.email}</div>}
          {l.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {l.phone}</div>}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Badge variant={LEAD_STATUS_VARIANT[l.status]} className="text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full mr-1" style={{ backgroundColor: LEAD_STATUS_TINT[l.status] }} />
            {LEAD_STATUS_LABEL[l.status]}
          </Badge>
          <Badge variant={LEAD_SCORE_VARIANT[l.score]} className="text-[10px]">
            {LEAD_SCORE_LABEL[l.score]}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{LEAD_SOURCE_LABEL[l.source]}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Budget"
          value={l.budgetMin && l.budgetMax
            ? `${formatCurrency(l.budgetMin)} – ${formatCurrency(l.budgetMax)}`
            : l.budgetMax ? `≤${formatCurrency(l.budgetMax)}`
            : l.budgetMin ? `≥${formatCurrency(l.budgetMin)}`
            : "—"}
        />
        <Fact label="Bedrooms (min)" value={l.bedroomsMin != null ? `${l.bedroomsMin}+` : "—"} />
        <Fact label="Next follow-up" icon={Calendar} value={formatDate(l.nextFollowUpAt)} />
        <Fact label="Last contact" icon={Calendar} value={formatDate(l.lastContactedAt)} />
      </div>

      {l.preferredCities.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Preferred cities</div>
          <div className="flex flex-wrap gap-1.5">
            {l.preferredCities.map((c) => (
              <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
            ))}
          </div>
        </div>
      )}

      {l.propertyTypes.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Property types</div>
          <div className="flex flex-wrap gap-1.5">
            {l.propertyTypes.map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
            ))}
          </div>
        </div>
      )}

      {l.notes && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Notes</div>
          <p className="text-sm leading-relaxed whitespace-pre-line">{l.notes}</p>
        </Card>
      )}

      {(l as any).activities && (l as any).activities.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Recent activity</div>
          <ul className="space-y-1.5 text-sm">
            {(l as any).activities.slice(0, 5).map((act: any) => (
              <li key={act.id} className="flex items-start gap-2">
                <span className="text-muted-foreground tabular-nums shrink-0 text-xs mt-0.5">{formatDate(act.occurredAt)}</span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium">{act.type}</span>
                  {act.subject && <> — {act.subject}</>}
                </span>
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

// ─── Kanban view ─────────────────────────────────────────────────────────────

function KanbanView({ setViewMode }: { setViewMode: (m: "list" | "kanban") => void }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useGetLeadsQuery({
    search: search || undefined,
    limit: 200,
  });

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const grouped = useMemo(() => {
    const m = new Map<LeadStatus, Lead[]>();
    LEAD_PIPELINE.forEach((s) => m.set(s, []));
    for (const l of items) {
      const list = m.get(l.status) ?? [];
      list.push(l);
      m.set(l.status, list);
    }
    return m;
  }, [items]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-[100rem]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" />
            Leads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} lead{total === 1 ? "" : "s"} · pipeline view
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search leads…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput.trim())}
              className="pl-8 h-8 w-56 text-sm"
            />
          </div>
          <div className="flex border rounded-md p-0.5 bg-muted/30">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewMode("list")}>
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button variant="secondary" size="sm" className="h-7 px-2" disabled aria-pressed>
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button asChild size="sm" className="h-8">
            <Link href="/real-estate/leads/new"><Plus className="h-3.5 w-3.5 mr-1" /> Capture</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3 lg:grid-cols-7">
          {LEAD_PIPELINE.map((s) => <Skeleton key={s} className="h-72" />)}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3 lg:grid-cols-7">
          {LEAD_PIPELINE.map((status) => {
            const list = grouped.get(status) ?? [];
            return (
              <div key={status} className="rounded-lg bg-muted/30 flex flex-col min-h-[300px]">
                <div className="px-3 py-2 border-b flex items-center justify-between sticky top-0 bg-muted/50 backdrop-blur rounded-t-lg">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LEAD_STATUS_TINT[status] }} />
                    {LEAD_STATUS_LABEL[status]}
                  </div>
                  <Badge variant="secondary" className="text-[10px] tabular-nums">{list.length}</Badge>
                </div>
                <div className="p-2 flex-1 space-y-2 overflow-auto max-h-[70vh]">
                  {list.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground text-center py-6">—</div>
                  ) : (
                    list.map((l) => (
                      <Link key={l.id} href={`/real-estate/leads/${l.id}`}>
                        <Card className="p-2.5 hover:shadow-md transition-shadow group cursor-pointer">
                          <div className="flex items-start gap-2">
                            <ScoreBadge score={l.score} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{l.name}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {l.budgetMax ? formatCurrency(l.budgetMax) : "—"} · {l.preferredCities[0] ?? "—"}
                              </div>
                              {l.nextFollowUpAt && (
                                <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                  <Calendar className="h-2.5 w-2.5" />
                                  {formatDate(l.nextFollowUpAt)}
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
