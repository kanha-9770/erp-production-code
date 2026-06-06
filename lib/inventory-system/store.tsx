"use client";

/**
 * InventoryProvider — the optimistic state layer for the Inventory System.
 *
 * Pattern (mirrors the codebase's manual-optimistic approach, e.g. the AI
 * config client): every mutation updates the in-memory state IMMEDIATELY so the
 * UI feels instant, fires the async service in the background, then reconciles
 * the result (swapping a temp id for the canonical record) or rolls the change
 * back and surfaces a toast on failure.
 *
 * The provider is the single source of truth for the mounted module. It is
 * deliberately decoupled from the rest of the ERP — it only talks to
 * `inventoryService`, so swapping the mock for a real API is a one-file change.
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
  items: Record<SubmoduleKey, InventoryItem[]>;
  masters: MasterType[];

  // Item CRUD (optimistic)
  createItem: (submodule: SubmoduleKey, data: Record<string, unknown>) => Promise<void>;
  updateItem: (
    submodule: SubmoduleKey,
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  deleteItem: (submodule: SubmoduleKey, id: string) => Promise<void>;

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
  const [items, setItems] = useState<Record<SubmoduleKey, InventoryItem[]>>({
    store: [],
    machine: [],
    metal: [],
  });
  const [masters, setMasters] = useState<MasterType[]>([]);

  // Keep a ref to the latest masters so async reconcilers persist the right
  // snapshot without stale closures.
  const mastersRef = useRef(masters);
  mastersRef.current = masters;

  useEffect(() => {
    let alive = true;
    inventoryService.load().then((snap) => {
      if (!alive) return;
      setItems(snap.items);
      setMasters(snap.masters);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── Item CRUD ─────────────────────────────────────────────────────────────

  const createItem = useCallback(
    async (submodule: SubmoduleKey, data: Record<string, unknown>) => {
      const tempId = uid("tmp");
      const now = new Date().toISOString();
      const optimistic: InventoryItem = {
        ...data,
        id: tempId,
        submodule,
        createdAt: now,
        updatedAt: now,
        _optimistic: true,
      };
      // 1) show it immediately
      setItems((prev) => ({ ...prev, [submodule]: [optimistic, ...prev[submodule]] }));
      try {
        // 2) persist
        const saved = await inventoryService.createItem(submodule, data);
        // 3) reconcile temp → canonical
        setItems((prev) => ({
          ...prev,
          [submodule]: prev[submodule].map((i) => (i.id === tempId ? saved : i)),
        }));
      } catch (err) {
        // 4) rollback
        setItems((prev) => ({
          ...prev,
          [submodule]: prev[submodule].filter((i) => i.id !== tempId),
        }));
        toast({
          variant: "destructive",
          title: "Could not create",
          description: (err as Error)?.message ?? "Please try again.",
        });
        throw err;
      }
    },
    [toast],
  );

  const updateItem = useCallback(
    async (submodule: SubmoduleKey, id: string, patch: Record<string, unknown>) => {
      let snapshot: InventoryItem | undefined;
      setItems((prev) => ({
        ...prev,
        [submodule]: prev[submodule].map((i) => {
          if (i.id !== id) return i;
          snapshot = i;
          return { ...i, ...patch, _optimistic: true, updatedAt: new Date().toISOString() };
        }),
      }));
      try {
        const saved = await inventoryService.updateItem(submodule, id, patch);
        setItems((prev) => ({
          ...prev,
          [submodule]: prev[submodule].map((i) => (i.id === id ? saved : i)),
        }));
      } catch (err) {
        // rollback to the captured snapshot
        if (snapshot) {
          const restore = snapshot;
          setItems((prev) => ({
            ...prev,
            [submodule]: prev[submodule].map((i) => (i.id === id ? restore : i)),
          }));
        }
        toast({
          variant: "destructive",
          title: "Could not save changes",
          description: (err as Error)?.message ?? "Please try again.",
        });
        throw err;
      }
    },
    [toast],
  );

  const deleteItem = useCallback(
    async (submodule: SubmoduleKey, id: string) => {
      let removed: InventoryItem | undefined;
      let removedIndex = -1;
      // mark deleting (dim) then remove on success
      setItems((prev) => {
        const list = prev[submodule];
        removedIndex = list.findIndex((i) => i.id === id);
        removed = list[removedIndex];
        return {
          ...prev,
          [submodule]: list.map((i) => (i.id === id ? { ...i, _deleting: true } : i)),
        };
      });
      try {
        await inventoryService.deleteItem(submodule, id);
        setItems((prev) => ({
          ...prev,
          [submodule]: prev[submodule].filter((i) => i.id !== id),
        }));
      } catch (err) {
        // restore at original position
        if (removed) {
          const restore = removed;
          const at = removedIndex;
          setItems((prev) => {
            const list = prev[submodule].map((i) =>
              i.id === id ? { ...restore, _deleting: false } : i,
            );
            // if it had already been filtered out somehow, reinsert
            if (!list.some((i) => i.id === id) && at >= 0) {
              list.splice(at, 0, { ...restore, _deleting: false });
            }
            return { ...prev, [submodule]: list };
          });
        }
        toast({
          variant: "destructive",
          title: "Could not delete",
          description: (err as Error)?.message ?? "Please try again.",
        });
        throw err;
      }
    },
    [toast],
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
    setItems(snap.items);
    setMasters(snap.masters);
    toast({ title: "Inventory data reset", description: "Sample data has been restored." });
  }, [toast]);

  const value = useMemo<InventoryContextValue>(
    () => ({
      ready,
      items,
      masters,
      createItem,
      updateItem,
      deleteItem,
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
      items,
      masters,
      createItem,
      updateItem,
      deleteItem,
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
