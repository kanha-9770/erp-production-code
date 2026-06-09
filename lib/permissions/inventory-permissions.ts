/**
 * Inventory-system privileged actions — named-permission enforcement.
 *
 * Mirror of lib/permissions/purchase-permissions.ts for the inventory module.
 * Gates the stock-affecting / destructive operations on org-scoped named
 * permissions resolved by hasPermission() (admin/owner bypass; otherwise needs
 * a role grant or user override). Secure by default — only admins can perform
 * these until granted via the Approvals & Permissions admin page.
 */

import { hasPermission } from "@/lib/permissions/has-permission";

export const POST_INVENTORY_MOVEMENT = "POST_INVENTORY_MOVEMENT";
export const DELETE_INVENTORY_ITEM = "DELETE_INVENTORY_ITEM";
export const RESET_INVENTORY_DATA = "RESET_INVENTORY_DATA";

/** Source of truth for the inventory permissions, used by the catalog + tooling. */
export const INVENTORY_PERMISSIONS: ReadonlyArray<{
  name: string;
  description: string;
  resource: string;
}> = [
  {
    name: POST_INVENTORY_MOVEMENT,
    description:
      "Post, edit or delete goods movements (inward/outward) — changes stock levels. Grant to store-keeper / warehouse roles.",
    resource: "inventory",
  },
  {
    name: DELETE_INVENTORY_ITEM,
    description:
      "Delete inventory items (single or bulk). Grant to inventory-manager roles.",
    resource: "inventory",
  },
  {
    name: RESET_INVENTORY_DATA,
    description: "Wipe and reseed all inventory data. Admin-level action.",
    resource: "inventory",
  },
];

/** Thrown when the caller lacks a required inventory permission → HTTP 403. */
export class InventoryPermissionError extends Error {
  readonly forbidden = true;
  constructor(public readonly permission: string, message?: string) {
    super(
      message ??
        `You do not have permission to perform this action (${permission}).`,
    );
    this.name = "InventoryPermissionError";
  }
}

/** Throw InventoryPermissionError unless the user holds (or admin-bypasses) `name`. */
export async function requireInventoryPermission(
  userId: string,
  name: string,
): Promise<void> {
  const ok = await hasPermission(userId, name);
  if (!ok) throw new InventoryPermissionError(name);
}
