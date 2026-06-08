/**
 * POST /api/forms/[formId]/ensure-core-fields
 *
 * Idempotently injects the locked Identity core fields into an Employee
 * Master form so the hybrid HR Core page can rely on them existing.
 *
 * The contract is "what's missing, add. What's there, leave alone." Existing
 * non-core fields the admin has already customised are never touched. Existing
 * core fields are detected by `properties.coreKey` and skipped.
 *
 * Each injected field is stamped with `properties.isCore = true` so the
 * builder UI can hide rename/delete affordances and the field PUT/DELETE
 * handlers refuse destructive edits server-side. `coreKey` is the stable
 * identifier the static page reads from when rendering columns and
 * record forms — `label` is just the human display and may be relabelled
 * via the form-builder if the admin edits the *settings* (label changes are
 * blocked, but description/placeholder are still allowed).
 */

export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { HYBRID_FORMS_ENABLED } from '@/lib/feature-flags';

const CORE_SECTION_TITLE = 'Employee Identity';

interface CoreFieldSpec {
  coreKey: string;
  label: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
}

const CORE_FIELDS: CoreFieldSpec[] = [
  {
    coreKey: 'salutation',
    label: 'Salutation',
    type: 'select',
    options: [
      { label: 'Mr', value: 'MR' },
      { label: 'Ms', value: 'MS' },
      { label: 'Mrs', value: 'MRS' },
      { label: 'Dr', value: 'DR' },
    ],
  },
  { coreKey: 'firstName', label: 'First Name', type: 'text', required: true },
  { coreKey: 'lastName', label: 'Last Name', type: 'text', required: true },
  {
    coreKey: 'gender',
    label: 'Gender',
    type: 'select',
    options: [
      { label: 'Male', value: 'MALE' },
      { label: 'Female', value: 'FEMALE' },
      { label: 'Other', value: 'OTHER' },
    ],
  },
  { coreKey: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
];

export async function POST(request: NextRequest, props0: { params: Promise<{ formId: string }> }) {
  // Hybrid Employee-form mode is off → no core-field injection. No-op (not an
  // error) so the caller's optional "ensure" step quietly does nothing.
  if (!HYBRID_FORMS_ENABLED) {
    return NextResponse.json({ success: true, created: 0, alreadyExisted: 0, disabled: true });
  }
  const params = await props0.params;
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  if (!authUser.organizationId) {
    return NextResponse.json({ success: false, error: 'No organization' }, { status: 403 });
  }
  if (!(await isUserAdmin(authUser.id, authUser.organizationId))) {
    return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 });
  }

  const { formId } = params;
  const form = await prisma.form.findFirst({
    where: { id: formId, module: { organizationId: authUser.organizationId } },
    include: {
      sections: { include: { fields: true }, orderBy: { order: 'asc' } },
    },
  });
  if (!form) {
    return NextResponse.json({ success: false, error: 'Form not found' }, { status: 404 });
  }

  const existingCoreKeys = new Set<string>();
  for (const section of form.sections) {
    for (const f of section.fields) {
      const props = (f.properties as any) ?? {};
      if (props?.coreKey) existingCoreKeys.add(String(props.coreKey));
    }
  }

  // Resolve / create the Identity section. If a core field already exists in
  // a different section (admin moved it), we leave it alone — but new core
  // fields land in the canonical section.
  let identitySection =
    form.sections.find((s) => s.title === CORE_SECTION_TITLE) ?? form.sections[0] ?? null;

  if (!identitySection) {
    identitySection = (await prisma.formSection.create({
      data: {
        formId: form.id,
        title: CORE_SECTION_TITLE,
        order: 0,
        columns: 2,
        visible: true,
      },
      include: { fields: true },
    })) as any;
  }

  const baseOrder = identitySection!.fields.length;
  const created: Array<{ id: string; coreKey: string }> = [];

  for (let i = 0; i < CORE_FIELDS.length; i++) {
    const spec = CORE_FIELDS[i];
    if (existingCoreKeys.has(spec.coreKey)) continue;

    const field = await prisma.formField.create({
      data: {
        sectionId: identitySection!.id,
        type: spec.type,
        label: spec.label,
        placeholder: spec.placeholder,
        options: spec.options ?? [],
        validation: spec.required ? { required: true } : {},
        order: baseOrder + i,
        properties: {
          isCore: true,
          coreKey: spec.coreKey,
        },
      },
    });
    created.push({ id: field.id, coreKey: spec.coreKey });
  }

  return NextResponse.json({
    success: true,
    formId: form.id,
    created: created.length,
    alreadyExisted: CORE_FIELDS.length - created.length,
    coreKeys: CORE_FIELDS.map((f) => f.coreKey),
  });
}
