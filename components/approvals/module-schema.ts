/**
 * Client-side schema bridge for the module-aware approval builder.
 *
 * The approval UI is generic; this resolves the right module's field/section
 * metadata (inventory or purchase) for the criteria + scope + action pickers.
 * Both schema modules are plain data, safe to import in client components.
 */

import { SUBMODULE_SCHEMAS as INV_SCHEMAS, SUBMODULE_ORDER as INV_ORDER } from "@/lib/inventory-system/schema";
import { SUBMODULE_SCHEMAS as PUR_SCHEMAS, SUBMODULE_ORDER as PUR_ORDER } from "@/lib/purchase-system/schema";
import { STATUS_OPTIONS as INV_STATUS } from "@/lib/inventory-system/format";

export type ApprovalModule = "inventory" | "purchase";

export interface ApprovalField {
  key: string;
  label: string;
  type: string;
  section: string;
  master?: string;
  options?: Array<{ value: string; label: string }>;
}

/** Field types that don't make sense as criteria/scope targets. */
export const NON_CRITERIA_TYPES = new Set(["image", "media", "lineItems"]);

export const MODULE_LABEL: Record<ApprovalModule, string> = {
  inventory: "Inventory",
  purchase: "Purchase",
};

function schemaFor(module: ApprovalModule, submodule: string) {
  if (module === "purchase") return (PUR_SCHEMAS as Record<string, any>)[submodule];
  return (INV_SCHEMAS as Record<string, any>)[submodule];
}

export function moduleSubmodules(module: ApprovalModule): Array<{ key: string; label: string }> {
  if (module === "purchase") return PUR_ORDER.map((k) => ({ key: k, label: (PUR_SCHEMAS as any)[k].label }));
  return INV_ORDER.map((k) => ({ key: k, label: (INV_SCHEMAS as any)[k].label }));
}

export function moduleFields(module: ApprovalModule, submodule: string): ApprovalField[] {
  const schema = schemaFor(module, submodule);
  if (!schema) return [];
  return (schema.fields as any[]).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    section: f.section,
    master: f.master,
    options: f.options,
  }));
}

export function criteriaFields(module: ApprovalModule, submodule: string): ApprovalField[] {
  return moduleFields(module, submodule).filter((f) => !NON_CRITERIA_TYPES.has(f.type));
}

export function moduleSections(module: ApprovalModule, submodule: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of moduleFields(module, submodule)) {
    if (!seen.has(f.section)) {
      seen.add(f.section);
      out.push(f.section);
    }
  }
  return out;
}

/** Status values selectable in onApprove/onReject + status criteria for a submodule. */
export function statusOptionsFor(module: ApprovalModule, submodule: string): Array<{ value: string; label: string }> {
  const schema = schemaFor(module, submodule);
  if (!schema) return [];
  const statusField = (schema.fields as any[]).find((f) => f.key === "status" || f.type === "status");
  const statusOptions = statusField?.statusOptions as Array<{ value: string; label: string }> | undefined;
  if (statusOptions?.length) return statusOptions.map((o) => ({ value: o.value, label: o.label }));
  if (statusField?.options?.length) return statusField.options.map((o: any) => ({ value: o.value, label: o.label }));
  if (module === "inventory") return INV_STATUS.map((o) => ({ value: o.value, label: o.label }));
  return [];
}
