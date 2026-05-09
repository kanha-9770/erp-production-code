/**
 * One-time migration: convert each org's AttendanceConfiguration report*
 * settings into scheduled WorkflowRules. After this runs the legacy
 * attendance-only scheduler can be retired — the generic workflow scheduler
 * will fire the same emails.
 *
 * Idempotency: keyed by rule name (`Attendance daily report`,
 * `Attendance weekly report`, `Attendance monthly report`) per org. Re-running
 * the script updates existing rules in place rather than creating duplicates.
 *
 * Usage:
 *   npx tsx scripts/migrate-attendance-schedules-to-workflows.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

type Cadence = "daily" | "weekly" | "monthly"

interface AttendanceConfig {
  organizationId: string | null
  reportRecipients: any
  reportTimezone: string | null
  reportSendHour: number
  reportDailyEnabled: boolean
  reportWeeklyEnabled: boolean
  reportMonthlyEnabled: boolean
  workflowModuleName: string | null
}

const CADENCES: Cadence[] = ["daily", "weekly", "monthly"]

function ruleNameFor(cadence: Cadence): string {
  return `Attendance ${cadence} report`
}

function recipientCsv(raw: any): string {
  if (!raw) return ""
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string").join(", ")
  if (typeof raw === "string") return raw
  return ""
}

async function migrateOrg(cfg: AttendanceConfig) {
  if (!cfg.organizationId) return { skipped: true, reason: "no organizationId" }

  const orgId = cfg.organizationId
  const recipients = recipientCsv(cfg.reportRecipients)
  if (!recipients) return { skipped: true, reason: "no recipients" }

  // Resolve a creator for the rule — use org owner so the rule survives
  // creator-deletion. AttendanceConfiguration doesn't store who configured it.
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, ownerId: true },
  })
  if (!org?.ownerId) {
    return { skipped: true, reason: `org ${orgId} has no owner — cannot create rule` }
  }

  const enabledByCadence: Record<Cadence, boolean> = {
    daily: cfg.reportDailyEnabled,
    weekly: cfg.reportWeeklyEnabled,
    monthly: cfg.reportMonthlyEnabled,
  }

  const created: string[] = []
  const updated: string[] = []
  const skipped: string[] = []

  for (const cadence of CADENCES) {
    if (!enabledByCadence[cadence]) {
      skipped.push(cadence)
      continue
    }

    const name = ruleNameFor(cadence)
    const existing = await (prisma as any).workflowRule.findFirst({
      where: { organizationId: orgId, name },
      select: { id: true },
    })

    const baseData: any = {
      name,
      description: `Auto-migrated from AttendanceConfiguration on ${new Date().toISOString()}`,
      moduleName: cfg.workflowModuleName || "Attendance",
      executeBasedOn: "schedule",
      conditionType: "all",
      conditions: null,
      scheduleCadence: cadence,
      scheduleHour: cfg.reportSendHour ?? 9,
      scheduleMinute: 0,
      scheduleDayOfWeek: cadence === "weekly" ? 1 : null, // Monday
      scheduleDayOfMonth: cadence === "monthly" ? 1 : null,
      scheduleTimezone: cfg.reportTimezone || null,
      scheduleEnabled: true,
      active: true,
      instantActions: [
        {
          type: "Report Export",
          reportName: `Attendance ${cadence} report`,
          reportDataSource: "attendance",
          reportPeriod: cadence,
          reportTimezone: cfg.reportTimezone || undefined,
          emailToStatic: recipients,
          emailSubject: `[${org.name}] Team attendance ${cadence} report`,
          emailBody: `<p>Attached: the team attendance ${cadence} report.</p>`,
        },
      ],
    }

    if (existing) {
      await (prisma as any).workflowRule.update({
        where: { id: existing.id },
        data: baseData,
      })
      updated.push(`${cadence} (rule ${existing.id})`)
    } else {
      const rule = await (prisma as any).workflowRule.create({
        data: {
          ...baseData,
          organizationId: orgId,
          createdById: org.ownerId,
        },
      })
      created.push(`${cadence} (rule ${rule.id})`)
    }
  }

  return { skipped: false, orgId, orgName: org.name, created, updated, skippedCadences: skipped }
}

async function main() {
  console.log("[migrate] loading active AttendanceConfiguration rows...")
  const configs = await (prisma as any).attendanceConfiguration.findMany({
    where: { isActive: true, organizationId: { not: null } },
    select: {
      organizationId: true,
      reportRecipients: true,
      reportTimezone: true,
      reportSendHour: true,
      reportDailyEnabled: true,
      reportWeeklyEnabled: true,
      reportMonthlyEnabled: true,
      workflowModuleName: true,
    },
  })
  console.log(`[migrate] found ${configs.length} configuration(s)`)

  let totalCreated = 0
  let totalUpdated = 0
  let orgsSkipped = 0

  for (const cfg of configs) {
    const result = await migrateOrg(cfg as AttendanceConfig)
    if ((result as any).skipped) {
      orgsSkipped++
      console.log(`[migrate] org ${cfg.organizationId} — skipped: ${(result as any).reason}`)
    } else {
      const r = result as any
      totalCreated += r.created.length
      totalUpdated += r.updated.length
      console.log(
        `[migrate] org "${r.orgName}" (${r.orgId}) — created: [${r.created.join(", ") || "none"}], updated: [${r.updated.join(", ") || "none"}], skipped cadences: [${r.skippedCadences.join(", ") || "none"}]`,
      )
    }
  }

  console.log(
    `\n[migrate] done. orgs processed: ${configs.length - orgsSkipped}, orgs skipped: ${orgsSkipped}, rules created: ${totalCreated}, rules updated: ${totalUpdated}`,
  )
}

main()
  .catch((err) => {
    console.error("[migrate] failed:", err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
