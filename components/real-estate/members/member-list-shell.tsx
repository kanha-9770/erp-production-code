"use client";

/**
 * Shared shell for the three Members Management views (Active / Pending / KYC).
 *
 * They differ only in:
 *   - the page title + icon
 *   - the prefilled status / compliance filter passed to useGetAgentsQuery
 *
 * Everything else (table columns, search, preview, inline-edit, saved views)
 * is identical to /real-estate/agents — we reuse the same primitives so the
 * users learn one table and reuse it everywhere.
 */

import Link from "next/link";
import { ReactNode, useMemo, useState } from "react";
import {
  useGetAgentsQuery, useGetAgentQuery, useUpdateAgentMutation,
} from "@/lib/api/real-estate/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  Search, Plus, ChevronLeft, ChevronRight, ExternalLink, Pencil, Shield, Sparkles,
} from "lucide-react";
import {
  AGENT_STATUS_LABEL, AGENT_STATUS_OPTIONS, AGENT_STATUS_VARIANT,
  AGENT_COMPLIANCE_LABEL, AGENT_COMPLIANCE_VARIANT,
  fullName, initials, formatDate,
} from "@/components/real-estate/constants";
import {
  WorkspaceShell, WorkspaceHeader,
  DataTable, type ColumnDef,
  InlineEditCell,
  ManageColumnsButton,
} from "@/components/real-estate/workspace";
import type { AgentProfile } from "@/lib/api/real-estate/types";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 50;

interface MemberListShellProps {
  scope: string;
  pageTitle: string;
  pageSubtitle: string;
  pageIcon: ReactNode;
  /** Filters applied to useGetAgentsQuery on top of the search. */
  statusFilter?: AgentProfile["status"];
  complianceFilter?: AgentProfile["complianceStatus"];
  emptyState?: ReactNode;
}

export function MemberListShell({
  scope, pageTitle, pageSubtitle, pageIcon,
  statusFilter, complianceFilter, emptyState,
}: MemberListShellProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useGetAgentsQuery({
    search: search || undefined,
    status: statusFilter,
    compliance: complianceFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          <Shield className="h-3 w-3 mr-1" /> {AGENT_COMPLIANCE_LABEL[a.complianceStatus]}
        </Badge>
      ),
    },
    {
      id: "rank",
      header: "Rank",
      width: 130,
      copyValue: (a) => a.rank?.name ?? "",
      cell: (a) => a.rank ? (
        <Badge variant="outline" className="text-[10px]">
          <Sparkles className="h-3 w-3 mr-1" /> {a.rank.name}
        </Badge>
      ) : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      id: "team",
      header: "Team",
      width: 110,
      align: "right",
      copyValue: (a) => `${a._count?.children ?? 0} direct / ${a._count?.recruits ?? 0} total`,
      cell: (a) => (
        <span className="text-xs tabular-nums">
          {a._count?.children ?? 0} <span className="text-muted-foreground">d</span>
          <span className="mx-1 text-muted-foreground">·</span>
          {a._count?.recruits ?? 0} <span className="text-muted-foreground">t</span>
        </span>
      ),
    },
    {
      id: "joined",
      header: "Joined",
      width: 110,
      copyValue: (a) => formatDate(a.joinedAt),
      cell: (a) => <span className="text-xs text-muted-foreground tabular-nums">{formatDate(a.joinedAt)}</span>,
    },
    {
      id: "license",
      header: "License Expires",
      width: 130,
      defaultHidden: true,
      copyValue: (a) => formatDate(a.licenseExpiresAt),
      cell: (a) => <span className="text-xs text-muted-foreground tabular-nums">{a.licenseExpiresAt ? formatDate(a.licenseExpiresAt) : "—"}</span>,
    },
  ], [updateAgent, toast]);

  return (
    <WorkspaceShell
      scope={scope}
      selectedId={selectedId}
      onCloseSelection={() => setSelectedId(null)}
      header={
        <WorkspaceHeader
          icon={pageIcon}
          title={pageTitle}
          subtitle={`${total.toLocaleString()} ${pageSubtitle}${isFetching ? " · syncing…" : ""}`}
        >
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Name, email, sponsor code…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { setSearch(searchInput.trim()); setPage(0); }
                if (e.key === "Escape") { setSearchInput(""); setSearch(""); setPage(0); }
              }}
              className="pl-8 h-8 w-56 text-sm"
            />
          </div>
          <ManageColumnsButton
            tableId={`rebm-${scope}`}
            columns={columns}
          />
          <Button asChild size="sm" className="h-8">
            <Link href="/real-estate/agents/new"><Plus className="h-3.5 w-3.5 mr-1" /> Onboard</Link>
          </Button>
        </WorkspaceHeader>
      }
      list={
        <div className="flex flex-col h-full">
          <div className="flex-1 min-h-0">
            <DataTable<AgentProfile>
              tableId={`rebm-${scope}`}
              columns={columns}
              rows={items}
              rowId={(a) => a.id}
              pageSize={10}
              isLoading={isLoading}
              selectedId={selectedId}
              onRowClick={(a) => setSelectedId(a.id)}
              emptyState={emptyState}
            />
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t bg-background/95 text-xs">
              <span className="text-muted-foreground tabular-nums">Page {page + 1} of {pages} · {total.toLocaleString()} total</span>
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
      preview={selectedId ? <MemberPreview id={selectedId} /> : null}
      previewHeader={selectedId ? <MemberPreviewHeader id={selectedId} /> : null}
    />
  );
}

function MemberPreviewHeader({ id }: { id: string }) {
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

function MemberPreview({ id }: { id: string }) {
  const { data, isLoading } = useGetAgentQuery(id);
  const a = data?.data;
  if (isLoading || !a || !a.user) {
    return <div className="p-4 sm:p-5 space-y-3"><Skeleton className="h-20" /><Skeleton className="h-32" /></div>;
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
          <div className="text-sm text-muted-foreground mt-1">{a.user.email}</div>
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
        <Stat label="Direct" value={a._count?.children ?? 0} />
        <Stat label="Total downline" value={a._count?.recruits ?? 0} />
        <Stat label="Joined" value={formatDate(a.joinedAt)} />
      </div>
      {a.bio && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Bio</div>
          <p className="text-sm leading-relaxed whitespace-pre-line">{a.bio}</p>
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
