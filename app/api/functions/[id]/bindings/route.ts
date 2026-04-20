export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"

const VALID_EVENTS = new Set([
  "onFieldChange",
  "onFieldBlur",
  "beforeSubmit",
  "afterCreate",
  "afterUpdate",
  "manual",
])

/** GET /api/functions/[id]/bindings — list bindings for a function. */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    if (!authUser.organizationId) {
      return NextResponse.json({ success: true, data: [] })
    }

    const fn = await prisma.crmFunction.findFirst({
      where: { id: params.id, organizationId: authUser.organizationId },
      select: { id: true },
    })
    if (!fn) {
      return NextResponse.json({ success: false, error: "Function not found" }, { status: 404 })
    }

    const bindings = await (prisma as any).functionBinding.findMany({
      where: { functionId: params.id, organizationId: authUser.organizationId },
      orderBy: [{ event: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    })

    return NextResponse.json({ success: true, data: bindings })
  } catch (err) {
    console.error("[GET /api/functions/[id]/bindings]", err)
    return NextResponse.json(
      { success: false, error: "Failed to load bindings" },
      { status: 500 }
    )
  }
}

/** POST /api/functions/[id]/bindings — create a binding. */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({} as any))
    const {
      event,
      formId,
      fieldId,
      moduleId,
      inputMapping,
      outputMapping,
      condition,
      active,
      order,
    } = body || {}

    if (typeof event !== "string" || !VALID_EVENTS.has(event)) {
      return NextResponse.json(
        { success: false, error: `Invalid event. Must be one of: ${Array.from(VALID_EVENTS).join(", ")}` },
        { status: 400 }
      )
    }
    const scopeCount = [formId, fieldId, moduleId].filter(Boolean).length
    if (scopeCount !== 1) {
      return NextResponse.json(
        { success: false, error: "Exactly one of formId / fieldId / moduleId is required" },
        { status: 400 }
      )
    }

    const fn = await prisma.crmFunction.findFirst({
      where: { id: params.id, organizationId: authUser.organizationId },
      select: { id: true },
    })
    if (!fn) {
      return NextResponse.json({ success: false, error: "Function not found" }, { status: 404 })
    }

    // Verify the scope target belongs to the same organization.
    if (formId) {
      const ok = await prisma.form.findFirst({
        where: { id: formId, module: { organizationId: authUser.organizationId } },
        select: { id: true },
      })
      if (!ok) return NextResponse.json({ success: false, error: "Form not found" }, { status: 404 })
    } else if (fieldId) {
      const ok = await prisma.formField.findFirst({
        where: {
          id: fieldId,
          OR: [
            { section: { form: { module: { organizationId: authUser.organizationId } } } },
            { subform: { form: { module: { organizationId: authUser.organizationId } } } },
          ],
        },
        select: { id: true },
      })
      if (!ok) return NextResponse.json({ success: false, error: "Field not found" }, { status: 404 })
    } else if (moduleId) {
      const ok = await prisma.formModule.findFirst({
        where: { id: moduleId, organizationId: authUser.organizationId },
        select: { id: true },
      })
      if (!ok) return NextResponse.json({ success: false, error: "Module not found" }, { status: 404 })
    }

    const created = await (prisma as any).functionBinding.create({
      data: {
        functionId: params.id,
        organizationId: authUser.organizationId,
        event,
        formId: formId || null,
        fieldId: fieldId || null,
        moduleId: moduleId || null,
        inputMapping: inputMapping ?? {},
        outputMapping: outputMapping ?? {},
        condition: condition ?? null,
        active: active ?? true,
        order: typeof order === "number" ? order : 0,
      },
    })

    // Mark the function as "associated" so the list view can badge it.
    await prisma.crmFunction.update({
      where: { id: params.id },
      data: { associated: true },
    })

    return NextResponse.json({ success: true, data: created })
  } catch (err: any) {
    console.error("[POST /api/functions/[id]/bindings]", err)
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to create binding" },
      { status: 500 }
    )
  }
}
