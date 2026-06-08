/**
 * POST /api/forms/ensure-employee-form
 *
 * Idempotently guarantees that the caller's organization has an Employee form
 * in the form-builder, then returns its id so the static `/employee-master`
 * page can deep-link to `/builder/<id>` for customization.
 *
 * Flow:
 *  1. Look up an existing Form with `isEmployeeForm = true` scoped to the
 *     org. If one exists, return it (no writes).
 *  2. Otherwise, find or create a FormModule named "HR" to anchor the form
 *     under (an org may have no modules at all — we don't want to dump the
 *     form under a random one).
 *  3. Create the Form with `isEmployeeForm = true` and seed it with the
 *     locked Identity core fields by reusing the same field specs as the
 *     existing /ensure-core-fields endpoint, so the static page's column
 *     mapping keeps working out of the box.
 *
 * Admin-only. Without the gate, any signed-in user could spawn a form +
 * module pair in the org's namespace.
 */

export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { HYBRID_FORMS_ENABLED } from "@/lib/feature-flags";

const DEFAULT_FORM_NAME = "Employee Master";
const DEFAULT_MODULE_NAME = "HR";

interface CoreFieldSpec {
  coreKey: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

interface SectionSpec {
  title: string;
  columns: number;
  fields: CoreFieldSpec[];
}

/**
 * Mirrors every field rendered by `components/employee/employee-form.tsx` —
 * grouped into the same sections so the form-builder view matches the static
 * page section-for-section. Admins can rearrange, hide, or add to these;
 * `isCore=true` keeps the field's label/type locked so the static page's
 * column mapping doesn't break when someone renames "First Name" → "FN".
 */
const FORM_SECTIONS: SectionSpec[] = [
  {
    title: "Identity",
    columns: 2,
    fields: [
      {
        coreKey: "salutation",
        label: "Salutation",
        type: "select",
        options: [
          { label: "Mr", value: "MR" },
          { label: "Ms", value: "MS" },
          { label: "Mrs", value: "MRS" },
          { label: "Dr", value: "DR" },
        ],
      },
      { coreKey: "firstName", label: "First Name", type: "text", required: true, placeholder: "e.g. Ananya" },
      { coreKey: "lastName", label: "Last Name", type: "text", placeholder: "e.g. Sharma" },
      {
        coreKey: "gender",
        label: "Gender",
        type: "select",
        options: [
          { label: "Male", value: "MALE" },
          { label: "Female", value: "FEMALE" },
          { label: "Other", value: "OTHER" },
        ],
      },
      {
        coreKey: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "Active", value: "ACTIVE" },
          { label: "Inactive", value: "INACTIVE" },
          { label: "On leave", value: "ON_LEAVE" },
          { label: "Terminated", value: "TERMINATED" },
        ],
      },
      { coreKey: "dob", label: "Date of Birth", type: "date" },
      { coreKey: "nativePlace", label: "Native Place", type: "text" },
      { coreKey: "country", label: "Country", type: "text" },
    ],
  },
  {
    title: "Employment",
    columns: 2,
    fields: [
      { coreKey: "department", label: "Department", type: "text" },
      { coreKey: "designation", label: "Designation", type: "text" },
      { coreKey: "companyName", label: "Company", type: "text" },
      { coreKey: "employeeEngagementTeamName", label: "Engagement Team", type: "text" },
      { coreKey: "dateOfJoining", label: "Date of Joining", type: "date" },
      { coreKey: "dateOfLeaving", label: "Date of Leaving", type: "date" },
    ],
  },
  {
    title: "Contact",
    columns: 2,
    fields: [
      { coreKey: "emailAddress1", label: "Primary Email", type: "email" },
      { coreKey: "emailAddress2", label: "Secondary Email", type: "email" },
      { coreKey: "personalContact", label: "Personal Contact", type: "phone" },
      { coreKey: "alternateNo1", label: "Alternate No. 1", type: "phone" },
      { coreKey: "alternateNo2", label: "Alternate No. 2", type: "phone" },
    ],
  },
  {
    title: "Address",
    columns: 1,
    fields: [
      { coreKey: "permanentAddress", label: "Permanent Address", type: "textarea" },
      { coreKey: "currentAddress", label: "Current Address", type: "textarea" },
    ],
  },
  {
    title: "Shift",
    columns: 3,
    fields: [
      { coreKey: "shiftType", label: "Shift Type", type: "text" },
      { coreKey: "inTime", label: "In Time", type: "time" },
      { coreKey: "outTime", label: "Out Time", type: "time" },
    ],
  },
  {
    title: "Compensation",
    columns: 2,
    fields: [
      { coreKey: "totalSalary", label: "Total Salary", type: "number" },
      { coreKey: "givenSalary", label: "Take-home Salary", type: "number" },
      { coreKey: "bonusAmount", label: "Bonus", type: "number" },
      { coreKey: "nightAllowance", label: "Night Allowance", type: "number" },
      { coreKey: "overTime", label: "Overtime", type: "number" },
      { coreKey: "oneHourExtra", label: "One-Hour Extra", type: "number" },
      { coreKey: "incrementMonth", label: "Increment Month", type: "number" },
      { coreKey: "yearsOfAgreement", label: "Years of Agreement", type: "number" },
      { coreKey: "bonusAfterYears", label: "Bonus After Years", type: "number" },
    ],
  },
  {
    title: "Bank & Identification",
    columns: 2,
    fields: [
      { coreKey: "bankName", label: "Bank Name", type: "text" },
      { coreKey: "bankAccountNo", label: "Account Number", type: "text" },
      { coreKey: "ifscCode", label: "IFSC Code", type: "text" },
      { coreKey: "aadharCardNo", label: "Aadhaar Number", type: "text" },
      { coreKey: "companySimIssue", label: "Company SIM Issued", type: "checkbox" },
    ],
  },
];

