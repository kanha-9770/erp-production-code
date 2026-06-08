import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/lib/database/database-service";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { moveToTrash } from "@/lib/trash";
import { HYBRID_FORMS_ENABLED } from "@/lib/feature-flags";

/**
 * Collect every fieldId in the form (sections + nested subforms). Used to
 * scope field-level FunctionBinding lookups so the form-detail response
 * carries the bindings the client needs to dispatch onFieldChange / onBlur.
 */
function collectFieldIds(form: any): string[] {
  const ids: string[] = [];
  const walkFields = (fields: any[]) => {
    if (!Array.isArray(fields)) return;
    for (const f of fields) if (f?.id) ids.push(f.id);
  };
  const walkSubforms = (subforms: any[]) => {
    if (!Array.isArray(subforms)) return;
    for (const sf of subforms) {
      walkFields(sf.fields);
      if (Array.isArray(sf.childSubforms)) walkSubforms(sf.childSubforms);
    }
  };
  if (Array.isArray(form?.sections)) {
    for (const s of form.sections) {
      walkFields(s.fields);
      walkSubforms(s.subforms);
    }
  }
  walkSubforms(form?.subforms);
  return ids;
}

/**
 * Fetch the bindings the client needs to wire field-level events for this
 * form. We only ship onFieldChange / onFieldBlur — beforeSubmit / afterCreate
 * / afterUpdate are evaluated server-side and don't need to be in the client
 * payload. Returns a small, flat list — ids only, no script bodies.
 */
async function loadClientBindings(form: any) {
  if (!form?.id) return [];
  const fieldIds = collectFieldIds(form);
  const where: any = {
    active: true,
    event: { in: ["onFieldChange", "onFieldBlur"] },
    OR: [
      { formId: form.id },
      ...(fieldIds.length ? [{ fieldId: { in: fieldIds } }] : []),
    ],
  };
  const bindings = await (prisma as any).functionBinding.findMany({
    where,
    select: {
      id: true,
      functionId: true,
      formId: true,
      fieldId: true,
      event: true,
      inputMapping: true,
      outputMapping: true,
      condition: true,
      order: true,
      function: { select: { displayName: true, name: true } },
    },
    orderBy: [{ event: "asc" }, { order: "asc" }],
  });
  return bindings;
}

function makePublishedView(form: any) {
  if (!form) return form;
  const clone = JSON.parse(JSON.stringify(form));

  const processSubforms = (subforms: any[]) => {
    if (!Array.isArray(subforms)) return subforms;
    return subforms.map((sf) => {
      const sfcopy = { ...sf };
      sfcopy.fields = Array.isArray(sfcopy.fields)
        ? sfcopy.fields
            .filter((f: any) => f.visible !== false)
            .map((f: any) => ({
              ...f,
              readonly: !!(f.readonly || f.properties?.readonly || f.properties?.readOnly),
            }))
        : [];
      if (sfcopy.childSubforms) sfcopy.childSubforms = processSubforms(sfcopy.childSubforms);
      return sfcopy;
    });
  };

  clone.sections = Array.isArray(clone.sections)
    ? clone.sections.map((section: any) => {
        const scopy = { ...section };
        scopy.fields = Array.isArray(scopy.fields)
          ? scopy.fields
              .filter((f: any) => f.visible !== false)
              .map((f: any) => ({
                ...f,
                readonly: !!(f.readonly || f.properties?.readonly || f.properties?.readOnly),
              }))
          : [];
        if (scopy.subforms) scopy.subforms = processSubforms(scopy.subforms);
        return scopy;
      })
    : [];

  if (clone.settings && typeof clone.settings === "object") {
    delete clone.settings.draftNotes;
  }

  clone.isPublished = true;
  return clone;
}

