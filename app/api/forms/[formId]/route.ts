// import { type NextRequest, NextResponse } from "next/server";
// import { DatabaseService } from "@/lib/database-service";

// export async function GET(
//   request: NextRequest,
//   { params }: { params: { formId: string } }
// ) {
//   try {
//     console.log("API: Fetching form:", params.formId);
//     const form = await DatabaseService.getForm(params.formId);
//     console.log("API: Form fetched successfully:akash", form);
//     if (!form) {
//       return NextResponse.json(
//         { success: false, error: "Form not found" },
//         { status: 404 }
//       );
//     }
//     console.log("API: Form fetched successfully:", form.name);
//     return NextResponse.json({ success: true, data: form });
//   } catch (error: any) {
//     console.error("API: Error fetching form:", error);
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 500 }
//     );
//   }
// }

// export async function PUT(
//   request: NextRequest,
//   { params }: { params: { formId: string } }
// ) {
//   try {
//     const body = await request.json();
//     const form = await DatabaseService.updateForm(params.formId, body);
//     return NextResponse.json({ success: true, data: form });
//   } catch (error: any) {
//     console.error("API: Error updating form:", error);
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 500 }
//     );
//   }
// }

// export async function DELETE(
//   request: NextRequest,
//   { params }: { params: { formId: string } }
// ) {
//   try {
//     await DatabaseService.deleteForm(params.formId);
//     return NextResponse.json({ success: true });
//   } catch (error: any) {
//     console.error("API: Error deleting form:", error);
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 500 }
//     );
//   }
// }


import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/lib/database-service";
import { validateSession } from "@/lib/auth";

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
              // support readonly stored in different places (field.readonly, properties.readonly)
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
    // remove any draft-only notes
    delete clone.settings.draftNotes;
  }

  // ensure published flag
  clone.isPublished = true;
  return clone;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
  try {
    console.log("API: Fetching form:", params.formId);
    const form = await DatabaseService.getForm(params.formId);
    if (!form) {
      return NextResponse.json({ success: false, error: "Form not found" }, { status: 404 });
    }

    // If caller requested the published view, return a pruned published representation
    const publishedParam = request.nextUrl.searchParams.get("published");
    if (publishedParam === "true") {
      try {
        const published = makePublishedView(form);

        // Determine if requester is admin; admins should see live/draft behavior
        let isAdmin = false;
        try {
          const token = request.cookies.get("auth-token")?.value;
          if (token) {
            const session = await validateSession(token as string);
            if (session && session.user) {
              const roles = session.user.unitAssignments || [];
              isAdmin = roles.some((ua: any) => ua?.role?.isAdmin || ua?.role?.name === "ADMIN");
            }
          }
        } catch (err) {
          console.error("Error checking session in published view:", err);
        }

        // If not admin, enforce public editability rules: only fields with
        // `properties.publicEditable === true` remain editable; others become readonly.
        if (!isAdmin) {
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

        // If debug requested, include a small debug payload showing first-section fields
        if (request.nextUrl.searchParams.get("debug") === "true") {
          const debugFields = (published.sections?.[0]?.fields || []).map((f: any) => ({ id: f.id, label: f.label, visible: f.visible, readonly: f.readonly, properties: f.properties }));
          return NextResponse.json({ success: true, data: published, debug: debugFields });
        }

        return NextResponse.json({ success: true, data: published });
      } catch (err) {
        console.error("Error building published view:", err);
        // fallthrough to return full form
      }
    }

    console.log("API: Form fetched successfully:", form.name);
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

// ────────────────────────────────────────────────
// NEW: Add PATCH handler (used by your frontend toggle)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
  try {
    const body = await request.json();
    console.log("PATCH request received for form:", params.formId, body);

    // Optional: validate allowed fields
    const allowedFields = ["isEmployeeForm", "isUserForm", "name", "description" /* add others if needed */];
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