"use client";

/**
 * ProductProvider — optimistic state layer for the Product Master System.
 * Same manual-optimistic pattern as the purchase/accounts modules: mutate state
 * immediately, persist in the background via `productService`, then reconcile or
 * roll back + toast on failure. Fully decoupled from the rest of the ERP.
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
import { productService } from "./service";
import type {
  ProductRecord,
  MasterOption,
  MasterType,
  ProductSubmoduleKey,
} from "./types";

interface ProductContextValue {
  ready: boolean;
  records: Record<ProductSubmoduleKey, ProductRecord[]>;
  masters: MasterType[];

  createRecord: (submodule: ProductSubmoduleKey, data: Record<string, unknown>) => Promise<void>;
  updateRecord: (
    submodule: ProductSubmoduleKey,
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  deleteRecord: (submodule: ProductSubmoduleKey, id: string) => Promise<void>;

  getMaster: (key: string) => MasterType | undefined;
  getMasterOptions: (key: string) => MasterOption[];
  addMasterOption: (key: string, value: string, code?: string) => Promise<void>;
  updateMasterOption: (key: string, optionId: string, patch: Partial<MasterOption>) => Promise<void>;
  deleteMasterOption: (key: string, optionId: string) => Promise<void>;
  addMasterType: (label: string, opts?: { description?: string }) => Promise<string>;
  deleteMasterType: (key: string) => Promise<void>;

  resetAll: () => Promise<void>;
}

const ProductContext = createContext<ProductContextValue | null>(null);

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function ProductProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [records, setRecords] = useState<Record<ProductSubmoduleKey, ProductRecord[]>>({
    product: [],
  });
  const [masters, setMasters] = useState<MasterType[]>([]);

  const mastersRef = useRef(masters);
  mastersRef.current = masters;

  useEffect(() => {
    let alive = true;
    productService.load().then((snap) => {
      if (!alive) return;
      setRecords(snap.records);
      setMasters(snap.masters);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── Record CRUD ───────────────────────────────────────────────────────────

  const createRecord = useCallback(
    async (submodule: ProductSubmoduleKey, data: Record<string, unknown>) => {
      const tempId = uid("tmp");
      const now = new Date().toISOString();
      const optimistic: ProductRecord = {
        ...data,
        id: tempId,
        submodule,
        createdAt: now,
        updatedAt: now,
        _optimistic: true,
      };
      setRecords((prev) => ({ ...prev, [submodule]: [optimistic, ...prev[submodule]] }));
      try {
        const saved = await productService.createRecord(submodule, data);
        setRecords((prev) => ({
          ...prev,
          [submodule]: prev[submodule].map((r) => (r.id === tempId ? saved : r)),
        }));
      } catch (err) {
        setRecords((prev) => ({
          ...prev,
          [submodule]: prev[submodule].filter((r) => r.id !== tempId),
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

  const updateRecord = useCallback(
    async (submodule: ProductSubmoduleKey, id: string, patch: Record<string, unknown>) => {
      let snapshot: ProductRecord | undefined;
      setRecords((prev) => ({
        ...prev,
        [submodule]: prev[submodule].map((r) => {
          if (r.id !== id) return r;
          snapshot = r;
          return { ...r, ...patch, _optimistic: true, updatedAt: new Date().toISOString() };
        }),
      }));
      try {
        const saved = await productService.updateRecord(submodule, id, patch);
        setRecords((prev) => ({
          ...prev,
          [submodule]: prev[submodule].map((r) => (r.id === id ? saved : r)),
        }));
      } catch (err) {
        if (snapshot) {
          const restore = snapshot;
          setRecords((prev) => ({
            ...prev,
            [submodule]: prev[submodule].map((r) => (r.id === id ? restore : r)),
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

  const deleteRecord = useCallback(
    async (submodule: ProductSubmoduleKey, id: string) => {
      let removed: ProductRecord | undefined;
      let removedIndex = -1;
      setRecords((prev) => {
        const list = prev[submodule];
        removedIndex = list.findIndex((r) => r.id === id);
        removed = list[removedIndex];
        return {
          ...prev,
          [submodule]: list.map((r) => (r.id === id ? { ...r, _deleting: true } : r)),
        };
      });
      try {
        await productService.deleteRecord(submodule, id);
        setRecords((prev) => ({
          ...prev,
          [submodule]: prev[submodule].filter((r) => r.id !== id),
        }));
      } catch (err) {
        if (removed) {
          const restore = removed;
          const at = removedIndex;
          setRecords((prev) => {
            const list = prev[submodule].map((r) =>
              r.id === id ? { ...restore, _deleting: false } : r,
            );
            if (!list.some((r) => r.id === id) && at >= 0) {
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

  const getMaster = useCallback((key: string) => mastersRef.current.find((m) => m.key === key), []);

  const getMasterOptions = useCallback(
    (key: string) =>
      (mastersRef.current.find((m) => m.key === key)?.options ?? [])
        .filter((o) => o.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [],
  );

  const mutateMasters = useCallback(
    async (next: MasterType[], errorTitle: string) => {
      const prev = mastersRef.current;
      setMasters(next);
      try {
        await productService.saveMasters(next);
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
          description: "System masters are required by the Product Master.",
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
    const snap = await productService.reset();
    setRecords(snap.records);
    setMasters(snap.masters);
    toast({ title: "Product data reset", description: "Sample data has been restored." });
  }, [toast]);

  const value = useMemo<ProductContextValue>(
    () => ({
      ready,
      records,
      masters,
      createRecord,
      updateRecord,
      deleteRecord,
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
      records,
      masters,
      createRecord,
      updateRecord,
      deleteRecord,
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

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProduct(): ProductContextValue {
  const ctx = useContext(ProductContext);
  if (!ctx) throw new Error("useProduct must be used within a ProductProvider");
  return ctx;
}
