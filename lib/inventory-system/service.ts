/**
 * Inventory System — service boundary (the seam between UI and "backend").
 *
 * Today this is a mock that persists to localStorage and simulates network
 * latency, so the whole module works with zero backend. It is the ONLY file
 * that knows where data lives. To go live, reimplement these functions against
 * the real API (RTK Query / fetch) — the provider and UI never change.
 *
 * All write methods return the canonical record as the "server" would, so the
 * optimistic provider can reconcile (e.g. swap a temp id for a real one).
 */

import type {
  InventoryItem,
  InventorySnapshot,
  MasterType,
  SubmoduleKey,
} from "./types";
import { SEED_MASTERS, SUBMODULE_ORDER } from "./schema";
import { seedItems } from "./seed";

const STORAGE_KEY = "erp:inventory-system:v1";
const SNAPSHOT_VERSION = 1;
const LATENCY_MS = 350; // visible enough to make optimistic UI obvious

function delay(): Promise<void> {
  return new Promise((res) => setTimeout(res, LATENCY_MS));
}

function emptyItems(): Record<SubmoduleKey, InventoryItem[]> {
  return { store: [], machine: [], metal: [] };
}

function freshSnapshot(): InventorySnapshot {
  const items = emptyItems();
  for (const key of SUBMODULE_ORDER) items[key] = seedItems(key);
  return {
    version: SNAPSHOT_VERSION,
    masters: structuredClone(SEED_MASTERS),
    items,
  };
}

function read(): InventorySnapshot {
  if (typeof window === "undefined") return freshSnapshot();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = freshSnapshot();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as InventorySnapshot;
    // Backfill any masters that were added to the seed after first run, so new
    // dropdowns (e.g. metal_form) appear without a manual reset.
    const known = new Set(parsed.masters.map((m) => m.key));
    for (const m of SEED_MASTERS) {
      if (!known.has(m.key)) parsed.masters.push(structuredClone(m));
    }
    if (!parsed.items) parsed.items = emptyItems();
    for (const key of SUBMODULE_ORDER) parsed.items[key] ??= [];
    return parsed;
  } catch {
    return freshSnapshot();
  }
}

function write(snap: InventorySnapshot): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const inventoryService = {
  /** Load the full snapshot (masters + items for all submodules). */
  async load(): Promise<InventorySnapshot> {
    await delay();
    return read();
  },

  // ── Items ──
  async createItem(
    submodule: SubmoduleKey,
    data: Record<string, unknown>,
  ): Promise<InventoryItem> {
    await delay();
    const snap = read();
    const record: InventoryItem = {
      ...data,
      id: uid("itm"),
      submodule,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    snap.items[submodule] = [record, ...snap.items[submodule]];
    write(snap);
    return record;
  },

  async updateItem(
    submodule: SubmoduleKey,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<InventoryItem> {
    await delay();
    const snap = read();
    const list = snap.items[submodule];
    const idx = list.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error("Item not found");
    const updated: InventoryItem = { ...list[idx], ...patch, updatedAt: nowIso() };
    list[idx] = updated;
    write(snap);
    return updated;
  },

  async deleteItem(submodule: SubmoduleKey, id: string): Promise<{ id: string }> {
    await delay();
    const snap = read();
    snap.items[submodule] = snap.items[submodule].filter((i) => i.id !== id);
    write(snap);
    return { id };
  },

  // ── Masters ──
  async saveMasters(masters: MasterType[]): Promise<MasterType[]> {
    await delay();
    const snap = read();
    snap.masters = masters;
    write(snap);
    return masters;
  },

  /** Wipe local data and reseed — handy for demos. */
  async reset(): Promise<InventorySnapshot> {
    const seeded = freshSnapshot();
    write(seeded);
    await delay();
    return seeded;
  },
};

export { STORAGE_KEY as INVENTORY_STORAGE_KEY };
