/**
 * Per-employee, shift-aware check-in reminder.
 *
 * A single in-process cron job (registered from instrumentation.ts) ticks
 * every minute. On each tick, for every org that has
 * AttendanceConfiguration.checkInReminderMinutes set, it:
 *
 *   1. Skips the whole org if today is a holiday or weekly-off (reuses the
 *      same rules the workflow scheduler uses).
 *   2. Loads active employees that have a linked user account.
 *   3. Resolves each employee's OWN shift start (Employee Master inTime via
 *      getEffectiveShift, falling back to the org default).
 *   4. If "now" (in the org timezone) is within the same minute as
 *      (shiftStart − reminderMinutes), and the employee hasn't checked in
 *      today, sends a push + in-app notification.
 *
 * So staff on different shifts are each reminded the configured number of
 * minutes before *their* start — not a single fixed time.
 *
 * De-dup: an in-memory set keyed by `${userId}:${dateKey}` ensures one
 * reminder per employee per day even though the job ticks 60×/hour. The set is
 * pruned to today's keys on each run so it can't grow unbounded. (On a multi-
 * replica deploy each replica keeps its own set, so guard with
 * DISABLE_WORKFLOW_SCHEDULER=1 on all-but-one — same constraint the workflow
 * scheduler already documents.)
 */

import cron, { type ScheduledTask } from "node-cron"
import { prisma } from "@/lib/prisma"
import { getAttendanceConfig } from "@/lib/hr/attendance-config"
import {
  getEffectiveShift,
  orgTimezone,
  todayKey,
} from "@/lib/hr/attendance-service"
import { sendPushToUsers } from "@/lib/push/server"

let task: ScheduledTask | null = null

// `${userId}:${YYYY-MM-DD}` for reminders already sent. Pruned each tick.
const sentToday = new Set<string>()

// HH:mm → minutes since midnight. Returns null on malformed input.
function hhmmToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

// Current wall-clock minutes-since-midnight in the given IANA timezone.
function nowMinutesInTz(tz: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date())
    const h = Number(parts.find((p) => p.type === "hour")?.value)
    const min = Number(parts.find((p) => p.type === "minute")?.value)
    if (Number.isNaN(h) || Number.isNaN(min)) return null
    // Intl can emit "24" for midnight in some runtimes — normalise.
    return ((h % 24) * 60 + min)
  } catch {
    return null
  }
}

// Is today a non-working day for the org (weekly-off or non-optional holiday)?
async function isOrgNonWorkingDay(
  organizationId: string,
  tz: string,
  weeklyOffDays: number[],
): Promise<boolean> {
  try {
    // Weekly-off (0 = Sun … 6 = Sat) in the org timezone.
    const weekdayName = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    }).format(new Date())
    const dowMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    }
    const dow = dowMap[weekdayName]
    if (dow !== undefined && weeklyOffDays.includes(dow)) return true

    // Non-optional holiday on today's date.
    const today = todayKey(new Date(), tz)
    const holiday = await (prisma as any).holiday.findFirst({
      where: { organizationId, date: today, isOptional: false },
      select: { id: true },
    })
    return !!holiday
  } catch {
    return false // never block reminders on a lookup glitch
  }
}

async function runReminderTick(): Promise<void> {
  // Find org configs that have reminders enabled. The column may be absent on
  // a stale Prisma client — fall back to scanning all configs then filtering.
  let configs: Array<{ organizationId: string | null }> = []
  try {
    configs = await (prisma as any).attendanceConfiguration.findMany({
      where: { isActive: true, checkInReminderMinutes: { gt: 0 } },
      select: { organizationId: true },
    })
  } catch {
    try {
      const all = await (prisma as any).attendanceConfiguration.findMany({
        where: { isActive: true },
        select: { organizationId: true },
      })
      configs = all
    } catch {
      return
    }
  }

  for (const c of configs) {
    if (!c.organizationId) continue
    try {
      await runOrgReminders(c.organizationId)
    } catch (err: any) {
      console.warn(
        `[checkin-reminder] org ${c.organizationId} tick failed:`,
        err?.message || err,
      )
    }
  }

  // Prune the de-dup set to today's keys so it can't grow forever. We don't
  // know each org's tz precisely here, so keep any key whose date matches
  // today in UTC or the previous UTC day (covers tz offsets).
  const todayUtc = new Date().toISOString().slice(0, 10)
  for (const key of sentToday) {
    const date = key.slice(key.indexOf(":") + 1)
    if (date !== todayUtc) {
      // Keep yesterday's keys briefly only if still "today" somewhere; simplest
      // safe choice is to drop anything not matching UTC today. Tz windows are
      // minutes wide, so a stale key just means at worst one missed dedup at a
      // date boundary — acceptable and self-heals next day.
      sentToday.delete(key)
    }
  }
}

