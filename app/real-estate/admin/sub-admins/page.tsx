"use client";

/**
 * Sub-Admins — brokerage staff with admin privileges scoped to the Real
 * Estate module. Equivalent to the MLM-template "Sub Admins" page.
 *
 * Implementation note:
 *   We do NOT introduce a parallel role system for REBM. Instead this page
 *   reads the existing `useGetAdminUsersQuery` directory and filters to
 *   users who hold at least one isAdmin role. The "User Group" column
 *   shows the role names already on the user.
 *
 *   Inviting a new sub-admin → redirects to the central user-management
 *   surface (/settings/users) so we don't duplicate the create form.
 *   Editing role membership → redirects to the existing role-permission UI.
 *
 * Tabs match the screenshot: Active / Inactive / Trashed (based on
 * user.status).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGetAdminUsersQuery, type AdminUser } from "@/lib/api/users";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ShieldCheck, Plus, Search, MoreHorizontal,
  Users as UsersIcon, ChevronLeft, ChevronRight, CircleCheck, CircleX, Trash2,
} from "lucide-react";
import { fullName, initials, formatDate } from "@/components/real-estate/constants";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type TabKey = "active" | "inactive" | "trashed";

const TAB_META: Record<TabKey, { label: string; icon: any; matches: (s: string) => boolean }> = {
  active:   { label: "Active",   icon: CircleCheck, matches: (s) => s === "ACTIVE" },
  inactive: { label: "Inactive", icon: CircleX,     matches: (s) => s === "INACTIVE" || s === "SUSPENDED" || s === "PENDING" || s === "PENDING_VERIFICATION" },
  trashed:  { label: "Trashed",  icon: Trash2,      matches: (s) => s === "DELETED" || s === "TRASHED" },
};

export default function SubAdminsPage() {
  const { data, isLoading } = useGetAdminUsersQuery();
  const allUsers: AdminUser[] = useMemo(() => data?.data ?? [], [data]);

  const [tab, setTab] = useState<TabKey>("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // Sub-admin = user with at least one role marked isAdmin.
  const subAdmins = useMemo(
    () =>
      allUsers.filter((u) =>
        (u.unitsAndRoles ?? u.unitAssignments ?? []).some(
          (ur: any) => ur.role?.isAdmin,
        ),
      ),
    [allUsers],
  );

  const tabbed = useMemo(
    () => subAdmins.filter((u) => TAB_META[tab].matches(u.status)),
    [subAdmins, tab],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tabbed;
    return tabbed.filter(
      (u) =>
        (u.fullName ?? "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q),
    );
  }, [tabbed, search]);

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Counts per tab — for badge display.
  const tabCounts: Record<TabKey, number> = useMemo(
    () => ({
      active:   subAdmins.filter((u) => TAB_META.active.matches(u.status)).length,
      inactive: subAdmins.filter((u) => TAB_META.inactive.matches(u.status)).length,
      trashed:  subAdmins.filter((u) => TAB_META.trashed.matches(u.status)).length,
    }),
    [subAdmins],
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Real Estate</span>
            <span>·</span>
            <span>Administration</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Sub-Admins
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Brokerage staff with administrative privileges. Roles are managed
            through the central permission system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/permission/roles">
              <UsersIcon className="h-4 w-4 mr-1.5" /> User Groups
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/settings/users">
              <Plus className="h-4 w-4 mr-1.5" /> Add Sub-Admin
            </Link>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Card>
        <div className="px-3 pt-3 border-b flex items-end gap-1 overflow-x-auto">
          {(Object.keys(TAB_META) as TabKey[]).map((key) => {
            const meta = TAB_META[key];
            const Icon = meta.icon;
            const isActive = tab === key;
            return (
              <button
                key={key}
                onClick={() => { setTab(key); setPage(0); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
                <Badge variant="secondary" className="ml-1 text-[10px] tabular-nums">
                  {tabCounts[key]}
                </Badge>
              </button>
            );
          })}
          <div className="ml-auto px-2 py-1.5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Name, email, username…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-8 h-7 w-56 text-sm"
              />
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {search
                ? "No sub-admins match your search."
                : tab === "active"
                  ? "No active sub-admins yet. Click \"Add Sub-Admin\" to invite one."
                  : `No ${TAB_META[tab].label.toLowerCase()} sub-admins.`}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left w-12">No</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Username</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">User Group(s)</th>
                  <th className="px-3 py-2 text-left">Created Date</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u, idx) => {
                  const adminRoles = (u.unitsAndRoles ?? u.unitAssignments ?? []).filter(
                    (ur: any) => ur.role?.isAdmin,
                  );
                  return (
                    <tr key={u.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {page * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={u.avatar ?? undefined} />
                            <AvatarFallback className="text-[10px]">{initials(u)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium truncate">{fullName(u) || u.email}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate">
                        {u.username ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs truncate">{u.email}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {adminRoles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            adminRoles.slice(0, 3).map((r: any, i: number) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">
                                {r.role?.name ?? "—"}
                              </Badge>
                            ))
                          )}
                          {adminRoles.length > 3 && (
                            <Badge variant="outline" className="text-[10px]">+{adminRoles.length - 3}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/settings/permission/users/${u.id}`}>
                                <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Manage permissions
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t bg-background/95 text-xs">
              <span className="text-muted-foreground tabular-nums">
                Page {page + 1} of {pages} · {total.toLocaleString()} sub-admin{total === 1 ? "" : "s"}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="h-7">
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="h-7">
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Groups callout — points to the central role system */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <UsersIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">User groups are managed centrally</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real Estate sub-admins inherit their permissions from the
              organization-wide role system. To create a new role like
              "Compliance Officer" or "Payout Approver", use the central
              roles UI — those roles will then become assignable here.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/permission/roles">Manage roles</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/permission">Permissions</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
