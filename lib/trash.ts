/**
 * Recycle Bin / Trash subsystem.
 *
 * `moveToTrash(resourceType, id, ctx)` snapshots a record (and any cascade
 * children we care about) into the TrashBin table, then hard-deletes the
 * original. `restoreFromTrash(trashId, ctx)` rebuilds the record from the
 * snapshot inside a transaction. `purgeTrashItem` permanently removes a
 * trash entry.
 *
 * Each supported resource type registers a TrashConfig below. Most are
 * "simple" — flat records with no children — and use the default
 * serialize/restore path. Complex resources (Form, FormModule) override
 * with custom snapshot/restore logic so cascade trees survive a round-trip.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

export type TrashContext = {
  userId?: string | null;
  userName?: string | null;
  organizationId?: string | null;
};

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * If the Prisma client doesn't have `trashBin`, the schema change wasn't
 * applied to the running server. Surface a clear, actionable error instead of
 * the cryptic "Cannot read properties of undefined (reading 'create')" that
 * Prisma would throw later inside a transaction.
 */
function assertTrashBinAvailable(): void {
  if (!(prisma as any).trashBin) {
    throw new Error(
      "TrashBin model is not registered on the Prisma client. " +
        "Run `pnpm exec prisma db push` (or `prisma migrate dev`), then " +
        "`pnpm exec prisma generate`, and restart the dev server.",
    );
  }
}

type Snapshot = {
  /** Display name shown in the trash list */
  name: string;
  /** Organization the record belonged to (nullable for global resources) */
  organizationId: string | null;
  /** JSON-serialisable payload — passed back into restore() verbatim */
  data: any;
};

