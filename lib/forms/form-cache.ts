/**
 * Form-structure cache.
 *
 * The form-structure shape (Form + Module + Sections + Fields + Subforms +
 * TableMapping) is loaded on every records-list request. It changes rarely
 * (admin edits in the form-builder) but reads happen constantly. This makes
 * it the highest-leverage caching target in the app.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   // READ side — anywhere you'd normally call prisma.form.findUnique with the
 *   // standard structure include:
 *   import { getCachedFormStructure } from "@/lib/forms/form-cache";
 *   const form = await getCachedFormStructure(formId);
 *
 *   // WRITE side — call this from every handler that mutates Form, FormSection,
 *   // FormField, Subform, FormulaField, FormTableMapping, LookupSource, or
 *   // LookupFieldRelation for a given form:
 *   import { invalidateFormCache } from "@/lib/forms/form-cache";
 *   await invalidateFormCache(formId);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CORRECTNESS CONTRACT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Forgetting to call `invalidateFormCache` after a mutation produces stale
 * reads for up to FORM_STRUCTURE_TTL_S seconds. The grep query to verify
 * you haven't missed a write site:
 *
 *   prisma\.(form|formSection|formField|subform|formulaField|formTableMapping|lookupSource|lookupFieldRelation)\.(create|update|delete|upsert|createMany|updateMany|deleteMany)
 *
 * If the formId isn't already in scope at the mutation site, use
 * `resolveFormIdFromField`, `resolveFormIdFromSection`, or
 * `resolveFormIdFromSubform` (cheap one-row lookups) before calling the
 * invalidator.
 */

import { prisma } from "@/lib/prisma";
import { buildKey, cached, cacheInvalidate } from "@/lib/cache";

const FORM_STRUCTURE_TTL_S = 600; // 10 minutes — admin edits propagate within this
const formStructureKey = (formId: string) =>
  buildKey("forms", "structure", formId);

/**
 * The canonical "load a form with everything attached" query. Used by the
 * records route, the form-builder, and any other code that needs the full
 * form schema. Cached in the `forms` namespace (own Upstash DB).
 *
 * Returns `null` if the form doesn't exist.
 */
export async function getCachedFormStructure(formId: string) {
  return cached(
    "forms",
    formStructureKey(formId),
    FORM_STRUCTURE_TTL_S,
    () => loadFormStructureFromDb(formId),
  );
}

async function loadFormStructureFromDb(formId: string) {
  return prisma.form.findUnique({
    where: { id: formId },
    include: {
      module: { select: { organizationId: true } },
      sections: {
        include: {
          fields: { orderBy: { order: "asc" } },
        },
        orderBy: { order: "asc" },
      },
      subforms: {
        where: { parentSubformId: null },
        include: {
          fields: { orderBy: { order: "asc" } },
          childSubforms: {
            include: {
              fields: { orderBy: { order: "asc" } },
              childSubforms: {
                include: {
                  fields: { orderBy: { order: "asc" } },
                },
                orderBy: { order: "asc" },
              },
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
      tableMapping: true,
    },
  });
}

/**
 * Drop the cached form structure for `formId`. Must be called from every
 * code path that mutates the form's structure. See file header for the grep
 * query that verifies coverage.
 *
 * Safe to call with a non-existent formId — Redis just no-ops.
 */
export async function invalidateFormCache(formId: string): Promise<void> {
  if (!formId) return;
  await cacheInvalidate("forms", formStructureKey(formId));
}

/**
 * Bulk invalidation — use when one operation affects many forms (rare).
 */
export async function invalidateFormCacheMany(formIds: string[]): Promise<void> {
  const unique = Array.from(new Set(formIds.filter(Boolean)));
  if (unique.length === 0) return;
  await cacheInvalidate("forms", ...unique.map(formStructureKey));
}

// ─────────────────────────────────────────────────────────────────────────────
// formId resolvers — for write sites that have a child id but not the formId.
// Each does a single-column SELECT and runs in <5ms with the standard FK
// indexes. Returns null if the child is gone.
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveFormIdFromField(fieldId: string): Promise<string | null> {
  if (!fieldId) return null;
  const row = await prisma.formField.findUnique({
    where: { id: fieldId },
    select: {
      section: { select: { formId: true } },
      subform: { select: { formId: true } },
    },
  });
  return row?.section?.formId ?? row?.subform?.formId ?? null;
}

export async function resolveFormIdFromSection(sectionId: string): Promise<string | null> {
  if (!sectionId) return null;
  const row = await prisma.formSection.findUnique({
    where: { id: sectionId },
    select: { formId: true },
  });
  return row?.formId ?? null;
}

export async function resolveFormIdFromSubform(subformId: string): Promise<string | null> {
  if (!subformId) return null;
  const row = await prisma.subform.findUnique({
    where: { id: subformId },
    select: { formId: true },
  });
  return row?.formId ?? null;
}
