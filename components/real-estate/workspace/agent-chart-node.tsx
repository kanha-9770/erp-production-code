"use client";

/**
 * AgentChartNode — visual twin of the company-hierarchy ChartNode used at
 * /settings/company. Same neo-brutalist shadow, same connector edges, same
 * collapse chevron — but with agent fields (avatar, rank, status badges,
 * recruits/team counts) and the REBM colour palette.
 *
 * Decoupled from any context: takes `node`, `expandedIds`, and toggle/click
 * callbacks via props. The tree page owns the data and the collapsed state.
 */

import Link from "next/link";
import { ChevronDown, ChevronUp, Shield, Sparkles, Users, Settings2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { TreeConnectors } from "@/components/organization/tree-connectors";
import {
  AGENT_STATUS_LABEL, AGENT_STATUS_VARIANT,
  AGENT_COMPLIANCE_VARIANT, AGENT_COMPLIANCE_LABEL,
  fullName, initials,
} from "@/components/real-estate/constants";
import type { AgentTreeNode } from "@/lib/api/real-estate/types";
import { Badge } from "@/components/ui/badge";

export interface AgentNodeData extends AgentTreeNode {
  children: AgentNodeData[];
  // Aggregated counts populated when building the tree.
  directCount: number;
  totalDownline: number;
}

interface Props {
  node: AgentNodeData;
  isFirst?: boolean;
  isLast?: boolean;
  isRoot?: boolean;
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
  highlightedId?: string | null;
  onHighlight?: (id: string | null) => void;
}

export function AgentChartNode({
  node,
  isFirst = false,
  isLast = false,
  isRoot = false,
  collapsedIds,
  onToggle,
  highlightedId,
  onHighlight,
}: Props) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.id);
  const isHighlighted = highlightedId === node.id;

  // Status drives the card border accent so the user can spot suspended /
  // terminated branches at a glance from across the canvas.
  const accent =
    node.status === "TERMINATED"
      ? "border-red-500 shadow-[4px_4px_0px_0px_rgb(239,68,68)]"
      : node.status === "SUSPENDED"
      ? "border-amber-500 shadow-[4px_4px_0px_0px_rgb(245,158,11)]"
      : node.status === "PENDING_KYC"
      ? "border-slate-500 shadow-[4px_4px_0px_0px_rgb(100,116,139)]"
      : "border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]";

  const u = node.user;

  return (
    <div className="flex flex-col items-center relative flex-1">
      <TreeConnectors isRoot={isRoot} isFirst={isFirst} isLast={isLast} />

      <div
        className={cn(
          "relative group bg-white border-2 rounded-lg p-3 w-60 z-20 mx-3 transition-all",
          "hover:-translate-y-1",
          accent,
          isHighlighted && "ring-4 ring-primary/40",
        )}
        onMouseEnter={() => onHighlight?.(node.id)}
        onMouseLeave={() => onHighlight?.(null)}
      >
        <div className="flex items-start gap-2.5">
          <Avatar className="h-10 w-10 shrink-0 border-2 border-slate-200">
            <AvatarImage src={u.avatar ?? undefined} alt={fullName(u)} />
            <AvatarFallback className="text-xs font-bold">{initials(u)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-black text-slate-900 leading-tight truncate">
              {fullName(u)}
            </h4>
            <p className="text-[10px] font-medium text-slate-500 truncate">{u.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 mt-2 pt-2 border-t border-slate-100">
          {node.rank && (
            <Badge variant="outline" className="text-[9px] gap-0.5 px-1.5 py-0 border-slate-300 font-bold uppercase">
              <Sparkles className="h-2.5 w-2.5" /> {node.rank.name}
            </Badge>
          )}
          <Badge
            variant={AGENT_STATUS_VARIANT[node.status]}
            className="text-[9px] px-1.5 py-0 font-bold uppercase"
          >
            {AGENT_STATUS_LABEL[node.status]}
          </Badge>
          {node.complianceStatus && node.complianceStatus !== "COMPLIANT" && (
            <Badge
              variant={AGENT_COMPLIANCE_VARIANT[node.complianceStatus]}
              className="text-[9px] px-1.5 py-0 gap-0.5"
            >
              <Shield className="h-2.5 w-2.5" />
              {AGENT_COMPLIANCE_LABEL[node.complianceStatus]}
            </Badge>
          )}
        </div>

        {(node.directCount > 0 || node.totalDownline > 0) && (
          <div className="flex items-center justify-around mt-2 pt-2 border-t border-slate-100 text-[9px] font-bold">
            <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
              <Users className="h-2.5 w-2.5" /> {node.directCount} direct
            </span>
            <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
              <Users className="h-2.5 w-2.5" /> {node.totalDownline} total
            </span>
          </div>
        )}

        {/* Hover floating actions — open profile / settings */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 z-30">
          <Link
            href={`/real-estate/agents/${node.id}`}
            className="bg-slate-900 text-white p-1.5 rounded-full shadow-lg hover:bg-indigo-600 transition-colors"
            title="Open agent profile"
          >
            <Users className="h-3 w-3" />
          </Link>
          <Link
            href={`/real-estate/agents/${node.id}/edit`}
            className="bg-white border-2 border-slate-900 p-1.5 rounded-full shadow-lg hover:bg-slate-100"
            title="Edit"
          >
            <Settings2 className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {hasChildren && (
        <>
          <div className="w-px h-8 bg-slate-900 relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(node.id);
              }}
              className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                "w-7 h-7 bg-white border-2 border-slate-900 rounded-full",
                "flex items-center justify-center z-40 shadow-md",
                "hover:bg-slate-900 hover:text-white transition-all",
              )}
              aria-label={isCollapsed ? "Expand subtree" : "Collapse subtree"}
            >
              {isCollapsed ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
              {isCollapsed && (
                <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[9px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                  {node.totalDownline}
                </span>
              )}
            </button>
          </div>
          {!isCollapsed && (
            <div className="flex items-start justify-center w-full animate-in fade-in slide-in-from-top-2 duration-300">
              {node.children.map((child, idx) => (
                <AgentChartNode
                  key={child.id}
                  node={child}
                  isFirst={idx === 0}
                  isLast={idx === node.children.length - 1}
                  collapsedIds={collapsedIds}
                  onToggle={onToggle}
                  highlightedId={highlightedId}
                  onHighlight={onHighlight}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
