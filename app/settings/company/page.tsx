"use client";

import React from "react";
import { RoleProvider, useRoles } from "@/context/role-context";
import { OrganizationTree } from "@/components/organization/organization-tree";
import { RoleManagementSheet } from "@/components/organization/role-management-sheet";
import { RoleFormModal } from "@/components/organization/role-form-modal";
import { OrganizationUnitFormModal } from "@/components/organization/organization-unit-form-modal";
import { StatisticsPopup } from "@/components/organization/statistics-popup";
import { UserManagementSheet } from "@/components/organization/user-management-sheet";
import { Shield, HelpCircle, Plus, Users, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// ─── Responsive Header ────────────────────────────────────────────────
function OrganizationHeader() {
  const { dispatch } = useRoles();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-14 sm:h-16 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl bg-indigo-600 shadow-md">
            <Shield className="h-4.5 w-4.5 sm:h-5.5 sm:w-5.5 text-white" />
          </div>

          <div className="hidden sm:block">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Org Architecture
            </h1>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wider">
              Hierarchy & Permissions
            </p>
          </div>

          {/* Short title on mobile */}
          <h1 className="sm:hidden text-base font-bold text-slate-900">
            Org Structure
          </h1>
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-2 sm:gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                  onClick={() => dispatch({ type: "TOGGLE_ORG_STATS_POPUP" })}
                >
                  <HelpCircle className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Analytics & Statistics
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="h-5 w-px bg-slate-200 mx-2" />

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-slate-300 hover:border-indigo-200 hover:bg-indigo-50/60 text-slate-700 h-9 px-3 sm:px-4"
            onClick={() => dispatch({ type: "OPEN_ROLE_SHEET" })}
          >
            <Shield className="h-4 w-4 text-indigo-600" />
            <span>Roles</span>
          </Button>


          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 h-9 px-4 sm:px-5 shadow-sm"
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
            <Plus className="mr-1.5 h-4 w-4" />
            New Unit
          </Button>
        </div>

        {/* Mobile Hamburger Menu */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] sm:w-80 pt-12">
              <div className="flex flex-col gap-4 mt-6">
                <Button
                  variant="outline"
                  className="justify-start gap-2 text-base h-11"
                  onClick={() => dispatch({ type: "TOGGLE_ORG_STATS_POPUP" })}
                >
                  <HelpCircle className="h-5 w-5" />
                  View Statistics
                </Button>

                <Button
                  variant="outline"
                  className="justify-start gap-2 text-base h-11"
                  onClick={() => dispatch({ type: "OPEN_ROLE_SHEET" })}
                >
                  <Shield className="h-5 w-5 text-indigo-600" />
                  Manage Roles
                </Button>

                <Button
                  variant="outline"
                  className="justify-start gap-2 text-base h-11"
                  onClick={() =>
                    dispatch({ type: "OPEN_USER_MANAGEMENT_SHEET" })
                  }
                >
                  <Users className="h-5 w-5 text-indigo-600" />
                  Manage Users
                </Button>

                <Button
                  className="h-11 text-base justify-start gap-2 bg-indigo-600 hover:bg-indigo-700"
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
                  <Plus className="h-5 w-5" />
                  Create New Unit
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function OrganizationManagement() {
  return (
    <RoleProvider>
      <OrganizationManagementContent />
    </RoleProvider>
  );
}

// ─── Content Wrapper ──────────────────────────────────────────────────
function OrganizationManagementContent() {
  const { state, dispatch } = useRoles();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <OrganizationHeader />

      <main className="mx-auto max-w-screen-2xl px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="py-4 sm:py-6 md:py-8">
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <OrganizationTree />
          </div>
        </div>
      </main>

      {/* All overlays / sheets / modals */}
      <RoleManagementSheet />
      <RoleFormModal />
      <OrganizationUnitFormModal />
      <StatisticsPopup isOpen={false} onClose={function (): void {
        throw new Error("Function not implemented.");
      } } type={"roles"} data={undefined} expandedCount={0} />
      <UserManagementSheet
        open={state.showUserManagementSheet}
        onOpenChange={(open) =>
          dispatch({
            type: open
              ? "OPEN_USER_MANAGEMENT_SHEET"
              : "CLOSE_USER_MANAGEMENT_SHEET",
          })
        }
      />
    </div>
  );
}
