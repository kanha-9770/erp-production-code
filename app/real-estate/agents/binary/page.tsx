"use client";

/**
 * Genealogy: Binary view.
 *
 * Real-estate brokerages don't use strict 1-left-1-right binary placement
 * the way MLM software does. To honour the screenshot's intent without
 * forcing an unnatural data model, we render every node's first child as
 * the "Left Leg" and second child as the "Right Leg"; any third+ children
 * show as a "+N more" indicator the user can click to expand.
 *
 * Selecting any node populates the right-side profile panel with that
 * agent's stats. The classic "BV" (business volume) columns from MLM
 * software are renamed to real-estate equivalents — Team Sales (left)
 * / Team Sales (right) — and computed from the existing sponsor tree.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useGetAgentTreeQuery } from "@/lib/api/real-estate/agents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Search, RotateCcw, Sparkles, Shield, Users,
  ChevronDown, Calendar, MoreHorizontal,
} from "lucide-react";
import {
  AGENT_STATUS_LABEL, AGENT_STATUS_VARIANT,
  AGENT_COMPLIANCE_LABEL, AGENT_COMPLIANCE_VARIANT,
  fullName, initials, formatDate,
} from "@/components/real-estate/constants";
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} from "@/components/ui/resizable";
import type { AgentTreeNode } from "@/lib/api/real-estate/types";
import { cn } from "@/lib/utils";

interface BinaryNode extends AgentTreeNode {
  left: BinaryNode | null;
  right: BinaryNode | null;
  overflow: BinaryNode[];
  leftDownline: number;
  rightDownline: number;
  totalDownline: number;
}

/** Build tree where first child = left, second child = right, rest = overflow. */
function buildBinaryTree(nodes: AgentTreeNode[]): BinaryNode[] {
  const byId = new Map<string, BinaryNode>();
  const childrenOf = new Map<string, AgentTreeNode[]>();

  nodes.forEach((n) => {
    byId.set(n.id, {
      ...n,
      left: null,
      right: null,
      overflow: [],
      leftDownline: 0,
      rightDownline: 0,
      totalDownline: 0,
    });
    if (n.parentId) {
      const arr = childrenOf.get(n.parentId) ?? [];
      arr.push(n);
      childrenOf.set(n.parentId, arr);
    }
  });

  // Wire up left / right / overflow.
  for (const node of byId.values()) {
    const kids = (childrenOf.get(node.id) ?? [])
      .map((k) => byId.get(k.id)!)
      .filter(Boolean);
    node.left = kids[0] ?? null;
    node.right = kids[1] ?? null;
    node.overflow = kids.slice(2);
  }

  // Compute leg counts (recursive).
  const countDownline = (n: BinaryNode | null): number => {
    if (!n) return 0;
    const left = countDownline(n.left);
    const right = countDownline(n.right);
    const overflow = n.overflow.reduce((s, o) => s + countDownline(o) + 1, 0);
    n.leftDownline = (n.left ? 1 : 0) + left;
    n.rightDownline = (n.right ? 1 : 0) + right;
    n.totalDownline = n.leftDownline + n.rightDownline + overflow;
    return n.totalDownline;
  };

  const roots = Array.from(byId.values()).filter(
    (n) => !n.parentId || !byId.has(n.parentId),
  );
  roots.forEach(countDownline);
  return roots;
}

