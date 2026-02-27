import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const { moduleId, sortOrder } = await request.json()

    if (!id) {
      return NextResponse.json({ error: "Form ID required" }, { status: 400 })
    }

    // Validate form exists
    const form = await prisma.form.findUnique({
      where: { id },
    })

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    // Update form with new module and sort order
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
