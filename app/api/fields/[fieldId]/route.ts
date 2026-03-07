// export const dynamic = 'force-dynamic';
// import { NextResponse } from "next/server";
// import { DatabaseService } from "@/lib/database-service";

// export async function PUT(
//   request: Request,
//   { params }: { params: { fieldId: string } }
// ) {
//   try {
//     const body = await request.json();
//     console.log("Updating field:", params.fieldId, body);
//     const field = await DatabaseService.updateField(params.fieldId, {
//       sectionId: body.sectionId,
//       subformId: body.subformId,
//       type: body.type,
//       label: body.label,
//       placeholder: body.placeholder,
//       description: body.description,
//       defaultValue: body.defaultValue,
//       options: body.options,
//       validation: body.validation,
//       visible: body.visible,
//       readonly: body.readonly,
//       width: body.width,
//       order: body.order,
//       conditional: body.conditional,
//       styling: body.styling,
//       properties: body.properties,
//       formula: body.formula,
//       rollup: body.rollup,
//       lookup: body.lookup,
//     });

//     return NextResponse.json({ success: true, data: field });
//   } catch (error: any) {
//     console.error("Error updating field:", error);
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 500 }
//     );
//   }
// }

// export async function DELETE(
//   request: Request,
//   { params }: { params: { fieldId: string } }
// ) {
//   try {
//     await DatabaseService.deleteField(params.fieldId);
//     return NextResponse.json({ success: true });
//   } catch (error: any) {
//     console.error("Error deleting field:", error);
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 500 }
//     );
//   }
// }

// export async function GET(
//   request: Request,
//   { params }: { params: { fieldId: string } }
// ) {
//   try {
//     // This could be used to get a specific field if needed
//     return NextResponse.json({ success: true, data: null });
//   } catch (error: any) {
//     console.error("Error fetching field:", error);
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 500 }
//     );
//   }
// }


export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { DatabaseService } from "@/lib/database-service";

export async function PUT(
  request: Request,
  { params }: { params: { fieldId: string } }
) {
  try {
    const body = await request.json();
    console.log("Updating field:", params.fieldId, body);

    const field = await DatabaseService.updateField(params.fieldId, {
      sectionId: body.sectionId,
      subformId: body.subformId,
      type: body.type,
      label: body.label,
      placeholder: body.placeholder,
      description: body.description,
      defaultValue: body.defaultValue,
      options: body.options,
      validation: body.validation,
      visible: body.visible,
      readonly: body.readonly,
      width: body.width,
      order: body.order,
      conditional: body.conditional,
      styling: body.styling,
      properties: body.properties,
      formula: body.formula,
      rollup: body.rollup,
      lookup: body.lookup,

      // ────────────────────────────────────────────────
      // ADD THESE THREE LINES — this is the fix
      // ────────────────────────────────────────────────
      isDependent: body.isDependent ?? false,
      parentFieldId: body.parentFieldId ?? null,
      dependentGroups: body.dependentGroups ?? [],
      // ────────────────────────────────────────────────
    });

    return NextResponse.json({ success: true, data: field });
  } catch (error: any) {
    console.error("Error updating field:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { fieldId: string } }
) {
  try {
    await DatabaseService.deleteField(params.fieldId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting field:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: { fieldId: string } }
) {
  try {
    // This could be used to get a specific field if needed
    return NextResponse.json({ success: true, data: null });
  } catch (error: any) {
    console.error("Error fetching field:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}