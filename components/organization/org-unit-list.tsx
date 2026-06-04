"use client";

/**
 * OrgUnitList — a compact, collapsible outline view of the org-unit hierarchy.
 * A reusable alternative to the canvas chart that's denser and easier to scan
 * for big/deep trees. Shares the same role-context data + actions as the chart,
 * so click-to-edit, add sub-unit, and delete behave identically.
 *
 * Lives in components/organization so it can be reused anywhere (settings,
 * departments, dashboards, …).
 */

import React from "react";
import {
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Users,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoles } from "@/context/role-context";
import { useToast } from "@/hooks/use-toast";
import { useDeleteOrgUnitMutation } from "@/lib/api/organization";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrganizationUnit } from "@/types/role";

export function OrgUnitList() {
  const { state } = useRoles();
  const units = state.organizationUnits ?? [];

  if (state.loading && units.length === 0) {
    return (
      <div className="space-y-2 p-3 sm:p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Nothing here yet. Use the add button above to create the first one.
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-3 max-h-[70vh] overflow-y-auto">
      <ul className="space-y-0.5">
        {units.map((u) => (
          <ListRow key={u.id} unit={u} depth={0} isRoot rootCount={units.length} />
        ))}
      </ul>
    </div>
  );
}

function ListRow({
  unit,
  depth,
  isRoot = false,
  rootCount = 0,
}: {
  unit: OrganizationUnit;
  depth: number;
  isRoot?: boolean;
  rootCount?: number;
}) {
  const { state, dispatch, refreshData } = useRoles();
  const { toast } = useToast();
  const [deleteOrgUnit] = useDeleteOrgUnitMutation();

  const children = unit.children ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = !state.expandedOrgNodes?.has(unit.id);
  const isOnlyRoot = isRoot && rootCount === 1;

  const edit = () =>
    dispatch({ type: "SELECT_ORG_UNIT", payload: { unit: { ...unit } } });

  const addChild = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({
      type: "SELECT_ORG_UNIT",
      payload: {
        unit: {
          id: "new",
          parentId: unit.id,
          name: "",
          description: "",
          children: [],
          unitRoles: [],
          userAssignments: [],
        } as unknown as OrganizationUnit,
      },
    });
  };

  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${unit.name}" and all descendants?`)) return;
    try {
      await deleteOrgUnit({
        organizationId: state.organizationId ?? "",
        unitId: unit.id,
      }).unwrap();
      await refreshData();
      toast({ title: "Deleted", description: "Removed successfully" });
    } catch (err) {
      toast({
        title: "Error",
        description: (err as Error).message || "Failed to delete",
        variant: "destructive",
      });
    }
  };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: "TOGGLE_ORG_EXPAND", payload: { unitId: unit.id } });
  };

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={edit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            edit();
          }
        }}
        title="Click to edit"
        style={{ paddingLeft: depth * 20 + 8 }}
        className={cn(
          "group flex items-center gap-2 rounded-lg pr-2 py-2 cursor-pointer",
          "hover:bg-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors",
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={toggle}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                isExpanded && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}

        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            isRoot
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Building2 className="h-3.5 w-3.5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {unit.name || "Untitled"}
          </p>
          {unit.description && (
            <p className="truncate text-xs text-muted-foreground">
              {unit.description}
            </p>
          )}
        </div>

        <span className="hidden sm:flex items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1 rounded bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
            <Shield className="h-3 w-3" />
            {unit.unitRoles?.length ?? 0}
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
            <Users className="h-3 w-3" />
            {unit.userAssignments?.length ?? 0}
          </span>
        </span>

        <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={addChild}
            aria-label="Add sub-item"
            title="Add sub-item"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              edit();
            }}
            aria-label="Edit"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {!isOnlyRoot && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={remove}
              aria-label="Delete"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </span>
      </div>

      {hasChildren && isExpanded && (
        <ul className="space-y-0.5">
          {children.map((c) => (
            <ListRow key={c.id} unit={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
