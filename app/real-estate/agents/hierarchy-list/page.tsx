"use client";

/**
 * Hierarchy List view — flat list of every agent in the brokerage with a
 * depth indicator showing where they sit in the sponsor tree. The tree
 * page (/agents/tree) is the visual equivalent; this is the spreadsheet
 * equivalent — sortable, copyable, searchable.
 *
 * Depth is computed client-side from `parentId` so we don't need a new API.
 * For organisations with > 5K agents we'd swap to a server-side recursive
 * CTE, but for the FR-2.4 envelope the client-side walk is fine.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGetAgentTreeQuery } from "@/lib/api/real-estate/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Network, Search, ArrowLeft, Sparkles, Shield, ChevronRight,
} from "lucide-react";
import {
  AGENT_STATUS_LABEL, AGENT_STATUS_VARIANT,
  AGENT_COMPLIANCE_LABEL, AGENT_COMPLIANCE_VARIANT,
  fullName, initials, formatDate,
} from "@/components/real-estate/constants";
import {
  WorkspaceShell, WorkspaceHeader,
  DataTable, type ColumnDef,
} from "@/components/real-estate/workspace";
import type { AgentTreeNode } from "@/lib/api/real-estate/types";
import { cn } from "@/lib/utils";

interface NodeRow extends AgentTreeNode {
  depth: number;
  directCount: number;
  totalDownline: number;
  parentName: string | null;
}

/**
 * Walk the tree depth-first, producing a flat list whose order matches a
 * pre-order traversal (parent → child → next-sibling-subtree). This is the
 * order the user expects when they read the list top-to-bottom.
 */
function flatten(nodes: AgentTreeNode[]): NodeRow[] {
  const byId = new Map<string, AgentTreeNode>();
  const childrenOf = new Map<string, AgentTreeNode[]>();
  nodes.forEach((n) => {
    byId.set(n.id, n);
    if (n.parentId) {
      const arr = childrenOf.get(n.parentId) ?? [];
      arr.push(n);
      childrenOf.set(n.parentId, arr);
    }
  });

  const totalDownlineCache = new Map<string, number>();
  const totalDownline = (id: string): number => {
    const cached = totalDownlineCache.get(id);
    if (cached != null) return cached;
    const kids = childrenOf.get(id) ?? [];
    let count = kids.length;
    for (const k of kids) count += totalDownline(k.id);
    totalDownlineCache.set(id, count);
    return count;
  };

  const out: NodeRow[] = [];
  const roots = nodes.filter((n) => !n.parentId || !byId.has(n.parentId));

  const walk = (n: AgentTreeNode, depth: number) => {
    const parent = n.parentId ? byId.get(n.parentId) : null;
    const parentName = parent
      ? fullName({ first_name: parent.user.first_name, last_name: parent.user.last_name })
      : null;
    out.push({
      ...n,
      depth,
      directCount: (childrenOf.get(n.id) ?? []).length,
      totalDownline: totalDownline(n.id),
      parentName,
    });
    for (const child of childrenOf.get(n.id) ?? []) walk(child, depth + 1);
  };
  roots.forEach((r) => walk(r, 0));
  return out;
}

