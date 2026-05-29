import { type NextRequest, NextResponse } from "next/server"
import { getFormulaEvaluator } from "@/lib/formula/evaluator"
import { prisma } from "@/lib/prisma"

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ formId: string; fieldId: string }> }
) {
  const params = await props.params;
  try {
    const { formId, fieldId } = params
    const body = await request.json()
    const { fieldValues } = body

    const field = await prisma.formField.findFirst({
      where: {
        id: fieldId,
        section: {
          formId,
        },
      },
      include: {
        formula: true,
      },
    })

    if (!field || field.type !== "formula") {
      return NextResponse.json({ error: "Formula field not found" }, { status: 404 })
    }

    if (!field.formula) {
      return NextResponse.json({ error: "Formula not configured" }, { status: 400 })
    }

    const evaluator = getFormulaEvaluator()
    const result = evaluator.evaluate(
      field.formula.expression,
      fieldValues,
      field.formula.returnType,
      field.formula.blankPreference,
    )

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
      })
    }

    return NextResponse.json({
      success: true,
      value: result.value,
      returnType: field.formula.returnType,
    })
  } catch (error) {
    console.error("[v0] Error calculating formula:", error)
    return NextResponse.json(
      { error: "Failed to calculate formula", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
