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
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  useGetLeadsQuery, useGetLeadQuery, useUpdateLeadMutation, useClaimLeadMutation,
  useGetLeadDuplicatesQuery,
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
  ExternalLink, Pencil, Building2, ShieldAlert,
  AlertCircle, TrendingUp, Target, Users as UsersIcon, GripVertical,
  Coins,
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
  AdvancedFilter, applyAdvancedFilters,
  type FilterField, type FilterCondition,
  ManageColumnsButton,
} from "@/components/real-estate/workspace";

const PAGE_SIZE = 50;

interface Filters {
  search: string;
  status: string;
  score: string;
  source: string;
  /** "mine" | "company" | "all" — toggles between the agent's own leads
   *  and the company pool. Defaults to "mine" so agents land on their
   *  own work first. */
  pool: "mine" | "company" | "all";
}
const EMPTY_FILTERS: Filters = {
  search: "", status: "", score: "", source: "", pool: "mine",
};

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
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

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
    pool: filters.pool,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const rawItems = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filterFields: FilterField[] = useMemo(
    () => [
      { id: "name", label: "Name", type: "text" },
      { id: "email", label: "Email", type: "text" },
      { id: "phone", label: "Phone", type: "text" },
      {
        id: "status",
        label: "Stage",
        type: "select",
        options: LEAD_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      },
      {
        id: "score",
        label: "Score",
        type: "select",
        options: [
          { value: "HOT", label: "Hot" },
          { value: "WARM", label: "Warm" },
          { value: "COLD", label: "Cold" },
        ],
      },
      {
        id: "source",
        label: "Source",
        type: "select",
        options: LEAD_SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      },
      {
        id: "city",
        label: "Preferred city",
        type: "text",
        getValue: (l: Lead) => l.preferredCities?.[0] ?? "",
      },
      { id: "budgetMin", label: "Budget min", type: "number" },
      { id: "budgetMax", label: "Budget max", type: "number" },
      { id: "nextFollowUpAt", label: "Next follow-up", type: "date" },
      { id: "lastContactedAt", label: "Last contact", type: "date" },
      { id: "createdAt", label: "Created", type: "date" },
    ],
    [],
  );

  const items = useMemo(
    () => applyAdvancedFilters(rawItems, conditions, filterFields),
    [rawItems, conditions, filterFields],
  );

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
  const [claimLead, { isLoading: isClaiming }] = useClaimLeadMutation();

  // Admin-only convenience: query the duplicate-review endpoint to
  // surface a "Duplicates (N)" badge in the header that jumps straight
  // to /real-estate/admin/duplicates.
  //
  // The endpoint enforces the admin gate server-side. For regular
  // agents the request comes back 403 → `data` stays undefined →
  // `canSeeDuplicates` is false → button hidden. Safe to call from
  // every leads-list render.
  const dupsQ = useGetLeadDuplicatesQuery();
  const duplicateCount =
    dupsQ.data?.data.reduce((n, g) => n + g.duplicates.length, 0) ?? 0;
  const canSeeDuplicates = Boolean(dupsQ.data);

  const handleClaim = async (id: string) => {
    try {
      await claimLead(id).unwrap();
      toast({ title: "Lead claimed", description: "This lead is now assigned to you." });
    } catch (e: any) {
      toast({
        title: "Could not claim lead",
        description: e?.data?.error ?? e?.message,
        variant: "destructive",
      });
    }
  };

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
      defaultHidden: true,
      copyValue: (l) => LEAD_SOURCE_LABEL[l.source],
      cell: (l) => <Badge variant="outline" className="text-[10px]">{LEAD_SOURCE_LABEL[l.source]}</Badge>,
    },
    {
      id: "origin",
      header: "Origin",
      width: 130,
      copyValue: (l) => (l.origin === "COMPANY" ? "Company pool" : "Agent"),
      cell: (l) => {
        const isCompany = l.origin === "COMPANY";
        const isUnclaimed = isCompany && !l.assignedAgentId;
        return (
          <div className="flex items-center gap-1.5">
            <Badge
              variant={isCompany ? "secondary" : "outline"}
              className="text-[10px]"
            >
              {isCompany ? "Company pool" : "Agent"}
            </Badge>
            {isUnclaimed && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                disabled={isClaiming}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClaim(l.id);
                }}
              >
                Claim
              </Button>
            )}
          </div>
        );
      },
    },
    {
      id: "followup",
      header: "Follow-up",
      width: 120,
      // Keep follow-up visible by default — it's the action column most reps
      // open the leads list for.
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
            {/* Pool selector — toggles between the agent's own leads
                and the company pool. Admin/MD callers can still see
                "All" to get the unified view. */}
            <div className="flex border rounded-md p-0.5 bg-muted/30 text-xs">
              {(["mine", "company", "all"] as const).map((p) => {
                const label = p === "mine" ? "Mine" : p === "company" ? "Company pool" : "All";
                const isActive = filters.pool === p;
                return (
                  <Button
                    key={p}
                    type="button"
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2.5 text-[11px]"
                    aria-pressed={isActive}
                    onClick={() => updateFilter("pool", p)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
            <AdvancedFilter
              fields={filterFields}
              value={conditions}
              onChange={setConditions}
            />
            <ManageColumnsButton tableId="rebm-leads" columns={columns} />
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
            {canSeeDuplicates && (
              <Button
                asChild
                variant={duplicateCount > 0 ? "outline" : "ghost"}
                size="sm"
                className="h-8"
                title="Review silently-flagged duplicate leads (admin only)"
              >
                <Link href="/real-estate/admin/duplicates">
                  <ShieldAlert className="h-3.5 w-3.5 mr-1.5 opacity-70" />
                  Duplicates
                  {duplicateCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1.5 h-4 min-w-4 px-1 text-[10px] font-semibold"
                    >
                      {duplicateCount}
                    </Badge>
                  )}
                </Link>
              </Button>
            )}
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

// ─── Kanban view ────────────────────────────────────────────────────────────
//
// Pipeline-shaped leads board with:
//   - Drag-and-drop between stages (mouse + touch + keyboard). The drop
//     fires an optimistic updateLead mutation; toast on failure.
//   - KPI strip across the top (total · hot · overdue · pipeline value
//     · avg deal). Computed from the SAME slice we render.
//   - Inline filters: pool toggle (Mine / Company / All), score chips,
//     and a debounced search input matching the list view.
//   - Per-column header with status dot, count, and Σ budget for the
//     column — owners can see "how much money is parked in Negotiating"
//     at a glance.
//   - Score-coloured stripe down the left of each card. Phone / email
//     icons, follow-up badge that flips red when overdue, source pill.
//
// Responsive strategy:
//   - On every viewport the columns share a single horizontal scroll
//     container with `snap-x` so the user can flick across stages. That
//     scales from a 320px phone to a 4K monitor without re-layout
//     gymnastics, and beats the 7-col grid that crammed unreadable
//     30-px-wide cards on tablets.
//   - On xl+ screens (≥ 1280 px) we widen each column from 280→320 px
//     so the full pipeline fits without scrolling for most agents.

interface KanbanColumnMeta {
  status: LeadStatus;
  leads: Lead[];
  pipelineValue: number;
}

function KanbanView({ setViewMode }: { setViewMode: (m: "list" | "kanban") => void }) {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  // Same query the list view uses — pool / search / score / source all
  // apply server-side so the Kanban reflects exactly what the agent
  // would see in the list. `limit: 250` keeps the board snappy even
  // on huge pipelines; the user can narrow with filters if they need
  // to see more.
  const { data, isLoading, isFetching } = useGetLeadsQuery({
    search: filters.search || undefined,
    score: filters.score || undefined,
    source: filters.source || undefined,
    pool: filters.pool,
    limit: 250,
  });

  const [updateLead] = useUpdateLeadMutation();

  // Optimistic move state — when the user drops a lead onto a new
  // column we shove it into `overrides` so the UI updates instantly,
  // then issue the PUT in the background. On failure we revert.
  const [overrides, setOverrides] = useState<Record<string, LeadStatus>>({});
  // Currently-dragged lead — used by DragOverlay so the floating card
  // looks identical to the source card on every browser.
  const [draggingLead, setDraggingLead] = useState<Lead | null>(null);

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  // Apply overrides to the server slice before grouping.
  const displayLeads = useMemo(
    () =>
      items.map((l) =>
        overrides[l.id] && overrides[l.id] !== l.status
          ? { ...l, status: overrides[l.id] }
          : l,
      ),
    [items, overrides],
  );

  const columns: KanbanColumnMeta[] = useMemo(() => {
    const buckets = new Map<LeadStatus, Lead[]>();
    LEAD_PIPELINE.forEach((s) => buckets.set(s, []));
    for (const l of displayLeads) {
      const arr = buckets.get(l.status);
      if (arr) arr.push(l);
    }
    return LEAD_PIPELINE.map((status) => {
      const leads = buckets.get(status) ?? [];
      const pipelineValue = leads.reduce(
        (acc, l) => acc + (l.budgetMax ?? l.budgetMin ?? 0),
        0,
      );
      return { status, leads, pipelineValue };
    });
  }, [displayLeads]);

  // ── KPI strip ──────────────────────────────────────────────────────
  const now = Date.now();
  const kpi = useMemo(() => {
    let hot = 0;
    let overdue = 0;
    let activeValue = 0;
    let activeCount = 0;
    for (const l of displayLeads) {
      if (l.score === "HOT") hot += 1;
      if (l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() < now) overdue += 1;
      // "Active" = anything not Converted/Lost — those don't represent
      // open opportunity any more.
      if (l.status !== "CONVERTED" && l.status !== "LOST") {
        const v = l.budgetMax ?? l.budgetMin ?? 0;
        activeValue += v;
        if (v > 0) activeCount += 1;
      }
    }
    const avg = activeCount > 0 ? activeValue / activeCount : 0;
    return { hot, overdue, activeValue, avg };
  }, [displayLeads, now]);

  // ── DnD setup ──────────────────────────────────────────────────────
  // PointerSensor with a 4px activation distance prevents accidental
  // drags when the user just clicks the card to open it. TouchSensor
  // mirrors that with a longer delay so swiping the horizontal column
  // strip on mobile doesn't grab a card.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    const lead = displayLeads.find((l) => l.id === id) ?? null;
    setDraggingLead(lead);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setDraggingLead(null);
    const overId = e.over?.id;
    if (!overId) return;
    const next = String(overId) as LeadStatus;
    if (!LEAD_PIPELINE.includes(next)) return;
    const id = String(e.active.id);
    const lead = displayLeads.find((l) => l.id === id);
    if (!lead || lead.status === next) return;

    // CONVERTED requires the /convert endpoint (creates a Buyer). We
    // don't try to do that from a drag-and-drop — surface a hint and
    // bail. Everything else is fair game.
    if (next === "CONVERTED") {
      toast({
        title: "Use Convert to mark as won",
        description: "Drag-and-drop can't create the Buyer record. Open the lead and use Convert.",
      });
      return;
    }

    const previous = lead.status;
    setOverrides((o) => ({ ...o, [id]: next }));
    try {
      await updateLead({ id, body: { status: next } }).unwrap();
      // Clear the override once the cache refresh propagates so we
      // don't keep a stale entry forever.
      setOverrides((o) => {
        const { [id]: _drop, ...rest } = o;
        return rest;
      });
    } catch (err: any) {
      // Revert the optimistic move.
      setOverrides((o) => ({ ...o, [id]: previous }));
      toast({
        title: "Could not move lead",
        description: err?.data?.error ?? err?.message ?? "Try again",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-[100rem]">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" />
            Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} lead{total === 1 ? "" : "s"} on this board
            {isFetching && <span className="ml-1.5 opacity-70">· syncing…</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search leads…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") updateFilter("search", searchInput.trim());
                if (e.key === "Escape") { setSearchInput(""); updateFilter("search", ""); }
              }}
              className="pl-8 h-8 w-48 sm:w-56 text-sm"
            />
          </div>
          <div className="flex border rounded-md p-0.5 bg-muted/30">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewMode("list")} aria-label="List view">
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button variant="secondary" size="sm" className="h-7 px-2" disabled aria-pressed aria-label="Pipeline view">
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button asChild size="sm" className="h-8">
            <Link href="/real-estate/leads/new"><Plus className="h-3.5 w-3.5 mr-1" /> Capture</Link>
          </Button>
        </div>
      </div>

      {/* Filter row — pool / score chips. Source filter intentionally
          omitted to keep the bar tight on mobile; users who need it can
          switch to list view. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border rounded-md p-0.5 bg-muted/30 text-xs">
          {(["mine", "company", "all"] as const).map((p) => {
            const label = p === "mine" ? "Mine" : p === "company" ? "Company pool" : "All";
            const isActive = filters.pool === p;
            return (
              <Button
                key={p}
                type="button"
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                aria-pressed={isActive}
                onClick={() => updateFilter("pool", p)}
              >
                {label}
              </Button>
            );
          })}
        </div>
        <div className="flex border rounded-md p-0.5 bg-muted/30 text-xs">
          {([
            { value: "", label: "Any score" },
            { value: "HOT", label: "Hot", icon: <Flame className="h-3 w-3" /> },
            { value: "WARM", label: "Warm", icon: <Sun className="h-3 w-3" /> },
            { value: "COLD", label: "Cold", icon: <Snowflake className="h-3 w-3" /> },
          ] as const).map((s) => {
            const isActive = filters.score === s.value;
            return (
              <Button
                key={s.value || "any"}
                type="button"
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-[11px] gap-1"
                aria-pressed={isActive}
                onClick={() => updateFilter("score", s.value)}
              >
                {("icon" in s ? s.icon : null) as React.ReactNode}
                {s.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiTile
          icon={<UsersIcon className="h-3.5 w-3.5" />}
          label="Hot leads"
          value={kpi.hot.toLocaleString()}
          tone="rose"
        />
        <KpiTile
          icon={<AlertCircle className="h-3.5 w-3.5" />}
          label="Overdue follow-ups"
          value={kpi.overdue.toLocaleString()}
          tone={kpi.overdue > 0 ? "amber" : "muted"}
        />
        <KpiTile
          icon={<Coins className="h-3.5 w-3.5" />}
          label="Active pipeline ₹"
          value={formatCurrency(kpi.activeValue)}
          tone="indigo"
        />
        <KpiTile
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Avg deal size"
          value={kpi.avg > 0 ? formatCurrency(kpi.avg) : "—"}
          tone="emerald"
        />
      </div>

      {/* The board itself */}
      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {LEAD_PIPELINE.map((s) => (
            <Skeleton key={s} className="h-[60vh] min-w-[280px] xl:min-w-[320px]" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-4 sm:-mx-6 px-4 sm:px-6">
            {columns.map((col) => (
              <KanbanColumn key={col.status} column={col} />
            ))}
          </div>

          <DragOverlay dropAnimation={{ duration: 180 }}>
            {draggingLead ? (
              <div className="w-[280px] xl:w-[300px] rotate-2 opacity-95">
                <KanbanCard lead={draggingLead} isDragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

// ─── Kanban column ──────────────────────────────────────────────────────────

function KanbanColumn({ column }: { column: KanbanColumnMeta }) {
  const { status, leads, pipelineValue } = column;
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const tint = LEAD_STATUS_TINT[status];

  return (
    <div
      ref={setNodeRef}
      className={
        "shrink-0 snap-start w-[80vw] sm:w-[300px] xl:w-[320px] " +
        "rounded-lg border bg-muted/20 flex flex-col max-h-[78vh] " +
        (isOver ? "ring-2 ring-primary/40 bg-primary/5" : "")
      }
    >
      {/* Column header */}
      <div
        className="px-3 py-2 border-b sticky top-0 bg-muted/40 backdrop-blur rounded-t-lg z-10"
        style={{ borderTopColor: tint, borderTopWidth: 2 }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: tint }}
            />
            <span className="text-xs font-semibold truncate">
              {LEAD_STATUS_LABEL[status]}
            </span>
          </div>
          <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0">
            {leads.length}
          </Badge>
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
          {pipelineValue > 0 ? formatCurrency(pipelineValue) : "—"}
        </div>
      </div>

      {/* Cards */}
      <div className="p-2 flex-1 space-y-2 overflow-y-auto">
        {leads.length === 0 ? (
          <div className="text-[11px] text-muted-foreground text-center py-8 italic">
            {isOver ? "Drop here" : "No leads in this stage"}
          </div>
        ) : (
          leads.map((l) => <DraggableKanbanCard key={l.id} lead={l} />)
        )}
      </div>
    </div>
  );
}

// ─── Draggable wrapper around the visual card ──────────────────────────────

function DraggableKanbanCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, isDragging, transform } =
    useDraggable({ id: lead.id });
  // We DO NOT translate the source card while dragging — DragOverlay
  // renders a clone at the cursor, so leaving the source in place keeps
  // the column layout stable. Hide the source instead.
  const style: React.CSSProperties = {
    opacity: isDragging ? 0.35 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <KanbanCard lead={lead} dragListeners={listeners} />
    </div>
  );
}

// ─── Visual card ────────────────────────────────────────────────────────────

function KanbanCard({
  lead,
  isDragging,
  dragListeners,
}: {
  lead: Lead;
  isDragging?: boolean;
  dragListeners?: any;
}) {
  const tint =
    lead.score === "HOT"
      ? "#ef4444"
      : lead.score === "WARM"
        ? "#f59e0b"
        : "#94a3b8";

  const followUpDue = lead.nextFollowUpAt
    ? new Date(lead.nextFollowUpAt)
    : null;
  const isOverdue = !!followUpDue && followUpDue.getTime() < Date.now();
  const isCompanyOrigin = lead.origin === "COMPANY";
  const budgetLabel =
    lead.budgetMin && lead.budgetMax
      ? `${formatCurrency(lead.budgetMin)} – ${formatCurrency(lead.budgetMax)}`
      : lead.budgetMax
        ? `≤ ${formatCurrency(lead.budgetMax)}`
        : lead.budgetMin
          ? `≥ ${formatCurrency(lead.budgetMin)}`
          : null;

  return (
    <Card
      className={
        "relative p-2.5 pl-3 hover:shadow-md transition-shadow group " +
        (isDragging ? "shadow-lg ring-2 ring-primary/30" : "")
      }
    >
      {/* Score stripe down the left edge — instant visual signal */}
      <span
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l"
        style={{ backgroundColor: tint }}
      />

      <div className="flex items-start gap-2">
        {/* Drag handle. Pulled out into its own grip so clicking the
            rest of the card opens it instead of starting a drag. */}
        <button
          type="button"
          aria-label="Drag"
          className="p-0.5 -ml-0.5 mt-0.5 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
          {...(dragListeners ?? {})}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {/* Body — wraps the click-to-open Link so the whole card area
            (other than the grip) navigates to the detail page. */}
        <Link
          href={`/real-estate/leads/${lead.id}`}
          className="flex-1 min-w-0 space-y-1"
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-sm font-medium truncate">{lead.name}</span>
            <ScoreBadge score={lead.score} />
          </div>

          <div className="space-y-0.5 text-[11px] text-muted-foreground">
            {lead.phone && (
              <div className="flex items-center gap-1 min-w-0">
                <Phone className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{lead.phone}</span>
              </div>
            )}
            {lead.email && !lead.phone && (
              <div className="flex items-center gap-1 min-w-0">
                <Mail className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{lead.email}</span>
              </div>
            )}
            {budgetLabel && (
              <div className="flex items-center gap-1 min-w-0 tabular-nums">
                <Coins className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{budgetLabel}</span>
              </div>
            )}
            {lead.preferredCities[0] && (
              <div className="flex items-center gap-1 min-w-0">
                <Building2 className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{lead.preferredCities[0]}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-1.5 pt-0.5">
            {followUpDue ? (
              <span
                className={
                  "inline-flex items-center gap-1 text-[10px] tabular-nums " +
                  (isOverdue ? "text-destructive font-medium" : "text-muted-foreground")
                }
              >
                <Calendar className="h-2.5 w-2.5" />
                {isOverdue ? "Overdue · " : ""}
                {formatDate(lead.nextFollowUpAt)}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground italic">
                No follow-up
              </span>
            )}
            {isCompanyOrigin && (
              <Badge variant="outline" className="text-[9px] h-4 px-1">
                Pool
              </Badge>
            )}
          </div>
        </Link>
      </div>
    </Card>
  );
}

// ─── KPI tile ──────────────────────────────────────────────────────────────

function KpiTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "rose" | "amber" | "indigo" | "emerald" | "muted";
}) {
  const toneClass = {
    rose: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/40",
    amber: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/40",
    indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:ring-indigo-900/40",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/40",
    muted: "bg-muted text-muted-foreground ring-border",
  }[tone];

  return (
    <div className="rounded-lg border bg-card p-2.5 flex items-center gap-2.5">
      <span className={`flex h-7 w-7 items-center justify-center rounded-md ring-1 ${toneClass}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
          {label}
        </div>
        <div className="text-sm font-semibold tabular-nums truncate">{value}</div>
      </div>
    </div>
  );
}
