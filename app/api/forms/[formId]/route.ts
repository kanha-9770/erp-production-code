import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/lib/database/database-service";
import { getAuthenticatedUser } from "@/lib/api-helpers";

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

export async function GET(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
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
          if (!hasWritePermission) {
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

    return NextResponse.json({ success: true, data: form });
  } catch (error: any) {
    console.error("API: Error fetching form:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
  try {
    const body = await request.json();

    const allowedFields = ["isEmployeeForm", "isUserForm", "name", "description"];
    const updates: Record<string, any> = {};
    for (const key in body) {
      if (allowedFields.includes(key)) {
        updates[key] = body[key];
      }
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
  try {
    await DatabaseService.deleteForm(params.formId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API: Error deleting form:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
