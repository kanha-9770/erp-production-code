"use client";

/**
 * Agent hierarchy tree — fetches the flat list of agents and recursively
 * renders a collapsible tree. Performance note: capped at the API's 5K-node
 * envelope from FR-2.4. For larger orgs we'd switch to server-side
 * subtree-on-demand (the API already supports rootId).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useGetAgentTreeQuery } from "@/lib/api/real-estate/agents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Network,
  ChevronDown,
  ChevronRight,
  Search,
  Sparkles,
} from "lucide-react";
import {
  AGENT_STATUS_LABEL,
  AGENT_STATUS_VARIANT,
  fullName,
  initials,
} from "@/components/real-estate/constants";
import type { AgentTreeNode } from "@/lib/api/real-estate/types";

interface NodeWithChildren extends AgentTreeNode {
  children: NodeWithChildren[];
}

function buildTree(nodes: AgentTreeNode[]): NodeWithChildren[] {
  const byId = new Map<string, NodeWithChildren>();
  nodes.forEach((n) => byId.set(n.id, { ...n, children: [] }));
  const roots: NodeWithChildren[] = [];
  for (const n of byId.values()) {
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}

export default function AgentTreePage() {
  const { data, isLoading } = useGetAgentTreeQuery();
  const nodes = data?.data ?? [];
  const tree = useMemo(() => buildTree(nodes), [nodes]);

  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    const all = new Set<string>();
    nodes.forEach((n) => all.add(n.id));
    setCollapsed(all);
  };

  // Filter mode: when searching, auto-expand any branch that contains a hit.
  const matchesSearch = (n: AgentTreeNode): boolean => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (n.user.first_name ?? "").toLowerCase().includes(q) ||
      (n.user.last_name ?? "").toLowerCase().includes(q) ||
      n.user.email.toLowerCase().includes(q) ||
      (n.sponsorCode ?? "").toLowerCase().includes(q)
    );
  };

  // Decide if a subtree should be visible: itself matches OR any descendant
  // matches. Run once; results memoised by node id.
  const visibleIds = useMemo(() => {
    if (!search) return null;
    const out = new Set<string>();
    const visit = (n: NodeWithChildren): boolean => {
      const childAny = n.children.map(visit).some(Boolean);
      const me = matchesSearch(n);
      if (me || childAny) out.add(n.id);
      return me || childAny;
    };
    tree.forEach(visit);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, search]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/real-estate/agents" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
              <Network className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
              Agent hierarchy
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {nodes.length} agent{nodes.length === 1 ? "" : "s"} in tree.
              Recruits and direct reports follow the parent edge (FR-2.2).
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>Expand all</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>Collapse all</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 flex gap-2">
          <div className="flex-1 flex gap-2">
            <Input
              placeholder="Search by name, email, sponsor code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search className="h-4 w-4 self-center text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : tree.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Network className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No agents yet.</p>
              <Button asChild variant="link">
                <Link href="/real-estate/agents/new">Onboard the first agent</Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {tree.map((n) => (
                <TreeRow
                  key={n.id}
                  node={n}
                  depth={0}
                  collapsed={collapsed}
                  toggle={toggle}
                  visibleIds={visibleIds}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  collapsed,
  toggle,
  visibleIds,
}: {
  node: NodeWithChildren;
  depth: number;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  visibleIds: Set<string> | null;
}) {
  if (visibleIds && !visibleIds.has(node.id)) return null;
  const isCollapsed = collapsed.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className="flex items-center gap-2 py-1.5 rounded-md hover:bg-muted/50 group"
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        <button
          type="button"
          className="h-5 w-5 flex items-center justify-center text-muted-foreground"
          onClick={() => hasChildren && toggle(node.id)}
          aria-label={hasChildren ? (isCollapsed ? "Expand" : "Collapse") : undefined}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
          ) : (
            <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
          )}
        </button>
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarImage src={node.user.avatar ?? undefined} alt={fullName(node.user)} />
          <AvatarFallback className="text-[10px]">{initials(node.user)}</AvatarFallback>
        </Avatar>
        <Link
          href={`/real-estate/agents/${node.id}`}
          className="flex-1 min-w-0 flex items-center gap-2"
        >
          <span className="font-medium truncate">{fullName(node.user)}</span>
          {node.rank && (
            <Badge variant="outline" className="text-[10px] shrink-0 gap-1">
              <Sparkles className="h-3 w-3" /> {node.rank.name}
            </Badge>
          )}
          <Badge variant={AGENT_STATUS_VARIANT[node.status]} className="text-[10px] shrink-0">
            {AGENT_STATUS_LABEL[node.status]}
          </Badge>
          {hasChildren && (
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {node.children.length}
            </span>
          )}
        </Link>
      </div>
      {!isCollapsed && hasChildren && (
        <ul>
          {node.children.map((c) => (
            <TreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              collapsed={collapsed}
              toggle={toggle}
              visibleIds={visibleIds}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
