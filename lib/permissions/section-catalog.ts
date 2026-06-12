/**
 * SECTION-permission catalog — pure data (no prisma), safe to import anywhere.
 *
 * Every form section of the schema-driven purchase + inventory documents gets
 * a named permission (EDIT_<MODULE>_<SUBMODULE>_SECTION_<SECTION>) so the
 * Approvals & Permissions page can grant per-section edit access to roles and
 * users — e.g. only the Guard role edits a GRN's "Gate Entry" section, only QC
 * edits "Inspection".
 *
 * Semantics — OPEN UNTIL GRANTED: a section is unrestricted (anyone who can
 * edit the document may edit its fields) until the org grants its permission
 * to at least one role or user. From then on only grantees (and admins) may
 * change fields in that section. This keeps the feature opt-in per section —
 * granting nothing changes nothing. Enforcement lives in
 * lib/permissions/section-permissions.ts; client gating rides the
 * `sectionAccess` map delivered with each module's snapshot.
 *
 * EXCLUDED submodules (see SECTION_GATING_EXCLUDED) get NO section permissions
 * at all: the Purchase Requisition is a plain data-entry document anyone who
 * can edit it may fill — its only gate is the named approval permission
 * (APPROVE_PURCHASE_REQUISITION), enforced separately on the Approval fields in
 * lib/permissions/purchase-permissions.ts. So no EDIT_PURCHASE_PR_SECTION_*
 * permissions are generated, no "Section Access" card shows for it, and the
 * server never demands a section grant on a requisition write.
 */

import {
  SUBMODULE_SCHEMAS as PURCHASE_SCHEMAS,
  SUBMODULE_ORDER as PURCHASE_ORDER,
} from "@/lib/purchase-system/schema";
import {
  SUBMODULE_SCHEMAS as INVENTORY_SCHEMAS,
  SUBMODULE_ORDER as INVENTORY_ORDER,
} from "@/lib/inventory-system/schema";
import type { ActionModuleGroup } from "@/lib/permissions/action-catalog";

export type SectionModule = "purchase" | "inventory";

export interface SectionPermissionDef {
  /** Named permission (Permission.name row), globally unique. */
  name: string;
  /** The form section it guards. */
  section: string;
  module: SectionModule;
  submodule: string;
  /** Human label of the owning form, e.g. "Goods Receipt (GRN)". */
  formLabel: string;
}

/** "Tax & Legal" → "TAX_LEGAL" */
function slugSection(section: string): string {
  return section
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function sectionPermissionName(
  module: SectionModule,
  submodule: string,
  section: string,
): string {
  return `EDIT_${module.toUpperCase()}_${submodule.toUpperCase()}_SECTION_${slugSection(section)}`;
}

/** Distinct sections of a schema, in first-appearance (form) order. */
function sectionsOf(fields: Array<{ section: string }>): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (f.section !== "line" && !out.includes(f.section)) out.push(f.section);
  }
  return out;
}

interface AnySchema {
  key: string;
  label: string;
  fields: Array<{ key: string; section: string }>;
}

/**
 * Submodules whose form sections are NOT gated by section permissions. The
 * Purchase Requisition (`pr`) is excluded: its fields need no per-section grant,
 * only the named approval permission on the Approval fields. Add a submodule key
 * here to make its whole form ungated by the section layer.
 */
const SECTION_GATING_EXCLUDED: Record<SectionModule, string[]> = {
  purchase: ["pr"],
  inventory: [],
};

function isSectionGated(module: SectionModule, submodule: string): boolean {
  return !SECTION_GATING_EXCLUDED[module].includes(submodule);
}

function defsFor(module: SectionModule, schema: AnySchema): SectionPermissionDef[] {
  return sectionsOf(schema.fields).map((section) => ({
    name: sectionPermissionName(module, schema.key, section),
    section,
    module,
    submodule: schema.key,
    formLabel: schema.label,
  }));
}

const PURCHASE_SECTION_DEFS: SectionPermissionDef[] = PURCHASE_ORDER.filter((k) =>
  isSectionGated("purchase", k),
).flatMap((k) => defsFor("purchase", PURCHASE_SCHEMAS[k] as AnySchema));
const INVENTORY_SECTION_DEFS: SectionPermissionDef[] = INVENTORY_ORDER.filter((k) =>
  isSectionGated("inventory", k),
).flatMap((k) => defsFor("inventory", INVENTORY_SCHEMAS[k] as AnySchema));

/** Every section permission across both modules. */
export const ALL_SECTION_PERMISSION_DEFS: SectionPermissionDef[] = [
  ...PURCHASE_SECTION_DEFS,
  ...INVENTORY_SECTION_DEFS,
];

/** section name → permission name for one form. */
export function sectionPermissionMap(
  module: SectionModule,
  submodule: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of ALL_SECTION_PERMISSION_DEFS) {
    if (d.module === module && d.submodule === submodule) out[d.section] = d.name;
  }
  return out;
}

/** All section names per submodule of a module (drives the sectionAccess map). */
export function sectionNamesBySubmodule(module: SectionModule): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const d of ALL_SECTION_PERMISSION_DEFS) {
    if (d.module !== module) continue;
    (out[d.submodule] ??= []).push(d.section);
  }
  return out;
}

/**
 * Approvals-page groups: one card per form so the matrix stays readable
 * (columns = that form's sections). Spread into ACTION_CATALOG.
 */
export const SECTION_ACTION_GROUPS: ActionModuleGroup[] = [
  ...PURCHASE_ORDER.filter((k) => isSectionGated("purchase", k)).map((k) => {
    const schema = PURCHASE_SCHEMAS[k] as AnySchema;
    return {
      module: `purchase-sections-${k}`,
      label: `Purchase · ${schema.label} — Section Access`,
      description:
        "Per-section edit access for this form. A section is open to everyone until granted to at least one role/user — then only grantees (and admins) may edit its fields.",
      functionalities: defsFor("purchase", schema).map((d) => ({
        name: d.name,
        label: d.section,
        description: `Edit the “${d.section}” section of the ${d.formLabel} form.`,
        enforced: true,
      })),
    };
  }),
  ...INVENTORY_ORDER.filter((k) => isSectionGated("inventory", k)).map((k) => {
    const schema = INVENTORY_SCHEMAS[k] as AnySchema;
    return {
      module: `inventory-sections-${k}`,
      label: `Inventory · ${schema.label} — Section Access`,
      description:
        "Per-section edit access for this form. A section is open to everyone until granted to at least one role/user — then only grantees (and admins) may edit its fields.",
      functionalities: defsFor("inventory", schema).map((d) => ({
        name: d.name,
        label: d.section,
        description: `Edit the “${d.section}” section of the ${d.formLabel} form.`,
        enforced: true,
      })),
    };
  }),
];
