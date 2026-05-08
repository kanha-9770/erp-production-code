export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"
import { moveToTrash } from "@/lib/trash"
import {
  prepareInstantActionsForWrite,
  redactInstantActionsForRead,
} from "@/lib/workflow/email-secrets"
import { syncWorkflowRule, buildCronExpression } from "@/lib/workflow/scheduler"

// Validate the schedule fields a client may send. Returns an error string if
// invalid (which the route turns into a 400) or null if all good.
function validateScheduleFields(fields: any): string | null {
  if (fields.executeBasedOn !== "schedule") return null
  const cadence = fields.scheduleCadence
  if (!cadence) return "scheduleCadence is required when executeBasedOn = 'schedule'"
  if (!["daily", "weekly", "monthly", "custom"].includes(cadence)) {
    return "scheduleCadence must be one of: daily, weekly, monthly, custom"
  }
  // buildCronExpression also validates the raw cron string for cadence=custom.
  const expr = buildCronExpression({
    cadence,
    cron: fields.scheduleCron ?? null,
    hour: fields.scheduleHour ?? null,
    minute: fields.scheduleMinute ?? null,
    dayOfWeek: fields.scheduleDayOfWeek ?? null,
    dayOfMonth: fields.scheduleDayOfMonth ?? null,
    timezone: fields.scheduleTimezone ?? null,
    enabled: true,
  })
  if (!expr) {
    return cadence === "custom"
      ? "scheduleCron is required and must be a valid 5-field cron expression"
      : "schedule fields are invalid"
  }
  if (fields.scheduleTimezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: fields.scheduleTimezone }).format(new Date())
    } catch {
      return `scheduleTimezone "${fields.scheduleTimezone}" is not a valid IANA name`
    }
  }
  return null
}

const SCHEDULE_FIELD_NAMES = [
  "scheduleCadence",
  "scheduleCron",
  "scheduleHour",
  "scheduleMinute",
  "scheduleDayOfWeek",
  "scheduleDayOfMonth",
  "scheduleTimezone",
  "scheduleEnabled",
] as const

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

    const rules = await (prisma as any).workflowRule.findMany({
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
        scheduleCadence: true,
        scheduleCron: true,
        scheduleHour: true,
        scheduleMinute: true,
        scheduleDayOfWeek: true,
        scheduleDayOfMonth: true,
        scheduleTimezone: true,
        scheduleEnabled: true,
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

    const scheduleErr = validateScheduleFields(body)
    if (scheduleErr) {
      return NextResponse.json(
        { success: false, error: scheduleErr },
        { status: 400 }
      )
    }

    // Encrypt any plaintext SMTP password before storing. New rules have no
    // previous state, so KEPT sentinels (which shouldn't occur on create
    // anyway) resolve to undefined.
    const writableInstantActions = instantActions
      ? prepareInstantActionsForWrite(instantActions, { previous: null })
      : null

    const createData: any = {
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
    }
    for (const f of SCHEDULE_FIELD_NAMES) {
      if (body[f] !== undefined) createData[f] = body[f]
    }

    const rule = await (prisma as any).workflowRule.create({ data: createData })

    // Hot-reload the scheduler — non-fatal if it fails (rule still saved).
    syncWorkflowRule(rule.id).catch((err) =>
      console.error(`[POST /api/workflow-rules] sync failed for ${rule.id}:`, err),
    )

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
    for (const f of SCHEDULE_FIELD_NAMES) {
      if (fields[f] !== undefined) updateData[f] = fields[f]
    }

    // Validate schedule shape if any schedule field changed OR the trigger is
    // being switched to schedule mode. Use the merged view (existing + patch)
    // so partial updates pass when the unchanged fields are already valid.
    const incomingExecuteBasedOn = fields.executeBasedOn ?? existing.executeBasedOn
    if (
      incomingExecuteBasedOn === "schedule" &&
      (fields.executeBasedOn !== undefined ||
        SCHEDULE_FIELD_NAMES.some((f) => fields[f] !== undefined))
    ) {
      const merged: any = { ...existing, ...updateData }
      const scheduleErr = validateScheduleFields(merged)
      if (scheduleErr) {
        return NextResponse.json(
          { success: false, error: scheduleErr },
          { status: 400 }
        )
      }
    }

    const updated = await (prisma as any).workflowRule.update({
      where: { id },
      data: updateData,
    })

    // Hot-reload scheduler — covers active toggle, schedule edits, and
    // executeBasedOn flips.
    syncWorkflowRule(id).catch((err) =>
      console.error(`[PUT /api/workflow-rules] sync failed for ${id}:`, err),
    )

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

    await moveToTrash("WorkflowRule", id, {
      userId: authUser.id,
      userName: authUser.email,
      organizationId: authUser.organizationId,
    })

    // Tear down any in-process schedule for this rule (sync notices it's gone).
    syncWorkflowRule(id).catch((err) =>
      console.error(`[DELETE /api/workflow-rules] sync failed for ${id}:`, err),
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[DELETE /api/workflow-rules]", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to delete workflow rule" },
      { status: 500 }
    )
  }
}
