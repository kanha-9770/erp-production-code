// lib/audit.ts
import { prisma } from "@/lib/prisma"

export async function logAudit({
  userId,
  performedBy,
  action,
  module,
  recordId,
  recordName,
  details,
  ipAddress,
  userAgent,
}: {
  userId?: string
  performedBy: string
  action: string
  module: string
  recordId?: string
  recordName?: string
  details?: string
  ipAddress?: string
  userAgent?: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        performedBy,
        action,
        module,
        recordId: recordId || null,
        organizationId: user?.organizationId || null,
        recordName: recordName || null,
        details: details || null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    })
  } catch (error) {
    console.error("Audit log failed:", error)
  }
}