export async function POST(request: NextRequest) {
  try {
    // Hybrid Employee-form mode is off → don't seed/return a builder form.
    if (!HYBRID_FORMS_ENABLED) {
      return NextResponse.json(
        { success: false, disabled: true, error: "Hybrid Employee forms are disabled." },
        { status: 403 },
      );
    }
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }
    if (!user.organizationId) {
      return NextResponse.json(
        { success: false, error: "No organization" },
        { status: 403 },
      );
    }
    if (!(await isUserAdmin(user.id, user.organizationId))) {
      return NextResponse.json(
        { success: false, error: "Admin only" },
        { status: 403 },
      );
    }

    // 1. Existing form? Backfill any missing core sections/fields so an org
    //    that was seeded with the old 11-field version (or has an admin who
    //    deleted a core field) ends up with the full set after one click.
    const existing = await prisma.form.findFirst({
      where: {
        isEmployeeForm: true,
        module: { organizationId: user.organizationId },
      },
      include: { sections: { include: { fields: true }, orderBy: { order: "asc" } } },
    });
    if (existing) {
      const backfill = await backfillForm(existing);
      return NextResponse.json({
        success: true,
        created: false,
        backfilled: backfill.fieldsAdded,
        formId: existing.id,
        formName: existing.name,
        moduleId: existing.moduleId,
      });
    }

    // 2. Find or create the anchor module. Prefer one that's literally named
    //    "HR" or contains "HR"/"Employee" in the name — that way orgs with
    //    custom-named HR modules don't end up with a duplicate.
    let module = await prisma.formModule.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [
          { name: { equals: DEFAULT_MODULE_NAME, mode: "insensitive" } },
          { name: { contains: "HR", mode: "insensitive" } },
          { name: { contains: "Employee", mode: "insensitive" } },
          { name: { contains: "Human", mode: "insensitive" } },
        ],
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
          name: DEFAULT_MODULE_NAME,
          description: "Employees, payroll and people processes",
          organizationId: user.organizationId,
          moduleType: "standard",
          icon: "users",
          isActive: true,
          sortOrder: (lastModule?.sortOrder ?? 0) + 1,
        },
      });
    }

    // 3. Create the form and seed every section/field from FORM_SECTIONS in a
    //    single transaction so a partial failure doesn't leave a half-built
    //    form behind. Fields go in via createMany per section so a section
    //    with 9 fields is one INSERT instead of 9 — keeps us under the
    //    (bumped) transaction budget on slow dev DBs that used to throw
    //    P2028 "Transaction not found" after the 5s default elapsed.
    const result = await prisma.$transaction(
      async (tx) => {
        const form = await tx.form.create({
          data: {
            moduleId: module!.id,
            name: DEFAULT_FORM_NAME,
            description:
              "Master record for every employee. Add custom fields here to extend the employee profile across the app.",
            settings: {},
            isEmployeeForm: true,
            isPublished: false,
          },
        });

        for (let sIdx = 0; sIdx < FORM_SECTIONS.length; sIdx++) {
          const sectionSpec = FORM_SECTIONS[sIdx];
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
                properties: {
                  isCore: true,
                  coreKey: spec.coreKey,
                },
              })),
            });
          }
        }

        return form;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

    return NextResponse.json({
      success: true,
      created: true,
      formId: result.id,
      formName: result.name,
      moduleId: result.moduleId,
    });
  } catch (err: any) {
    console.error("[POST /api/forms/ensure-employee-form]", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message ?? "Failed to ensure employee form",
      },
      { status: 500 },
    );
  }
}

/**
 * Add any missing sections/core fields from FORM_SECTIONS to an existing
 * Employee form. Idempotent: a coreKey already present (in ANY section, since
 * admins may move fields around) is left alone. New sections are appended
 * after the existing ones. Returns how many fields were added.
 */
async function backfillForm(form: {
  id: string;
  sections: Array<{ id: string; title: string; order: number; fields: Array<{ properties: any }> }>;
}): Promise<{ fieldsAdded: number; sectionsAdded: number }> {
  // Collect every coreKey already in the form so we don't re-create them
  // even if the admin moved a field into a different section.
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

  for (const sectionSpec of FORM_SECTIONS) {
    const missingFields = sectionSpec.fields.filter((f) => !presentKeys.has(f.coreKey));
    if (missingFields.length === 0) continue;

    // Drop new fields into the matching section if one already exists;
    // otherwise create the section so the layout stays coherent.
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

    // Append missing fields after the section's current max order so they
    // don't overlap whatever the admin has already arranged.
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
          properties: {
            isCore: true,
            coreKey: spec.coreKey,
          },
        },
      });
      fieldsAdded += 1;
    }
  }

  return { fieldsAdded, sectionsAdded };
}
