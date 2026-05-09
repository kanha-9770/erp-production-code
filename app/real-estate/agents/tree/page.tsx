"use client";

/**
 * Agent hierarchy tree — pan/zoom canvas in the same shape as
 * /settings/company. Reuses the existing useCanvasTransform hook so the
 * UX (mouse drag to pan, wheel to zoom, percentage indicator, target/center)
 * is identical to the org-architecture page the user already knows.
 *
 * Differences from /settings/company:
 *   - Nodes are AgentChartNode (avatar, rank, status, recruits/team counts)
 *   - "Status" tab in the toolbar shows live counts: ACTIVE, SUSPENDED, etc.
 *   - Search highlights matching nodes and auto-pans to the first match
 *   - Capped at 5K nodes per FR-2.4; for larger orgs we'd switch to
 *     subtree-on-demand (the API already supports rootId).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useGetAgentTreeQuery } from "@/lib/api/real-estate/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCanvasTransform } from "@/hooks/use-canvas-transform";
import {
  ArrowLeft, Network, Search, ZoomIn, ZoomOut, Target,
  Maximize2, Minimize2, ChevronsDownUp, ChevronsUpDown, Move,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AgentChartNode, type AgentNodeData,
} from "@/components/real-estate/workspace/agent-chart-node";
import type { AgentTreeNode } from "@/lib/api/real-estate/types";

// ─── Tree assembly ───────────────────────────────────────────────────────────
// Build hierarchy + roll-up direct/total counts in a single pass per branch
// so AgentChartNode gets the numbers without the page recomputing them on
// every render.

function buildTree(nodes: AgentTreeNode[]): AgentNodeData[] {
  const byId = new Map<string, AgentNodeData>();
  nodes.forEach((n) =>
    byId.set(n.id, {
      ...n,
      children: [],
      directCount: 0,
      totalDownline: 0,
    }),
  );

  const roots: AgentNodeData[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Recursively populate counts.
  const rollUp = (n: AgentNodeData): number => {
    n.directCount = n.children.length;
    let total = n.children.length;
    for (const c of n.children) total += rollUp(c);
    n.totalDownline = total;
    return total;
  };
  roots.forEach(rollUp);

  return roots;
}

function flatten(roots: AgentNodeData[]): AgentNodeData[] {
  const out: AgentNodeData[] = [];
  const walk = (n: AgentNodeData) => {
    out.push(n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

export default function AgentTreePage() {
  const treeQuery = useGetAgentTreeQuery();
  const treeNodes: AgentTreeNode[] = useMemo(() => treeQuery.data?.data ?? [], [treeQuery.data]);

  const tree = useMemo(() => buildTree(treeNodes), [treeNodes]);
  const flat = useMemo(() => flatten(tree), [tree]);

  const [search, setSearch] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPanHint, setShowPanHint] = useState(true);

  const {
    transform, isPanning, containerRef,
    centerView, handleMouseDown, attachWheelListener,
    zoomIn, zoomOut,
  } = useCanvasTransform({ initialScale: 0.8 });

  useEffect(() => {
    const t = setTimeout(() => centerView(160, 60), 150);
    return () => clearTimeout(t);
  }, [centerView, isFullscreen]);
  useEffect(() => attachWheelListener(), [attachWheelListener]);
  useEffect(() => {
    if (isPanning) setShowPanHint(false);
  }, [isPanning]);

  const toggleNode = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const expandAll = () => setCollapsedIds(new Set());
  const collapseAll = () => {
    // Collapse every node that has children — leaves nothing to collapse for
    // childless nodes.
    const toCollapse = new Set<string>();
    flat.forEach((n) => {
      if (n.children.length > 0) toCollapse.add(n.id);
    });
    setCollapsedIds(toCollapse);
  };

  // Search → highlight the first matching node.
  useEffect(() => {
    if (!search) {
      setHighlightedId(null);
      return;
    }
    const q = search.toLowerCase();
    const match = flat.find(
      (n) =>
        (n.user.first_name ?? "").toLowerCase().includes(q) ||
        (n.user.last_name ?? "").toLowerCase().includes(q) ||
        n.user.email.toLowerCase().includes(q) ||
        (n.sponsorCode ?? "").toLowerCase().includes(q),
    );
    setHighlightedId(match?.id ?? null);

    // Expand every ancestor of the match so it's visible.
    if (match) {
      const ancestors = new Set<string>();
      const findPath = (id: string): boolean => {
        const node = flat.find((n) => n.id === id);
        if (!node) return false;
        if (!node.parentId) return true;
        ancestors.add(node.parentId);
        return findPath(node.parentId);
      };
      findPath(match.id);
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        ancestors.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [search, flat]);

  // Status counts for the toolbar pill row.
  const statusCounts = useMemo(() => {
    const c = { ACTIVE: 0, PENDING_KYC: 0, SUSPENDED: 0, TERMINATED: 0 };
    flat.forEach((n) => {
      c[n.status as keyof typeof c]++;
    });
    return c;
  }, [flat]);

  const isLoading = treeQuery.isLoading;

  return (
    <div
      className={cn(
        "flex flex-col w-full transition-all duration-500 ease-in-out",
        isFullscreen
          ? "fixed inset-0 z-[100] bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm p-3 sm:p-5 md:p-6"
          : "relative h-[calc(100vh-var(--header-height,4rem))]",
      )}
    >
      {/* Header strip — title + back + status pills */}
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 border-b bg-background/95 backdrop-blur sticky top-0 z-30">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
          <Link href="/real-estate/agents" aria-label="Back to agents">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Network className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">
            Agent hierarchy
          </h1>
          <p className="text-xs text-muted-foreground">
            {flat.length} agent{flat.length === 1 ? "" : "s"} ·{" "}
            recruit edges per FR-2.2
          </p>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <StatusPill label="Active" count={statusCounts.ACTIVE} tone="emerald" />
          <StatusPill label="Pending" count={statusCounts.PENDING_KYC} tone="slate" />
          <StatusPill label="Suspended" count={statusCounts.SUSPENDED} tone="amber" />
          <StatusPill label="Terminated" count={statusCounts.TERMINATED} tone="red" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 px-3 sm:px-4 py-2.5 mx-3 sm:mx-4 mt-3 sm:mt-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-10">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-8 sm:h-9 rounded-lg sm:rounded-xl px-2.5 sm:px-4 text-xs sm:text-sm font-medium"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
            )}
            {isFullscreen ? "Exit" : "Full screen"}
          </Button>

          <div className="flex items-center bg-slate-100/80 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={zoomOut}>
              <ZoomOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <span className="min-w-[42px] sm:min-w-[52px] text-center text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums">
              {Math.round(transform.scale * 100)}%
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={zoomIn}>
              <ZoomIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8 hidden sm:flex"
              onClick={() => centerView(160, 60)}
              title="Center view"
            >
              <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>

          <div className="flex items-center bg-slate-100/80 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
            <Button variant="ghost" size="sm" className="h-7 sm:h-8 text-[11px] sm:text-xs px-2 sm:px-3" onClick={expandAll}>
              <ChevronsUpDown className="h-3.5 w-3.5 mr-1" /> Expand all
            </Button>
            <Button variant="ghost" size="sm" className="h-7 sm:h-8 text-[11px] sm:text-xs px-2 sm:px-3" onClick={collapseAll}>
              <ChevronsDownUp className="h-3.5 w-3.5 mr-1" /> Collapse all
            </Button>
          </div>
        </div>

        <div className="relative flex-shrink-0">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Find agent in tree…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 w-56 text-sm"
          />
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        className={cn(
          "flex-1 relative overflow-hidden bg-slate-50/70 dark:bg-slate-950/40 mx-3 sm:mx-4 my-3 sm:my-4 rounded-xl sm:rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-inner select-none",
          isPanning ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{
          backgroundImage: "radial-gradient(#cbd5e1 0.8px, transparent 0.8px)",
          backgroundSize: `${20 * transform.scale}px ${20 * transform.scale}px`,
          backgroundPosition: `${transform.x}px ${transform.y}px`,
        }}
      >
        {showPanHint && !isFullscreen && tree.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
            <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm px-4 py-2.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 animate-pulse">
              <Move className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Drag to pan · Scroll / pinch to zoom
              </span>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="h-40 w-60" />
          </div>
        ) : tree.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <Network className="h-10 w-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No agents in the tree yet.</p>
            <Button asChild variant="link" size="sm">
              <Link href="/real-estate/agents/new">Onboard the first agent</Link>
            </Button>
          </div>
        ) : (
          <div
            className="absolute origin-top-left will-change-transform"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transition: isPanning ? "none" : "transform 0.12s ease-out",
            }}
          >
            <div className="p-20 sm:p-32 md:p-40 lg:p-48 min-w-max flex justify-center">
              <div className="flex flex-col sm:flex-row gap-12 sm:gap-20 md:gap-28 lg:gap-36">
                {tree.map((root) => (
                  <AgentChartNode
                    key={root.id}
                    node={root}
                    isRoot
                    collapsedIds={collapsedIds}
                    onToggle={toggleNode}
                    highlightedId={highlightedId}
                    onHighlight={setHighlightedId}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "emerald" | "slate" | "amber" | "red";
}) {
  const cls = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
    slate: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-700",
    amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
    red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900",
  }[tone];
  return (
    <span
      className={cn(
        "h-7 px-2.5 rounded-full text-[11px] font-medium inline-flex items-center gap-1.5 border tabular-nums",
        cls,
      )}
    >
      {label} <span className="font-bold">{count}</span>
    </span>
  );
}