type TrashConfig = {
  /** Prisma model accessor on the client (e.g. "holiday", "formModule") */
  model: string;
  /** Pull a display name out of the record */
  nameOf: (r: any) => string;
  /** Field on the record that carries organizationId (omit for global/unscoped) */
  orgField?: string;
  /** Override the default snapshot path when the record has child rows to capture */
  customSerialize?: (id: string, db: Tx) => Promise<Snapshot | null>;
  /** Override the default restore path when the snapshot includes nested data */
  customRestore?: (data: any, db: Tx) => Promise<void>;
  /** Override the default delete path (only needed for sharded tables / unusual keys) */
  customDelete?: (id: string, snapshot: any, db: Tx) => Promise<void>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Strip undefined keys so Prisma create accepts the payload. */
function clean<T extends object>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Default serialize: read the record, pluck name + org. */
async function defaultSerialize(
  cfg: TrashConfig,
  id: string,
  db: Tx,
): Promise<Snapshot | null> {
  const record = await (db as any)[cfg.model].findUnique({ where: { id } });
  if (!record) return null;
  return {
    name: cfg.nameOf(record) ?? id,
    organizationId: cfg.orgField ? (record[cfg.orgField] ?? null) : null,
    data: record,
  };
}

/** Default restore: re-create the record verbatim. */
async function defaultRestore(cfg: TrashConfig, data: any, db: Tx) {
  await (db as any)[cfg.model].create({ data: clean(data) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom serialize/restore for cascade trees
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Form snapshots include sections → fields, top-level subforms → fields +
 * nested childSubforms, plus the table-mapping row. RolePermission /
 * UserPermission / FunctionBinding / LookupSource rows are intentionally
 * NOT snapshotted: they reference roles, users, functions, modules that may
 * have changed by the time the form is restored, and rebuilding them would
 * silently re-grant stale permissions. Restoring a form gives you the form
 * structure back; permissions need to be reapplied.
 */
async function serializeForm(id: string, db: Tx): Promise<Snapshot | null> {
  const form = await (db as any).form.findUnique({
    where: { id },
    include: {
      sections: { include: { fields: true } },
      subforms: { include: { fields: true, childSubforms: { include: { fields: true } } } },
      tableMapping: true,
      module: { select: { organizationId: true } },
    },
  });
  if (!form) return null;
  const orgId = form.module?.organizationId ?? null;
  const { module: _m, ...rest } = form;
  return { name: form.name, organizationId: orgId, data: rest };
}

async function restoreForm(data: any, db: Tx) {
  const { sections = [], subforms = [], tableMapping, ...formCore } = data;

  // Recreate the form shell first so child rows have a parent FK to point at.
  await (db as any).form.create({ data: clean(formCore) });

  // Sections + their fields.
  for (const s of sections) {
    const { fields = [], ...sectionCore } = s;
    await (db as any).formSection.create({ data: clean(sectionCore) });
    for (const f of fields) {
      await (db as any).formField.create({ data: clean(f) });
    }
  }

  // Top-level subforms, then nested children, then their fields.
  for (const sf of subforms) {
    const { fields = [], childSubforms = [], ...subformCore } = sf;
    await (db as any).subform.create({ data: clean(subformCore) });
    for (const f of fields) {
      await (db as any).formField.create({ data: clean(f) });
    }
    for (const child of childSubforms) {
      const { fields: childFields = [], ...childCore } = child;
      await (db as any).subform.create({ data: clean(childCore) });
      for (const f of childFields) {
        await (db as any).formField.create({ data: clean(f) });
      }
    }
  }

  if (tableMapping) {
    await (db as any).formTableMapping.create({ data: clean(tableMapping) });
  }
}

/**
 * Module snapshots are flat — modules with children can't be deleted (the
 * existing `deleteModule` already throws), so there's never a tree to capture.
 */
async function serializeModule(id: string, db: Tx): Promise<Snapshot | null> {
  const m = await (db as any).formModule.findUnique({ where: { id } });
  if (!m) return null;
  return { name: m.name, organizationId: m.organizationId ?? null, data: m };
}

/**
 * Section snapshots include all fields under the section.
 */
async function serializeSection(id: string, db: Tx): Promise<Snapshot | null> {
  const s = await (db as any).formSection.findUnique({
    where: { id },
    include: { fields: true, form: { select: { name: true, module: { select: { organizationId: true } } } } },
  });
  if (!s) return null;
  const orgId = s.form?.module?.organizationId ?? null;
  const { form: _f, ...rest } = s;
  return { name: `${s.form?.name ?? "Section"}: ${s.title}`, organizationId: orgId, data: rest };
}

async function restoreSection(data: any, db: Tx) {
  const { fields = [], ...sectionCore } = data;
  await (db as any).formSection.create({ data: clean(sectionCore) });
  for (const f of fields) {
    await (db as any).formField.create({ data: clean(f) });
  }
}

/**
 * Subform snapshots include all fields and any nested child subforms.
 */
async function serializeSubform(id: string, db: Tx): Promise<Snapshot | null> {
  const sf = await (db as any).subform.findUnique({
    where: { id },
    include: {
      fields: true,
      childSubforms: { include: { fields: true } },
      form: { select: { module: { select: { organizationId: true } } } },
    },
  });
  if (!sf) return null;
  const orgId = sf.form?.module?.organizationId ?? null;
  const { form: _f, ...rest } = sf;
  return { name: sf.name, organizationId: orgId, data: rest };
}

async function restoreSubform(data: any, db: Tx) {
  const { fields = [], childSubforms = [], ...subformCore } = data;
  await (db as any).subform.create({ data: clean(subformCore) });
  for (const f of fields) {
    await (db as any).formField.create({ data: clean(f) });
  }
  for (const child of childSubforms) {
    const { fields: childFields = [], ...childCore } = child;
    await (db as any).subform.create({ data: clean(childCore) });
    for (const f of childFields) {
      await (db as any).formField.create({ data: clean(f) });
    }
  }
}

/**
 * FormRecord is sharded across formRecord1..formRecord15 plus a unified
 * `formRecord` table — the delete walks all shards to find the live row,
 * the restore puts it back into the same shard. We tag the snapshot with
 * `__shard` so restore knows where to land. `__indexedFields` carries the
 * companion rows from `form_record_fields` so the record's searchable values
 * survive the round-trip (without them, restored records would be invisible
 * to indexed filters even though `recordData` is intact).
 */
async function serializeFormRecord(id: string, db: Tx): Promise<Snapshot | null> {
  // Always capture indexed-field rows first so they survive whichever shard
  // the record lives in. `findMany` is safe when none exist — returns [].
  let indexedFields: any[] = [];
  try {
    indexedFields = await (db as any).formRecordField.findMany({ where: { recordId: id } });
  } catch {
    // form_record_fields table absent — fine, the snapshot just won't carry indexed rows
  }

  for (let i = 1; i <= 15; i++) {
    const model = `formRecord${i}`;
    try {
      const r = await (db as any)[model].findUnique({ where: { id } });
      if (r) return {
        name: r.id,
        organizationId: r.organizationId ?? null,
        data: { ...r, __shard: i, __indexedFields: indexedFields },
      };
    } catch {
      // shard may not exist in this deployment — keep walking
    }
  }
  try {
    const r = await (db as any).formRecord.findUnique({ where: { id } });
    if (r) return {
      name: r.id,
      organizationId: r.organizationId ?? null,
      data: { ...r, __shard: 0, __indexedFields: indexedFields },
    };
  } catch {
    // unified table absent — fall through
  }
  return null;
}

async function deleteFormRecord(id: string, snapshot: any, db: Tx) {
  const shard = snapshot.__shard ?? 0;
  if (shard >= 1 && shard <= 15) {
    await (db as any)[`formRecord${shard}`].delete({ where: { id } });
  }
  // Always try to clean up the unified mirror + indexed-fields rows. Either
  // one being absent is fine — the form may not use that table at all.
  try { await (db as any).formRecord.deleteMany({ where: { id } }); } catch {}
  try { await (db as any).formRecordField.deleteMany({ where: { recordId: id } }); } catch {}
}

async function restoreFormRecord(data: any, db: Tx) {
  const { __shard, __indexedFields = [], ...record } = data;
  if (__shard && __shard >= 1 && __shard <= 15) {
    await (db as any)[`formRecord${__shard}`].create({ data: clean(record) });
    try { await (db as any).formRecord.create({ data: clean(record) }); } catch {
      // unified mirror absent — fine
    }
  } else {
    await (db as any).formRecord.create({ data: clean(record) });
  }

  // Re-create the indexed-field rows. Without these, indexed filters and
  // sorts won't see the restored record even though recordData is intact.
  if (Array.isArray(__indexedFields) && __indexedFields.length > 0) {
    for (const f of __indexedFields) {
      try { await (db as any).formRecordField.create({ data: clean(f) }); }
      catch (err) {
        // Best-effort: a single bad row shouldn't sink the whole restore.
        console.warn("[trash] formRecordField restore skipped row", f?.id, err);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource registry
// ─────────────────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, TrashConfig> = {
  // Form-builder structure
  Form: {
    model: "form",
    nameOf: (r) => r.name,
    customSerialize: serializeForm,
    customRestore: restoreForm,
  },
  FormModule: {
    model: "formModule",
    orgField: "organizationId",
    nameOf: (r) => r.name,
    customSerialize: serializeModule,
  },
  FormSection: {
    model: "formSection",
    nameOf: (r) => r.title,
    customSerialize: serializeSection,
    customRestore: restoreSection,
  },
  FormField: {
    model: "formField",
    nameOf: (r) => r.label,
  },
  Subform: {
    model: "subform",
    nameOf: (r) => r.name,
    customSerialize: serializeSubform,
    customRestore: restoreSubform,
  },
  FormRecord: {
    model: "formRecord",
    nameOf: (r) => r.id,
    customSerialize: serializeFormRecord,
    customRestore: restoreFormRecord,
    customDelete: deleteFormRecord,
  },

  // HR / Attendance
  Holiday: { model: "holiday", orgField: "organizationId", nameOf: (r) => r.name },
  PayrollRecord: { model: "payrollRecord", nameOf: (r) => `${r.employeeId} ${r.month}/${r.year}` },

  // Org / users / roles
  Role: { model: "role", orgField: "organizationId", nameOf: (r) => r.name },
  OrganizationUnit: { model: "organizationUnit", orgField: "organizationId", nameOf: (r) => r.name },
  User: { model: "user", orgField: "organizationId", nameOf: (r) => r.email },
  UserUnitAssignment: { model: "userUnitAssignment", nameOf: (r) => r.id },

  // Automation / functions
  WorkflowRule: { model: "workflowRule", orgField: "organizationId", nameOf: (r) => r.name },
  CrmFunction: { model: "crmFunction", orgField: "organizationId", nameOf: (r) => r.displayName ?? r.name },
  FunctionBinding: { model: "functionBinding", orgField: "organizationId", nameOf: (r) => r.id },

  // Misc
  SavedFilter: { model: "savedFilter", orgField: "organizationId", nameOf: (r) => r.name },
  RoutePermission: { model: "routePermission", orgField: "organizationId", nameOf: (r) => r.pattern },
  LookupTemplate: { model: "lookupTemplate", orgField: "organizationId", nameOf: (r) => r.name ?? r.id },
  LookupSource: { model: "lookupSource", nameOf: (r) => r.name ?? r.id },
  ChatConversation: { model: "chatConversation", orgField: "organizationId", nameOf: (r) => r.title ?? r.id },
  AIProvider: { model: "aIProvider", orgField: "organizationId", nameOf: (r) => r.displayName ?? r.name },
  AIProviderKey: { model: "aIProviderKey", orgField: "organizationId", nameOf: (r) => r.label ?? r.id },

  // HR / Recruitment
  JobApplication: { model: "jobApplication", orgField: "organizationId", nameOf: (r) => r.applicantName ?? r.id },
  JobOpening: { model: "jobOpening", orgField: "organizationId", nameOf: (r) => r.profileName ?? r.id },
  JobOffer: { model: "jobOffer", orgField: "organizationId", nameOf: (r) => r.applicantName ?? r.id },
  StaffingPlan: { model: "staffingPlan", orgField: "organizationId", nameOf: (r) => r.profileName ?? r.id },
  EmployeeReferral: { model: "employeeReferral", orgField: "organizationId", nameOf: (r) => r.applicantName ?? r.id },
  AppointmentLetter: { model: "appointmentLetter", orgField: "organizationId", nameOf: (r) => r.applicantName ?? r.id },
  // Employee has no direct `organizationId` column — it's scoped via User.
  // Skipping orgField means snapshot.organizationId is null and moveToTrash
  // falls back to ctx.organizationId, which the handler passes from auth.
  Employee: { model: "employee", nameOf: (r) => r.employeeName ?? r.id },

  // HR — Performance, Onboarding, Offboarding (Phase 1)
  Kra: { model: "kra", orgField: "organizationId", nameOf: (r) => r.displayId ?? r.id },
  Appraisal: { model: "appraisal", orgField: "organizationId", nameOf: (r) => r.displayId ?? r.id },
  OnboardingTemplate: { model: "onboardingTemplate", orgField: "organizationId", nameOf: (r) => r.name ?? r.id },
  OnboardingChecklist: { model: "onboardingChecklist", orgField: "organizationId", nameOf: (r) => r.id },
  ExitChecklist: { model: "exitChecklist", orgField: "organizationId", nameOf: (r) => r.id },

  // Inventory
  InventoryProduct: { model: "inventoryProduct", orgField: "organizationId", nameOf: (r) => r.name ?? r.id },

  // Real-estate
  Lead: { model: "lead", orgField: "organizationId", nameOf: (r) => r.name ?? r.id },
  PropertyViewing: { model: "propertyViewing", orgField: "organizationId", nameOf: (r) => `Viewing ${r.id}` },
  Rank: { model: "rank", orgField: "organizationId", nameOf: (r) => r.name ?? r.id },
  BankAccount: {
    model: "bankAccount",
    orgField: "organizationId",
    nameOf: (r) => r.label ?? (`${r.bankName ?? ""} ${r.accountHolderName ?? ""}`.trim() || r.id),
  },
  Property: { model: "property", orgField: "organizationId", nameOf: (r) => r.title ?? r.id },
  // Documents are scoped via their parent (no orgId column). moveToTrash
  // falls back to ctx.organizationId, which the handler passes from auth.
  PropertyDocument: { model: "propertyDocument", nameOf: (r) => r.name ?? r.id },
  TransactionDocument: { model: "transactionDocument", nameOf: (r) => r.name ?? r.id },
};

export function getTrashConfig(resourceType: string): TrashConfig | null {
  return CONFIGS[resourceType] ?? null;
}

export function getRegisteredResourceTypes(): string[] {
  return Object.keys(CONFIGS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot a record into TrashBin and hard-delete the original.
 * Throws if `resourceType` is not registered.
 *
 * Caller is responsible for permission/auth checks BEFORE calling this — by
 * the time we get here the delete is authorized; we just need to wrap it in
 * a snapshot.
 */
export async function moveToTrash(
  resourceType: string,
  id: string,
  ctx: TrashContext = {},
): Promise<{ trashId: string }> {
  assertTrashBinAvailable();
  const cfg = getTrashConfig(resourceType);
  if (!cfg) {
    throw new Error(`Trash: unknown resourceType "${resourceType}". Register it in lib/trash.ts.`);
  }

  return prisma.$transaction(async (tx) => {
    const snapshot = cfg.customSerialize
      ? await cfg.customSerialize(id, tx)
      : await defaultSerialize(cfg, id, tx);

    if (!snapshot) {
      throw new Error(`Trash: ${resourceType} with id "${id}" not found.`);
    }

    const trashRow = await tx.trashBin.create({
      data: {
        resourceType,
        resourceId: id,
        resourceName: snapshot.name,
        organizationId: snapshot.organizationId ?? ctx.organizationId ?? null,
        snapshot: snapshot.data as any,
        deletedById: ctx.userId ?? null,
        deletedByName: ctx.userName ?? null,
      },
    });

    if (cfg.customDelete) {
      await cfg.customDelete(id, snapshot.data, tx);
    } else {
      await (tx as any)[cfg.model].delete({ where: { id } });
    }
    return { trashId: trashRow.id };
  });
}

/**
 * Re-create a previously trashed record from its snapshot, then remove the
 * TrashBin row. Restores fail if a record with the same id already exists
 * (someone may have re-created it manually) — caller should surface that as
 * a user-facing error.
 *
 * Transaction limits are bumped well above the 5 s default: a Form with many
 * sections/subforms/fields can issue dozens of writes, and the default budget
 * occasionally trips, leaving the trash row in place and the user staring at
 * "Restore failed" with no obvious cause.
 */
export async function restoreFromTrash(
  trashId: string,
  ctx: TrashContext = {},
): Promise<{ resourceType: string; resourceId: string }> {
  assertTrashBinAvailable();

  // Pre-read the row outside the transaction so we can give specific error
  // messages (404 vs cross-org) without waking up a tx slot.
  const row = await prisma.trashBin.findUnique({ where: { id: trashId } });
  if (!row) throw new Error("Trash entry not found");
  if (ctx.organizationId && row.organizationId && row.organizationId !== ctx.organizationId) {
    throw new Error("Trash entry belongs to another organization");
  }

  const cfg = getTrashConfig(row.resourceType);
  if (!cfg) throw new Error(`Unknown resourceType "${row.resourceType}"`);

  // Guard against double-restore: if the original row was already re-created
  // (manually, or via a second click while the first was in flight), the
  // create below would throw "Unique constraint failed on the fields: (`id`)"
  // and abort the whole tx. Detecting it up front lets us return a clear
  // user-facing message AND clean up the orphaned trash row.
  try {
    const existing = await (prisma as any)[cfg.model].findUnique({
      where: { id: row.resourceId },
      select: { id: true },
    });
    if (existing) {
      await prisma.trashBin.delete({ where: { id: trashId } });
      throw new Error(
        `A ${row.resourceType} with id "${row.resourceId}" already exists. The trash entry has been cleared.`,
      );
    }
  } catch (err: any) {
    // Re-throw our own "already exists" error; swallow lookup errors (e.g.
    // sharded FormRecord doesn't support findUnique on the unified accessor
    // for every shard — restoreForm/Record handle that themselves).
    if (err?.message?.startsWith("A ")) throw err;
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        if (cfg.customRestore) {
          await cfg.customRestore(row.snapshot, tx);
        } else {
          await defaultRestore(cfg, row.snapshot, tx);
        }
        // `deleteMany` instead of `delete` so a racing second click (or a
        // concurrent purge) doesn't blow up the whole tx with P2025 after
        // the entity has already been re-created.
        await tx.trashBin.deleteMany({ where: { id: trashId } });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (err: any) {
    // Surface the real Prisma error so the route handler can pass it back
    // to the UI. Logging the snapshot type + resource id gives operators a
    // fighting chance to reproduce.
    console.error(
      `[trash] restore failed for ${row.resourceType} (resourceId=${row.resourceId}, trashId=${trashId}):`,
      err,
    );
    throw new Error(
      `Failed to restore ${row.resourceType}: ${err?.message ?? "unknown error"}`,
    );
  }

  return { resourceType: row.resourceType, resourceId: row.resourceId };
}

/** Permanently remove a single trash entry without restoring. */
export async function purgeTrashItem(trashId: string, ctx: TrashContext = {}): Promise<void> {
  assertTrashBinAvailable();
  const row = await prisma.trashBin.findUnique({ where: { id: trashId } });
  if (!row) return;
  if (ctx.organizationId && row.organizationId && row.organizationId !== ctx.organizationId) {
    throw new Error("Trash entry belongs to another organization");
  }
  await prisma.trashBin.delete({ where: { id: trashId } });
}

/** Permanently remove every trash entry in the org (or all entries if org is null). */
export async function emptyTrash(ctx: TrashContext = {}): Promise<{ count: number }> {
  assertTrashBinAvailable();
  const result = await prisma.trashBin.deleteMany({
    where: ctx.organizationId ? { organizationId: ctx.organizationId } : {},
  });
  return { count: result.count };
}

/** List trash entries scoped to the caller's organization. */
export async function listTrash(ctx: TrashContext = {}) {
  assertTrashBinAvailable();
  // Auto-purge expired items first so the list never shows things that
  // should already be gone. Best-effort — failures are logged and the list
  // is still returned so the page never breaks because of cleanup trouble.
  if (ctx.organizationId) {
    try { await purgeExpiredTrash(ctx.organizationId); }
    catch (err) { console.error("[trash] auto-purge failed:", err); }
  }
  return prisma.trashBin.findMany({
    where: ctx.organizationId ? { organizationId: ctx.organizationId } : {},
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      resourceType: true,
      resourceId: true,
      resourceName: true,
      deletedById: true,
      deletedByName: true,
      deletedAt: true,
      organizationId: true,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Retention policy
// ─────────────────────────────────────────────────────────────────────────────

/** Default retention when no row exists yet. Matches the schema default. */
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Read the retention policy for an org. Creates the row on first access so
 * subsequent reads/writes always have something to point at.
 *
 * `retentionDays === 0` means "never auto-delete" — items stay in the bin
 * until manually purged.
 */
export async function getTrashRetentionDays(organizationId: string): Promise<number> {
  if (!(prisma as any).trashRetentionSetting) {
    // Schema not yet migrated — fall back to default rather than blowing up
    // the whole list endpoint.
    return DEFAULT_RETENTION_DAYS;
  }
  const row = await prisma.trashRetentionSetting.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId, retentionDays: DEFAULT_RETENTION_DAYS },
    select: { retentionDays: true },
  });
  return row.retentionDays;
}

/**
 * Update the retention policy for an org. Caller is responsible for the
 * admin-only permission check.
 *
 * `days` clamps to a sensible range: 0 (never), 1–3650. Negative values
 * become 0; absurdly large values cap at 10 years to keep the index in
 * `purgeExpiredTrash` reasonable.
 */
export async function setTrashRetentionDays(
  organizationId: string,
  days: number,
  updatedById?: string | null,
): Promise<{ retentionDays: number }> {
  if (!(prisma as any).trashRetentionSetting) {
    throw new Error(
      "TrashRetentionSetting model is not registered. Run `pnpm exec prisma db push` and `pnpm exec prisma generate`, then restart the dev server.",
    );
  }
  const clamped = Math.max(0, Math.min(3650, Math.floor(days)));
  const row = await prisma.trashRetentionSetting.upsert({
    where: { organizationId },
    update: { retentionDays: clamped, updatedById: updatedById ?? null },
    create: { organizationId, retentionDays: clamped, updatedById: updatedById ?? null },
    select: { retentionDays: true },
  });
  return { retentionDays: row.retentionDays };
}

/**
 * Permanently delete trash entries older than the org's configured retention
 * window. Returns the number of rows deleted. No-op when retention is 0
 * ("Never").
 */
export async function purgeExpiredTrash(organizationId: string): Promise<{ count: number }> {
  assertTrashBinAvailable();
  const retentionDays = await getTrashRetentionDays(organizationId);
  if (!retentionDays || retentionDays <= 0) return { count: 0 };

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.trashBin.deleteMany({
    where: {
      organizationId,
      deletedAt: { lt: cutoff },
    },
  });
  return { count: result.count };
}
