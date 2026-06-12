/**
 * SECTION-permission enforcement (server only — prisma).
 *
 * Companion to lib/permissions/section-catalog.ts (the pure catalog). A form
 * section is OPEN UNTIL GRANTED: editing its fields needs no permission until
 * the org grants the section's named permission to at least one role or user
 * (via /settings/permission/approvals). Once granted, only grantees — resolved
 * exactly like hasPermission (admin/owner bypass → user override, deny beats
 * grant → role grant) — may CHANGE fields in that section.
 *
 * Enforcement diffs the incoming patch against the existing record (or the
 * schema defaults on create), so re-submitting the full form bag with
 * untouched values never demands a permission — only an actual change does.
 * All lookups are batched (≤3 queries per write) because this DB's round-trips
 * are expensive.
 */

import { prisma } from "@/lib/prisma";
import {
  sectionPermissionMap,
  sectionNamesBySubmodule,
  type SectionModule,
} from "@/lib/permissions/section-catalog";
import { SUBMODULE_SCHEMAS as PURCHASE_SCHEMAS } from "@/lib/purchase-system/schema";
import { SUBMODULE_SCHEMAS as INVENTORY_SCHEMAS } from "@/lib/inventory-system/schema";

/** Minimal structural field shape shared by both modules' schemas. */
interface AnyField {
  key: string;
  type: string;
  section: string;
  defaultValue?: string | number;
  auto?: boolean;
  computed?: boolean;
  prefillUser?: string;
  statusOptions?: Array<{ value: string }>;
}

function fieldsFor(module: SectionModule, submodule: string): AnyField[] {
  const schema =
    module === "purchase"
      ? (PURCHASE_SCHEMAS as Record<string, { fields: AnyField[] }>)[submodule]
      : (INVENTORY_SCHEMAS as Record<string, { fields: AnyField[] }>)[submodule];
  return schema?.fields ?? [];
}

/** Thrown when the caller may not edit a restricted section → HTTP 403. */
export class SectionPermissionError extends Error {
  readonly forbidden = true;
  constructor(
    public readonly permission: string,
    public readonly section: string,
  ) {
    super(
      `You do not have permission to edit the “${section}” section (${permission}).`,
    );
    this.name = "SectionPermissionError";
  }
}

/**
 * Which of `names` are RESTRICTED in this org — i.e. have at least one live
 * positive grant (role grant or non-expired user override). One query.
 */
export async function getRestrictedNames(
  organizationId: string,
  names: string[],
): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const now = new Date();
  const rows = await prisma.permission.findMany({
    where: { name: { in: names }, organizationId, isActive: true },
    select: {
      name: true,
      rolePermissions: { where: { granted: true }, select: { id: true }, take: 1 },
      userOverrides: {
        where: { granted: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { id: true },
        take: 1,
      },
    },
  });
  const out = new Set<string>();
  for (const r of rows) {
    if (r.rolePermissions.length > 0 || r.userOverrides.length > 0) out.add(r.name);
  }
  return out;
}

/**
 * Batched hasPermission: which of `names` does this user hold? Mirrors
 * lib/permissions/has-permission.ts exactly (admin/owner bypass; non-expired
 * user override, deny beats grant; any role grant) but resolves the whole set
 * in ≤2 queries instead of 2 per name.
 */
export async function resolveGrantedNames(
  userId: string,
  names: string[],
): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      organizationId: true,
      ownedOrganization: { select: { id: true } },
      unitAssignments: {
        select: { roleId: true, role: { select: { isAdmin: true, name: true } } },
      },
      permissionOverrides: {
        where: { permission: { name: { in: names } } },
        select: { granted: true, expiresAt: true, permission: { select: { name: true } } },
      },
    },
  });
  if (!user) return new Set();

  const isAdmin =
    !!user.ownedOrganization ||
    user.unitAssignments.some(
      (ua) => ua.role?.isAdmin || (ua.role?.name ?? "").toLowerCase().includes("admin"),
    );
  if (isAdmin) return new Set(names);

  const now = new Date();
  const granted = new Set<string>();
  const denied = new Set<string>();
  for (const o of user.permissionOverrides) {
    if (o.expiresAt && o.expiresAt <= now) continue;
    (o.granted ? granted : denied).add(o.permission.name);
  }
  for (const d of denied) granted.delete(d); // deny beats grant

  const roleIds = user.unitAssignments.map((ua) => ua.roleId);
  const undecided = names.filter((n) => !granted.has(n) && !denied.has(n));
  if (user.organizationId && roleIds.length > 0 && undecided.length > 0) {
    const grants = await prisma.rolePermission.findMany({
      where: {
        roleId: { in: roleIds },
        granted: true,
        permission: {
          name: { in: undecided },
          organizationId: user.organizationId,
          isActive: true,
        },
      },
      select: { permission: { select: { name: true } } },
    });
    for (const g of grants) granted.add(g.permission.name);
  }
  return granted;
}

