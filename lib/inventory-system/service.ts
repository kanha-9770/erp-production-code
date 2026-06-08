/**
 * Inventory System — service boundary (LIVE: org-scoped Prisma-backed API).
 *
 * This is the ONLY file that knows where data lives. It used to persist to
 * localStorage; it now calls /api/inventory-system/* (backed by the
 * InventoryRecord + InventoryMasterSnapshot tables). The provider, schemas and
 * UI are unchanged — the method names, argument order and return types are
 * identical to the previous mock, so optimistic reconciliation still works
 * (every write returns the canonical server record).
 */

import type {
  InventoryItem,
  InventoryMovement,
  InventorySnapshot,
  MasterType,
  SubmoduleKey,
} from "./types";
<<<<<<< HEAD
=======
import { SEED_MASTERS, SUBMODULE_ORDER } from "./schema";
import { seedItems, seedMovements } from "./seed";
>>>>>>> 3f62dcd6f3ee142bcf58a686984ba27a27ffaab8

const BASE = "/api/inventory-system";

/** Query for one paginated page of a submodule. */
export interface InventoryListQuery {
  submodule: SubmoduleKey;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  masters?: Record<string, string>;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}

export interface InventoryListResult {
  rows: InventoryItem[];
  total: number;
  lowCount: number;
  outCount: number;
  page: number;
  pageSize: number;
}

<<<<<<< HEAD
/** Fetch + unwrap the {success,data} envelope; throw on any non-ok response. */
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || `Request failed (${res.status})`);
=======
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
>>>>>>> 3f62dcd6f3ee142bcf58a686984ba27a27ffaab8
  }
  return json.data as T;
}

/** Build the /items query string from a list query (omitting empty params). */
function listParams(q: InventoryListQuery): string {
  const p = new URLSearchParams();
  p.set("submodule", q.submodule);
  p.set("page", String(q.page));
  p.set("pageSize", String(q.pageSize));
  if (q.search?.trim()) p.set("search", q.search.trim());
  if (q.status) p.set("status", q.status);
  if (q.sortKey) {
    p.set("sortKey", q.sortKey);
    p.set("sortDir", q.sortDir ?? "desc");
  }
  if (q.masters) {
    const active = Object.fromEntries(Object.entries(q.masters).filter(([, v]) => v));
    if (Object.keys(active).length) p.set("masters", JSON.stringify(active));
  }
  return p.toString();
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
  /** Load the full snapshot (masters + items for all submodules). Legacy. */
  load(): Promise<InventorySnapshot> {
    return api<InventorySnapshot>(`${BASE}/load`);
  },

  /** Just the master registry — the provider's cheap mount-time load. */
  loadMasters(): Promise<MasterType[]> {
    return api<MasterType[]>(`${BASE}/masters`);
  },

  /** One paginated, server-filtered/sorted page of a submodule. */
  listItems(q: InventoryListQuery, signal?: AbortSignal): Promise<InventoryListResult> {
    return api<InventoryListResult>(`${BASE}/items?${listParams(q)}`, { signal });
  },

  /** Full single record (incl. image) — lazy-loaded on row select. */
  getItem(id: string, signal?: AbortSignal): Promise<InventoryItem> {
    return api<InventoryItem>(`${BASE}/items/${encodeURIComponent(id)}`, { signal });
  },

  /** All matching ids across every page — backs "Select all N matching". */
  listItemIds(q: InventoryListQuery): Promise<string[]> {
    return api<string[]>(`${BASE}/items/query`, {
      method: "POST",
      body: JSON.stringify({ op: "ids", query: q }),
    });
  },

  /** Lean records for a set of ids — cross-page export of the selection. */
  getItemsByIds(ids: string[]): Promise<InventoryItem[]> {
    return api<InventoryItem[]>(`${BASE}/items/query`, {
      method: "POST",
      body: JSON.stringify({ op: "byIds", ids }),
    });
  },

  // ── Items ──
  createItem(submodule: SubmoduleKey, data: Record<string, unknown>): Promise<InventoryItem> {
    return api<InventoryItem>(`${BASE}/items`, {
      method: "POST",
      body: JSON.stringify({ submodule, data }),
    });
  },

  updateItem(submodule: SubmoduleKey, id: string, patch: Record<string, unknown>): Promise<InventoryItem> {
    return api<InventoryItem>(`${BASE}/items/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ submodule, patch }),
    });
  },

  deleteItem(_submodule: SubmoduleKey, id: string): Promise<{ id: string }> {
    return api<{ id: string }>(`${BASE}/items/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  /** Delete many items at once (one request). */
  bulkDelete(ids: string[]): Promise<{ count: number }> {
    return api<{ count: number }>(`${BASE}/items/bulk-delete`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
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
  saveMasters(masters: MasterType[]): Promise<MasterType[]> {
    return api<MasterType[]>(`${BASE}/masters`, {
      method: "PUT",
      body: JSON.stringify({ masters }),
    });
  },

  /** Wipe this org's inventory data and reseed. */
  reset(): Promise<InventorySnapshot> {
    return api<InventorySnapshot>(`${BASE}/reset`, { method: "POST" });
  },
};
