import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { DatabaseService } from "@/lib/database/database-service"
import { invalidateFormCache } from "@/lib/forms/form-cache"

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params
    const { moduleId, sortOrder } = await request.json()

    if (!id) {
      return NextResponse.json({ success: false, error: "Form ID required" }, { status: 400 })
    }

    // Validate form exists
    const form = await DatabaseService.getForm(id)

    if (!form) {
      return NextResponse.json({ success: false, error: "Form not found" }, { status: 404 })
    }

    // Update form with new module and sort order
    // Raw prisma kept here to preserve the response shape with module include
    const updated = await prisma.form.update({
      where: { id },
      data: {
        moduleId: moduleId || form.moduleId,
        sortOrder: sortOrder ?? form.sortOrder,
      },
      include: {
        module: {
          select: { id: true, name: true },
        },
      },
    })

    // Module / sort order shifted — drop cached structure.
    await invalidateFormCache(id)

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Form reordered successfully",
    })
  } catch (error: any) {
    console.error("[API] Form reorder error:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to reorder form" }, { status: 500 })
  }
}
