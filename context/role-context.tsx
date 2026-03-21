"use client";

import type React from "react";
import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type {
  Role,
  RoleFormData,
  OrganizationUnit,
  OrganizationUnitFormData,
} from "@/types/role";
import { useToast } from "@/hooks/use-toast";
import { useGetUserQuery } from "@/lib/api/auth";
import {
  useEnsureOrganizationMutation,
  useGetOrgRolesQuery,
  useGetOrgUnitsQuery,
} from "@/lib/api/organization";

interface RoleState {
  roles: Role[];
  organizationUnits: OrganizationUnit[];
  expandedNodes: Set<string>;
  expandedOrgNodes: Set<string>;
  selectedRole: Role | null;
  selectedOrgUnit: OrganizationUnit | null;
  isRoleSheetOpen: boolean;
  isOrgFormOpen: boolean;
  isHeaderCollapsed: boolean;
  isTreeOnlyMode: boolean;
  isStatsPopupOpen: boolean;
  isOrgStatsPopupOpen: boolean;
  loading: boolean;
  error: string | null;
  organizationId: string | null;
  showUserManagementSheet: boolean;
}

type RoleAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_ROLES"; payload: Role[] }
  | { type: "SET_ORGANIZATION_UNITS"; payload: OrganizationUnit[] }
  | { type: "ADD_ROLE"; payload: { parentId?: string; roleData: RoleFormData } }
  | {
      type: "UPDATE_ROLE";
      payload: { roleId: string; roleData: Partial<RoleFormData> };
    }
  | { type: "DELETE_ROLE"; payload: { roleId: string } }
  | { type: "TOGGLE_EXPAND"; payload: { roleId: string } }
  | { type: "TOGGLE_ORG_EXPAND"; payload: { unitId: string } }
  | { type: "EXPAND_ALL" }
  | { type: "COLLAPSE_ALL" }
  | { type: "EXPAND_ALL_ORG" }
  | { type: "COLLAPSE_ALL_ORG" }
  | { type: "SELECT_ROLE"; payload: { role: Role | null } }
  | { type: "TOGGLE_ROLE_SHEET" }
  | { type: "OPEN_ROLE_SHEET" }
  | { type: "CLOSE_ROLE_SHEET" }
  | { type: "TOGGLE_HEADER_COLLAPSE" }
  | { type: "TOGGLE_TREE_ONLY_MODE" }
  | { type: "TOGGLE_STATS_POPUP" }
  | { type: "TOGGLE_ORG_STATS_POPUP" }
  | {
      type: "ADD_ORG_UNIT";
      payload: { parentId?: string; unitData: OrganizationUnitFormData };
    }
  | {
      type: "UPDATE_ORG_UNIT";
      payload: { unitId: string; unitData: Partial<OrganizationUnitFormData> };
    }
  | { type: "DELETE_ORG_UNIT"; payload: { unitId: string } }
  | { type: "SELECT_ORG_UNIT"; payload: { unit: OrganizationUnit | null } }
  | { type: "CLOSE_ORG_FORM" }
  | { type: "ASSIGN_ROLE_TO_UNIT"; payload: { unitId: string; roleId: string } }
  | {
      type: "REMOVE_ROLE_FROM_UNIT";
      payload: { unitId: string; roleId: string };
    }
  | {
      type: "ASSIGN_USER_TO_UNIT";
      payload: { unitId: string; userId: string; roleId: string };
    }
  | {
      type: "REMOVE_USER_FROM_UNIT";
      payload: { unitId: string; userId: string };
    }
  | { type: "SET_ORGANIZATION_ID"; payload: string | null }
  | { type: "OPEN_USER_MANAGEMENT_SHEET" }
  | { type: "CLOSE_USER_MANAGEMENT_SHEET" };

const initialState: RoleState = {
  roles: [],
  organizationUnits: [],
  expandedNodes: new Set(),
  expandedOrgNodes: new Set(),
  selectedRole: null,
  selectedOrgUnit: null,
  isRoleSheetOpen: false,
  isOrgFormOpen: false,
  isHeaderCollapsed: false,
  isTreeOnlyMode: false,
  isStatsPopupOpen: false,
  isOrgStatsPopupOpen: false,
  loading: false,
  error: null,
  organizationId: null,
  showUserManagementSheet: false,
};

