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
  // Posting/editing/deleting a movement adjusts the linked store item's stock
  // server-side, in the same transaction. The server mints the IN-/OUT- code.
  loadMovements(): Promise<InventoryMovement[]> {
    return api<InventoryMovement[]>(`${BASE}/movements`);
  },

  createMovement(data: Record<string, unknown>): Promise<{ movement: InventoryMovement }> {
    return api<{ movement: InventoryMovement }>(`${BASE}/movements`, {
      method: "POST",
      body: JSON.stringify({ data }),
    });
  },

  updateMovement(id: string, patch: Record<string, unknown>): Promise<{ movement: InventoryMovement }> {
    return api<{ movement: InventoryMovement }>(`${BASE}/movements/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ patch }),
    });
  },

  deleteMovement(id: string): Promise<{ id: string }> {
    return api<{ id: string }>(`${BASE}/movements/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
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
