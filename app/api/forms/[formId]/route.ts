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

export async function GET(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
  try {
    console.log("API: Fetching form:", params.formId);
    const form = await DatabaseService.getForm(params.formId);
    console.log("API: Form fetched successfully:akash", form);
    if (!form) {
      return NextResponse.json(
        { success: false, error: "Form not found" },
        { status: 404 }
      );
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