export default function HierarchyListPage() {
  const treeQ = useGetAgentTreeQuery();
  const flat = useMemo(() => flatten(treeQ.data?.data ?? []), [treeQ.data]);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter(
      (n) =>
        (n.user.first_name ?? "").toLowerCase().includes(q) ||
        (n.user.last_name ?? "").toLowerCase().includes(q) ||
        n.user.email.toLowerCase().includes(q) ||
        (n.sponsorCode ?? "").toLowerCase().includes(q),
    );
  }, [flat, search]);

  const columns: ColumnDef<NodeRow>[] = useMemo(() => [
    {
      id: "agent",
      header: "Agent",
      width: 320,
      pinned: true,
      sortKey: "name",
      copyValue: (n) => `${"  ".repeat(n.depth)}${fullName({ first_name: n.user.first_name, last_name: n.user.last_name })} <${n.user.email}>`,
      cell: (n) => (
        <div
          className="flex items-center gap-2 min-w-0"
          style={{ paddingLeft: `${n.depth * 16}px` }}
        >
          {n.depth > 0 && (
            <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          )}
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={n.user.avatar ?? undefined} />
            <AvatarFallback className="text-[10px]">{initials(n.user)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-medium truncate">{fullName(n.user)}</div>
            <div className="text-[11px] text-muted-foreground truncate">{n.user.email}</div>
          </div>
        </div>
      ),
    },
    {
      id: "rank",
      header: "Current Rank",
      width: 140,
      copyValue: (n) => n.rank?.name ?? "",
      cell: (n) =>
        n.rank ? (
          <Badge variant="outline" className="text-[10px]">
            <Sparkles className="h-3 w-3 mr-1" />
            {n.rank.name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      width: 130,
      sortKey: "status",
      copyValue: (n) => AGENT_STATUS_LABEL[n.status],
      cell: (n) => (
        <Badge variant={AGENT_STATUS_VARIANT[n.status]} className="text-[10px]">
          {AGENT_STATUS_LABEL[n.status]}
        </Badge>
      ),
    },
    {
      id: "compliance",
      header: "Compliance",
      width: 130,
      copyValue: (n) => AGENT_COMPLIANCE_LABEL[n.complianceStatus],
      cell: (n) => (
        <Badge variant={AGENT_COMPLIANCE_VARIANT[n.complianceStatus]} className="text-[10px]">
          <Shield className="h-3 w-3 mr-1" /> {AGENT_COMPLIANCE_LABEL[n.complianceStatus]}
        </Badge>
      ),
    },
    {
      id: "depth",
      header: "Depth",
      width: 80,
      align: "right",
      sortKey: "depth",
      copyValue: (n) => String(n.depth),
      cell: (n) => <span className="text-xs tabular-nums">L{n.depth}</span>,
    },
    {
      id: "directRecruits",
      header: "Direct",
      width: 90,
      align: "right",
      sortKey: "directCount",
      copyValue: (n) => String(n.directCount),
      cell: (n) => <span className="text-xs tabular-nums">{n.directCount}</span>,
    },
    {
      id: "totalDownline",
      header: "Total Downline",
      width: 130,
      align: "right",
      sortKey: "totalDownline",
      copyValue: (n) => String(n.totalDownline),
      cell: (n) => <span className="text-xs tabular-nums font-medium">{n.totalDownline}</span>,
    },
    {
      id: "sponsorCode",
      header: "Sponsor Code",
      width: 130,
      copyValue: (n) => n.sponsorCode ?? "",
      cell: (n) => (
        <code className="text-[11px] text-muted-foreground">{n.sponsorCode ?? "—"}</code>
      ),
    },
    {
      id: "parent",
      header: "Reports To",
      width: 160,
      defaultHidden: true,
      copyValue: (n) => n.parentName ?? "—",
      cell: (n) => (
        <span className="text-xs truncate">{n.parentName ?? <span className="text-muted-foreground">Top of tree</span>}</span>
      ),
    },
  ], []);

  return (
    <WorkspaceShell
      scope="hierarchy-list"
      selectedId={selectedId}
      onCloseSelection={() => setSelectedId(null)}
      header={
        <WorkspaceHeader
          icon={<Network className="h-4 w-4" />}
          title="Hierarchy: List View"
          subtitle={`${flat.length} agent${flat.length === 1 ? "" : "s"}, depth-first order`}
        >
          <Button asChild variant="ghost" size="sm" className="h-8">
            <Link href="/real-estate/agents/tree">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Tree view
            </Link>
          </Button>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Name, email, sponsor code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 w-56 text-sm"
            />
          </div>
        </WorkspaceHeader>
      }
      list={
        <DataTable<NodeRow>
          tableId="rebm-hierarchy-list"
          columns={columns}
          rows={filtered}
          rowId={(n) => n.id}
          pageSize={10}
          isLoading={treeQ.isLoading}
          selectedId={selectedId}
          onRowClick={(n) => setSelectedId(n.id)}
          emptyState={
            <div className="py-10">
              <Network className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p>No agents in the hierarchy yet.</p>
              <Button asChild variant="link" size="sm">
                <Link href="/real-estate/agents/new">Onboard the first agent</Link>
              </Button>
            </div>
          }
        />
      }
      preview={selectedId ? <PreviewBody id={selectedId} /> : null}
      previewHeader={selectedId ? <PreviewHeader rows={flat} id={selectedId} /> : null}
    />
  );
}

function PreviewHeader({ rows, id }: { rows: NodeRow[]; id: string }) {
  const n = rows.find((r) => r.id === id);
  if (!n) return null;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar className="h-6 w-6 shrink-0">
        <AvatarImage src={n.user.avatar ?? undefined} />
        <AvatarFallback className="text-[10px]">{initials(n.user)}</AvatarFallback>
      </Avatar>
      <span className="font-semibold truncate text-sm">{fullName(n.user)}</span>
      <Badge variant={AGENT_STATUS_VARIANT[n.status]} className="text-[10px] shrink-0">
        {AGENT_STATUS_LABEL[n.status]}
      </Badge>
      <Button asChild variant="ghost" size="sm" className="h-7 ml-auto shrink-0">
        <Link href={`/real-estate/agents/${n.id}`}>
          Open profile <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
        </Link>
      </Button>
    </div>
  );
}

function PreviewBody({ id }: { id: string }) {
  return (
    <div className="p-6 text-sm text-muted-foreground">
      Click <strong>"Open profile"</strong> in the header to see the full agent
      page (compliance docs, downline, promotions, recent activity). The list
      view here is optimised for scanning the whole hierarchy at once — like a
      spreadsheet view of the tree.
      <div className="mt-4">
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href={`/real-estate/agents/${id}`}>Open full profile</Link>
        </Button>
      </div>
    </div>
  );
}
