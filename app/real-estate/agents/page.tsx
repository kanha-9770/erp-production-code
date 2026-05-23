"use client";

/**
 * Agents — modern workspace.
 *
 * Same shell as Properties: resizable list+preview, saved views, ⌘K palette.
 * Inline-edit: status (with confirm dialog for SUSPENDED/TERMINATED would be
 * nice, but we keep it simple for v1 — the API enforces transition rules).
 *
 * Status of a freshly-suspended/terminated agent flips wallets to frozen on
 * the server (see commission engine compression rule, BR-8).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetAgentsQuery, useGetAgentQuery, useGetRanksQuery, useUpdateAgentMutation,
} from "@/lib/api/real-estate/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, Plus, Search, Network, Sparkles, Shield, AlertTriangle,
  ChevronLeft, ChevronRight, ExternalLink, Pencil, Calendar, Mail, Phone,
} from "lucide-react";
import {
  AGENT_STATUS_LABEL, AGENT_STATUS_OPTIONS, AGENT_STATUS_VARIANT,
  AGENT_COMPLIANCE_LABEL, AGENT_COMPLIANCE_VARIANT,
  fullName, initials, formatDate,
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
import type { AgentProfile } from "@/lib/api/real-estate/types";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 50;

interface Filters {
  search: string;
  status: string;
  compliance: string;
  rankId: string;
}
const EMPTY_FILTERS: Filters = { search: "", status: "", compliance: "", rankId: "" };

export default function AgentsListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const views = useSavedViews<Filters>("agents");
  const ranksQ = useGetRanksQuery();
  const ranks = ranksQ.data?.data ?? [];

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

  const { data, isLoading, isFetching } = useGetAgentsQuery({
    search: filters.search || undefined,
    status: filters.status || undefined,
    compliance: filters.compliance || undefined,
    rankId: filters.rankId || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const rawItems = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Filter fields exposed to the AdvancedFilter popover.
  const filterFields: FilterField[] = useMemo(
    () => [
      {
        id: "name",
        label: "Name",
        type: "text",
        getValue: (a: AgentProfile) => (a.user ? fullName(a.user) : ""),
      },
      {
        id: "email",
        label: "Email",
        type: "text",
        getValue: (a: AgentProfile) => a.user?.email ?? "",
      },
      {
        id: "status",
        label: "Status",
        type: "select",
        options: AGENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      },
      {
        id: "complianceStatus",
        label: "Compliance",
        type: "select",
        options: ["PENDING_KYC", "COMPLIANT", "NON_COMPLIANT", "EXPIRED"].map((v) => ({
          value: v,
          label: AGENT_COMPLIANCE_LABEL[v as keyof typeof AGENT_COMPLIANCE_LABEL] ?? v,
        })),
      },
      {
        id: "rankId",
        label: "Rank",
        type: "select",
        options: ranks.map((r) => ({ value: r.id, label: r.name })),
      },
      { id: "sponsorCode", label: "Sponsor code", type: "text" },
      {
        id: "directCount",
        label: "Direct recruits",
        type: "number",
        getValue: (a: AgentProfile) => a._count?.children ?? 0,
      },
      {
        id: "teamCount",
        label: "Total recruits",
        type: "number",
        getValue: (a: AgentProfile) => a._count?.recruits ?? 0,
      },
      { id: "joinedAt", label: "Joined on", type: "date" },
      { id: "licenseExpiresAt", label: "License expires", type: "date" },
    ],
    [ranks],
  );

  const items = useMemo(
    () => applyAdvancedFilters(rawItems, conditions, filterFields),
    [rawItems, conditions, filterFields],
  );

  const expiringSoon = useMemo(() =>
    items.filter((a) => {
      if (!a.licenseExpiresAt) return false;
      const days = (new Date(a.licenseExpiresAt).getTime() - Date.now()) / 86400000;
      return days >= 0 && days <= 30;
    }), [items],
  );

  const isDirty = useMemo(() => {
    if (views.activeId == null) return Object.values(filters).some(Boolean);
    const active = views.views.find((v) => v.id === views.activeId);
    return active ? JSON.stringify(active.filters) !== JSON.stringify(filters) : true;
  }, [filters, views.activeId, views.views]);

  const activeFilterPills = useMemo(() => {
    const pills: Array<{ key: string; label: React.ReactNode }> = [];
    if (filters.search) pills.push({ key: "search", label: <>Search: <strong>{filters.search}</strong></> });
    if (filters.status) pills.push({ key: "status", label: <>Status: <strong>{AGENT_STATUS_LABEL[filters.status as keyof typeof AGENT_STATUS_LABEL]}</strong></> });
    if (filters.compliance) pills.push({ key: "compliance", label: <>Compliance: <strong>{AGENT_COMPLIANCE_LABEL[filters.compliance as keyof typeof AGENT_COMPLIANCE_LABEL]}</strong></> });
    if (filters.rankId) {
      const r = ranks.find((x) => x.id === filters.rankId);
      pills.push({ key: "rankId", label: <>Rank: <strong>{r?.name ?? "—"}</strong></> });
    }
    return pills;
  }, [filters, ranks]);

  const [updateAgent] = useUpdateAgentMutation();

  const columns: ColumnDef<AgentProfile>[] = useMemo(() => [
    {
      id: "person",
      header: "Agent",
      width: 280,
      pinned: true,
      sortKey: "name",
      copyValue: (a) => a.user ? `${fullName(a.user)} <${a.user.email}>` : "",
      cell: (a) => {
        const u = a.user!;
        return (
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={u.avatar ?? undefined} />
              <AvatarFallback className="text-[11px]">{initials(u)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-medium truncate">{fullName(u)}</div>
              <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      width: 130,
      sortKey: "status",
      copyValue: (a) => AGENT_STATUS_LABEL[a.status],
      cell: (a) => (
        <InlineEditCell<AgentProfile["status"]>
          mode="select"
          value={a.status}
          stopRowClick
          options={AGENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          render={(v) => (
            <Badge variant={AGENT_STATUS_VARIANT[v]} className="text-[10px]">
              {AGENT_STATUS_LABEL[v]}
            </Badge>
          )}
          onSave={async (next) => {
            try {
              await updateAgent({ id: a.id, body: { status: next as any } }).unwrap();
            } catch (e: any) {
              toast({ title: "Update failed", description: e?.data?.error ?? e?.message, variant: "destructive" });
              throw e;
            }
          }}
        />
      ),
    },
    {
      id: "compliance",
      header: "Compliance",
      width: 130,
      copyValue: (a) => AGENT_COMPLIANCE_LABEL[a.complianceStatus],
      cell: (a) => (
        <Badge variant={AGENT_COMPLIANCE_VARIANT[a.complianceStatus]} className="text-[10px]">
          <Shield className="h-3 w-3 mr-1" />
          {AGENT_COMPLIANCE_LABEL[a.complianceStatus]}
        </Badge>
      ),
    },
    {
      id: "rank",
      header: "Rank",
      width: 130,
      copyValue: (a) => a.rank?.name ?? "",
      cell: (a) =>
        a.rank ? (
          <Badge variant="outline" className="text-[10px]">
            <Sparkles className="h-3 w-3 mr-1" />
            {a.rank.name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "team",
      header: "Team",
      width: 110,
      align: "right",
      copyValue: (a) => `${a._count?.children ?? 0} direct / ${a._count?.recruits ?? 0} total`,
      cell: (a) => (
        <span className="text-xs tabular-nums">
          {a._count?.children ?? 0} <span className="text-muted-foreground">direct</span>
          <span className="mx-1 text-muted-foreground">·</span>
          {a._count?.recruits ?? 0} <span className="text-muted-foreground">total</span>
        </span>
      ),
    },
    {
      id: "sponsor",
      header: "Sponsor",
      width: 160,
      // Hidden by default so the table opens with the core 5 columns
      // (Agent, Status, Compliance, Rank, Team). User flips on from Columns.
      defaultHidden: true,
      copyValue: (a) => a.sponsor?.user
        ? fullName({ first_name: a.sponsor.user.first_name, last_name: a.sponsor.user.last_name })
        : "",
      cell: (a) => {
        const s = a.sponsor?.user;
        if (!s) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <span className="text-xs truncate">
            {fullName({ first_name: s.first_name, last_name: s.last_name })}
          </span>
        );
      },
    },
    {
      id: "license",
      header: "License",
      width: 130,
      defaultHidden: true,
      copyValue: (a) => formatDate(a.licenseExpiresAt),
      cell: (a) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {a.licenseExpiresAt ? formatDate(a.licenseExpiresAt) : "—"}
        </span>
      ),
    },
    {
      id: "joinedAt",
      header: "Joined",
      width: 110,
      defaultHidden: true,
      sortKey: "joinedAt",
      copyValue: (a) => formatDate(a.joinedAt),
      cell: (a) => <span className="text-xs text-muted-foreground">{formatDate(a.joinedAt)}</span>,
    },
    {
      id: "sponsorCode",
      header: "Code",
      width: 110,
      defaultHidden: true,
      copyValue: (a) => a.sponsorCode ?? "",
      cell: (a) => <code className="text-[11px] text-muted-foreground">{a.sponsorCode ?? "—"}</code>,
    },
  ], [updateAgent, toast]);

  return (
    <WorkspaceShell
      scope="agents"
      selectedId={selectedId}
      onCloseSelection={() => setSelectedId(null)}
      header={
        <>
          <WorkspaceHeader
            icon={<Users className="h-4 w-4" />}
            title="Agents"
            subtitle={`${total.toLocaleString()} agent${total === 1 ? "" : "s"}${isFetching ? " · syncing…" : ""}`}
          >
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Name, email, sponsor code…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateFilter("search", searchInput.trim());
                  if (e.key === "Escape") { setSearchInput(""); updateFilter("search", ""); }
                }}
                className="pl-8 h-8 w-56 text-sm"
              />
            </div>
            <AdvancedFilter
              fields={filterFields}
              value={conditions}
              onChange={setConditions}
            />
            <ManageColumnsButton tableId="rebm-agents" columns={columns} />
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link href="/real-estate/agents/tree"><Network className="h-3.5 w-3.5 mr-1" /> Tree</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link href="/real-estate/agents/ranks"><Sparkles className="h-3.5 w-3.5 mr-1" /> Ranks</Link>
            </Button>
            <Button asChild size="sm" className="h-8">
              <Link href="/real-estate/agents/new"><Plus className="h-3.5 w-3.5 mr-1" /> Onboard</Link>
            </Button>
          </WorkspaceHeader>

          {expiringSoon.length > 0 && (
            <div className="mx-4 sm:mx-6 mb-2 px-3 py-1.5 rounded-md text-xs flex items-center gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>{expiringSoon.length}</strong> agent{expiringSoon.length === 1 ? "" : "s"} have a license expiring in the next 30 days.
              </span>
            </div>
          )}

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
              options={AGENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <FilterChips
              label="Compliance"
              value={filters.compliance}
              onChange={(v) => updateFilter("compliance", v)}
              options={[
                { value: "COMPLIANT", label: "Compliant" },
                { value: "PENDING_KYC", label: "Pending KYC" },
                { value: "NON_COMPLIANT", label: "Non-compliant" },
              ]}
            />
            <Select
              value={filters.rankId || "ALL"}
              onValueChange={(v) => updateFilter("rankId", v === "ALL" ? "" : v)}
            >
              <SelectTrigger className="h-7 text-xs w-32">
                <SelectValue placeholder="All ranks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All ranks</SelectItem>
                {ranks.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
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
            <DataTable<AgentProfile>
              tableId="rebm-agents"
              columns={columns}
              rows={items}
              rowId={(a) => a.id}
              pageSize={10}
              isLoading={isLoading}
              selectedId={selectedId}
              onRowClick={(a) => setSelectedId(a.id)}
              emptyState={
                <div className="py-10">
                  <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p>No agents match these filters.</p>
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
      preview={selectedId ? <AgentPreview id={selectedId} /> : null}
      previewHeader={selectedId ? <AgentPreviewHeader id={selectedId} /> : null}
    />
  );
}

function AgentPreviewHeader({ id }: { id: string }) {
  const { data } = useGetAgentQuery(id);
  const a = data?.data;
  if (!a || !a.user) return <Skeleton className="h-5 w-40" />;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar className="h-6 w-6 shrink-0">
        <AvatarImage src={a.user.avatar ?? undefined} />
        <AvatarFallback className="text-[10px]">{initials(a.user)}</AvatarFallback>
      </Avatar>
      <span className="font-semibold truncate text-sm">{fullName(a.user)}</span>
      <Badge variant={AGENT_STATUS_VARIANT[a.status]} className="text-[10px] shrink-0">
        {AGENT_STATUS_LABEL[a.status]}
      </Badge>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/real-estate/agents/${a.id}`} title="Open full page">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0">
        <Link href={`/real-estate/agents/${a.id}/edit`} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function AgentPreview({ id }: { id: string }) {
  const { data, isLoading } = useGetAgentQuery(id);
  const a = data?.data;

  if (isLoading || !a || !a.user) {
    return (
      <div className="p-4 sm:p-5 space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-start gap-4">
        <Avatar className="h-16 w-16 shrink-0">
          <AvatarImage src={a.user.avatar ?? undefined} />
          <AvatarFallback>{initials(a.user)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold truncate">{fullName(a.user)}</h2>
          <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
            <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {a.user.email}</div>
            {a.user.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {a.user.phone}</div>}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant={AGENT_STATUS_VARIANT[a.status]} className="text-[10px]">{AGENT_STATUS_LABEL[a.status]}</Badge>
            <Badge variant={AGENT_COMPLIANCE_VARIANT[a.complianceStatus]} className="text-[10px]">
              <Shield className="h-3 w-3 mr-1" />{AGENT_COMPLIANCE_LABEL[a.complianceStatus]}
            </Badge>
            {a.rank && (
              <Badge variant="outline" className="text-[10px]">
                <Sparkles className="h-3 w-3 mr-1" />{a.rank.name}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Direct recruits" value={a._count?.children ?? 0} />
        <Stat label="Total downline" value={a._count?.recruits ?? 0} />
        <Stat label="Joined" value={formatDate(a.joinedAt)} />
      </div>

      {(a.licenseNumber || a.licenseExpiresAt) && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">License</div>
          <div className="text-sm">
            <div>{a.licenseNumber ?? "—"} · {a.licenseAuthority ?? "—"}</div>
            <div className="text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Calendar className="h-3 w-3" /> Expires {formatDate(a.licenseExpiresAt)}
            </div>
          </div>
        </Card>
      )}

      {a.sponsor?.user && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Sponsor</div>
          <div className="text-sm">{fullName({ first_name: a.sponsor.user.first_name, last_name: a.sponsor.user.last_name })}</div>
        </Card>
      )}

      {a.specializations.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Specializations</div>
          <div className="flex flex-wrap gap-1.5">
            {a.specializations.map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
            ))}
          </div>
        </div>
      )}

      {a.serviceAreas.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Service areas</div>
          <div className="flex flex-wrap gap-1.5">
            {a.serviceAreas.map((s) => (
              <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
            ))}
          </div>
        </div>
      )}

      {a.bio && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Bio</div>
          <p className="text-sm leading-relaxed whitespace-pre-line">{a.bio}</p>
        </Card>
      )}

      {a.suspensionReason && a.status === "SUSPENDED" && (
        <Card className="p-4 border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">Suspension reason</div>
              <p className="text-muted-foreground mt-0.5">{a.suspensionReason}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{value}</div>
    </Card>
  );
}