export default function BinaryGenealogyPage() {
  const treeQ = useGetAgentTreeQuery();
  const nodes = useMemo(() => treeQ.data?.data ?? [], [treeQ.data]);
  const tree = useMemo(() => buildBinaryTree(nodes), [nodes]);

  const flatById = useMemo(() => {
    const m = new Map<string, BinaryNode>();
    const walk = (n: BinaryNode) => {
      m.set(n.id, n);
      if (n.left) walk(n.left);
      if (n.right) walk(n.right);
      n.overflow.forEach(walk);
    };
    tree.forEach(walk);
    return m;
  }, [tree]);

  const [searchInput, setSearchInput] = useState("");
  const [rootId, setRootId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default root = first top-level agent.
  useEffect(() => {
    if (!rootId && tree.length > 0) setRootId(tree[0].id);
  }, [tree, rootId]);

  // Default selection = root.
  useEffect(() => {
    if (rootId && !selectedId) setSelectedId(rootId);
  }, [rootId, selectedId]);

  const root = rootId ? flatById.get(rootId) : null;
  const selected = selectedId ? flatById.get(selectedId) : null;

  const onSearch = () => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return;
    const match = Array.from(flatById.values()).find(
      (n) =>
        (n.user.first_name ?? "").toLowerCase().includes(q) ||
        (n.user.last_name ?? "").toLowerCase().includes(q) ||
        n.user.email.toLowerCase().includes(q) ||
        (n.sponsorCode ?? "").toLowerCase().includes(q),
    );
    if (match) {
      setRootId(match.id);
      setSelectedId(match.id);
    }
  };

  const onReset = () => {
    setSearchInput("");
    if (tree.length > 0) {
      setRootId(tree[0].id);
      setSelectedId(tree[0].id);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem))]">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 border-b bg-background sticky top-0 z-20">
        <div className="flex items-center gap-3 mb-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <Link href="/real-estate/agents" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">Real Estate · Hierarchy</div>
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight">
              Binary: Genealogy
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search User"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            className="h-9 w-64"
          />
          <Button onClick={onSearch} size="sm" className="h-9">
            <Search className="h-3.5 w-3.5 mr-1" /> Search User
          </Button>
          <Button onClick={onReset} variant="outline" size="sm" className="h-9">
            Reset <RotateCcw className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>

      {/* Body — resizable split */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={70} minSize={45}>
            <div className="h-full overflow-auto bg-slate-50/40 dark:bg-slate-950/30">
              {treeQ.isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-32 w-64" />
                </div>
              ) : !root ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  No agents in the tree yet.
                </div>
              ) : (
                <div className="p-8 sm:p-12 min-w-fit">
                  <BinaryNodeView
                    node={root}
                    depth={0}
                    maxDepth={3}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onDrillDown={(id) => { setRootId(id); setSelectedId(id); }}
                  />
                </div>
              )}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={30} minSize={22}>
            <div className="h-full overflow-auto p-4">
              <ProfilePanel node={selected} loading={treeQ.isLoading} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

// ─── Tree visualization ──────────────────────────────────────────────────────

function BinaryNodeView({
  node, depth, maxDepth, selectedId, onSelect, onDrillDown,
}: {
  node: BinaryNode;
  depth: number;
  maxDepth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDrillDown: (id: string) => void;
}) {
  const hasChildren = node.left || node.right || node.overflow.length > 0;
  return (
    <div className="flex flex-col items-center">
      <NodeCard node={node} selected={node.id === selectedId} onClick={() => onSelect(node.id)} onDrillDown={() => onDrillDown(node.id)} />
      {depth < maxDepth && hasChildren && (
        <>
          {/* Vertical drop-line */}
          <div className="w-px h-8 bg-slate-300 dark:bg-slate-700" />
          {/* Horizontal connector and slots */}
          <div className="flex items-start justify-center gap-12 sm:gap-20 lg:gap-32 relative">
            {/* Connector rail */}
            <div className="absolute top-0 left-0 right-0 h-px bg-slate-300 dark:bg-slate-700" />
            <div className="flex flex-col items-center pt-px relative">
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded px-1.5 py-0.5 mt-2 mb-2 z-10">
                Left
              </span>
              {node.left ? (
                <BinaryNodeView
                  node={node.left}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onDrillDown={onDrillDown}
                />
              ) : (
                <EmptySlot side="left" />
              )}
            </div>
            <div className="flex flex-col items-center pt-px relative">
              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded px-1.5 py-0.5 mt-2 mb-2 z-10">
                Right
              </span>
              {node.right ? (
                <BinaryNodeView
                  node={node.right}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onDrillDown={onDrillDown}
                />
              ) : (
                <EmptySlot side="right" />
              )}
            </div>
          </div>
          {node.overflow.length > 0 && (
            <button
              type="button"
              onClick={() => onDrillDown(node.id)}
              className="mt-3 text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed"
            >
              <MoreHorizontal className="h-3 w-3" />
              {node.overflow.length} more recruit{node.overflow.length === 1 ? "" : "s"} — drill in
            </button>
          )}
        </>
      )}
      {/* If we hit the depth limit but there are descendants, show drill-in hint. */}
      {depth >= maxDepth && hasChildren && (
        <button
          type="button"
          onClick={() => onDrillDown(node.id)}
          className="mt-2 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50"
        >
          <ChevronDown className="h-3 w-3" /> Drill into subtree
        </button>
      )}
    </div>
  );
}

