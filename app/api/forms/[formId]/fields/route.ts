import { PrismaClient } from "@prisma/client"
import { type NextRequest, NextResponse } from "next/server"

const prisma = new PrismaClient()

export async function GET(request: NextRequest, { params }: { params: { formId: string } }) {
  try {
    const { formId } = params

    // Fetch the form directly
    const form = await prisma.form.findUnique({
      where: { id: formId },
    })

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    const actualFormId = formId
    const moduleId = form.moduleId

    // Fetch all forms in the same module
    const forms = await prisma.form.findMany({
      where: { moduleId },
      include: {
        sections: {
          include: {
            fields: {
              include: {
                formula: true,
              },
            },
          },
        },
      },
    })

    if (forms.length === 0) {
      return NextResponse.json({ error: "No forms found in module" }, { status: 404 })
    }

    const allFields = forms.flatMap((form) =>
      form.sections.flatMap((section) =>
        section.fields.map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          databaseName: field.id,
          formId: form.id,
          formName: form.name,
          sectionId: section.id,
          sectionTitle: section.title,
          visible: field.visible,
          readonly: field.readonly,
          decimalPlaces: field.decimalPlaces,
          ...(field.type === "formula" &&
            field.formula && {
              formulaConfig: {
                expression: field.formula.expression,
                returnType: field.formula.returnType,
                blankPreference: field.formula.blankPreference,
              },
            }),
        })),
      ),
    )

    const editableFields = allFields.filter((f) => f.visible && !f.readonly)

    return NextResponse.json({
      success: true,
      formId: actualFormId,
      moduleId,
      totalFields: editableFields.length,
      fields: editableFields,
    })
  } catch (error) {
    console.error("[v0] Error fetching form fields:", error)
    return NextResponse.json({ error: "Failed to fetch form fields" }, { status: 500 })
  }
}