"use client";

/**
 * AccountsProvider — optimistic state layer for the Accounts System.
 * Same manual-optimistic pattern as the purchase/inventory modules: mutate
 * state immediately, persist in the background via `accountsService`, then
 * reconcile or roll back + toast on failure. Fully decoupled from the rest of
 * the ERP.
 *
 * Two masters are kept in sync with their owning records:
 *   - `customer` ← Customer master records
 *   - `ledger`   ← Chart of Accounts records
 * so the Invoice/Receipt/Journal/Payment screens always see the live lists.
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
import { accountsService } from "./service";
import {
  deriveInvoiceTotals,
  deriveExpenseTotal,
  deriveJournalTotals,
} from "./lines";
import type {
  AccountsRecord,
  MasterOption,
  MasterType,
  AccountsSubmoduleKey,
} from "./types";

interface AccountsContextValue {
  ready: boolean;
  records: Record<AccountsSubmoduleKey, AccountsRecord[]>;
  masters: MasterType[];

  createRecord: (submodule: AccountsSubmoduleKey, data: Record<string, unknown>) => Promise<void>;
  updateRecord: (
    submodule: AccountsSubmoduleKey,
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  deleteRecord: (submodule: AccountsSubmoduleKey, id: string) => Promise<void>;

  /** Resolve an invoice number to its customer + outstanding balance. */
  getInvoiceTrace: (invoiceNo: string) => InvoiceTrace;
  /** Sales invoices with an outstanding balance (for a Receipt's dropdown).
   *  `includeValue` keeps an already-selected invoice in the list. */
  getOpenInvoiceOptions: (includeValue?: string) => OpenInvoiceOption[];

  getMaster: (key: string) => MasterType | undefined;
  getMasterOptions: (key: string) => MasterOption[];
  addMasterOption: (key: string, value: string, code?: string) => Promise<void>;
  updateMasterOption: (key: string, optionId: string, patch: Partial<MasterOption>) => Promise<void>;
  deleteMasterOption: (key: string, optionId: string) => Promise<void>;
  addMasterType: (label: string, opts?: { description?: string }) => Promise<string>;
  deleteMasterType: (key: string) => Promise<void>;

  resetAll: () => Promise<void>;
}

export interface InvoiceTrace {
  found: boolean;
  customer?: string;
  total?: number;
  received?: number;
  /** Total − received-so-far (never negative). */
  balance?: number;
}

export interface OpenInvoiceOption {
  value: string;
  label: string;
  balance: number;
  customer?: string;
}

/** Sum receipt amounts per invoice number across all receipts. */
function buildReceivedByInvoice(receipts: AccountsRecord[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of receipts) {
    if (r._deleting) continue;
    const inv = String(r.invoiceRef ?? "").trim();
    if (!inv) continue;
    m.set(inv, (m.get(inv) ?? 0) + (Number(r.amount ?? 0) || 0));
  }
  return m;
}

/** Recompute the system-derived totals for a document before persisting. */
function withDerived(
  submodule: AccountsSubmoduleKey,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (submodule === "salesInvoice" && ("items" in data || "taxRate" in data)) {
    return { ...data, ...deriveInvoiceTotals(data) };
  }
  if (submodule === "expense" && "items" in data) {
    return { ...data, ...deriveExpenseTotal(data) };
  }
  if (submodule === "journal" && "lines" in data) {
    const { totalDebit, totalCredit } = deriveJournalTotals(data);
    return { ...data, totalDebit, totalCredit };
  }
  return data;
}

