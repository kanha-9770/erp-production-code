import { NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/lib/database-service";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { newModuleId } = await request.json();

    const updatedForm = await DatabaseService.updateForm(params.formId, { moduleId: newModuleId });

    return NextResponse.json({ success: true, data: updatedForm });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}