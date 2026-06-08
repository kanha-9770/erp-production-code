/**
 * Purchase System — service boundary (LIVE: org-scoped Prisma-backed API).
 * Mirrors lib/inventory-system/service.ts. Calls /api/purchase-system/*
 * (backed by PurchaseRecord + PurchaseMasterSnapshot). Method names, argument
 * order and return types are unchanged from the localStorage mock, so the
 * provider/UI keep working without edits.
 */

import type {
  PurchaseRecord,
  PurchaseSnapshot,
  PostStockResult,
  MasterType,
  PurchaseSubmoduleKey,
} from "./types";

const BASE = "/api/purchase-system";

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

export const purchaseService = {
  load(): Promise<PurchaseSnapshot> {
    return api<PurchaseSnapshot>(`${BASE}/load`);
  },

  createRecord(submodule: PurchaseSubmoduleKey, data: Record<string, unknown>): Promise<PurchaseRecord> {
    return api<PurchaseRecord>(`${BASE}/records`, {
      method: "POST",
      body: JSON.stringify({ submodule, data }),
    });
  },

  updateRecord(submodule: PurchaseSubmoduleKey, id: string, patch: Record<string, unknown>): Promise<PurchaseRecord> {
    return api<PurchaseRecord>(`${BASE}/records/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ submodule, patch }),
    });
  },

  deleteRecord(_submodule: PurchaseSubmoduleKey, id: string): Promise<{ id: string }> {
    return api<{ id: string }>(`${BASE}/records/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  /** Post a received GRN's quantities into Store Inventory (increment-or-create). */
  postStock(grnId: string): Promise<PostStockResult> {
    return api<PostStockResult>(`${BASE}/grn/${encodeURIComponent(grnId)}/post-stock`, {
      method: "POST",
    });
  },

  saveMasters(masters: MasterType[]): Promise<MasterType[]> {
    return api<MasterType[]>(`${BASE}/masters`, {
      method: "PUT",
      body: JSON.stringify({ masters }),
    });
  },

  reset(): Promise<PurchaseSnapshot> {
    return api<PurchaseSnapshot>(`${BASE}/reset`, { method: "POST" });
  },
};
