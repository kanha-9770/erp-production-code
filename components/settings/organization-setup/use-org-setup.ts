"use client";

/**
 * useOrgSetupSection — load + save one section of /api/organization/setup.
 *
 * Each Organization Setup section (Policy, Locations, Departments, …) calls
 * this with its section key and a typed fallback. It returns the saved value,
 * an owner flag (writes are owner-only server-side), and a `save(next)` that
 * PUTs just that section and refreshes local state.
 */

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

export type SetupSection =
  | "policy"
  | "locations"
  | "departments"
  | "designations"
  | "branding"
  | "fromAddresses"
  | "emailAuth";

interface SetupResponse {
  success?: boolean;
  setup?: Record<string, unknown>;
  isOwner?: boolean;
  error?: string;
}

export function useOrgSetupSection<T>(section: SetupSection, fallback: T) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [saved, setSaved] = useState<T>(fallback);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/organization/setup", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as SetupResponse | null;
        if (!cancelled && json?.success && json.setup) {
          const value = json.setup[section];
          if (value !== undefined && value !== null) setSaved(value as T);
          setIsOwner(!!json.isOwner);
        }
      } catch {
        /* surfaced via the section's empty/error state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [section]);

  const save = useCallback(
    async (next: T, opts?: { silent?: boolean }): Promise<boolean> => {
      setSaving(true);
      try {
        const res = await fetch("/api/organization/setup", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section, data: next }),
        });
        const json = (await res.json().catch(() => null)) as SetupResponse | null;
        if (!res.ok || !json?.success) {
          throw new Error(json?.error ?? `Save failed (${res.status})`);
        }
        const value = json.setup?.[section];
        setSaved((value ?? next) as T);
        if (!opts?.silent) {
          toast({ title: "Saved", description: "Changes saved" });
        }
        return true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Try again";
        toast({ title: "Save failed", description: msg, variant: "destructive" });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [section, toast],
  );

  return { saved, setSaved, isOwner, loading, saving, save };
}

/** Stable client-side id for new list items. */
export function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
