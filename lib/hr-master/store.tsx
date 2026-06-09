"use client";

/**
 * HR Master store/provider. Loads the org's HR dropdown registry once, exposes
 * optimistic CRUD over masters + their options, and persists the whole array
 * back to /api/hr-master on every change (same replace-on-save approach the
 * inventory master uses). Kept self-contained so the HR Master page can mount
 * it without touching the rest of the app.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "@/hooks/use-toast";
import type { HrMasterType, HrMasterOption } from "./types";

interface HrMasterContextValue {
  ready: boolean;
  masters: HrMasterType[];
  addMasterOption: (key: string, value: string, code?: string) => Promise<void>;
  updateMasterOption: (
    key: string,
    optionId: string,
    patch: Partial<HrMasterOption>,
  ) => Promise<void>;
  deleteMasterOption: (key: string, optionId: string) => Promise<void>;
  addMasterType: (label: string, opts?: { description?: string }) => Promise<string>;
  deleteMasterType: (key: string) => Promise<void>;
}

const HrMasterContext = createContext<HrMasterContextValue | null>(null);

async function apiGet(): Promise<HrMasterType[]> {
  const res = await fetch("/api/hr-master", {
    credentials: "include",
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok || !json?.success) throw new Error(json?.error || "load failed");
  return json.data as HrMasterType[];
}

async function apiSave(masters: HrMasterType[]): Promise<HrMasterType[]> {
  const res = await fetch("/api/hr-master", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ masters }),
  });
  const json = await res.json();
  if (!res.ok || !json?.success) throw new Error(json?.error || "save failed");
  return json.data as HrMasterType[];
}

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function HrMasterProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [masters, setMasters] = useState<HrMasterType[]>([]);

  // Latest snapshot for async persists without stale closures.
  const mastersRef = useRef(masters);
  mastersRef.current = masters;

  useEffect(() => {
    let alive = true;
    apiGet()
      .then((m) => {
        if (alive) {
          setMasters(m);
          setReady(true);
        }
      })
      .catch(() => {
        if (alive) setReady(true); // unblock UI even if load fails
      });
    return () => {
      alive = false;
    };
  }, []);

  // Apply an optimistic mutation, persist the full array, and roll back on
  // failure. Returns the next array so callers can derive ids.
  const commit = useCallback(
    async (next: HrMasterType[]) => {
      const prev = mastersRef.current;
      setMasters(next);
      try {
        const saved = await apiSave(next);
        setMasters(saved);
      } catch (err) {
        setMasters(prev); // roll back
        toast({
          variant: "destructive",
          title: "Could not save",
          description: (err as Error)?.message ?? "Please try again.",
        });
        throw err;
      }
    },
    [toast],
  );

  const addMasterOption = useCallback(
    async (key: string, value: string, code?: string) => {
      const v = value.trim();
      if (!v) return;
      const next = mastersRef.current.map((m) => {
        if (m.key !== key) return m;
        const sortOrder =
          m.options.reduce((max, o) => Math.max(max, o.sortOrder), -1) + 1;
        const option: HrMasterOption = {
          id: `opt-${slugify(v)}-${sortOrder}`,
          value: v,
          code: code?.trim() || undefined,
          active: true,
          sortOrder,
        };
        return { ...m, options: [...m.options, option] };
      });
      await commit(next);
    },
    [commit],
  );

  const updateMasterOption = useCallback(
    async (key: string, optionId: string, patch: Partial<HrMasterOption>) => {
      const next = mastersRef.current.map((m) =>
        m.key !== key
          ? m
          : {
              ...m,
              options: m.options.map((o) =>
                o.id === optionId ? { ...o, ...patch } : o,
              ),
            },
      );
      await commit(next);
    },
    [commit],
  );

  const deleteMasterOption = useCallback(
    async (key: string, optionId: string) => {
      const next = mastersRef.current.map((m) =>
        m.key !== key
          ? m
          : { ...m, options: m.options.filter((o) => o.id !== optionId) },
      );
      await commit(next);
    },
    [commit],
  );

  const addMasterType = useCallback(
    async (label: string, opts?: { description?: string }) => {
      const l = label.trim();
      if (!l) return "";
      let base = slugify(l) || "master";
      const existing = new Set(mastersRef.current.map((m) => m.key));
      let key = base;
      let n = 2;
      while (existing.has(key)) key = `${base}_${n++}`;
      const master: HrMasterType = {
        key,
        label: l,
        description: opts?.description?.trim() || undefined,
        icon: "list",
        options: [],
      };
      await commit([...mastersRef.current, master]);
      return key;
    },
    [commit],
  );

  const deleteMasterType = useCallback(
    async (key: string) => {
      const next = mastersRef.current.filter((m) => m.key !== key);
      await commit(next);
    },
    [commit],
  );

  const value = useMemo(
    () => ({
      ready,
      masters,
      addMasterOption,
      updateMasterOption,
      deleteMasterOption,
      addMasterType,
      deleteMasterType,
    }),
    [
      ready,
      masters,
      addMasterOption,
      updateMasterOption,
      deleteMasterOption,
      addMasterType,
      deleteMasterType,
    ],
  );

  return (
    <HrMasterContext.Provider value={value}>{children}</HrMasterContext.Provider>
  );
}

export function useHrMaster(): HrMasterContextValue {
  const ctx = useContext(HrMasterContext);
  if (!ctx) throw new Error("useHrMaster must be used within HrMasterProvider");
  return ctx;
}