const RoleContext = createContext<{
  state: RoleState;
  dispatch: React.Dispatch<RoleAction>;
  refreshData: () => Promise<void>;
} | null>(null);

// Helper: Recursively remove a role and all its descendants
function removeRoleAndDescendants(roles: Role[], targetId: string): Role[] {
  return roles
    .filter((role) => role.id !== targetId)
    .map((role) => ({
      ...role,
      children: removeRoleAndDescendants(role.children || [], targetId),
    }));
}

function roleReducer(state: RoleState, action: RoleAction): RoleState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };

    case "SET_ROLES":
      return { ...state, roles: action.payload, loading: false };

    case "SET_ORGANIZATION_UNITS":
      return { ...state, organizationUnits: action.payload, loading: false };

    case "SET_ORGANIZATION_ID":
      return { ...state, organizationId: action.payload };

    case "DELETE_ROLE": {
      const { roleId } = action.payload;
      const newRoles = removeRoleAndDescendants(state.roles, roleId);
      const newExpanded = new Set(state.expandedNodes);
      newExpanded.delete(roleId);

      return {
        ...state,
        roles: newRoles,
        expandedNodes: newExpanded,
        selectedRole:
          state.selectedRole?.id === roleId ? null : state.selectedRole,
      };
    }

    case "ADD_ROLE":
    case "UPDATE_ROLE":
      return state;

    case "TOGGLE_EXPAND": {
      const { roleId } = action.payload;
      const newExpanded = new Set(state.expandedNodes);
      if (newExpanded.has(roleId)) {
        newExpanded.delete(roleId);
      } else {
        newExpanded.add(roleId);
      }
      return { ...state, expandedNodes: newExpanded };
    }

    case "TOGGLE_ORG_EXPAND": {
      const { unitId } = action.payload;
      const newExpanded = new Set(state.expandedOrgNodes);
      if (newExpanded.has(unitId)) {
        newExpanded.delete(unitId);
      } else {
        newExpanded.add(unitId);
      }
      return { ...state, expandedOrgNodes: newExpanded };
    }

    case "EXPAND_ALL": {
      const allIds = getAllRoleIds(state.roles);
      return { ...state, expandedNodes: new Set(allIds) };
    }

    case "COLLAPSE_ALL":
      return { ...state, expandedNodes: new Set() };

    case "EXPAND_ALL_ORG":
      return { ...state, expandedOrgNodes: new Set() };

    case "COLLAPSE_ALL_ORG": {
      const allIds = getAllOrgIds(state.organizationUnits);
      return { ...state, expandedOrgNodes: new Set(allIds) };
    }

    case "SELECT_ROLE":
      return { ...state, selectedRole: action.payload.role };

    case "TOGGLE_ROLE_SHEET":
      return { ...state, isRoleSheetOpen: !state.isRoleSheetOpen };

    case "OPEN_ROLE_SHEET":
      return { ...state, isRoleSheetOpen: true };

    case "CLOSE_ROLE_SHEET":
      return { ...state, isRoleSheetOpen: false };

    case "TOGGLE_HEADER_COLLAPSE":
      return { ...state, isHeaderCollapsed: !state.isHeaderCollapsed };

    case "TOGGLE_TREE_ONLY_MODE":
      return { ...state, isTreeOnlyMode: !state.isTreeOnlyMode };

    case "TOGGLE_STATS_POPUP":
      return { ...state, isStatsPopupOpen: !state.isStatsPopupOpen };

    case "TOGGLE_ORG_STATS_POPUP":
      return { ...state, isOrgStatsPopupOpen: !state.isOrgStatsPopupOpen };

    case "ADD_ORG_UNIT":
    case "UPDATE_ORG_UNIT":
    case "DELETE_ORG_UNIT":
    case "ASSIGN_ROLE_TO_UNIT":
    case "REMOVE_ROLE_FROM_UNIT":
    case "ASSIGN_USER_TO_UNIT":
    case "REMOVE_USER_FROM_UNIT":
      return state;

    case "SELECT_ORG_UNIT": {
      const unit = action.payload.unit;
      return {
        ...state,
        selectedOrgUnit: unit,
        isOrgFormOpen: !!unit,
      };
    }

    case "CLOSE_ORG_FORM":
      return {
        ...state,
        selectedOrgUnit: null,
        isOrgFormOpen: false,
      };

    case "OPEN_USER_MANAGEMENT_SHEET":
      return { ...state, showUserManagementSheet: true };

    case "CLOSE_USER_MANAGEMENT_SHEET":
      return { ...state, showUserManagementSheet: false };

    default:
      return state;
  }
}

