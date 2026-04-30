export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"
import {
  prepareInstantActionsForWrite,
  redactInstantActionsForRead,
} from "@/lib/workflow/email-secrets"

/**
 * GET /api/workflow-rules?moduleName=xxx
 * Returns all workflow rules for the user's organization.
 * Optionally filter by moduleName.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!authUser.organizationId) {
      return NextResponse.json({ success: true, data: [] })
    }

    const { searchParams } = new URL(request.url)
    const moduleName = searchParams.get("moduleName")

    const where: any = { organizationId: authUser.organizationId }
    if (moduleName) where.moduleName = moduleName

    const rules = await prisma.workflowRule.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        moduleName: true,
        executeBasedOn: true,
        recordAction: true,
        dateField: true,
        conditionType: true,
        conditions: true,
        instantActions: true,
        scheduledExecute: true,
        scheduledUnit: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    // Mask any stored SMTP passwords with a sentinel so plaintext (or even
    // ciphertext) never reaches the browser. The UI treats the sentinel as
    // "password on file — leave the input blank to keep it."
    const safeRules = rules.map((r) => ({
      ...r,
      instantActions: redactInstantActionsForRead(r.instantActions as any, r.id),
    }))

    return NextResponse.json({ success: true, data: safeRules })
  } catch (error) {
    console.error("[GET /api/workflow-rules]", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch workflow rules" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/workflow-rules
 * Create a new workflow rule.
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const body = await request.json()
    const {
      name,
      description,
      moduleName,
      executeBasedOn,
      recordAction,
      dateField,
      conditionType,
      conditions,
      instantActions,
      scheduledExecute,
      scheduledUnit,
    } = body

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Rule name is required" },
        { status: 400 }
      )
    }
    if (!moduleName) {
      return NextResponse.json(
        { success: false, error: "Module name is required" },
        { status: 400 }
      )
    }
    if (!executeBasedOn) {
      return NextResponse.json(
        { success: false, error: "Execute based on is required" },
        { status: 400 }
      )
    }

    // Encrypt any plaintext SMTP password before storing. New rules have no
    // previous state, so KEPT sentinels (which shouldn't occur on create
    // anyway) resolve to undefined.
    const writableInstantActions = instantActions
      ? prepareInstantActionsForWrite(instantActions, { previous: null })
      : null

    const rule = await prisma.workflowRule.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        moduleName,
        executeBasedOn,
        recordAction: recordAction || null,
        dateField: dateField || null,
        conditionType: conditionType || "all",
        conditions: conditions || null,
        instantActions: writableInstantActions,
        scheduledExecute: scheduledExecute || null,
        scheduledUnit: scheduledUnit || null,
        organizationId: authUser.organizationId,
        createdById: authUser.id,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        ...rule,
        instantActions: redactInstantActionsForRead(rule.instantActions as any, rule.id),
      },
    })
  } catch (error) {
    console.error("[POST /api/workflow-rules]", error)
    return NextResponse.json(
      { success: false, error: "Failed to create workflow rule" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/workflow-rules
 * Update an existing workflow rule.
 * Body: { id, ...fields }
 */
export async function PUT(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Rule id is required" },
        { status: 400 }
      )
    }

    const existing = await prisma.workflowRule.findFirst({
      where: { id, organizationId: authUser.organizationId },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Workflow rule not found" },
        { status: 404 }
      )
    }

    const updateData: Record<string, any> = {}
    if (fields.name?.trim()) updateData.name = fields.name.trim()
    if (fields.description !== undefined) updateData.description = fields.description?.trim() || null
    if (fields.executeBasedOn) updateData.executeBasedOn = fields.executeBasedOn
    if (fields.recordAction !== undefined) updateData.recordAction = fields.recordAction || null
    if (fields.dateField !== undefined) updateData.dateField = fields.dateField || null
    if (fields.conditionType) updateData.conditionType = fields.conditionType
    if (fields.conditions !== undefined) updateData.conditions = fields.conditions
    if (fields.instantActions !== undefined) {
      // Encrypt new plaintext SMTP password OR restore the stored ciphertext
      // when the client sends back the `__KEPT__:<id>` sentinel from the
      // last GET (it has no plaintext to send).
      updateData.instantActions = prepareInstantActionsForWrite(
        fields.instantActions,
        { previous: existing.instantActions }
      )
    }
    if (fields.scheduledExecute !== undefined) updateData.scheduledExecute = fields.scheduledExecute || null
    if (fields.scheduledUnit !== undefined) updateData.scheduledUnit = fields.scheduledUnit || null
    if (fields.active !== undefined) updateData.active = fields.active

    const updated = await prisma.workflowRule.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        instantActions: redactInstantActionsForRead(updated.instantActions as any, updated.id),
      },
    })
  } catch (error) {
    console.error("[PUT /api/workflow-rules]", error)
    return NextResponse.json(
      { success: false, error: "Failed to update workflow rule" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/workflow-rules?id=xxx
 * Delete a workflow rule.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Rule id is required" },
        { status: 400 }
      )
    }

    const existing = await prisma.workflowRule.findFirst({
      where: { id, organizationId: authUser.organizationId },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Workflow rule not found" },
        { status: 404 }
      )
    }

    await prisma.workflowRule.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[DELETE /api/workflow-rules]", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete workflow rule" },
      { status: 500 }
    )
  }
}
