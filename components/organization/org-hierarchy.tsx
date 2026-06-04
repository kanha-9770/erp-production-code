"use client";

/**
 * OrgHierarchy — the reusable organization-unit hierarchy, embeddable anywhere.
 *
 * Renders the same canvas chart as the Role Hierarchy (zoom / pan / device
 * preview / fullscreen) with two views over one data source:
 *   • Chart — the canvas org chart (default).
 *   • List  — a dense collapsible outline (OrgUnitList).
 *
 * Self-contained: it brings its own RoleProvider (data + actions) and the
 * OrganizationUnitFormModal (the edit/create dialog). A top "Add" button
 * creates a root node; hovering a node adds a sub-node or deletes it; clicking
 * a node edits it. Drop it into Organization Structure, Departments, a
 * dashboard widget, etc.
 *
 * Props:
 *   • addLabel    — label for the create-root button (e.g. "Add Department").
 *   • defaultView — "chart" (default) or "list".
 */

import { useState } from "react";
import { RoleProvider, useRoles } from "@/context/role-context";
import { OrganizationTree } from "./organization-tree";
import { OrganizationUnitFormModal } from "./organization-unit-form-modal";
import { OrgUnitList } from "./org-unit-list";
import { Button } from "@/components/ui/button";
import { Plus, Network, List, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrganizationUnit } from "@/types/role";

export type HierarchyView = "chart" | "list";

interface OrgHierarchyProps {
  addLabel?: string;
  defaultView?: HierarchyView;
}

export function OrgHierarchy({
  addLabel = "New Unit",
  defaultView = "chart",
}: OrgHierarchyProps) {
  return (
    <RoleProvider>
      <OrgHierarchyInner addLabel={addLabel} defaultView={defaultView} />
      <OrganizationUnitFormModal />
    </RoleProvider>
  );
}

function OrgHierarchyInner({
  addLabel,
  defaultView,
}: Required<OrgHierarchyProps>) {
  const { state, dispatch } = useRoles();
  const [view, setView] = useState<HierarchyView>(defaultView);

  const addRoot = () =>
    dispatch({
      type: "SELECT_ORG_UNIT",
      payload: {
        unit: {
          id: "new",
          name: "",
          description: "",
          children: [],
          unitRoles: [],
          userAssignments: [],
        } as unknown as OrganizationUnit,
      },
    });

  const canEdit = !!state.organizationId;

  const addButton = canEdit ? (
    <Button size="sm" className="h-8 sm:h-9" onClick={addRoot}>
      <Plus className="h-4 w-4 mr-1.5" />
      {addLabel}
    </Button>
  ) : null;

  const switcher = (
    <div className="inline-flex shrink-0 rounded-lg border bg-background p-0.5">
      <ViewButton
        active={view === "chart"}
        onClick={() => setView("chart")}
        icon={<Network className="h-3.5 w-3.5" />}
        label="Chart"
      />
      <ViewButton
        active={view === "list"}
        onClick={() => setView("list")}
        icon={<List className="h-3.5 w-3.5" />}
        label="List"
      />
    </div>
  );

  const controls = (
    <div className="flex items-center gap-2">
      {addButton}
      {switcher}
    </div>
  );

  if (view === "chart") {
    return (
      <div className="px-2 sm:px-3 pt-2 pb-1">
        <OrganizationTree toolbarStart={addButton} toolbarEnd={switcher} />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2 border-b bg-muted/20">
        <span className="hidden md:flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Click to edit · hover to add or delete</span>
        </span>
        <div className="ml-auto">{controls}</div>
      </div>
      <OrgUnitList />
    </>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
