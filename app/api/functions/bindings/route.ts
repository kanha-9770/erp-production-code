export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

/**
 * GET /api/functions/bindings
 *
 * Org-wide list of every FunctionBinding. Powers the "APIs and SDKs"
 * settings page, which gives admins one place to audit / govern all the
 * bindings in their org without drilling into each function.
 *
 * Returns each binding alongside the function it points to and a small
 * label for the scope target (form name, field label + form name, or
 * module name) so the table can render meaningful rows.
 *
 * Optional filters:
 *   ?event=onFieldChange        — single event
 *   ?functionId=<id>            — bindings for one function
 *   ?active=true|false          — only active / inactive
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    if (!authUser.organizationId) {
      return NextResponse.json({ success: true, data: [] })
    }

    const { searchParams } = new URL(request.url)
    const event = searchParams.get("event")
    const functionId = searchParams.get("functionId")
    const activeParam = searchParams.get("active")

    const where: Record<string, any> = { organizationId: authUser.organizationId }
    if (event) where.event = event
    if (functionId) where.functionId = functionId
    if (activeParam === "true") where.active = true
    if (activeParam === "false") where.active = false

    const bindings = await (prisma as any).functionBinding.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      include: {
        function: {
          select: { id: true, name: true, displayName: true, category: true, language: true },
        },
        form: { select: { id: true, name: true } },
        module: { select: { id: true, name: true } },
        field: {
          select: {
            id: true,
            label: true,
            section: { select: { form: { select: { id: true, name: true } } } },
            subform: { select: { form: { select: { id: true, name: true } } } },
          },
        },
      },
    })

    // Flatten the field's parent-form info up so the client doesn't have to
    // walk through section/subform indirection.
    const data = bindings.map((b: any) => {
      let scopeLabel = "—"
      let scopeFormId: string | null = null
      let scopeFormName: string | null = null
      if (b.field) {
        scopeFormId = b.field.section?.form?.id || b.field.subform?.form?.id || null
        scopeFormName = b.field.section?.form?.name || b.field.subform?.form?.name || null
        scopeLabel = scopeFormName ? `${scopeFormName} › ${b.field.label}` : b.field.label
      } else if (b.form) {
        scopeFormId = b.form.id
        scopeFormName = b.form.name
        scopeLabel = b.form.name
      } else if (b.module) {
        scopeLabel = b.module.name
      }
      return {
        ...b,
        scope: {
          kind: b.fieldId ? "field" : b.formId ? "form" : "module",
          label: scopeLabel,
          formId: scopeFormId,
          formName: scopeFormName,
        },
      }
    })

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error("[GET /api/functions/bindings]", err)
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load bindings" },
      { status: 500 }
    )
  }
}
