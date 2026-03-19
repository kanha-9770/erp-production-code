import { type NextRequest, NextResponse } from "next/server"
import { DatabaseModules } from "@/lib/DatabaseModules"

export async function GET(request: NextRequest, { params }: { params: { formId: string } }) {
  try {
    const { formId } = params

    // 1. Get form to find moduleId
    const form = await DatabaseModules.getForm(formId)
    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    const moduleId = form.moduleId

    // 2. Get all forms in the same module (now includes formula data)
    const forms = await DatabaseModules.getForms(moduleId)

    if (forms.length === 0) {
      return NextResponse.json({ error: "No forms found in module" }, { status: 404 })
    }

    // 3. Flatten to editable fields preserving exact same response format
    const allFields = forms.flatMap((f) =>
      (f.sections ?? []).flatMap((section) =>
        (section.fields ?? []).map((field: any) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          databaseName: field.id,
          formId: f.id,
          formName: f.name,
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
      formId,
      moduleId,
      totalFields: editableFields.length,
      fields: editableFields,
    })
  } catch (error) {
    console.error("[v0] Error fetching form fields:", error)
    return NextResponse.json({ error: "Failed to fetch form fields" }, { status: 500 })
  }
}
