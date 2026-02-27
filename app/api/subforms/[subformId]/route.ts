export const dynamic = 'force-dynamic';
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"


export async function GET(
  request: NextRequest,
  { params }: { params: { subformId: string } }
) {
  try {
    const { subformId } = params
    const { searchParams } = new URL(request.url)
    const includeNested = searchParams.get('includeNested') === 'true'

    const subform = await prisma.subform.findUnique({
      where: { id: subformId },
      include: {
        fields: {
          orderBy: { order: 'asc' }
        },
        childSubforms: includeNested ? {
          include: {
            fields: {
              orderBy: { order: 'asc' }
            },
            childSubforms: {
              include: {
                fields: {
                  orderBy: { order: 'asc' }
                },
                childSubforms: true
              }
            }
          },
          orderBy: { order: 'asc' }
        } : true,
        parentSubform: true
      }
    })

    if (!subform) {
      return NextResponse.json(
        { success: false, error: "Subform not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: subform
    })

  } catch (error) {
    console.error("Error fetching subform:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch subform" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { subformId: string } }
) {
  try {
    const { subformId } = params
    const body = await request.json()
    const { name, description, order, collapsed, columns, visible, parentSubformId } = body

    // Check if subform exists
    const existingSubform = await prisma.subform.findUnique({
      where: { id: subformId },
      include: { parentSubform: true }
    })

    if (!existingSubform) {
      return NextResponse.json(
        { success: false, error: "Subform not found" },
        { status: 404 }
      )
    }

    // If moving to a different parent, recalculate level and path
    let updateData: any = {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(order !== undefined && { order }),
      ...(collapsed !== undefined && { collapsed }),
      ...(columns !== undefined && { columns }),
      ...(visible !== undefined && { visible }),
    }

    if (parentSubformId !== undefined && parentSubformId !== existingSubform.parentSubformId) {
      let newLevel = 0
      let newPath = ""

      if (parentSubformId) {
        const newParent = await prisma.subform.findUnique({
          where: { id: parentSubformId }
        })

        if (!newParent) {
          return NextResponse.json(
            { success: false, error: "New parent subform not found" },
            { status: 404 }
          )
        }

        newLevel = (newParent.level || 0) + 1
        const siblingCount = await prisma.subform.count({
          where: { parentSubformId }
        })
        newPath = newParent.path ? `${newParent.path}.${siblingCount + 1}` : `${siblingCount + 1}`
      } else {
        // Moving to root level in the form
        const siblingCount = await prisma.subform.count({
          where: {
            formId: existingSubform.formId,
            parentSubformId: null
          }
        })
        newPath = `${siblingCount + 1}`
      }

      updateData = {
        ...updateData,
        parentSubformId,
        level: newLevel,
        path: newPath
      }
    }

    // Update the subform
    const updatedSubform = await prisma.subform.update({
      where: { id: subformId },
      data: updateData,
      include: {
        fields: {
          orderBy: { order: 'asc' }
        },
        childSubforms: {
          include: {
            fields: {
              orderBy: { order: 'asc' }
            },
            childSubforms: true
          },
          orderBy: { order: 'asc' }
        },
        parentSubform: true
      }
    })

    return NextResponse.json({
      success: true,
      data: updatedSubform
    })

  } catch (error) {
    console.error("Error updating subform:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update subform" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { subformId: string } }
) {
  try {
    const { subformId } = params

    console.log("[Subform API] DELETE request for subform:", subformId)

    // Check if subform exists and get all nested data
    const existingSubform = await prisma.subform.findUnique({
      where: { id: subformId },
      include: {
        fields: true,
        childSubforms: {
          include: {
            fields: true,
            childSubforms: {
              include: {
                fields: true,
                childSubforms: {
                  include: {
                    fields: true,
                    childSubforms: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!existingSubform) {
      console.error("[Subform API] Subform not found:", subformId)
      return NextResponse.json(
        { success: false, error: "Subform not found" },
        { status: 404 }
      )
    }

    console.log("[Subform API] Found subform to delete:", existingSubform.name, "with", existingSubform.fields.length, "fields and", existingSubform.childSubforms.length, "child subforms")

    // Recursively collect all subform IDs and field IDs for deletion
    const collectIds = (subform: any): { subformIds: string[], fieldIds: string[] } => {
      const subformIds = [subform.id]
      const fieldIds = subform.fields.map((f: any) => f.id)

      for (const child of subform.childSubforms || []) {
        const childIds = collectIds(child)
        subformIds.push(...childIds.subformIds)
        fieldIds.push(...childIds.fieldIds)
      }

      return { subformIds, fieldIds }
    }

    const { subformIds, fieldIds } = collectIds(existingSubform)
    console.log("[Subform API] Will delete", subformIds.length, "subforms and", fieldIds.length, "fields")

    // Delete all fields in all nested subforms
    if (fieldIds.length > 0) {
      await prisma.formField.deleteMany({
        where: { id: { in: fieldIds } }
      })
      console.log("[Subform API] Deleted", fieldIds.length, "fields")
    }

    // Delete all subforms (cascade will handle the hierarchy)
    await prisma.subform.deleteMany({
      where: { id: { in: subformIds } }
    })
    console.log("[Subform API] Deleted", subformIds.length, "subforms")

    return NextResponse.json({
      success: true,
      message: "Subform and all nested subforms/fields deleted successfully",
      deletedSubformIds: subformIds,
      deletedFieldIds: fieldIds
    })

  } catch (error) {
    console.error("[Subform API] Error deleting subform:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete subform" },
      { status: 500 }
    )
  }
}