function getAllRoleIds(roles: Role[]): string[] {
  const ids: string[] = [];
  roles.forEach((role) => {
    ids.push(role.id);
    ids.push(...getAllRoleIds(role.children));
  });
  return ids;
}

function getAllOrgIds(units: OrganizationUnit[]): string[] {
  const ids: string[] = [];
  units.forEach((unit) => {
    ids.push(unit.id);
    ids.push(...getAllOrgIds(unit.children));
  });
  return ids;
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(roleReducer, initialState);
  const { toast } = useToast();

  // Get organization ID from the authenticated user via RTK Query
  const { data: userData, isLoading: userLoading } = useGetUserQuery();

  const organizationId = userData?.user?.organization?.id ?? null;

  // Set organization ID when user data loads
  useEffect(() => {
    if (userLoading) return;
    if (organizationId) {
      dispatch({ type: "SET_ORGANIZATION_ID", payload: organizationId });
    } else if (!userLoading && !organizationId) {
      dispatch({ type: "SET_ERROR", payload: "Failed to load organization data" });
    }
  }, [organizationId, userLoading]);

  // Ensure organization exists
  const [ensureOrg] = useEnsureOrganizationMutation();

  // Fetch roles and units via RTK Query (skip if no org ID)
  const {
    data: rolesData,
    isLoading: rolesLoading,
    refetch: refetchRoles,
  } = useGetOrgRolesQuery(state.organizationId!, {
    skip: !state.organizationId,
  });

  const {
    data: unitsData,
    isLoading: unitsLoading,
    refetch: refetchUnits,
  } = useGetOrgUnitsQuery(state.organizationId!, {
    skip: !state.organizationId,
  });

  // Sync RTK Query data into reducer state
  useEffect(() => {
    if (rolesData) {
      dispatch({ type: "SET_ROLES", payload: rolesData });
    }
  }, [rolesData]);

  useEffect(() => {
    if (unitsData) {
      dispatch({ type: "SET_ORGANIZATION_UNITS", payload: unitsData });
    }
  }, [unitsData]);

  // Sync loading state
  useEffect(() => {
    dispatch({ type: "SET_LOADING", payload: userLoading || rolesLoading || unitsLoading });
  }, [userLoading, rolesLoading, unitsLoading]);

  // Ensure org on first load
  useEffect(() => {
    if (state.organizationId) {
      ensureOrg({ id: state.organizationId, name: "Default Organization" }).catch(() => {});
    }
  }, [state.organizationId, ensureOrg]);

  const refreshData = useCallback(async () => {
    if (!state.organizationId) return;

    try {
      dispatch({ type: "SET_LOADING", payload: true });
      await ensureOrg({ id: state.organizationId, name: "Default Organization" }).unwrap();
      await Promise.all([refetchRoles(), refetchUnits()]);
      dispatch({ type: "SET_ERROR", payload: null });
    } catch {
      dispatch({ type: "SET_ERROR", payload: "Failed to load data" });
      toast({
        title: "Error",
        description: "Failed to refresh data",
        variant: "destructive",
      });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [state.organizationId, ensureOrg, refetchRoles, refetchUnits, toast]);

  return (
    <RoleContext.Provider value={{ state, dispatch, refreshData }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRoles() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRoles must be used within a RoleProvider");
  }
  return context;
}
