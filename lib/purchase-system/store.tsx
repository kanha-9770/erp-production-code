"use client";

/**
 * PurchaseProvider — optimistic state layer for the Purchase System.
 * Same manual-optimistic pattern as the inventory module: mutate state
 * immediately, persist in the background via `purchaseService`, then reconcile
 * or roll back + toast on failure. Fully decoupled from the rest of the ERP.
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
import { purchaseService } from "./service";
import { deriveReceiptStatus } from "./receipt";
import type {
  PurchaseRecord,
  PostStockResult,
  CurrentUserIdentity,
  MasterOption,
  MasterType,
  PurchaseSubmoduleKey,
} from "./types";

interface PurchaseContextValue {
  ready: boolean;
  records: Record<PurchaseSubmoduleKey, PurchaseRecord[]>;
  masters: MasterType[];
  /** Logged-in user identity — drives read-only prefill of "Requested By" etc. */
  currentUser: CurrentUserIdentity;

  createRecord: (submodule: PurchaseSubmoduleKey, data: Record<string, unknown>) => Promise<void>;
  updateRecord: (
    submodule: PurchaseSubmoduleKey,
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  deleteRecord: (submodule: PurchaseSubmoduleKey, id: string) => Promise<void>;

  /** Post a received GRN's quantities into Store Inventory (increment-or-create). */
  postStock: (grnId: string) => Promise<PostStockResult>;

  /** Look up prior purchase history for an item (from PO records). */
  getItemHistory: (itemName: string) => ItemPurchaseHistory;
  /** Resolve a PO number to its supplier + originating PR (the trace chain). */
  getPoTrace: (poNo: string) => PoTrace;
  /** PO numbers not yet fully received (partial included). `includeValue`
   *  keeps an already-selected PO in the list even if it is now full. */
  getOpenPoOptions: (includeValue?: string) => OpenDocOption[];
  /** PR numbers not yet fully received (partial included). */
  getOpenPrOptions: (includeValue?: string) => OpenDocOption[];
  /** Every PO with an outstanding balance, for the pending-balances report. */
  getPendingPoBalances: () => PoBalance[];

  getMaster: (key: string) => MasterType | undefined;
  getMasterOptions: (key: string) => MasterOption[];
  addMasterOption: (key: string, value: string, code?: string) => Promise<void>;
  updateMasterOption: (key: string, optionId: string, patch: Partial<MasterOption>) => Promise<void>;
  deleteMasterOption: (key: string, optionId: string) => Promise<void>;
  addMasterType: (label: string, opts?: { description?: string }) => Promise<string>;
  deleteMasterType: (key: string) => Promise<void>;

  resetAll: () => Promise<void>;
}

export interface ItemPurchaseHistory {
  /** True when this item has been purchased before (matching PO exists). */
  found: boolean;
  /** Number of past POs for this item. */
  count: number;
  lastSupplier?: string;
  lastRate?: number;
  lastPoRef?: string;
  lastDate?: string;
}

export interface PoTrace {
  found: boolean;
  supplier?: string;
  /** Originating PR number, resolved PO → RFQ → PR where possible. */
  prRef?: string;
  poDate?: string;
  itemName?: string;
  rate?: number;
  orderedQty?: number;
  /** Qty still to receive against this PO (ordered − received-so-far). */
  balance?: number;
}

export interface OpenDocOption {
  value: string;
  label: string;
  balance: number;
}

export interface PoBalance {
  poNo: string;
  supplier?: string;
  itemName?: string;
  prRef?: string;
  orderedQty: number;
  received: number;
  balance: number;
  rate: number;
  pendingValue: number;
  status: "PENDING" | "PARTIAL";
  lastReceiptDate?: string;
}

/** Sum received qty per PO No. and per PR No. across every GRN's nested lines. */
function buildReceivedMaps(grnRows: PurchaseRecord[]): {
  byPo: Map<string, number>;
  byPr: Map<string, number>;
} {
  const byPo = new Map<string, number>();
  const byPr = new Map<string, number>();
  for (const grn of grnRows) {
    const invoices = Array.isArray(grn.lines) ? (grn.lines as Record<string, unknown>[]) : [];
    for (const inv of invoices) {
      const items = Array.isArray(inv.items) ? (inv.items as Record<string, unknown>[]) : [];
      for (const it of items) {
        const rec = Number(it.receivedQty ?? 0) || 0;
        const po = String(it.poRef ?? "").trim();
        const pr = String(it.prRef ?? "").trim();
        if (po) byPo.set(po, (byPo.get(po) ?? 0) + rec);
        if (pr) byPr.set(pr, (byPr.get(pr) ?? 0) + rec);
      }
    }
  }
  return { byPo, byPr };
}

