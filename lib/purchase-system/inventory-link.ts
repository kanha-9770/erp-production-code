/**
 * Purchase ⇄ Inventory bridge (one-directional, loosely coupled).
 *
 * For a REPEAT purchase the requisition is raised against an item that already
 * exists in Store Inventory, so the buyer picks from the live store list rather
 * than re-typing the item. This is the ONLY place the purchase module reaches
 * into the inventory module — it reads through inventory's public service, so
 * neither module's internals leak across the boundary.
 */

import { inventoryService } from "@/lib/inventory-system/service";

export interface StoreItemOption {
  id: string;
  itemCode: string;
  itemName: string;
  itemDescription: string;
  category: string;
  uom: string;
  warehouse: string;
  currentStock: number;
  unitRate: number;
}

/** Load the Store Inventory items as flat options for the requisition picker. */
export async function loadStoreItems(): Promise<StoreItemOption[]> {
  const snap = await inventoryService.load();
  const items = snap.items?.store ?? [];
  return items.map((i) => ({
    id: String(i.id),
    itemCode: String(i.itemCode ?? ""),
    itemName: String(i.itemName ?? ""),
    itemDescription: String(i.itemDescription ?? ""),
    category: String(i.category ?? ""),
    uom: String(i.uom ?? ""),
    warehouse: String(i.warehouse ?? ""),
    currentStock: Number(i.currentStock ?? 0) || 0,
    unitRate: Number(i.unitRate ?? 0) || 0,
  }));
}