/**
 * The user's per-section edit map for a module:
 * submodule → section → may-edit. Unrestricted sections are true for everyone;
 * restricted ones reflect the user's grants. Sent to the client for UI gating.
 */
export async function getSectionAccess(
  userId: string,
  organizationId: string,
  module: SectionModule,
): Promise<Record<string, Record<string, boolean>>> {
  const bySubmodule = sectionNamesBySubmodule(module);
  const allNames: string[] = [];
  for (const sub of Object.keys(bySubmodule)) {
    const map = sectionPermissionMap(module, sub);
    for (const section of bySubmodule[sub]) allNames.push(map[section]);
  }
  const restricted = await getRestrictedNames(organizationId, allNames);
  const granted =
    restricted.size > 0 ? await resolveGrantedNames(userId, [...restricted]) : new Set<string>();

  const out: Record<string, Record<string, boolean>> = {};
  for (const sub of Object.keys(bySubmodule)) {
    const map = sectionPermissionMap(module, sub);
    out[sub] = {};
    for (const section of bySubmodule[sub]) {
      const name = map[section];
      out[sub][section] = !restricted.has(name) || granted.has(name);
    }
  }
  return out;
}

/** buildInitial's defaults, mirrored so create-diffs compare against them. */
function defaultFor(f: AnyField): unknown {
  if (f.type === "lineItems") return [];
  if (f.type === "checkbox") return false;
  if (f.defaultValue != null) return f.defaultValue;
  if (f.type === "status" && f.statusOptions?.length) return f.statusOptions[0].value;
  return f.type === "number" || f.type === "currency" ? 0 : "";
}

/** Loose value equality for diffing (arrays/objects by JSON; "" ≈ null ≈ undefined; 0 ≈ "0"). */
function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown => {
    if (v == null || v === "") return null;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return v;
  };
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  return JSON.stringify(na ?? null) === JSON.stringify(nb ?? null);
}

/**
 * Throw SectionPermissionError unless the caller may apply `patch`. `existing`
 * is the stored data bag for updates, or null for creates (diffed against the
 * schema defaults so pre-filling a restricted section on create is caught too).
 * System-set fields (auto / computed / prefillUser) are exempt — they change
 * without user intent.
 */
export async function assertSectionEditsAllowed(opts: {
  userId: string;
  organizationId: string;
  module: SectionModule;
  submodule: string;
  existing: Record<string, unknown> | null;
  patch: Record<string, unknown>;
}): Promise<void> {
  const { userId, organizationId, module, submodule, existing, patch } = opts;
  const fields = fieldsFor(module, submodule);
  if (fields.length === 0) return;

  const permBySection = sectionPermissionMap(module, submodule);
  // Sections actually being CHANGED by this write.
  const touched = new Map<string, string>(); // permission name → section
  for (const f of fields) {
    if (f.auto || f.computed || f.prefillUser) continue;
    if (!Object.prototype.hasOwnProperty.call(patch, f.key)) continue;
    const base =
      existing && Object.prototype.hasOwnProperty.call(existing, f.key)
        ? existing[f.key]
        : defaultFor(f);
    if (sameValue(patch[f.key], base)) continue;
    const perm = permBySection[f.section];
    if (perm) touched.set(perm, f.section);
  }
  if (touched.size === 0) return;

  const restricted = await getRestrictedNames(organizationId, [...touched.keys()]);
  if (restricted.size === 0) return;

  const granted = await resolveGrantedNames(userId, [...restricted]);
  for (const name of restricted) {
    if (!granted.has(name)) {
      throw new SectionPermissionError(name, touched.get(name) ?? name);
    }
  }
}
