/** Presentation helpers for the Inventory System. */

import type { InventoryItem, ItemStatus } from "./types";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatMoney(value: unknown): string {
  const n = Number(value);
  if (value == null || value === "" || !Number.isFinite(n)) return "—";
  try {
    return inr.format(n);
  } catch {
    return `₹ ${n.toLocaleString("en-IN")}`;
  }
}

export function formatNumber(value: unknown): string {
  const n = Number(value);
  if (value == null || value === "" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN");
}

export function formatDate(value: unknown): string {
  if (!value) return "—";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
  MAINTENANCE: "Maintenance",
  RETIRED: "Retired",
};

export const STATUS_VARIANT: Record<ItemStatus, "default" | "secondary" | "outline" | "destructive"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  LOW_STOCK: "outline",
  OUT_OF_STOCK: "destructive",
  MAINTENANCE: "outline",
  RETIRED: "secondary",
};

/**
 * Derive a stock-aware status from quantities for items that don't carry an
 * explicit one. Out of stock when current <= 0; low when at/under the reorder
 * level; active otherwise.
 */
export function deriveStockStatus(item: InventoryItem): ItemStatus {
  const explicit = item.status as ItemStatus | undefined;
  if (explicit && explicit !== "ACTIVE") return explicit;
  const current = Number(item.currentStock ?? 0);
  const min = Number(item.minStock ?? 0);
  if (current <= 0) return "OUT_OF_STOCK";
  if (min > 0 && current <= min) return "LOW_STOCK";
  return "ACTIVE";
}

export const STATUS_OPTIONS: Array<{ value: ItemStatus; label: string }> = (
  ["ACTIVE", "LOW_STOCK", "OUT_OF_STOCK", "INACTIVE"] as ItemStatus[]
).map((value) => ({ value, label: STATUS_LABEL[value] }));
