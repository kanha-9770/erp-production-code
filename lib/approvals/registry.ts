/**
 * Approval adapter registry — maps a module key to its {@link ApprovalAdapter}.
 * The generic approval handlers/routes resolve the right adapter from here, so
 * adding a module is a one-line entry (plus building its adapter).
 */

import type { ApprovalAdapter } from "./types";
import { inventoryApprovalAdapter } from "@/lib/inventory-system/approval-adapter";
import { purchaseApprovalAdapter } from "@/lib/purchase-system/approval-adapter";

const ADAPTERS: Record<string, ApprovalAdapter> = {
  inventory: inventoryApprovalAdapter,
  purchase: purchaseApprovalAdapter,
};

export const APPROVAL_MODULES = Object.keys(ADAPTERS);

export function getAdapter(module: string): ApprovalAdapter {
  const adapter = ADAPTERS[module];
  if (!adapter) throw new Error(`Unknown approval module: ${module}`);
  return adapter;
}

export function listAdapters(): ApprovalAdapter[] {
  return Object.values(ADAPTERS);
}
