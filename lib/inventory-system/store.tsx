"use client";

/**
 * InventoryProvider — the master-registry + mutation layer for the Inventory
 * System.
 *
 * Items are NO LONGER held here. With 6K+ records per submodule, loading every
 * row up-front was the cause of the slow open, so the item list is now fetched
 * one server-paginated page at a time by `useInventoryList` (see
 * ./use-inventory-list). This provider keeps only the small master registry
 * (loaded once on mount) and exposes thin CRUD methods that mutate via the
 * service then bump a `revalidateToken` — every mounted list re-fetches its
 * current page in response, so the UI stays consistent without a global cache.
 *
 * It remains deliberately decoupled from the rest of the ERP — it only talks to
 * `inventoryService`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useToast } from "@/hooks/use-toast";
import { inventoryService } from "./service";
import type {
  InventoryItem,
  MasterOption,
  MasterType,
  SubmoduleKey,
} from "./types";

interface InventoryContextValue {
  ready: boolean;
  masters: MasterType[];

  /**
   * Bumped after every successful item mutation (and reset). `useInventoryList`
   * depends on it, so a bump triggers a re-fetch of every mounted page.
   */
  revalidateToken: number;
  /** Force a list re-fetch without a mutation (rarely needed). */
  bumpRevalidate: () => void;

  // Item CRUD — mutate via the service, then revalidate the visible page(s).
  createItem: (submodule: SubmoduleKey, data: Record<string, unknown>) => Promise<InventoryItem | undefined>;
  updateItem: (
    submodule: SubmoduleKey,
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  deleteItem: (submodule: SubmoduleKey, id: string) => Promise<void>;
  bulkDelete: (submodule: SubmoduleKey, ids: string[]) => Promise<void>;

  // Master helpers
  getMaster: (key: string) => MasterType | undefined;
  getMasterOptions: (key: string) => MasterOption[];
  addMasterOption: (key: string, value: string, code?: string) => Promise<void>;
  updateMasterOption: (key: string, optionId: string, patch: Partial<MasterOption>) => Promise<void>;
  deleteMasterOption: (key: string, optionId: string) => Promise<void>;

  // Master-type (dropdown) management
  addMasterType: (label: string, opts?: { description?: string }) => Promise<string>;
  deleteMasterType: (key: string) => Promise<void>;

  resetAll: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [masters, setMasters] = useState<MasterType[]>([]);
  const [revalidateToken, setRevalidateToken] = useState(0);

  const bumpRevalidate = useCallback(() => setRevalidateToken((n) => n + 1), []);

  // Keep a ref to the latest masters so async reconcilers persist the right
  // snapshot without stale closures.
  const mastersRef = useRef(masters);
  mastersRef.current = masters;

  // Mount-time load is now CHEAP: just the master registry (one small row),
  // not every inventory record. Items are paged in by useInventoryList.
  useEffect(() => {
    let alive = true;
    inventoryService
      .loadMasters()
      .then((m) => {
        if (!alive) return;
        setMasters(m);
        setReady(true);
      })
      .catch(() => {
        if (alive) setReady(true); // unblock the UI even if masters fail
      });
    return () => {
      alive = false;
    };
  }, []);

  // ── Item CRUD (mutate → revalidate) ────────────────────────────────────────
  // No in-memory list to reconcile: each method persists via the service and,
  // on success, bumps the revalidate token so the visible page re-fetches.

  const createItem = useCallback(
    async (submodule: SubmoduleKey, data: Record<string, unknown>) => {
      try {
        const saved = await inventoryService.createItem(submodule, data);
        bumpRevalidate();
        return saved;
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Could not create",
          description: (err as Error)?.message ?? "Please try again.",
        });
        throw err;
      }
    },
    [toast, bumpRevalidate],
  );

  const updateItem = useCallback(
    async (submodule: SubmoduleKey, id: string, patch: Record<string, unknown>) => {
      try {
        await inventoryService.updateItem(submodule, id, patch);
        bumpRevalidate();
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Could not save changes",
          description: (err as Error)?.message ?? "Please try again.",
        });
        throw err;
      }
    },
    [toast, bumpRevalidate],
  );

  const deleteItem = useCallback(
    async (submodule: SubmoduleKey, id: string) => {
      try {
        await inventoryService.deleteItem(submodule, id);
        bumpRevalidate();
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Could not delete",
          description: (err as Error)?.message ?? "Please try again.",
        });
        throw err;
      }
    },
    [toast, bumpRevalidate],
  );

  const bulkDelete = useCallback(
    async (_submodule: SubmoduleKey, ids: string[]) => {
      if (!ids.length) return;
      try {
        await inventoryService.bulkDelete(ids);
        bumpRevalidate();
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Could not delete selected items",
          description: (err as Error)?.message ?? "Please try again.",
        });
        throw err;
      }
    },
    [toast, bumpRevalidate],
  );

  // ── Masters ───────────────────────────────────────────────────────────────

  const getMaster = useCallback(
    (key: string) => mastersRef.current.find((m) => m.key === key),
    [],
  );

  const getMasterOptions = useCallback(
    (key: string) =>
      (mastersRef.current.find((m) => m.key === key)?.options ?? [])
        .filter((o) => o.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [],
  );

  /** Apply a master mutation optimistically and persist, rolling back on error. */
  const mutateMasters = useCallback(
    async (next: MasterType[], errorTitle: string) => {
      const prev = mastersRef.current;
      setMasters(next);
      try {
        await inventoryService.saveMasters(next);
      } catch (err) {
        setMasters(prev);
        toast({
          variant: "destructive",
          title: errorTitle,
          description: (err as Error)?.message ?? "Please try again.",
        });
        throw err;
      }
    },
    [toast],
  );

  const addMasterOption = useCallback(
    async (key: string, value: string, code?: string) => {
      const next = mastersRef.current.map((m) => {
        if (m.key !== key) return m;
        const sortOrder = m.options.reduce((max, o) => Math.max(max, o.sortOrder), -1) + 1;
        const option: MasterOption = {
          id: uid("opt"),
          value: value.trim(),
          code: code?.trim() || undefined,
          active: true,
          sortOrder,
        };
        return { ...m, options: [...m.options, option] };
      });
      await mutateMasters(next, "Could not add option");
    },
    [mutateMasters],
  );

  const updateMasterOption = useCallback(
    async (key: string, optionId: string, patch: Partial<MasterOption>) => {
      const next = mastersRef.current.map((m) =>
        m.key === key
          ? { ...m, options: m.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)) }
          : m,
      );
      await mutateMasters(next, "Could not update option");
    },
    [mutateMasters],
  );

  const deleteMasterOption = useCallback(
    async (key: string, optionId: string) => {
      const next = mastersRef.current.map((m) =>
        m.key === key ? { ...m, options: m.options.filter((o) => o.id !== optionId) } : m,
      );
      await mutateMasters(next, "Could not delete option");
    },
    [mutateMasters],
  );

  const addMasterType = useCallback(
    async (label: string, opts?: { description?: string }) => {
      const trimmed = label.trim();
      const baseKey =
        trimmed
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || "master";
      // Ensure the key is unique.
      const existing = new Set(mastersRef.current.map((m) => m.key));
      let key = baseKey;
      let n = 2;
      while (existing.has(key)) key = `${baseKey}_${n++}`;

      const master: MasterType = {
        key,
        label: trimmed,
        description: opts?.description?.trim() || undefined,
        icon: "list",
        usedBy: [],
        system: false,
        options: [],
      };
      await mutateMasters([...mastersRef.current, master], "Could not create master");
      return key;
    },
    [mutateMasters],
  );

  const deleteMasterType = useCallback(
    async (key: string) => {
      const target = mastersRef.current.find((m) => m.key === key);
      if (!target || target.system) {
        toast({
          variant: "destructive",
          title: "Cannot delete",
          description: "System masters are required by the inventory fields.",
        });
        return;
      }
      await mutateMasters(
        mastersRef.current.filter((m) => m.key !== key),
        "Could not delete master",
      );
    },
    [mutateMasters, toast],
  );

  const resetAll = useCallback(async () => {
    const snap = await inventoryService.reset();
    setMasters(snap.masters);
    bumpRevalidate();
    toast({ title: "Inventory data reset", description: "Sample data has been restored." });
  }, [toast, bumpRevalidate]);

  const value = useMemo<InventoryContextValue>(
    () => ({
      ready,
      masters,
      revalidateToken,
      bumpRevalidate,
      createItem,
      updateItem,
      deleteItem,
      bulkDelete,
      getMaster,
      getMasterOptions,
      addMasterOption,
      updateMasterOption,
      deleteMasterOption,
      addMasterType,
      deleteMasterType,
      resetAll,
    }),
    [
      ready,
      masters,
      revalidateToken,
      bumpRevalidate,
      createItem,
      updateItem,
      deleteItem,
      bulkDelete,
      getMaster,
      getMasterOptions,
      addMasterOption,
      updateMasterOption,
      deleteMasterOption,
      addMasterType,
      deleteMasterType,
      resetAll,
    ],
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory(): InventoryContextValue {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInventory must be used within an InventoryProvider");
  return ctx;
}
