"use client";

import { RoleProvider, useRoles } from "@/context/role-context";
import { OrganizationTree } from "@/components/organization/organization-tree";
import { RoleManagementSheet } from "@/components/organization/role-management-sheet";
import { RoleFormModal } from "@/components/organization/role-form-modal";
import { OrganizationUnitFormModal } from "@/components/organization/organization-unit-form-modal";
import { StatisticsPopup } from "@/components/organization/statistics-popup";
import { UserManagementSheet } from "@/components/organization/user-management-sheet";
import { Shield, HelpCircle, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Header – now safe because it's inside RoleProvider

function OrganizationHeader() {
  const { dispatch } = useRoles();  // ← only dispatch – no state needed here

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-white/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-indigo-200 shadow-lg">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">
              Org Architecture
            </h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Hierarchy & Permissions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                  onClick={() => dispatch({ type: "TOGGLE_ORG_STATS_POPUP" })}
                >
                  <HelpCircle className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View Analytics & Stats</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="h-6 w-[1px] bg-slate-200 mx-2" />

          <Button
            onClick={() => dispatch({ type: "OPEN_ROLE_SHEET" })}
            variant="outline"
            className="hidden sm:flex items-center gap-2 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50 text-slate-700"
          >
            <Shield className="h-4 w-4 text-indigo-600" />
            <span>Manage Roles</span>
          </Button>

          <Button
            onClick={() => dispatch({ type: "OPEN_USER_MANAGEMENT_SHEET" })}
            variant="outline"
            className="hidden sm:flex items-center gap-2 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50 text-slate-700"
          >
            <Users className="h-4 w-4 text-indigo-600" />
            <span>Manage Users</span>
          </Button>

          <Button
            className="bg-indigo-600 hover:bg-indigo-700 shadow-md"
            onClick={() =>
              dispatch({
                type: "SELECT_ORG_UNIT",
                payload: {
                  unit: {
                    id: "new",
                    name: "",
                    description: "",
                    level: 0,
                    children: [],
                    assignedRoles: [],
                    assignedUsers: [],
                  },
                },
              })
            }
          >
            <Plus className="h-4 w-4 mr-1" /> New Unit
          </Button>
        </div>
      </div>
    </header>
  );
}

// Main page component – no useRoles() at this level

export default function OrganizationManagement() {
  return (
    <RoleProvider>
      <OrganizationManagementContent />
    </RoleProvider>
  );
}

// Separated content – now safe to use context here

function OrganizationManagementContent() {
  const { state, dispatch } = useRoles();

  return (
    <div className="min-h-screen bg-slate-50/50">
      <OrganizationHeader />

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        <OrganizationTree />
        <RoleManagementSheet />
        <RoleFormModal />
        <OrganizationUnitFormModal />
        <StatisticsPopup />

        <UserManagementSheet
          open={state.showUserManagementSheet}
          onOpenChange={(open) =>
            dispatch({
              type: open ? "OPEN_USER_MANAGEMENT_SHEET" : "CLOSE_USER_MANAGEMENT_SHEET",
            })
          }
        />
      </main>
    </div>
  );
}