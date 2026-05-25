/**
 * Shared engine for the "Customize form" buttons on static React forms
 * (Job Application, Job Opening, Job Offer, Employee Referral, Appointment
 * Letter, Staffing Plan). Mirrors the older /api/forms/ensure-employee-form
 * pattern, but generic: callers pass in the seed spec and the helper handles
 * idempotent find-or-create, backfill, and field seeding.
 *
 * Lookup strategy: `Form.settings.staticFormKind === kind`, scoped to the
 * user's org. Match-by-kind survives admin renames of the form, and avoids
 * collisions with a manually-created form that happens to share the name.
 */
import { prisma } from "@/lib/prisma";

export interface StaticFormFieldSpec {
  coreKey: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

export interface StaticFormSectionSpec {
  title: string;
  columns: number;
  fields: StaticFormFieldSpec[];
}

export interface EnsureStaticFormParams {
  /** Owner of the request — used for org scoping. */
  user: { id: string; organizationId: string };
  /** Stable key persisted into `Form.settings.staticFormKind`. */
  kind: string;
  /** Display name of the form (e.g. "Job Application"). */
  formName: string;
  /** Short description shown in the builder. */
  formDescription: string;
  /** Module to anchor the form under. Created if not already present. */
  moduleName: string;
  /** Icon name for the module if it gets created. Defaults to "folder". */
  moduleIcon?: string;
  /** Seed sections + fields. */
  sections: StaticFormSectionSpec[];
}

export interface EnsureStaticFormResult {
  formId: string;
  formName: string;
  moduleId: string;
  created: boolean;
  /** Number of core fields added during backfill on an existing form. */
  backfilled: number;
}

export async function ensureStaticForm(
  params: EnsureStaticFormParams,
): Promise<EnsureStaticFormResult> {
  const { user, kind, formName, formDescription, moduleName, moduleIcon, sections } = params;

  // 1. Existing form? Match by settings.staticFormKind. JSON-path filters in
  //    Prisma vary by version, so we read the candidate set and filter in JS.
  const candidates = await prisma.form.findMany({
    where: { module: { organizationId: user.organizationId } },
    include: { sections: { include: { fields: true }, orderBy: { order: "asc" } } },
  });
  const existing = candidates.find(
    (f) => (f.settings as any)?.staticFormKind === kind,
  );
  if (existing) {
    const { fieldsAdded } = await backfillForm(existing, sections);
    return {
      formId: existing.id,
      formName: existing.name,
      moduleId: existing.moduleId,
      created: false,
      backfilled: fieldsAdded,
    };
  }

  // 2. Find or create the anchor module.
  let module = await prisma.formModule.findFirst({
    where: {
      organizationId: user.organizationId,
      name: { equals: moduleName, mode: "insensitive" },
    },
    orderBy: { sortOrder: "asc" },
  });
  if (!module) {
    const lastModule = await prisma.formModule.findFirst({
      where: { organizationId: user.organizationId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    module = await prisma.formModule.create({
      data: {
        name: moduleName,
        organizationId: user.organizationId,
        moduleType: "standard",
        icon: moduleIcon ?? "folder",
        isActive: true,
        sortOrder: (lastModule?.sortOrder ?? 0) + 1,
      },
    });
  }

  // 3. Create form + sections + fields in one transaction so a partial failure
  //    doesn't leave a half-built form behind. Fields go in via createMany per
  //    section so a section with 20 fields is one INSERT instead of 20 — keeps
  //    us well under the (bumped) transaction budget on slow dev DBs.
  const result = await prisma.$transaction(
    async (tx) => {
      const form = await tx.form.create({
        data: {
          moduleId: module!.id,
          name: formName,
          description: formDescription,
          settings: { staticFormKind: kind },
          isPublished: false,
        },
      });

      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const sectionSpec = sections[sIdx];
        const section = await tx.formSection.create({
          data: {
            formId: form.id,
            title: sectionSpec.title,
            order: sIdx,
            columns: sectionSpec.columns,
            visible: true,
            collapsible: false,
          },
        });

        if (sectionSpec.fields.length > 0) {
          await tx.formField.createMany({
            data: sectionSpec.fields.map((spec, fIdx) => ({
              sectionId: section.id,
              type: spec.type,
              label: spec.label,
              placeholder: spec.placeholder,
              options: spec.options ?? [],
              validation: spec.required ? { required: true } : {},
              order: fIdx,
              properties: { isCore: true, coreKey: spec.coreKey },
            })),
          });
        }
      }

      return form;
    },
    {
      // Defaults are maxWait=2s, timeout=5s — too tight for a 10-section seed
      // on a slow dev DB connection (P2028 "Transaction not found"). 30s
      // matches the budget the older ensure-employee-form needs in practice.
      maxWait: 10_000,
      timeout: 30_000,
    },
  );

  return {
    formId: result.id,
    formName: result.name,
    moduleId: result.moduleId,
    created: true,
    backfilled: 0,
  };
}

/**
 * Add any missing sections/core fields from `sections` to an existing form.
 * Idempotent: a coreKey already present (in any section, since admins may
 * have moved fields around) is left alone. New sections are appended.
 */
async function backfillForm(
  form: {
    id: string;
    sections: Array<{
      id: string;
      title: string;
      order: number;
      fields: Array<{ properties: any }>;
    }>;
  },
  sections: StaticFormSectionSpec[],
): Promise<{ fieldsAdded: number; sectionsAdded: number }> {
  const presentKeys = new Set<string>();
  for (const sec of form.sections) {
    for (const f of sec.fields) {
      const ck = (f.properties as any)?.coreKey;
      if (ck) presentKeys.add(String(ck));
    }
  }

  let fieldsAdded = 0;
  let sectionsAdded = 0;
  let nextSectionOrder = (form.sections[form.sections.length - 1]?.order ?? -1) + 1;

  for (const sectionSpec of sections) {
    const missingFields = sectionSpec.fields.filter((f) => !presentKeys.has(f.coreKey));
    if (missingFields.length === 0) continue;

    let section = form.sections.find(
      (s) => s.title.toLowerCase() === sectionSpec.title.toLowerCase(),
    );
    if (!section) {
      const created = await prisma.formSection.create({
        data: {
          formId: form.id,
          title: sectionSpec.title,
          order: nextSectionOrder++,
          columns: sectionSpec.columns,
          visible: true,
          collapsible: false,
        },
      });
      section = { id: created.id, title: created.title, order: created.order, fields: [] };
      sectionsAdded += 1;
    }

    const existingMax = await prisma.formField.aggregate({
      where: { sectionId: section.id },
      _max: { order: true },
    });
    let order = (existingMax._max.order ?? -1) + 1;
    for (const spec of missingFields) {
      await prisma.formField.create({
        data: {
          sectionId: section.id,
          type: spec.type,
          label: spec.label,
          placeholder: spec.placeholder,
          options: spec.options ?? [],
          validation: spec.required ? { required: true } : {},
          order: order++,
          properties: { isCore: true, coreKey: spec.coreKey },
        },
      });
      fieldsAdded += 1;
    }
  }

  return { fieldsAdded, sectionsAdded };
}