const AccountsContext = createContext<AccountsContextValue | null>(null);

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function AccountsProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [records, setRecords] = useState<Record<AccountsSubmoduleKey, AccountsRecord[]>>({
    coa: [],
    customer: [],
    salesInvoice: [],
    receipt: [],
    paymentVoucher: [],
    expense: [],
    journal: [],
  });
  const [masters, setMasters] = useState<MasterType[]>([]);

  const mastersRef = useRef(masters);
  mastersRef.current = masters;

  const recordsRef = useRef(records);
  recordsRef.current = records;

  useEffect(() => {
    let alive = true;
    accountsService.load().then((snap) => {
      if (!alive) return;
      setRecords(snap.records);
      setMasters(snap.masters);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Keep the `customer` dropdown master in sync with the Customer master entity:
  // its options are a projection of the customer records (active follows status).
  useEffect(() => {
    if (!ready) return;
    const options = records.customer
      .map((r, i) => ({
        id: `cust-${r.id}`,
        value: String(r.customerName ?? "").trim(),
        code: r.docNo ? String(r.docNo) : undefined,
        active: String(r.status ?? "ACTIVE") === "ACTIVE",
        sortOrder: i,
      }))
      .filter((o) => o.value);
    setMasters((prev) => {
      const cur = prev.find((m) => m.key === "customer");
      if (cur && JSON.stringify(cur.options) === JSON.stringify(options)) return prev;
      return prev.map((m) => (m.key === "customer" ? { ...m, options } : m));
    });
  }, [ready, records.customer]);

  // Keep the `ledger` dropdown master in sync with the Chart of Accounts: its
  // options are a projection of the (active) ledger accounts.
  useEffect(() => {
    if (!ready) return;
    const options = records.coa
      .map((r, i) => ({
        id: `led-${r.id}`,
        value: String(r.accountName ?? "").trim(),
        code: r.docNo ? String(r.docNo) : undefined,
        active: String(r.status ?? "ACTIVE") === "ACTIVE",
        sortOrder: i,
      }))
      .filter((o) => o.value);
    setMasters((prev) => {
      const cur = prev.find((m) => m.key === "ledger");
      if (cur && JSON.stringify(cur.options) === JSON.stringify(options)) return prev;
      return prev.map((m) => (m.key === "ledger" ? { ...m, options } : m));
    });
  }, [ready, records.coa]);

  // ── Record CRUD ───────────────────────────────────────────────────────────

  const createRecord = useCallback(
    async (submodule: AccountsSubmoduleKey, data: Record<string, unknown>) => {
      const tempId = uid("tmp");
      const now = new Date().toISOString();
      const payload = withDerived(submodule, data);
      const optimistic: AccountsRecord = {
        ...payload,
        id: tempId,
        submodule,
        createdAt: now,
        updatedAt: now,
        _optimistic: true,
      };
      setRecords((prev) => ({ ...prev, [submodule]: [optimistic, ...prev[submodule]] }));
      try {
        const saved = await accountsService.createRecord(submodule, payload);
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
    async (submodule: AccountsSubmoduleKey, id: string, patch: Record<string, unknown>) => {
      let snapshot: AccountsRecord | undefined;
      const payload = withDerived(submodule, patch);
      setRecords((prev) => ({
        ...prev,
        [submodule]: prev[submodule].map((r) => {
          if (r.id !== id) return r;
          snapshot = r;
          return { ...r, ...payload, _optimistic: true, updatedAt: new Date().toISOString() };
        }),
      }));
      try {
        const saved = await accountsService.updateRecord(submodule, id, payload);
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
    async (submodule: AccountsSubmoduleKey, id: string) => {
      let removed: AccountsRecord | undefined;
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
        await accountsService.deleteRecord(submodule, id);
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

  // ── Invoice ↔ Receipt links ────────────────────────────────────────────────

  const getInvoiceTrace = useCallback((invoiceNo: string): InvoiceTrace => {
    const ref = invoiceNo.trim().toLowerCase();
    if (!ref) return { found: false };
    const inv = recordsRef.current.salesInvoice.find(
      (r) => String(r.docNo ?? "").trim().toLowerCase() === ref,
    );
    if (!inv) return { found: false };
    const received = buildReceivedByInvoice(recordsRef.current.receipt).get(
      String(inv.docNo ?? "").trim(),
    ) ?? 0;
    const total = Number(inv.total ?? 0) || 0;
    return {
      found: true,
      customer: inv.customer as string | undefined,
      total,
      received,
      balance: Math.max(0, total - received),
    };
  }, []);

  const getOpenInvoiceOptions = useCallback((includeValue?: string): OpenInvoiceOption[] => {
    const received = buildReceivedByInvoice(recordsRef.current.receipt);
    const out: OpenInvoiceOption[] = [];
    for (const inv of recordsRef.current.salesInvoice) {
      if (inv.status === "CANCELLED") continue;
      const docNo = String(inv.docNo ?? "").trim();
      if (!docNo) continue;
      const total = Number(inv.total ?? 0) || 0;
      const balance = Math.max(0, total - (received.get(docNo) ?? 0));
      if (balance > 0 || docNo === includeValue) {
        const cust = inv.customer ? ` · ${String(inv.customer)}` : "";
        const bal = ` · bal ${balance}`;
        out.push({
          value: docNo,
          label: `${docNo}${cust}${bal}`,
          balance,
          customer: inv.customer as string | undefined,
        });
      }
    }
    if (includeValue && !out.some((o) => o.value === includeValue)) {
      out.unshift({ value: includeValue, label: includeValue, balance: 0 });
    }
    return out;
  }, []);

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
        await accountsService.saveMasters(next);
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
          description: "System masters are required by the finance documents.",
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
    const snap = await accountsService.reset();
    setRecords(snap.records);
    setMasters(snap.masters);
    toast({ title: "Accounts data reset", description: "Sample data has been restored." });
  }, [toast]);

  const value = useMemo<AccountsContextValue>(
    () => ({
      ready,
      records,
      masters,
      createRecord,
      updateRecord,
      deleteRecord,
      getInvoiceTrace,
      getOpenInvoiceOptions,
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
      getInvoiceTrace,
      getOpenInvoiceOptions,
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

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function useAccounts(): AccountsContextValue {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error("useAccounts must be used within an AccountsProvider");
  return ctx;
}
