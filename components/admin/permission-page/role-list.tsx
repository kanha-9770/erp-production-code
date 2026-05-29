"use client";

import { useMemo, useState } from "react";
import { Search, Shield, ShieldCheck, Users as UsersIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface RoleListItem {
  id: string;
  name: string;
  description: string | null;
  isAdmin: boolean;
  userCount: number;
  permissionCount: number;
}

interface RoleListProps {
  roles: RoleListItem[];
  loading: boolean;
  selectedRoleId: string | null;
  onSelect: (roleId: string) => void;
  /** Optional: invoked when the user hits enter on the search box with one match.
   *  Lets keyboard navigation feel as fast as click. */
  className?: string;
}

export function RoleList({
  roles,
  loading,
  selectedRoleId,
  onSelect,
  className,
}: RoleListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q),
    );
  }, [roles, query]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roles…"
            className="pl-8 h-9"
            aria-label="Search roles"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-3 space-y-1">
          {loading ? (
            <RoleListSkeleton />
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground px-3">
              {query ? "No roles match your search." : "No roles yet."}
            </div>
          ) : (
            filtered.map((r) => (
              <RoleRow
                key={r.id}
                role={r}
                selected={r.id === selectedRoleId}
                onClick={() => onSelect(r.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function RoleRow({
  role,
  selected,
  onClick,
}: {
  role: RoleListItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group w-full rounded-md px-2.5 py-2 text-left transition-colors",
        "border border-transparent",
        "hover:bg-muted/50",
        selected && "bg-primary/10 border-primary/30 hover:bg-primary/10",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
            role.isAdmin
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-slate-50 text-slate-600",
          )}
        >
          {role.isAdmin ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : (
            <Shield className="h-3.5 w-3.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "text-sm font-medium truncate",
                selected && "text-primary",
              )}
            >
              {role.name}
            </span>
            {role.isAdmin && (
              <Badge
                variant="outline"
                className="h-4 px-1 text-[9px] font-semibold uppercase tracking-wide border-amber-300 bg-amber-50 text-amber-800"
              >
                Admin
              </Badge>
            )}
          </div>
          {role.description ? (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {role.description}
            </p>
          ) : null}
          <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <UsersIcon className="h-3 w-3" />
              {role.userCount} {role.userCount === 1 ? "user" : "users"}
            </span>
            <span>·</span>
            <span>
              {role.permissionCount}{" "}
              {role.permissionCount === 1 ? "permission" : "permissions"}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function RoleListSkeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-2.5 px-2.5 py-2">
          <Skeleton className="h-7 w-7 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-2.5 w-44" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
