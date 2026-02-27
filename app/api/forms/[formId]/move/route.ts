import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    const session = await validateSession(token || "");
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { newModuleId } = await request.json();

    const updatedForm = await prisma.form.update({
      where: { id: params.formId },
      data: { moduleId: newModuleId },
    });

    return NextResponse.json({ success: true, data: updatedForm });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}