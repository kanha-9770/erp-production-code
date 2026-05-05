export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"
import { moveToTrash } from "@/lib/trash"

const VALID_EVENTS = new Set([
  "onFieldChange",
  "onFieldBlur",
  "beforeSubmit",
  "afterCreate",
  "afterUpdate",
  "manual",
])

interface Params {
  params: { id: string; bindingId: string }
}

/** PUT /api/functions/[id]/bindings/[bindingId] — update a binding. */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const existing = await (prisma as any).functionBinding.findFirst({
      where: {
        id: params.bindingId,
        functionId: params.id,
        organizationId: authUser.organizationId,
      },
    })
    if (!existing) {
      return NextResponse.json({ success: false, error: "Binding not found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({} as any))
    const update: Record<string, any> = {}

    if (typeof body.event === "string") {
      if (!VALID_EVENTS.has(body.event)) {
        return NextResponse.json(
          { success: false, error: "Invalid event" },
          { status: 400 }
        )
      }
      update.event = body.event
    }
    if (body.inputMapping !== undefined) update.inputMapping = body.inputMapping
    if (body.outputMapping !== undefined) update.outputMapping = body.outputMapping
    if (body.condition !== undefined) update.condition = body.condition
    if (typeof body.active === "boolean") update.active = body.active
    if (typeof body.order === "number") update.order = body.order

    // Allow re-scoping (rare, but cheap to support). When we rescope, the
    // other two scope fields are explicitly nulled to keep the "exactly one"
    // invariant. Skipped entirely if no scope key is in the request.
    const scopeKeys = ["formId", "fieldId", "moduleId"] as const
    const scopePresent = scopeKeys.some((k) => k in body)
    if (scopePresent) {
      const newScope = {
        formId: body.formId || null,
        fieldId: body.fieldId || null,
        moduleId: body.moduleId || null,
      }
      const set = scopeKeys.filter((k) => newScope[k]).length
      if (set !== 1) {
        return NextResponse.json(
          { success: false, error: "Exactly one of formId / fieldId / moduleId must be set" },
          { status: 400 }
        )
      }
      Object.assign(update, newScope)
    }

    const updated = await (prisma as any).functionBinding.update({
      where: { id: params.bindingId },
      data: update,
    })
    return NextResponse.json({ success: true, data: updated })
  } catch (err: any) {
    console.error("[PUT /api/functions/[id]/bindings/[bindingId]]", err)
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update binding" },
      { status: 500 }
    )
  }
}

/** DELETE /api/functions/[id]/bindings/[bindingId] — remove a binding. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const authUser = await getAuthenticatedUser(_request)
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const existing = await (prisma as any).functionBinding.findFirst({
      where: {
        id: params.bindingId,
        functionId: params.id,
        organizationId: authUser.organizationId,
      },
    })
    if (!existing) {
      return NextResponse.json({ success: false, error: "Binding not found" }, { status: 404 })
    }

    await moveToTrash("FunctionBinding", params.bindingId, {
      userId: authUser.id,
      userName: authUser.email,
      organizationId: authUser.organizationId,
    })

    // Recompute the function's `associated` flag — false if no bindings remain.
    const remaining = await (prisma as any).functionBinding.count({
      where: { functionId: params.id },
    })
    if (remaining === 0) {
      await prisma.crmFunction.update({
        where: { id: params.id },
        data: { associated: false },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[DELETE /api/functions/[id]/bindings/[bindingId]]", err)
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to delete binding" },
      { status: 500 }
    )
  }
}
