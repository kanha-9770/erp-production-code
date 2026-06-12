"use client"

import React, { useState, useEffect } from 'react';
import { useGetUserQuery } from "@/lib/api/auth";
import { useGetUsersQuery, useDeleteUserMutation, useCreateUserMutation, useUpdateUserMutation } from "@/lib/api/users";
import { useGetRolesQuery } from "@/lib/api/permissions";
import { useGetOrganizationUnitsQuery } from "@/lib/api/organization";
import { useToast } from "@/hooks/use-toast";
import { useRouteAccess } from "@/hooks/use-route-access";
import PageBackLink from "@/components/shared/page-back-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  User,
  Plus,
  Search,
  Mail,
  Shield,
  Trash2,
  Pencil,
  X,
  Loader2,
  RefreshCw,
  AlertTriangle,
  UserPlus,
  Users,
  Lock,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
} from "lucide-react";

// --- Types ---
export interface Unit {
  id: string;
  name: string;
  level?: number;
  parentId?: string | null;
}

export interface Role {
  id: string;
  name: string;
  isAdmin: boolean;
  level?: number;
}

export interface UnitAssignment {
  id: string;
  unit: Unit;
  role: Role;
  notes?: string;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar?: string;
  department: string;
  unitAssignments: UnitAssignment[];
}

export interface UserFormData extends Partial<User> {
  unitId?: string;
  roleId?: string;
  password?: string;
  organizationId?: string;
}

interface UserManagementProps {
  showBackLink?: boolean;
}

