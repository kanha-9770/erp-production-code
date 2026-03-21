import { type NextRequest, NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database/database-service"
export async function GET(request: NextRequest, { params }: { params: { formId: string } }) {
  try {
    const form = await DatabaseService.getForm(params.formId)
    if (!form) {
      return NextResponse.json({ success: false, error: "Form not found" }, { status: 404 })
    }
    let moduleForms: Array<{ formId: string; formName: string }> = []
    let currentModuleFields: Array<{
      formId: string
      formName: string
      fields: any[]
    }> = []
    let parentModuleFields: Array<{
      formId: string
      formName: string
      fields: any[]
    }> = []
    let parentModuleInfo: { id: string; name: string } | null = null
    // 1. Get current module
    const currentModule = await DatabaseService.getModule(form.moduleId)
    if (currentModule) {
      // 2. Get all forms in the current module
      const currentForms = await DatabaseService.getForms(currentModule.id)
      moduleForms = currentForms.map(f => ({
        formId: f.id,
        formName: f.name,
      }))
      // 3. Load full details + fields for ALL forms in current module (including CHECK-OUT)
      for (const moduleFormSummary of currentForms) {
        // Skip the main form we already have (to avoid duplication)
        if (moduleFormSummary.id === form.id) {
          // Use the already loaded form's fields
          let mainFormFields: any[] = []
          if (form.sections) {
            for (const section of form.sections) {
              if (section.fields) mainFormFields.push(...section.fields)
            }
          }
          currentModuleFields.push({
            formId: form.id,
            formName: form.name,
            fields: mainFormFields,
          })
          continue
        }
        // Load full form for others (e.g., CHECK-OUT)
        const fullForm = await DatabaseService.getForm(moduleFormSummary.id)
        if (fullForm) {
          let allFields: any[] = []
          if (fullForm.sections) {
            for (const section of fullForm.sections) {
              if (section.fields) allFields.push(...section.fields)
            }
          }
          currentModuleFields.push({
            formId: fullForm.id,
            formName: fullForm.name,
            fields: allFields,
          })
        }
      }
      // 4. Parent module fields (already working correctly)
      if (currentModule.parentId) {
        const parentModule = await DatabaseService.getModule(currentModule.parentId)
        if (parentModule) {
          parentModuleInfo = { id: parentModule.id, name: parentModule.name }
          const parentFormSummaries = await DatabaseService.getForms(parentModule.id)
          for (const parentFormSummary of parentFormSummaries) {
            const fullParentForm = await DatabaseService.getForm(parentFormSummary.id)
            if (fullParentForm) {
              let allFields: any[] = []
              if (fullParentForm.sections) {
                for (const section of fullParentForm.sections) {
                  if (section.fields) allFields.push(...section.fields)
                }
              }
              parentModuleFields.push({
                formId: fullParentForm.id,
                formName: fullParentForm.name,
                fields: allFields,
              })
            }
          }
        }
      }
    }
    const currentModuleInfo = currentModule
      ? { id: currentModule.id, name: currentModule.name }
      : null
    return NextResponse.json({
      success: true,
      data: {
        form, // Original full form (CHECK-IN)
        currentModule: currentModuleInfo,
        moduleForms, // List of form names/IDs in module
        currentModuleFields, // ← NEW: All fields from ALL forms in current module (incl. CHECK-OUT)
        parentModuleFields, // All fields from nearest parent module forms
        parentModule: parentModuleInfo,
      },
    })
  } catch (error: any) {
    console.error("API: Error fetching form:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
// PUT and DELETE — completely unchanged
export async function PUT(request: NextRequest, { params }: { params: { formId: string } }) {
  try {
    const body = await request.json()
    const form = await DatabaseService.updateForm(params.formId, body)
    return NextResponse.json({ success: true, data: form })
  } catch (error: any) {
    console.error("API: Error updating form:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
export async function DELETE(request: NextRequest, { params }: { params: { formId: string } }) {
  try {
    await DatabaseService.deleteForm(params.formId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("API: Error deleting form:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}