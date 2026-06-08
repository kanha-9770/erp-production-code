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
  InventoryMovement,
  InventorySnapshot,
  MasterType,
  SubmoduleKey,
} from "./types";
import { SEED_MASTERS, SUBMODULE_ORDER } from "./schema";
import { seedItems, seedMovements } from "./seed";

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
    movements: seedMovements(),
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
    if (!parsed.movements) parsed.movements = [];
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

/** Signed effect of a movement on stock: +qty for IN, −qty for OUT. */
function movementDelta(m: InventoryMovement): number {
  const qty = Number(m.quantity ?? 0) || 0;
  return m.direction === "IN" ? qty : -qty;
}

/** Adjust a store item's currentStock by `delta` (no-op if unlinked/missing). */
function applyStockDelta(snap: InventorySnapshot, itemId: string | undefined, delta: number): void {
  if (!itemId || delta === 0) return;
  const list = snap.items.store;
  const idx = list.findIndex((i) => i.id === itemId);
  if (idx === -1) return;
  const cur = Number(list[idx].currentStock ?? 0) || 0;
  list[idx] = { ...list[idx], currentStock: cur + delta, updatedAt: nowIso() };
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

  // ── Goods movements (Inward / Outward) ──
  // Posting a movement also adjusts the linked store item's currentStock in the
  // SAME snapshot write, so the ledger and stock never drift apart. Each method
  // returns the canonical store-item list so the provider can reconcile stock.
  async createMovement(
    data: Record<string, unknown>,
  ): Promise<{ movement: InventoryMovement; storeItems: InventoryItem[] }> {
    await delay();
    const snap = read();
    const movement = {
      ...data,
      id: uid("mov"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } as InventoryMovement;
    snap.movements = [movement, ...snap.movements];
    applyStockDelta(snap, movement.itemId, movementDelta(movement));
    write(snap);
    return { movement, storeItems: snap.items.store };
  },

  async updateMovement(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<{ movement: InventoryMovement; storeItems: InventoryItem[] }> {
    await delay();
    const snap = read();
    const idx = snap.movements.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error("Movement not found");
    const old = snap.movements[idx];
    // Reverse the old effect, apply the new — handles changed item/qty/direction.
    applyStockDelta(snap, old.itemId, -movementDelta(old));
    const updated = { ...old, ...patch, updatedAt: nowIso() } as InventoryMovement;
    snap.movements[idx] = updated;
    applyStockDelta(snap, updated.itemId, movementDelta(updated));
    write(snap);
    return { movement: updated, storeItems: snap.items.store };
  },

  async deleteMovement(id: string): Promise<{ id: string; storeItems: InventoryItem[] }> {
    await delay();
    const snap = read();
    const old = snap.movements.find((m) => m.id === id);
    if (old) applyStockDelta(snap, old.itemId, -movementDelta(old));
    snap.movements = snap.movements.filter((m) => m.id !== id);
    write(snap);
    return { id, storeItems: snap.items.store };
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