// --- Main Component ---
const UserManagement: React.FC<UserManagementProps> = ({ showBackLink = false }) => {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalUsers, setTotalUsers] = useState(0);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const [formData, setFormData] = useState<UserFormData>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const [units, setUnits] = useState<Unit[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  const [deleteUser] = useDeleteUserMutation();
  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [updateUser, { isLoading: isUpdating }] = useUpdateUserMutation();
  const { data: orgUnitsData } = useGetOrganizationUnitsQuery();

  const isSaving = isCreating || isUpdating;

  // RTK Query hooks for initial data
  const { data: sessionData } = useGetUserQuery();

  // Route-permission grant for this page. `isPermitted` is whitelist mode:
  // true only when an admin has explicitly granted "/settings/users" to this
  // user's role (or to the user directly) — admins always pass. This lets the
  // page be opened by a non-admin (e.g. HR) who was given the route grant in
  // Settings → Permission → Route, instead of being hard-locked to admins.
  const { isPermitted } = useRouteAccess();
  const canManageUsers = isPermitted("/settings/users");
  const { data: rolesData } = useGetRolesQuery();
  const { data: usersData, refetch: refetchUsers, isFetching, isLoading } = useGetUsersQuery({
    page,
    pageSize,
    search: debouncedSearch,
  });

  // Process session data
  useEffect(() => {
    if (sessionData) {
      const session = sessionData;
      const adminStatus = session?.user?.isAdmin === true
        || (session?.user as any)?.isOrgOwner === true
        || session?.user?.unitAssignments?.some(
            (ua: any) => ua?.role?.isAdmin === true || ua?.role?.name?.toLowerCase().includes('admin')
          )
        || false;
      const orgId = session?.user?.organization?.id || null;
      setIsAdmin(adminStatus);
      setOrganizationId(orgId);
    }
  }, [sessionData]);

  // Process roles data
  useEffect(() => {
    if (rolesData) {
      const raw = rolesData?.success ? rolesData.data : (Array.isArray(rolesData) ? rolesData : []);
      const fetchedRoles = raw.map((r: any) => ({
        id: r.id,
        name: r.name,
        isAdmin: !!r.isAdmin,
        level: r.level ?? 0,
      }));
      setRoles(fetchedRoles);
    }
  }, [rolesData]);

  // Fetch organization units via RTK Query
  useEffect(() => {
    if (orgUnitsData) {
      const fetchedUnits = (orgUnitsData as any)?.success ? (orgUnitsData as any).data : (Array.isArray(orgUnitsData) ? orgUnitsData : []);
      setUnits(fetchedUnits);
    }
  }, [orgUnitsData]);

  // Process users data
  useEffect(() => {
    if (usersData) {
      const rawUsers = Array.isArray(usersData)
        ? usersData
        : (usersData as any)?.data ?? (usersData as any)?.users ?? [];

      const filteredUsers = rawUsers.filter((user: any) => {
        const hasAdminRole = user.unitAssignments?.some((ua: any) => {
          const roleIsAdmin = ua?.role?.isAdmin === true || ua?.role?.isAdmin === 'true';
          const roleNameHasAdmin = String(ua?.role?.name || '').toLowerCase().includes('admin');
          return roleIsAdmin || roleNameHasAdmin;
        }) ?? false;

        return !hasAdminRole;
      });

      setUsers(filteredUsers);

      if (usersData && typeof usersData === 'object' && 'total' in usersData) {
        setTotalUsers((usersData as any).total ?? filteredUsers.length);
      } else {
        setTotalUsers(filteredUsers.length);
      }
    }
  }, [usersData]);

  // Search filter computation - now performed server-side, so we alias the users state
  const filteredUsers = users;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const closeForm = () => {
    setShowForm(false);
    setIsEditing(false);
    setEditId(null);
    setFormData({});
    setShowPassword(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) {
      toast({ title: "Authorization Error", description: "Cannot save: organization ID not available.", variant: "destructive" });
      return;
    }
    if (!formData.email || !formData.first_name) {
      toast({ title: "Validation Error", description: "Email and First Name are required", variant: "destructive" });
      return;
    }
    if (!formData.unitId || !formData.roleId) {
      toast({ title: "Validation Error", description: "Organization unit and system role are required", variant: "destructive" });
      return;
    }

    try {
      const payload = { ...formData, organizationId };

      if (isEditing && editId) {
        await updateUser({ userId: editId, body: payload }).unwrap();
        toast({ title: "User Updated", description: `${formData.first_name} has been updated successfully.` });
      } else {
        await createUser(payload).unwrap();
        toast({ title: "User Created", description: `${formData.first_name} has been provisioned successfully.` });
      }

      closeForm();
      refetchUsers();
    } catch (err: any) {
      console.error("User save error:", err);
      const detail = err?.data?.error || err?.data?.message || err?.message || "Unknown error";
      toast({ title: "Save Failed", description: detail, variant: "destructive" });
    }
  };

  const handleEdit = (user: User) => {
    setFormData({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      department: user.department,
      unitId: user.unitAssignments?.[0]?.unit?.id || '',
      roleId: user.unitAssignments?.[0]?.role?.id || '',
    });
    setIsEditing(true);
    setEditId(user.id);
    setShowForm(true);
  };

  const openCreate = () => {
    setIsEditing(false);
    setEditId(null);
    setFormData({});
    setShowForm(true);
  };

  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);

  const handleDeleteClick = (user: User) => {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
    setUserToDelete({ id: user.id, name: fullName });
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteUser(userToDelete.id).unwrap();
      toast({ title: "User Deleted", description: `${userToDelete.name} has been permanently removed.` });
      refetchUsers();
    } catch (err: any) {
      console.error("Delete error:", err);
      toast({ title: "Delete Failed", description: "Could not remove user profile.", variant: "destructive" });
    } finally {
      setUserToDelete(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));

  if (isAdmin === false && !canManageUsers) {
    return (
      <div className="p-4 sm:p-6">
        <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-lg border bg-card p-8 text-center shadow-sm">
          <div className="mb-4 rounded-full border border-destructive/20 bg-destructive/10 p-4 text-destructive">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h2 className="mb-1 text-lg font-semibold text-foreground">Access Restricted</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            You do not have the administrative directory access required to manage platform roles and permissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      {showBackLink && (
        <PageBackLink href="/settings" label="Settings" />
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader className="px-4 pb-3 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl">User Directory</CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Directory of system users — syncs with employee master units and roles.
                </CardDescription>
              </div>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto sm:self-auto">
              <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => refetchUsers()}>
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" className="flex-1 sm:flex-none" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                Add User
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 px-4 pb-4 pt-2 sm:px-6">
          {/* Search & stats */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, department, or role…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 pl-9 text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground sm:w-auto sm:whitespace-nowrap">
              {searchTerm
                ? `Found ${totalUsers} user${totalUsers === 1 ? "" : "s"}`
                : `Showing ${users.length} of ${totalUsers} user${totalUsers === 1 ? "" : "s"}`}
            </p>
          </div>

          {/* Directory table — desktop / tablet only */}
          <div className="hidden overflow-hidden rounded-md border sm:block">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="px-3 py-2 text-xs font-medium">User</TableHead>
                  <TableHead className="px-3 py-2 text-xs font-medium">Department</TableHead>
                  <TableHead className="px-3 py-2 text-xs font-medium">Roles &amp; Scope</TableHead>
                  <TableHead className="px-3 py-2 text-right text-xs font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && users.length === 0 ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 4 }).map((_, j) => (
                        <TableCell key={j} className="px-3 py-2.5"><Skeleton className="h-6 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-12 text-center">
                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
                        <Search className="h-5 w-5" />
                      </div>
                      <h3 className="mt-3 text-sm font-medium text-foreground">No users match your search</h3>
                      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                        Try checking for spelling, or clear the search to see the full directory.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => {
                    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
                    const initials = `${user.first_name?.charAt(0) ?? ''}${user.last_name?.charAt(0) ?? ''}`.toUpperCase() || '?';
                    return (
                      <TableRow key={user.id} className="group hover:bg-muted/30">
                        <TableCell className="px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-foreground">
                                {fullName || 'No name'}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                <span className="truncate">{user.email}</span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          {user.department ? (
                            <Badge variant="secondary" className="font-normal">{user.department}</Badge>
                          ) : (
                            <span className="text-xs italic text-muted-foreground">No department</span>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            {user.unitAssignments.map((ua, idx) => (
                              <div key={ua.id || idx} className="flex flex-col">
                                <Badge
                                  variant="outline"
                                  className={
                                    ua.role.isAdmin
                                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400"
                                      : "border-primary/20 bg-primary/10 text-primary"
                                  }
                                >
                                  <Shield className="h-3 w-3" />
                                  {ua.role.name}
                                </Badge>
                                <span className="mt-0.5 pl-1 text-[10px] italic text-muted-foreground">{ua.unit.name}</span>
                              </div>
                            ))}
                            {user.unitAssignments.length === 0 && (
                              <span className="text-xs italic text-muted-foreground">No roles assigned</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-right">
                          <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(user)}
                              title="Edit user"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteClick(user)}
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Directory cards — mobile only */}
          <div className="space-y-2 sm:hidden">
            {isLoading && users.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-lg border py-12 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
                  <Search className="h-5 w-5" />
                </div>
                <h3 className="mt-3 text-sm font-medium text-foreground">No users match your search</h3>
                <p className="mx-auto mt-1 max-w-xs px-4 text-xs text-muted-foreground">
                  Try checking for spelling, or clear the search to see the full directory.
                </p>
              </div>
            ) : (
              filteredUsers.map((user) => {
                const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
                const initials = `${user.first_name?.charAt(0) ?? ''}${user.last_name?.charAt(0) ?? ''}`.toUpperCase() || '?';
                return (
                  <div key={user.id} className="rounded-lg border p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{fullName || 'No name'}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{user.email}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(user)}
                          title="Edit user"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteClick(user)}
                          title="Delete user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-[52px]">
                      {user.department ? (
                        <Badge variant="secondary" className="font-normal">{user.department}</Badge>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">No department</span>
                      )}
                      {user.unitAssignments.map((ua, idx) => (
                        <Badge
                          key={ua.id || idx}
                          variant="outline"
                          className={
                            ua.role.isAdmin
                              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400"
                              : "border-primary/20 bg-primary/10 text-primary"
                          }
                          title={ua.unit.name}
                        >
                          <Shield className="h-3 w-3" />
                          {ua.role.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {filteredUsers.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                <span>
                  Showing <span className="font-medium text-foreground">{(page - 1) * pageSize + 1}</span> to{" "}
                  <span className="font-medium text-foreground">{Math.min(page * pageSize, totalUsers)}</span> of{" "}
                  <span className="font-medium text-foreground">{totalUsers}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span>Rows:</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                  >
                    <SelectTrigger className="h-7 w-[70px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[5, 10, 20, 50, 100].map((size) => (
                        <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  title="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 font-medium text-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  title="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slide-over form */}
      <Sheet open={showForm} onOpenChange={(open) => { if (!open && !isSaving) closeForm(); }}>
        <SheetContent side="right" resizable defaultWidth={448} minWidth={360} className="flex w-full flex-col gap-0 p-0">
          {/* Header */}
          <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              {isEditing ? <Pencil className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {isEditing ? "Modify User Account" : "Create System User"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isEditing ? "Edit roles, scope and credentials" : "Provision a new platform user"}
              </p>
            </div>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Personal details */}
              <div className="space-y-4 rounded-lg border bg-card p-4">
                <p className="flex items-center gap-1.5 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <User className="h-3.5 w-3.5" /> Personal Details
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs">Email Address *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="name@company.com"
                    value={formData.email || ''}
                    onChange={handleInputChange}
                    required
                    disabled={isSaving}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="first_name" className="text-xs">First Name *</Label>
                    <Input
                      id="first_name"
                      name="first_name"
                      placeholder="First name"
                      value={formData.first_name || ''}
                      onChange={handleInputChange}
                      required
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="last_name" className="text-xs">Last Name</Label>
                    <Input
                      id="last_name"
                      name="last_name"
                      placeholder="Last name"
                      value={formData.last_name || ''}
                      onChange={handleInputChange}
                      disabled={isSaving}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="department" className="text-xs">Department</Label>
                  <Input
                    id="department"
                    name="department"
                    placeholder="e.g. Engineering"
                    value={formData.department || ''}
                    onChange={handleInputChange}
                    disabled={isSaving}
                  />
                </div>
              </div>

              {/* Organizational hierarchy */}
              <div className="space-y-4 rounded-lg border bg-card p-4">
                <p className="flex items-center gap-1.5 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Shield className="h-3.5 w-3.5" /> Organizational Hierarchy
                </p>

                <div className="space-y-1.5">
                  <Label className="text-xs">Organization Unit *</Label>
                  <Select
                    value={formData.unitId || ''}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, unitId: v }))}
                    disabled={isSaving}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {'  '.repeat(unit.level ?? 0)}{unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">System Role *</Label>
                  {/* Searchable role picker (Popover + Command). The Radix Select
                      viewport can't host a sticky search box, so we use the
                      combobox pattern used elsewhere in the app. cmdk matches on
                      an item's `value` (the role id), so a custom `filter` matches
                      the typed query against the role name instead. */}
                  <Popover open={roleOpen} onOpenChange={setRoleOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={roleOpen}
                        disabled={isSaving}
                        className="h-10 w-full justify-between bg-background px-3 font-normal"
                      >
                        <span className={cn("truncate", !formData.roleId && "text-muted-foreground")}>
                          {(() => {
                            const sr = roles.find((r) => r.id === formData.roleId);
                            return sr ? `${sr.name}${sr.isAdmin ? ' (admin)' : ''}` : "Select role";
                          })()}
                        </span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                      <Command
                        filter={(value, search) => {
                          // cmdk may normalise (lowercase) the item value, so compare loosely.
                          const role = roles.find((r) => r.id.toLowerCase() === value.toLowerCase());
                          if (!role) return 0;
                          return role.name.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0;
                        }}
                      >
                        <CommandInput placeholder="Search roles…" className="h-9" />
                        <CommandList>
                          <CommandEmpty>No roles found</CommandEmpty>
                          <CommandGroup>
                            {roles.map((role) => (
                              <CommandItem
                                key={role.id}
                                value={role.id}
                                onSelect={() => {
                                  setFormData((prev) => ({ ...prev, roleId: role.id }));
                                  setRoleOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4 shrink-0",
                                    formData.roleId === role.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="truncate">
                          {'  '.repeat(role.level ?? 0)}{role.name}{role.isAdmin ? ' (admin)' : ''}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Credentials */}
              <div className="space-y-4 rounded-lg border bg-card p-4">
                <p className="flex items-center gap-1.5 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> Account Security
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs">
                    Account Password {isEditing ? '(optional)' : '*'}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={isEditing ? "Leave blank to keep current" : "Secure password"}
                      value={formData.password || ''}
                      onChange={handleInputChange}
                      required={!isEditing}
                      disabled={isSaving}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      disabled={isSaving}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {isEditing && (
                    <p className="text-xs text-muted-foreground">Leave blank unless you want to reset the user&apos;s password.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex shrink-0 justify-end gap-2 border-t bg-background p-4">
              <Button type="button" variant="outline" onClick={closeForm} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSaving ? (isEditing ? 'Updating…' : 'Creating…') : (isEditing ? 'Update User' : 'Create User')}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-center">Confirm Permanent Deletion</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-foreground">{userToDelete?.name}</span>? This deactivates their
              access and removes their account. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserManagement;
