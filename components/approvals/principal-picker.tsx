"use client";

/**
 * Multi-select picker for approvers — users AND/OR roles. Selected principals
 * render as removable chips; the popover lists roles then users with a search
 * filter. Used per approver stage (and for process admins, users-only).
 */

import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Check, Plus, ShieldCheck, User, X } from "lucide-react";
import type { DirRole, DirUser } from "./directory";

interface Props {
  users: DirUser[];
  roles: DirRole[];
  selectedUserIds: string[];
  selectedRoleIds: string[];
  onChange: (userIds: string[], roleIds: string[]) => void;
  usersOnly?: boolean;
  placeholder?: string;
}

export function PrincipalPicker({
  users,
  roles,
  selectedUserIds,
  selectedRoleIds,
  onChange,
  usersOnly,
  placeholder = "Add approver…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const filteredUsers = useMemo(() => {
    const s = q.trim().toLowerCase();
    return users.filter((u) => !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
  }, [users, q]);
  const filteredRoles = useMemo(() => {
    const s = q.trim().toLowerCase();
    return roles.filter((r) => !s || r.name.toLowerCase().includes(s));
  }, [roles, q]);

  const toggleUser = (id: string) =>
    onChange(
      selectedUserIds.includes(id) ? selectedUserIds.filter((x) => x !== id) : [...selectedUserIds, id],
      selectedRoleIds,
    );
  const toggleRole = (id: string) =>
    onChange(
      selectedUserIds,
      selectedRoleIds.includes(id) ? selectedRoleIds.filter((x) => x !== id) : [...selectedRoleIds, id],
    );

  const hasSelection = selectedUserIds.length + selectedRoleIds.length > 0;

  return (
    <div className="space-y-2">
      {hasSelection && (
        <div className="flex flex-wrap gap-1.5">
          {selectedRoleIds.map((id) => (
            <Badge key={`r-${id}`} variant="secondary" className="gap-1 pr-1">
              <ShieldCheck className="h-3 w-3" />
              {roleById.get(id)?.name ?? id}
              <button type="button" onClick={() => toggleRole(id)} className="ml-0.5 rounded hover:bg-muted-foreground/20">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {selectedUserIds.map((id) => (
            <Badge key={`u-${id}`} variant="outline" className="gap-1 pr-1">
              <User className="h-3 w-3" />
              {userById.get(id)?.name ?? id}
              <button type="button" onClick={() => toggleUser(id)} className="ml-0.5 rounded hover:bg-muted">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> {placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="p-2 border-b">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users or roles…" className="h-8" />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {!usersOnly && filteredRoles.length > 0 && (
              <div className="px-2 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Roles</div>
            )}
            {!usersOnly &&
              filteredRoles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRole(r.id)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 text-left truncate">{r.name}</span>
                  {selectedRoleIds.includes(r.id) && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
            <div className="px-2 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Users</div>
            {filteredUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleUser(u.id)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
              >
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 text-left min-w-0">
                  <span className="block truncate">{u.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{u.email}</span>
                </span>
                {selectedUserIds.includes(u.id) && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
            {filteredUsers.length === 0 && filteredRoles.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">No matches</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