export async function GET(request: NextRequest, props: { params: Promise<{ formId: string }> }) {
  const params = await props.params;
  try {
    const form = await DatabaseService.getForm(params.formId);
    if (!form) {
      return NextResponse.json({ success: false, error: "Form not found" }, { status: 404 });
    }

    // If caller requested the published view, return a pruned published representation
    const publishedParam = request.nextUrl.searchParams.get("published");
    if (publishedParam === "true") {
      if (!form.isPublished) {
        return NextResponse.json({ success: false, error: "Form not found" }, { status: 404 });
      }

      try {
        const published = makePublishedView(form);

        // Admins see live/draft behaviour; check session non-critically
        let isAdmin = false;
        try {
          const currentUser = await getAuthenticatedUser(request);
          if (currentUser) {
            // isAdmin check still needs role info - re-fetch with unitAssignments
            const { prisma } = await import("@/lib/prisma");
            const userWithRoles = await prisma.user.findUnique({
              where: { id: currentUser.id },
              select: { unitAssignments: { include: { role: { select: { isAdmin: true, name: true } } } } },
            });
            const isAdminUser = userWithRoles?.unitAssignments.some(
              (ua: any) => ua.role?.isAdmin || ua.role?.name?.toLowerCase().includes("admin")
            ) ?? false;
            isAdmin = isAdminUser;
          }
        } catch (err) {
          console.error("Error checking session in published view:", err);
        }

        // Non-admins: check if the user has form-level write permissions.
        // If they do (CREATE/EDIT/DELETE), fields stay editable.
        // If they only have VIEW or are anonymous, enforce publicEditable.
        if (!isAdmin) {
          let hasWritePermission = false;
          try {
            const currentUserForPerms = await getAuthenticatedUser(request);
            if (currentUserForPerms) {
              const { prisma: db } = await import("@/lib/prisma");
              const userRoles = await db.user.findUnique({
                where: { id: currentUserForPerms.id },
                select: { unitAssignments: { select: { role: { select: { id: true } } } } },
              });
              const roleIds = (userRoles?.unitAssignments || []).map((ua: any) => ua.role.id);
              if (roleIds.length > 0) {
                const writePerms = await db.rolePermission.count({
                  where: {
                    roleId: { in: roleIds },
                    granted: true,
                    sectionId: null,
                    formFieldId: null,
                    permission: { name: { in: ["CREATE", "EDIT", "DELETE"] } },
                    OR: [{ formId: form.id }, { formId: null }],
                  },
                });
                hasWritePermission = writePerms > 0;
              }
            }
          } catch {
            // If permission check fails, fall through to publicEditable logic
          }

          // Only enforce publicEditable restrictions for users WITHOUT write
          // permissions (anonymous visitors, VIEW-only users).  Users with
          // CREATE/EDIT/DELETE should be able to fill in all fields.
          //
          // EXCEPTION: when the admin explicitly enabled "Allow Anonymous
          // Submissions" on the form, every field stays editable by default
          // — the per-field `publicEditable` opt-in is only meant for
          // restrictive public-view forms (where admin wants to expose just
          // a subset). Without this exception every published anonymous
          // form rendered as fully read-only and submissions were
          // impossible (form fields are not flagged `publicEditable: true`
          // by the publish dialog — there's no UI for it).
          if (!hasWritePermission && !form.allowAnonymous) {
            const markReadonly = (sections: any[]) => {
              if (!Array.isArray(sections)) return;
              sections.forEach((section) => {
                if (Array.isArray(section.fields)) {
                  section.fields = section.fields.map((f: any) => ({
                    ...f,
                    readonly: !!(f.readonly || f.properties?.readonly || f.properties?.readOnly) || !(f.properties?.publicEditable === true),
                  }));
                }
                if (Array.isArray(section.subforms)) {
                  const proc = (sforms: any[]) => {
                    sforms.forEach((sf: any) => {
                      if (Array.isArray(sf.fields)) {
                        sf.fields = sf.fields.map((f: any) => ({
                          ...f,
                          readonly: !!(f.readonly || f.properties?.readonly || f.properties?.readOnly) || !(f.properties?.publicEditable === true),
                        }));
                      }
                      if (Array.isArray(sf.childSubforms)) proc(sf.childSubforms);
                    });
                  };
                  proc(section.subforms);
                }
              });
            };

            markReadonly(published.sections);
          }
        }

        published.functionBindings = await loadClientBindings(published);

        if (request.nextUrl.searchParams.get("debug") === "true") {
          const debugFields = (published.sections?.[0]?.fields || []).map((f: any) => ({
            id: f.id, label: f.label, visible: f.visible, readonly: f.readonly, properties: f.properties,
          }));
          return NextResponse.json({ success: true, data: published, debug: debugFields });
        }

        return NextResponse.json({ success: true, data: published });
      } catch (err) {
        console.error("Error building published view:", err);
        // fallthrough to return full form
      }
    }

    (form as any).functionBindings = await loadClientBindings(form);
    return NextResponse.json({ success: true, data: form });
  } catch (error: any) {
    console.error("API: Error fetching form:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ formId: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json();
    const form = await DatabaseService.updateForm(params.formId, body);
    return NextResponse.json({ success: true, data: form });
  } catch (error: any) {
    console.error("API: Error updating form:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ formId: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json();

    const allowedFields = ["isEmployeeForm", "isUserForm", "name", "description"];
    const updates: Record<string, any> = {};
    for (const key in body) {
      if (allowedFields.includes(key)) {
        updates[key] = body[key];
      }
    }

    // Hybrid Employee-form mode is off → never let a form be flagged as the
    // Employee form (turning one OFF is still allowed).
    if (!HYBRID_FORMS_ENABLED && updates.isEmployeeForm === true) {
      delete updates.isEmployeeForm;
    }

    // Hierarchical inheritance toggle. We don't expose Form.settings as a
    // free-form blob through PATCH (too many ways to clobber it) — instead
    // we read the existing settings, spread them, set the single key, and
    // write them back. Missing key in the request means "no change", not
    // "reset to default".
    if (typeof body.inheritsToAncestors === "boolean") {
      const existing = await prisma.form.findUnique({
        where: { id: params.formId },
        select: { settings: true },
      });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Form not found" },
          { status: 404 }
        );
      }
      const existingSettings =
        existing.settings && typeof existing.settings === "object" && !Array.isArray(existing.settings)
          ? (existing.settings as Record<string, any>)
          : {};
      updates.settings = {
        ...existingSettings,
        inheritsToAncestors: body.inheritsToAncestors,
      };
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updatedForm = await DatabaseService.updateForm(params.formId, updates);
    return NextResponse.json({ success: true, data: updatedForm });
  } catch (error: any) {
    console.error("PATCH /api/forms/[formId] error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update form" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ formId: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    await moveToTrash("Form", params.formId, {
      userId: user.id,
      userName: user.email,
      organizationId: user.organizationId,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API: Error deleting form:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
