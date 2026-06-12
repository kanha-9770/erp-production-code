"use client";

/**
 * One-shot loaders for org users, roles and a module's masters — used by the
 * approval-process builder (approver pickers + criteria value lists).
 */

import { useEffect, useState } from "react";
import type { ApprovalModule } from "./module-schema";

export interface DirUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}
export interface DirRole {
  id: string;
  name: string;
  isAdmin: boolean;
  /** Parent role id in the org role tree (null = top level). */
  parentId: string | null;
}
export interface MasterLite {
  key: string;
  label?: string;
  options: Array<{ id: string; value: string; code?: string }>;
}

export function useDirectory() {
  const [users, setUsers] = useState<DirUser[]>([]);
  const [roles, setRoles] = useState<DirRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [uRes, rRes] = await Promise.all([
          fetch("/api/admin/users", { credentials: "include" }).then((r) => r.json()).catch(() => null),
          fetch("/api/roles/with-counts", { credentials: "include" }).then((r) => r.json()).catch(() => null),
        ]);
        if (!active) return;
        setUsers(
          (uRes?.data ?? []).map((x: any) => ({
            id: x.id,
            name: x.fullName || [x.first_name, x.last_name].filter(Boolean).join(" ") || x.email,
            email: x.email,
            avatar: x.avatar ?? null,
          })),
        );
        setRoles(
          (rRes?.roles ?? []).map((x: any) => ({
            id: x.id,
            name: x.name,
            isAdmin: !!x.isAdmin,
            parentId: x.parentId ?? null,
          })),
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { users, roles, loading };
}

export function useModuleMasters(module: ApprovalModule) {
  const [masters, setMasters] = useState<MasterLite[]>([]);
  useEffect(() => {
    const url = module === "purchase" ? "/api/purchase-system/masters" : "/api/inventory-system/masters";
    let active = true;
    fetch(url, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (active) setMasters((j?.data ?? []) as MasterLite[]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [module]);
  return masters;
}