const PurchaseContext = createContext<PurchaseContextValue | null>(null);

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function PurchaseProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [records, setRecords] = useState<Record<PurchaseSubmoduleKey, PurchaseRecord[]>>({
    supplier: [],
    pr: [],
    sourcing: [],
    po: [],
    grn: [],
    payment: [],
  });
  const [masters, setMasters] = useState<MasterType[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUserIdentity>({ name: "", department: "" });

  const mastersRef = useRef(masters);
  mastersRef.current = masters;

  // Keep a ref so the history lookup always reads the latest records without
  // forcing the callback identity to change on every edit.
  const recordsRef = useRef(records);
  recordsRef.current = records;

  useEffect(() => {
    let alive = true;
    purchaseService.load().then((snap) => {
      if (!alive) return;
      setRecords(snap.records);
      setMasters(snap.masters);
      if (snap.currentUser) setCurrentUser(snap.currentUser);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Keep the legacy "supplier" dropdown master in sync with the Supplier Master
  // entity: its options are a projection of the supplier records (active flag
  // follows status). Transaction screens keep using `master: "supplier"` and
  // automatically see the right list — no per-form wiring needed.
  useEffect(() => {
    if (!ready) return;
    const options = records.supplier
      .map((r, i) => ({
        id: `sup-${r.id}`,
        value: String(r.supplierName ?? "").trim(),
        code: r.docNo ? String(r.docNo) : undefined,
        active: (String(r.status ?? "ACTIVE")) === "ACTIVE",
        sortOrder: i,
      }))
      .filter((o) => o.value);
    setMasters((prev) => {
      const cur = prev.find((m) => m.key === "supplier");
      if (cur && JSON.stringify(cur.options) === JSON.stringify(options)) return prev;
      return prev.map((m) => (m.key === "supplier" ? { ...m, options } : m));
    });
  }, [ready, records.supplier]);

  // ── Record CRUD ───────────────────────────────────────────────────────────

  const createRecord = useCallback(
    async (submodule: PurchaseSubmoduleKey, data: Record<string, unknown>) => {
      const tempId = uid("tmp");
      const now = new Date().toISOString();
      // GRN receipt completeness is system-derived, never typed.
      const payload =
        submodule === "grn" ? { ...data, receiptStatus: deriveReceiptStatus(data.lines) } : data;
      const optimistic: PurchaseRecord = {
        ...payload,
        id: tempId,
        submodule,
        createdAt: now,
        updatedAt: now,
        _optimistic: true,
      };
      setRecords((prev) => ({ ...prev, [submodule]: [optimistic, ...prev[submodule]] }));
      try {
        const saved = await purchaseService.createRecord(submodule, payload);
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
    async (submodule: PurchaseSubmoduleKey, id: string, patch: Record<string, unknown>) => {
      let snapshot: PurchaseRecord | undefined;
      const payload =
        submodule === "grn" && "lines" in patch
          ? { ...patch, receiptStatus: deriveReceiptStatus(patch.lines) }
          : patch;
      setRecords((prev) => ({
        ...prev,
        [submodule]: prev[submodule].map((r) => {
          if (r.id !== id) return r;
          snapshot = r;
          return { ...r, ...payload, _optimistic: true, updatedAt: new Date().toISOString() };
        }),
      }));
      try {
        const saved = await purchaseService.updateRecord(submodule, id, payload);
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
    async (submodule: PurchaseSubmoduleKey, id: string) => {
      let removed: PurchaseRecord | undefined;
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
        await purchaseService.deleteRecord(submodule, id);
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

  // ── GRN → Inventory stock posting ───────────────────────────────────────────

  const postStock = useCallback(async (grnId: string): Promise<PostStockResult> => {
    const result = await purchaseService.postStock(grnId);
    // Reflect the server's STOCK_UPDATED / stockUpdated=YES on the local GRN row.
    setRecords((prev) => ({
      ...prev,
      grn: prev.grn.map((r) => (r.id === grnId ? result.grn : r)),
    }));
    return result;
  }, []);

  // ── Purchase history (repeat-purchase detection) ────────────────────────────

  const getItemHistory = useCallback((itemName: string): ItemPurchaseHistory => {
    const name = itemName.trim().toLowerCase();
    if (!name) return { found: false, count: 0 };
    // A "past purchase" is an existing PO for the same item. We ignore
    // cancelled POs so a scrapped order doesn't count as a repeat.
    const matches = recordsRef.current.po.filter((r) => {
      if (r._deleting) return false;
      if (r.status === "CANCELLED") return false;
      return String(r.itemName ?? "").trim().toLowerCase() === name;
    });
    if (matches.length === 0) return { found: false, count: 0 };
    const dateOf = (r: PurchaseRecord) =>
      new Date((r.docDate as string) || r.createdAt).getTime();
    const latest = [...matches].sort((a, b) => dateOf(b) - dateOf(a))[0];
    return {
      found: true,
      count: matches.length,
      lastSupplier: latest.supplier as string | undefined,
      lastRate: latest.rate as number | undefined,
      lastPoRef: latest.docNo as string | undefined,
      lastDate: (latest.docDate as string) || latest.createdAt,
    };
  }, []);

  const getPoTrace = useCallback((poNo: string): PoTrace => {
    const ref = poNo.trim().toLowerCase();
    if (!ref) return { found: false };
    const po = recordsRef.current.po.find(
      (r) => String(r.docNo ?? "").trim().toLowerCase() === ref,
    );
    if (!po) return { found: false };

    // Resolve the PR: the PO references an RFQ (or a PR) via rfqRef. Walk
    // PO → RFQ → PR; fall back to treating rfqRef as the PR itself.
    let prRef: string | undefined;
    const rfqRef = String(po.rfqRef ?? "").trim();
    if (rfqRef) {
      const rfqLow = rfqRef.toLowerCase();
      const rfq = recordsRef.current.sourcing.find(
        (r) => String(r.docNo ?? "").trim().toLowerCase() === rfqLow,
      );
      if (rfq?.prRef) prRef = String(rfq.prRef);
      else {
        const pr = recordsRef.current.pr.find(
          (r) => String(r.docNo ?? "").trim().toLowerCase() === rfqLow,
        );
        prRef = pr ? String(pr.docNo) : rfqRef;
      }
    }

    const { byPo } = buildReceivedMaps(recordsRef.current.grn);
    const orderedQty = Number(po.quantity ?? 0) || 0;
    const received = byPo.get(String(po.docNo ?? "").trim()) ?? 0;
    const balance = orderedQty > 0 ? Math.max(0, orderedQty - received) : 0;

    return {
      found: true,
      supplier: po.supplier as string | undefined,
      prRef,
      poDate: (po.docDate as string) || po.createdAt,
      itemName: po.itemName as string | undefined,
      rate: Number(po.rate ?? 0) || 0,
      orderedQty,
      balance,
    };
  }, []);

  const getOpenPoOptions = useCallback((includeValue?: string): OpenDocOption[] => {
    const { byPo } = buildReceivedMaps(recordsRef.current.grn);
    const out: OpenDocOption[] = [];
    for (const po of recordsRef.current.po) {
      if (po.status === "CANCELLED") continue;
      const docNo = String(po.docNo ?? "").trim();
      if (!docNo) continue;
      const qty = Number(po.quantity ?? 0) || 0;
      const received = byPo.get(docNo) ?? 0;
      const balance = qty > 0 ? qty - received : 0;
      const open = qty <= 0 ? true : received < qty; // partial & not-started stay
      if (open || docNo === includeValue) {
        const item = po.itemName ? ` · ${String(po.itemName)}` : "";
        const bal = qty > 0 ? ` · bal ${Math.max(0, balance)}` : "";
        out.push({ value: docNo, label: `${docNo}${item}${bal}`, balance: Math.max(0, balance) });
      }
    }
    if (includeValue && !out.some((o) => o.value === includeValue)) {
      out.unshift({ value: includeValue, label: includeValue, balance: 0 });
    }
    return out;
  }, []);

  const getOpenPrOptions = useCallback((includeValue?: string): OpenDocOption[] => {
    const { byPr } = buildReceivedMaps(recordsRef.current.grn);
    const out: OpenDocOption[] = [];
    for (const pr of recordsRef.current.pr) {
      if (pr.status === "REJECTED") continue;
      const docNo = String(pr.docNo ?? "").trim();
      if (!docNo) continue;
      const qty = Number(pr.quantity ?? 0) || 0;
      const received = byPr.get(docNo) ?? 0;
      const balance = qty > 0 ? qty - received : 0;
      const open = qty <= 0 ? true : received < qty;
      if (open || docNo === includeValue) {
        const item = pr.itemName ? ` · ${String(pr.itemName)}` : "";
        const bal = qty > 0 ? ` · bal ${Math.max(0, balance)}` : "";
        out.push({ value: docNo, label: `${docNo}${item}${bal}`, balance: Math.max(0, balance) });
      }
    }
    if (includeValue && !out.some((o) => o.value === includeValue)) {
      out.unshift({ value: includeValue, label: includeValue, balance: 0 });
    }
    return out;
  }, []);

  const getPendingPoBalances = useCallback((): PoBalance[] => {
    // received qty + last receipt date per PO, across every GRN's nested lines.
    const recv = new Map<string, { qty: number; lastDate?: string }>();
    for (const grn of recordsRef.current.grn) {
      const invoices = Array.isArray(grn.lines) ? (grn.lines as Record<string, unknown>[]) : [];
      const grnDate = (grn.docDate as string) || (grn.createdAt as string);
      for (const inv of invoices) {
        const items = Array.isArray(inv.items) ? (inv.items as Record<string, unknown>[]) : [];
        for (const it of items) {
          const po = String(it.poRef ?? "").trim();
          if (!po) continue;
          const cur = recv.get(po) ?? { qty: 0 };
          cur.qty += Number(it.receivedQty ?? 0) || 0;
          if (grnDate && (!cur.lastDate || grnDate > cur.lastDate)) cur.lastDate = grnDate;
          recv.set(po, cur);
        }
      }
    }

    const out: PoBalance[] = [];
    for (const po of recordsRef.current.po) {
      if (po.status === "CANCELLED") continue;
      const poNo = String(po.docNo ?? "").trim();
      if (!poNo) continue;
      const orderedQty = Number(po.quantity ?? 0) || 0;
      if (orderedQty <= 0) continue;
      const entry = recv.get(poNo);
      const received = entry?.qty ?? 0;
      const balance = orderedQty - received;
      if (balance <= 0) continue; // fully received → not pending
      const rate = Number(po.rate ?? 0) || 0;
      out.push({
        poNo,
        supplier: po.supplier as string | undefined,
        itemName: po.itemName as string | undefined,
        prRef: getPoTrace(poNo).prRef,
        orderedQty,
        received,
        balance,
        rate,
        pendingValue: Number((balance * rate).toFixed(2)),
        status: received > 0 ? "PARTIAL" : "PENDING",
        lastReceiptDate: entry?.lastDate,
      });
    }
    // Partially-received first (closer to completion), then largest value owed.
    out.sort((a, b) =>
      a.status === b.status ? b.pendingValue - a.pendingValue : a.status === "PARTIAL" ? -1 : 1,
    );
    return out;
  }, [getPoTrace]);

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
        await purchaseService.saveMasters(next);
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
          description: "System masters are required by the purchase documents.",
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
    const snap = await purchaseService.reset();
    setRecords(snap.records);
    setMasters(snap.masters);
    if (snap.currentUser) setCurrentUser(snap.currentUser);
    toast({ title: "Purchase data reset", description: "Sample data has been restored." });
  }, [toast]);

  const value = useMemo<PurchaseContextValue>(
    () => ({
      ready,
      records,
      masters,
      currentUser,
      createRecord,
      updateRecord,
      deleteRecord,
      postStock,
      getItemHistory,
      getPoTrace,
      getOpenPoOptions,
      getOpenPrOptions,
      getPendingPoBalances,
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
      currentUser,
      createRecord,
      updateRecord,
      deleteRecord,
      postStock,
      getItemHistory,
      getPoTrace,
      getOpenPoOptions,
      getOpenPrOptions,
      getPendingPoBalances,
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

  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

export function usePurchase(): PurchaseContextValue {
  const ctx = useContext(PurchaseContext);
  if (!ctx) throw new Error("usePurchase must be used within a PurchaseProvider");
  return ctx;
}