function NodeCard({
  node, selected, onClick, onDrillDown,
}: {
  node: BinaryNode;
  selected: boolean;
  onClick: () => void;
  onDrillDown: () => void;
}) {
  const u = node.user;
  const accent =
    node.status === "TERMINATED" ? "border-red-500"
    : node.status === "SUSPENDED" ? "border-amber-500"
    : node.status === "PENDING_KYC" ? "border-slate-400"
    : "border-slate-900";

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDrillDown}
      className={cn(
        "relative cursor-pointer bg-white dark:bg-slate-900 border-2 rounded-lg px-3 py-2.5 w-56",
        "shadow-[3px_3px_0px_0px_rgba(15,23,42,0.7)] dark:shadow-[3px_3px_0px_0px_rgba(148,163,184,0.4)]",
        "hover:-translate-y-0.5 transition-transform",
        accent,
        selected && "ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-900",
      )}
    >
      <div className="flex items-center gap-2">
        <Avatar className="h-9 w-9 shrink-0 border-2 border-slate-200">
          <AvatarImage src={u.avatar ?? undefined} />
          <AvatarFallback className="text-[10px] font-bold">{initials(u)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold truncate">{fullName(u)}</div>
          <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px]">
        {node.rank && (
          <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-semibold uppercase truncate">
            {node.rank.name}
          </span>
        )}
        <span className="text-muted-foreground tabular-nums shrink-0">
          L{node.leftDownline} · R{node.rightDownline}
        </span>
      </div>
    </div>
  );
}

function EmptySlot({ side }: { side: "left" | "right" }) {
  return (
    <div className="w-56 h-20 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg flex items-center justify-center text-[11px] text-muted-foreground">
      Empty {side} slot
    </div>
  );
}

// ─── Profile panel ───────────────────────────────────────────────────────────

function ProfilePanel({ node, loading }: { node: BinaryNode | null | undefined; loading?: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!node) {
    return (
      <div className="text-sm text-muted-foreground text-center py-12">
        Click any agent in the tree to see their profile.
      </div>
    );
  }
  const u = node.user;
  const fields: Array<{ icon: any; label: string; value: React.ReactNode }> = [
    { icon: Users,    label: "Name",            value: fullName(u) },
    { icon: Users,    label: "Username",        value: u.email },
    { icon: Sparkles, label: "Current Rank",    value: node.rank?.name ?? "—" },
    { icon: Calendar, label: "Date of Join",    value: "joinedAt" in node ? formatDate((node as any).joinedAt) : "—" },
    { icon: Users,    label: "Sponsor Code",    value: node.sponsorCode ?? "—" },
    { icon: Users,    label: "Total Left Users",  value: <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{node.leftDownline}</span> },
    { icon: Users,    label: "Total Right Users", value: <span className="text-blue-700 dark:text-blue-400 font-semibold">{node.rightDownline}</span> },
    { icon: Users,    label: "Total Downline",  value: <span className="font-semibold">{node.totalDownline}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 pb-3 border-b">
        <Avatar className="h-12 w-12">
          <AvatarImage src={u.avatar ?? undefined} />
          <AvatarFallback>{initials(u)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{fullName(u)}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            <Badge variant={AGENT_STATUS_VARIANT[node.status]} className="text-[10px]">
              {AGENT_STATUS_LABEL[node.status]}
            </Badge>
            <Badge variant={AGENT_COMPLIANCE_VARIANT[node.complianceStatus]} className="text-[10px]">
              <Shield className="h-3 w-3 mr-1" /> {AGENT_COMPLIANCE_LABEL[node.complianceStatus]}
            </Badge>
          </div>
        </div>
      </div>

      {fields.map((f) => {
        const Icon = f.icon;
        return (
          <Card key={f.label} className="border-slate-200/50 dark:border-slate-800">
            <CardContent className="p-2.5 flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{f.label}</div>
                <div className="text-sm truncate">{f.value}</div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="pt-2">
        <Button asChild className="w-full" size="sm">
          <Link href={`/real-estate/agents/${node.id}`}>Open full profile</Link>
        </Button>
      </div>
    </div>
  );
}
