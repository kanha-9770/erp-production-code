"use client";

/**
 * HierarchyTab — the per-user "reporting structure" view on
 * /profile#hierarchy, rendered as a top-down org chart that mirrors the role
 * hierarchy chart at /settings/company (same boxed nodes + connector lines +
 * LEVEL labels).
 *
 * Crucially this is READ-ONLY and SCOPED: it does NOT use the admin
 * RoleProvider (which loads the whole org tree and exposes edit/delete). It
 * consumes the server-scoped /api/profile/hierarchy payload — the caller's
 * ancestors (who they report to), their own role, and their descendant subtree
 * (who reports to them) — and stitches it into one connected tree:
 *
 *     topmost ancestor → … → manager → YOU → your team subtree
 *
 * Each node shows the role name, level, and a head-count; clicking a node
 * reveals the people holding that role. The presentational <TreeConnectors>
 * is shared with the admin chart so the lines look identical.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TreeConnectors } from "@/components/organization/tree-connectors";
import { useCanvasTransform } from "@/hooks/use-canvas-transform";
import {
  Network,
  Users,
  ChevronUp,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Target,
  Maximize2,
  Minimize2,
  Move,
} from "lucide-react";
import {
  useGetMyHierarchyQuery,
  type HierarchyNode,
  type HierarchyUser,
  type ScopedHierarchyChain,
} from "@/lib/api/hierarchy";

// A node in the stitched display tree. `children` here is the DISPLAY tree
// (ancestor chain linked down to `you`, then `you`'s descendants), which is
// not the same as the raw node.children for ancestor rows.
interface DisplayNode {
  node: HierarchyNode;
  children: DisplayNode[];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

// Stitch a chain (ancestors + you + descendants) into one connected tree whose
// root is the top-most ancestor (or `you` when the caller is at the top).
function buildDisplayTree(chain: ScopedHierarchyChain): DisplayNode {
  const toDisplay = (n: HierarchyNode): DisplayNode => ({
    node: n,
    children: n.children.map(toDisplay),
  });
  let root = toDisplay(chain.you);
  for (let i = chain.reportsTo.length - 1; i >= 0; i--) {
    root = { node: chain.reportsTo[i], children: [root] };
  }
  return root;
}

function PersonRow({ person }: { person: HierarchyUser }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5",
        person.isYou && "bg-primary/5",
      )}
      title={person.email}
    >
      <Avatar className="h-7 w-7 shrink-0">
        {person.avatar ? <AvatarImage src={person.avatar} alt={person.name} /> : null}
        <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground/70">
          {initials(person.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium leading-tight">
          {person.name}
          {person.isYou && (
            <span className="ml-1 text-[10px] font-semibold text-primary">(You)</span>
          )}
        </p>
        <p className="truncate text-[11px] text-muted-foreground leading-tight">
          {person.email}
        </p>
      </div>
    </div>
  );
}

// One boxed role node + its connector + (recursively) its children row.
// Mirrors the admin RoleChartNode layout so the shared TreeConnectors align,
// but is read-only (no add/edit/delete) and collapses via local state.
function OrgChartNode({
  display,
  isRoot,
  isFirst,
  isLast,
}: {
  display: DisplayNode;
  isRoot: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { node, children } = display;
  const hasChildren = children.length > 0;
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="flex flex-col items-center relative flex-1">
      <TreeConnectors isRoot={isRoot} isFirst={isFirst} isLast={isLast} />

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={`${node.roleName} — click to see who holds this role`}
            className={cn(
              "relative rounded-lg p-3 w-52 text-center z-20 mx-4 transition-all hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              node.isYou
                ? "bg-primary/5 border-2 border-primary shadow-[3px_3px_0px_0px_hsl(var(--primary))] focus-visible:ring-primary"
                : node.isAdmin
                  ? "bg-amber-50 border-2 border-amber-500 shadow-[3px_3px_0px_0px_rgba(217,119,6,1)] focus-visible:ring-amber-500"
                  : "bg-white border-2 border-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] focus-visible:ring-slate-900",
            )}
          >
            <h4 className="text-sm font-black text-slate-900 truncate">
              {node.roleName || "Untitled Role"}
            </h4>
            <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">
              Level {node.level ?? "?"}
            </p>

            <div className="mt-2 flex items-center justify-center gap-1.5">
              {node.isYou && (
                <span className="text-[9px] bg-primary/15 text-primary font-bold px-1.5 py-0.5 rounded">
                  YOU
                </span>
              )}
              {node.isAdmin && (
                <span className="text-[9px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded border border-amber-300">
                  ADMIN
                </span>
              )}
              <span className="flex items-center text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                <Users className="h-2.5 w-2.5 mr-1" />
                {node.userCount}
              </span>
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-64 p-0">
          <div className="border-b px-3 py-2">
            <p className="truncate text-sm font-semibold">{node.roleName}</p>
            <p className="text-xs text-muted-foreground">
              Level {node.level} · {node.userCount}{" "}
              {node.userCount === 1 ? "person" : "people"}
            </p>
          </div>
          <div className="max-h-60 overflow-auto p-1.5">
            {node.users.length > 0 ? (
              node.users.map((p) => <PersonRow key={p.id} person={p} />)
            ) : (
              <p className="px-2 py-3 text-center text-xs italic text-muted-foreground">
                No one holds this role yet.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {hasChildren && (
        <>
          <div className="w-px h-8 bg-slate-900 relative">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              title={expanded ? "Collapse" : "Expand"}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-white border-2 border-slate-900 rounded-full flex items-center justify-center z-40 hover:bg-slate-100"
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
          {expanded && (
            <div className="flex items-start justify-center w-full pt-1">
              {children.map((child, idx) => (
                <OrgChartNode
                  key={child.node.roleId}
                  display={child}
                  isRoot={false}
                  isFirst={idx === 0}
                  isLast={idx === children.length - 1}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChainChart({
  chain,
  heading,
}: {
  chain: ScopedHierarchyChain;
  heading?: string;
}) {
  const root = buildDisplayTree(chain);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHint, setShowHint] = useState(true);

  // Same pan/zoom canvas the /settings/company role chart uses: drag to pan,
  // wheel/pinch to zoom toward the cursor, +/- buttons, center, fullscreen.
  const {
    transform,
    setTransform,
    isPanning,
    containerRef,
    handleMouseDown,
    attachWheelListener,
    zoomIn,
    zoomOut,
  } = useCanvasTransform({ initialScale: 0.85, minScale: 0.3, maxScale: 2 });
  const stageRef = useRef<HTMLDivElement>(null);

  // Center the tree horizontally within the canvas (its content is
  // justify-center, so the root lands in the middle) and pin it near the top.
  const centerStage = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cw = container.clientWidth;
    const scale = window.innerWidth < 640 ? 0.6 : 0.85;
    const stageW = stageRef.current?.scrollWidth ?? 0;
    setTransform({
      x: Math.round(cw / 2 - (stageW / 2) * scale),
      y: 24,
      scale,
    });
  }, [containerRef, setTransform]);

  useEffect(() => {
    const t = setTimeout(centerStage, 150);
    const onResize = () => centerStage();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
    // Re-center when the layout context changes (fullscreen toggle, new data).
  }, [centerStage, isFullscreen]);

  useEffect(() => attachWheelListener(), [attachWheelListener]);
  useEffect(() => {
    if (isPanning) setShowHint(false);
  }, [isPanning]);

  return (
    <div
      className={cn(
        "space-y-2",
        isFullscreen &&
          "fixed inset-0 z-[100] bg-background p-3 sm:p-5 overflow-auto",
      )}
    >
      {heading && (
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <span>As {heading}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}
      {chain.totalReports > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80 tabular-nums">
            {chain.totalReports}
          </span>{" "}
          {chain.totalReports === 1 ? "person reports" : "people report"} up to you.
        </p>
      )}

      <div className="relative">
        {/* Control bar (zoom out / % / zoom in / center / fullscreen) */}
        <div className="absolute right-2 top-2 z-30 flex items-center gap-0.5 rounded-lg border bg-background/90 p-0.5 shadow-sm backdrop-blur">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={zoomOut} title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-10 text-center text-xs font-semibold tabular-nums text-muted-foreground">
            {Math.round(transform.scale * 100)}%
          </span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={zoomIn} title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => centerStage()} title="Center / reset view">
            <Target className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsFullscreen((f) => !f)} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>

        {/* Pan/zoom canvas — dotted background that tracks the transform,
            matching the /settings/company role chart. Read-only. */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown as unknown as React.TouchEventHandler<HTMLDivElement>}
          className={cn(
            "relative overflow-hidden rounded-xl border bg-slate-50/70 dark:bg-slate-950/40 select-none",
            isPanning ? "cursor-grabbing" : "cursor-grab",
            isFullscreen ? "h-[calc(100vh-7rem)]" : "h-[62vh]",
          )}
          style={{
            backgroundImage: "radial-gradient(#cbd5e1 0.8px, transparent 0.8px)",
            backgroundSize: `${20 * transform.scale}px ${20 * transform.scale}px`,
            backgroundPosition: `${transform.x}px ${transform.y}px`,
          }}
        >
          {showHint && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur dark:bg-slate-800/85 dark:text-slate-300">
                <Move className="h-3 w-3" /> Drag to pan · scroll to zoom
              </span>
            </div>
          )}

          <div
            ref={stageRef}
            className="absolute origin-top-left will-change-transform"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transition: isPanning ? "none" : "transform 0.12s ease-out",
            }}
          >
            <div className="min-w-max flex justify-center p-8 sm:p-12">
              <OrgChartNode display={root} isRoot isFirst isLast />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HierarchyTab() {
  const { data, isLoading, isError } = useGetMyHierarchyQuery();

  if (isLoading) {
    return <HierarchySkeleton />;
  }

  if (isError || !data?.success) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Network className="mx-auto h-7 w-7 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">Couldn&apos;t load your reporting structure</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Please refresh the page or try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hierarchy = data.data;

  if (!hierarchy.hasRole || hierarchy.chains.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border bg-muted/50 text-muted-foreground">
            <Network className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium">No role assigned yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
            You haven&apos;t been placed in the organization hierarchy. Ask your
            administrator to assign you a role in Settings → Company.
          </p>
        </CardContent>
      </Card>
    );
  }

  const multi = hierarchy.chains.length > 1;

  return (
    <div className="space-y-6 pb-12">
      {/* Intro */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Network className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">Reporting structure</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Where you sit in the organization — who you report to and who reports
            to you. Click any role to see who holds it.
          </p>
        </div>
      </div>

      {hierarchy.chains.map((chain) => (
        <ChainChart
          key={chain.you.roleId}
          chain={chain}
          heading={multi ? chain.you.roleName : undefined}
        />
      ))}
    </div>
  );
}

function HierarchySkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <Skeleton className="h-[60vh] w-full rounded-xl" />
    </div>
  );
}
