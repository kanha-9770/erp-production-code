export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

const ALL_EVENTS = [
  "onFieldChange",
  "onFieldBlur",
  "beforeSubmit",
  "afterCreate",
  "afterUpdate",
  "manual",
] as const

/**
 * GET /api/functions/bindings/tree
 *
 * Returns the org's module → form → bindings tree, with the **events array
 * prebuilt** under every form. The UI never shows an empty page — even forms
 * with zero bindings render every event slot ready to be filled.
 *
 * Shape:
 * {
 *   success: true,
 *   data: [
 *     {
 *       id, name, description,
 *       moduleBindings: [...],          // bindings scoped to the module itself
 *       forms: [
 *         {
 *           id, name, isPublished,
 *           events: [
 *             { event: "onFieldChange", bindings: [...] },
 *             { event: "onFieldBlur",   bindings: [] },
 *             ...                        // every event is always present
 *           ]
 *         }, ...
 *       ]
 *     }, ...
 *   ]
 * }
 *
 * Each binding row carries its `function` (id/name/displayName) so the UI
 * can render rich rows without an extra round trip.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    if (!authUser.organizationId) {
      return NextResponse.json({ success: true, data: [] })
    }

    const orgId = authUser.organizationId

    // Pull all modules + their forms + each form's section→field ids in one
    // query. We need the field ids so a field-scoped binding can be slotted
    // under its parent form.
    const modules = await prisma.formModule.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        forms: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            isPublished: true,
            sections: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                title: true,
                fields: {
                  orderBy: { order: "asc" },
                  select: { id: true, label: true, type: true },
                },
              },
            },
            subforms: {
              select: {
                id: true,
                name: true,
                fields: {
                  orderBy: { order: "asc" },
                  select: { id: true, label: true, type: true },
                },
              },
            },
          },
        },
      },
    })

    // Build a fieldId → formId index so we can slot field bindings under the
    // right form.
    const fieldToForm = new Map<string, string>()
    for (const m of modules) {
      for (const f of m.forms) {
        for (const s of f.sections) for (const fld of s.fields) fieldToForm.set(fld.id, f.id)
        for (const sf of f.subforms) for (const fld of sf.fields) fieldToForm.set(fld.id, f.id)
      }
    }

    // Flatten each form's fields into a single ordered list the UI can drop
    // straight into a picker. We tag each field with its parent
    // section/subform title so the dropdown labels stay disambiguated when
    // two sections share field labels.
    const flattenFields = (form: typeof modules[number]["forms"][number]) => {
      const out: Array<{ id: string; label: string; type: string; group: string }> = []
      for (const s of form.sections) {
        for (const f of s.fields) {
          out.push({ id: f.id, label: f.label, type: f.type, group: s.title })
        }
      }
      for (const sf of form.subforms) {
        for (const f of sf.fields) {
          out.push({ id: f.id, label: f.label, type: f.type, group: `${sf.name} (subform)` })
        }
      }
      return out
    }

    const allBindings = await (prisma as any).functionBinding.findMany({
      where: { organizationId: orgId },
      orderBy: [{ event: "asc" }, { order: "asc" }, { updatedAt: "desc" }],
      include: {
        function: {
          select: { id: true, name: true, displayName: true, language: true, category: true },
        },
        field: { select: { id: true, label: true } },
      },
    })

    // Index bindings by (formId, event) and (moduleId, event).
    const formEventIndex = new Map<string, any[]>()
    const moduleEventIndex = new Map<string, any[]>()
    const pushTo = (map: Map<string, any[]>, key: string, value: any) => {
      const list = map.get(key)
      if (list) list.push(value)
      else map.set(key, [value])
    }

    for (const b of allBindings) {
      let resolvedFormId: string | null = b.formId || null
      let fieldLabel: string | null = null
      if (b.fieldId) {
        resolvedFormId = fieldToForm.get(b.fieldId) || null
        fieldLabel = b.field?.label ?? null
      }
      const enriched = { ...b, resolvedFormId, fieldLabel }

      if (resolvedFormId) {
        pushTo(formEventIndex, `${resolvedFormId}::${b.event}`, enriched)
      } else if (b.moduleId) {
        pushTo(moduleEventIndex, `${b.moduleId}::${b.event}`, enriched)
      }
    }

    const data = modules.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      icon: m.icon,
      // Module-scoped events live alongside form events — the UI groups them
      // separately under each module heading.
      events: ALL_EVENTS.map((event) => ({
        event,
        bindings: moduleEventIndex.get(`${m.id}::${event}`) || [],
      })),
      forms: m.forms.map((f) => ({
        id: f.id,
        name: f.name,
        isPublished: f.isPublished,
        fields: flattenFields(f),
        events: ALL_EVENTS.map((event) => ({
          event,
          bindings: formEventIndex.get(`${f.id}::${event}`) || [],
        })),
      })),
    }))

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error("[GET /api/functions/bindings/tree]", err)
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load bindings tree" },
      { status: 500 }
    )
  }
}
