"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Mail,
  Search,
  Settings2,
  ShieldAlert,
  UserCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface RoleUser {
  userId: string;
  name: string;
  email: string;
  username: string | null;
  status: string;
  unitName: string | null;
  overrideCount: number;
  assignmentId: string;
  notes: string | null;
}

interface UsersTabProps {
  roleId: string;
  roleName: string;
  onOverride: (userId: string) => void;
}

interface ApiResponse {
  success: boolean;
  users: RoleUser[];
  error?: string;
}

/**
 * Users-in-role tab. Fetches the role's users via the batched
 * /api/roles/[id]/users-with-overrides endpoint and renders them with a
 * per-user "Override permissions" action.
 */
export function UsersTab({ roleId, roleName, onOverride }: UsersTabProps) {
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/roles/${roleId}/users-with-overrides`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j: ApiResponse) => {
        if (cancelled) return;
        if (j.success) {
          setUsers(j.users);
        } else {
          setError(j.error ?? "Failed to load users");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to load users");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roleId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q) ||
        (u.unitName ?? "").toLowerCase().includes(q),
    );
  }, [users, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {loading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <>
              <span className="font-medium text-foreground">
                {users.length}
              </span>{" "}
              {users.length === 1 ? "user" : "users"} assigned to{" "}
              <span className="font-medium text-foreground">{roleName}</span>
            </>
          )}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users…"
            className="pl-8 h-9"
            aria-label="Search users"
          />
        </div>
      </div>

      {error ? (
        <Card className="border-destructive">
          <CardContent className="py-4 flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" /> {error}
          </CardContent>
        </Card>
      ) : loading ? (
        <UserListSkeleton />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <UserCircle2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {query
                ? "No users match your search."
                : "No users are assigned to this role yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {filtered.map((u) => (
            <UserCard key={u.userId} user={u} onOverride={onOverride} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserCard({
  user,
  onOverride,
}: {
  user: RoleUser;
  onOverride: (userId: string) => void;
}) {
  const initials = useMemo(() => {
    const parts = user.name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return user.email[0]?.toUpperCase() ?? "?";
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }, [user.name, user.email]);

  const isInactive = user.status !== "ACTIVE";

  return (
    <Card
      className={cn(
        "transition-colors",
        isInactive && "opacity-70",
      )}
    >
      <CardContent className="p-3 space-y-2.5">
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate">{user.name}</p>
              {isInactive && (
                <Badge
                  variant="outline"
                  className="h-4 px-1 text-[9px] uppercase tracking-wide"
                >
                  {user.status.toLowerCase()}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
              <Mail className="h-3 w-3 shrink-0" />
              {user.email}
            </p>
            {user.unitName ? (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {user.unitName}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          {user.overrideCount > 0 ? (
            <Badge
              variant="secondary"
              className="h-5 px-1.5 text-[10px] gap-1 bg-amber-50 text-amber-800 border border-amber-200"
            >
              <ShieldAlert className="h-3 w-3" />
              {user.overrideCount}{" "}
              {user.overrideCount === 1 ? "override" : "overrides"}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              Inherits all from role
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => onOverride(user.userId)}
          >
            <Settings2 className="h-3 w-3" />
            Override
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UserListSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-3 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-2.5 w-44" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-16" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
