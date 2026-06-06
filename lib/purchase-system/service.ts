/**
 * Purchase System — service boundary (mock; localStorage-backed).
 * Mirrors lib/inventory-system/service.ts. The only file that knows where data
 * lives; swap it to wire a real backend without touching provider or UI.
 */

import type {
  PurchaseRecord,
  PurchaseSnapshot,
  MasterType,
  PurchaseSubmoduleKey,
} from "./types";
import { SEED_MASTERS, SUBMODULE_ORDER } from "./schema";
import { seedRecords } from "./seed";

const STORAGE_KEY = "erp:purchase-system:v1";
const SNAPSHOT_VERSION = 1;
const LATENCY_MS = 350;

function delay(): Promise<void> {
  return new Promise((res) => setTimeout(res, LATENCY_MS));
}

function emptyRecords(): Record<PurchaseSubmoduleKey, PurchaseRecord[]> {
  return { supplier: [], pr: [], sourcing: [], po: [], grn: [], payment: [] };
}

function freshSnapshot(): PurchaseSnapshot {
  const records = emptyRecords();
  for (const key of SUBMODULE_ORDER) records[key] = seedRecords(key);
  return {
    version: SNAPSHOT_VERSION,
    masters: structuredClone(SEED_MASTERS),
    records,
  };
}

function read(): PurchaseSnapshot {
  if (typeof window === "undefined") return freshSnapshot();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = freshSnapshot();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as PurchaseSnapshot;
    const known = new Set(parsed.masters.map((m) => m.key));
    for (const m of SEED_MASTERS) {
      if (!known.has(m.key)) parsed.masters.push(structuredClone(m));
    }
    if (!parsed.records) parsed.records = emptyRecords();
    for (const key of SUBMODULE_ORDER) parsed.records[key] ??= [];
    return parsed;
  } catch {
    return freshSnapshot();
  }
}

function write(snap: PurchaseSnapshot): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const purchaseService = {
  async load(): Promise<PurchaseSnapshot> {
    await delay();
    return read();
  },

  async createRecord(
    submodule: PurchaseSubmoduleKey,
    data: Record<string, unknown>,
  ): Promise<PurchaseRecord> {
    await delay();
    const snap = read();
    const record: PurchaseRecord = {
      ...data,
      id: uid("rec"),
      submodule,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    snap.records[submodule] = [record, ...snap.records[submodule]];
    write(snap);
    return record;
  },

  async updateRecord(
    submodule: PurchaseSubmoduleKey,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<PurchaseRecord> {
    await delay();
    const snap = read();
    const list = snap.records[submodule];
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("Record not found");
    const updated: PurchaseRecord = { ...list[idx], ...patch, updatedAt: nowIso() };
    list[idx] = updated;
    write(snap);
    return updated;
  },

  async deleteRecord(submodule: PurchaseSubmoduleKey, id: string): Promise<{ id: string }> {
    await delay();
    const snap = read();
    snap.records[submodule] = snap.records[submodule].filter((r) => r.id !== id);
    write(snap);
    return { id };
  },

  async saveMasters(masters: MasterType[]): Promise<MasterType[]> {
    await delay();
    const snap = read();
    snap.masters = masters;
    write(snap);
    return masters;
  },

  async reset(): Promise<PurchaseSnapshot> {
    const seeded = freshSnapshot();
    write(seeded);
    await delay();
    return seeded;
  },
};

export { STORAGE_KEY as PURCHASE_STORAGE_KEY };
