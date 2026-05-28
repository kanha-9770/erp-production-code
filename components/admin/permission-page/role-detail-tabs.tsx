"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, Users as UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { UsersTab } from "./users-tab";
import { UserOverrideSheet } from "./user-override-sheet";
import type { RoleListItem } from "./role-list";

interface RoleDetailTabsProps {
  role: RoleListItem;
  /** Slot for the existing role-permissions matrices (or any other content). */
  permissionsSlot: React.ReactNode;
}

/**
 * Right-side detail panel for the selected role.
 *
 * Two tabs:
 *   - Permissions — hosts a custom slot (we pass the existing matrices in).
 *   - Users       — list of users in the role + per-user override sheet.
 *
 * The override sheet is owned here (rather than inside UsersTab) so opening
 * it from anywhere — including future "Override" buttons we might add to the
 * Permissions tab — only mounts a single instance.
 */
export function RoleDetailTabs({ role, permissionsSlot }: RoleDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<"permissions" | "users">(
    "permissions",
  );
  const [overrideUserId, setOverrideUserId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="flex h-full flex-col min-h-0">
      <RoleHeader role={role} />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "permissions" | "users")}
        className="flex-1 min-h-0 flex flex-col"
      >
        <TabsList className="mx-4 mt-3 w-fit">
          <TabsTrigger value="permissions" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Permissions
            <Badge
              variant="secondary"
              className="ml-1 h-4 px-1 text-[10px] font-normal"
            >
              {role.permissionCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <UsersIcon className="h-3.5 w-3.5" />
            Users
            <Badge
              variant="secondary"
              className="ml-1 h-4 px-1 text-[10px] font-normal"
            >
              {role.userCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="permissions"
          className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 mt-3"
        >
          {permissionsSlot}
        </TabsContent>
        <TabsContent
          value="users"
          className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 mt-3"
        >
          {/* reloadKey forces a refetch after a save so override counts refresh. */}
          <UsersTab
            key={reloadKey}
            roleId={role.id}
            roleName={role.name}
            onOverride={(userId) => setOverrideUserId(userId)}
          />
        </TabsContent>
      </Tabs>

      <UserOverrideSheet
        userId={overrideUserId}
        roleName={role.name}
        open={overrideUserId !== null}
        onClose={() => setOverrideUserId(null)}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}

function RoleHeader({ role }: { role: RoleListItem }) {
  return (
    <div className="px-4 pt-4 border-b pb-3">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
            role.isAdmin
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-slate-50 text-slate-600",
          )}
        >
          {role.isAdmin ? (
            <ShieldCheck className="h-5 w-5" />
          ) : (
            <Shield className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h2 className="text-lg font-semibold truncate">{role.name}</h2>
            {role.isAdmin && (
              <Badge
                variant="outline"
                className="h-5 px-1.5 text-[10px] uppercase tracking-wide border-amber-300 bg-amber-50 text-amber-800"
              >
                Admin
              </Badge>
            )}
          </div>
          {role.description ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {role.description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
