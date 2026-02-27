import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const { newParentId, sortOrder } = await request.json()

    if (!id) {
      return NextResponse.json({ error: "Module ID required" }, { status: 400 })
    }

    // Validate module exists
    const module = await prisma.formModule.findUnique({
      where: { id },
    })

    if (!module) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 })
    }

    // Update module with new parent and sort order
    const updated = await prisma.formModule.update({
      where: { id },
      data: {
        parentId: newParentId || null,
        sortOrder: sortOrder ?? 0,
      },
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Module reordered successfully",
    })
  } catch (error: any) {
    console.error("[API] Module reorder error:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to reorder module" }, { status: 500 })
  }
}
