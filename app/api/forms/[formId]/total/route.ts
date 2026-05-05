import { type NextRequest, NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database/database-service"
import { getAuthenticatedUser } from "@/lib/api-helpers"
import { moveToTrash } from "@/lib/trash"

// Recursively collect ALL fields from a form — sections, subforms, and any
// nested child subforms. Each field is annotated with its origin (subform name
// or section title) so the formula builder UI can group/label them.
function collectAllFields(form: any): any[] {
  const out: any[] = []

  const pushFromSubform = (subform: any, parentLabel?: string) => {
    if (!subform) return
    const subformLabel = parentLabel
      ? `${parentLabel} › ${subform.name || subform.title || "Subform"}`
      : subform.name || subform.title || "Subform"
    if (Array.isArray(subform.fields)) {
      for (const field of subform.fields) {
        out.push({
          ...field,
          _subformId: subform.id,
          _subformName: subformLabel,
          _isSubformField: true,
        })
      }
    }
    // Subforms can have nested sections of their own
    if (Array.isArray(subform.sections)) {
      for (const sec of subform.sections) {
        if (Array.isArray(sec.fields)) {
          for (const field of sec.fields) {
            out.push({
              ...field,
              _subformId: subform.id,
              _subformName: subformLabel,
              _sectionTitle: sec.title,
              _isSubformField: true,
            })
          }
        }
      }
    }
    // Recurse into child subforms
    if (Array.isArray(subform.childSubforms)) {
      for (const child of subform.childSubforms) {
        pushFromSubform(child, subformLabel)
      }
    }
    if (Array.isArray(subform.subforms)) {
      for (const child of subform.subforms) {
        pushFromSubform(child, subformLabel)
      }
    }
  }

  // Section fields + section-level subforms
  if (Array.isArray(form?.sections)) {
    for (const section of form.sections) {
      if (Array.isArray(section.fields)) {
        out.push(...section.fields)
      }
      if (Array.isArray(section.subforms)) {
        for (const sf of section.subforms) {
          pushFromSubform(sf)
        }
      }
    }
  }

  // Form-level subforms
  if (Array.isArray(form?.subforms)) {
    for (const sf of form.subforms) {
      pushFromSubform(sf)
    }
  }

  return out
}

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
          // Use the already loaded form's fields (sections + subforms)
          currentModuleFields.push({
            formId: form.id,
            formName: form.name,
            fields: collectAllFields(form),
          })
          continue
        }
        // Load full form for others (e.g., CHECK-OUT)
        const fullForm = await DatabaseService.getForm(moduleFormSummary.id)
        if (fullForm) {
          currentModuleFields.push({
            formId: fullForm.id,
            formName: fullForm.name,
            fields: collectAllFields(fullForm),
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
              parentModuleFields.push({
                formId: fullParentForm.id,
                formName: fullParentForm.name,
                fields: collectAllFields(fullParentForm),
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
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    await moveToTrash("Form", params.formId, {
      userId: user.id,
      userName: user.email,
      organizationId: user.organizationId,
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("API: Error deleting form:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}