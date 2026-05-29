import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { invalidateFormCache } from "@/lib/forms/form-cache"

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ formId: string; fieldId: string }> }
) {
  const params = await props.params;
  try {
    const { formId, fieldId } = params
    const body = await request.json()
    const { expression, returnType, decimalPlaces, blankPreference } = body

    // Validate form and field exist
    const field = await prisma.formField.findFirst({
      where: {
        id: fieldId,
        section: {
          formId,
        },
      },
    })

    if (!field) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 })
    }

    if (field.type !== "formula") {
      return NextResponse.json({ error: "Field is not a formula field" }, { status: 400 })
    }

    const formula = await prisma.formulaField.upsert({
      where: { fieldId },
      update: {
        expression,
        returnType,
        decimalPlaces: decimalPlaces || 2,
        blankPreference: blankPreference || "Empty",
        updatedAt: new Date(),
      },
      create: {
        fieldId,
        expression,
        returnType,
        decimalPlaces: decimalPlaces || 2,
        blankPreference: blankPreference || "Empty",
      },
    })

    // formId is already validated above (field belongs to this form).
    await invalidateFormCache(formId)

    return NextResponse.json({
      success: true,
      message: "Formula saved successfully",
      formula,
    })
  } catch (error) {
    console.error("[v0] Error saving formula:", error)
    return NextResponse.json(
      { error: "Failed to save formula", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ formId: string; fieldId: string }> }
) {
  const params = await props.params;
  try {
    const { formId, fieldId } = params

    const formula = await prisma.formulaField.findUnique({
      where: { fieldId },
      include: {
        field: {
          include: {
            section: true,
          },
        },
      },
    })

    if (!formula) {
      return NextResponse.json({ error: "Formula not found" }, { status: 404 })
    }

    if (formula.field.section.formId !== formId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      formula,
    })
  } catch (error) {
    console.error("[v0] Error fetching formula:", error)
    return NextResponse.json({ error: "Failed to fetch formula" }, { status: 500 })
  }
}