async function runOrgReminders(organizationId: string): Promise<void> {
  const cfg = await getAttendanceConfig(organizationId)
  const lead = cfg.checkInReminderMinutes
  if (!lead || lead <= 0) return

  const tz = orgTimezone(cfg)
  const nowMin = nowMinutesInTz(tz)
  if (nowMin == null) return

  // Whole-org skip on holidays / weekly-offs.
  if (await isOrgNonWorkingDay(organizationId, tz, cfg.weeklyOffDays)) return

  const dateKey = todayKey(new Date(), tz)

  // Active employees with a linked user account. enforceEmployeeActive only
  // gates punches; for reminders we always target ACTIVE employees.
  const employees = await prisma.employee.findMany({
    where: {
      userId: { not: null },
      status: "ACTIVE",
      user: { organizationId },
    },
    select: { userId: true, employeeName: true },
  })
  if (employees.length === 0) return

  for (const emp of employees) {
    const userId = emp.userId
    if (!userId) continue

    // Per-employee shift window (Employee Master inTime/outTime → org default).
    const shift = await getEffectiveShift(userId, cfg)
    const startMin = hhmmToMinutes(shift.start)
    const endMin = hhmmToMinutes(shift.end)

    // ── Check-IN reminder: `lead` minutes before the shift START ──────────
    if (startMin != null && nowMin === startMin - lead) {
      const dedupKey = `in:${userId}:${dateKey}`
      if (!sentToday.has(dedupKey)) {
        const row = await prisma.attendance.findFirst({
          where: { userId, date: dateKey },
          select: { checkedIn: true },
        })
        // Only nudge people who haven't checked in yet.
        if (row?.checkedIn) {
          sentToday.add(dedupKey)
        } else {
          await sendReminder(
            userId,
            organizationId,
            dateKey,
            "in",
            "⏰ Shift starting soon",
            `Your shift starts at ${formatHHmm12(shift.start)}. Don't forget to check in!`,
          )
          sentToday.add(dedupKey)
        }
      }
    }

    // ── Check-OUT reminder: `lead` minutes before the shift END ───────────
    if (endMin != null && nowMin === endMin - lead) {
      const dedupKey = `out:${userId}:${dateKey}`
      if (!sentToday.has(dedupKey)) {
        const row = await prisma.attendance.findFirst({
          where: { userId, date: dateKey },
          select: { checkedIn: true, checkedOut: true },
        })
        // Only remind people who ARE checked in but haven't checked out yet —
        // no point reminding someone who never came in or already left.
        if (row?.checkedIn && !row?.checkedOut) {
          await sendReminder(
            userId,
            organizationId,
            dateKey,
            "out",
            "🔔 Shift ending soon",
            `Your shift ends at ${formatHHmm12(shift.end)}. Don't forget to check out!`,
          )
        }
        sentToday.add(dedupKey)
      }
    }
  }
}

// Send one reminder via both channels (in-app bell row + phone push). `kind`
// keeps the push tag distinct so a check-in and check-out reminder on the same
// day don't collapse into one banner.
async function sendReminder(
  userId: string,
  organizationId: string,
  dateKey: string,
  kind: "in" | "out",
  title: string,
  body: string,
): Promise<void> {
  try {
    await (prisma as any).notification.create({
      data: {
        recipientId: userId,
        organizationId,
        title,
        body,
        moduleName: "Attendance",
        link: "/attendance",
      },
    })
  } catch (err: any) {
    console.warn(
      `[checkin-reminder] in-app notification failed for ${userId}:`,
      err?.message || err,
    )
  }
  void sendPushToUsers([userId], {
    title,
    body,
    url: "/attendance",
    tag: `${kind === "in" ? "checkin" : "checkout"}-reminder:${dateKey}`,
  }).catch(() => {})
}

// "09:30" → "9:30 AM". Local copy so we don't pull the client-only helper.
function formatHHmm12(hhmm: string): string {
  const min = hhmmToMinutes(hhmm)
  if (min == null) return hhmm
  let h = Math.floor(min / 60)
  const m = min % 60
  const period = h < 12 ? "AM" : "PM"
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${String(m).padStart(2, "0")} ${period}`
}

/**
 * Start the once-a-minute reminder ticker. Idempotent — safe to call from
 * instrumentation; a second call is a no-op.
 */
export function startCheckInReminderScheduler(): void {
  if (task) return
  try {
    task = cron.schedule("* * * * *", () => {
      runReminderTick().catch((err) => {
        console.error(
          "[checkin-reminder] tick threw:",
          err?.message || err,
        )
      })
    })
    console.log("[checkin-reminder] started — ticking every minute")
  } catch (err: any) {
    console.error("[checkin-reminder] failed to start:", err?.message || err)
    task = null
  }
}
