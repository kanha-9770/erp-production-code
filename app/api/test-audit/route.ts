// Temporary test route: app/api/test-audit/route.ts
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const count = await prisma.auditLog.count()
    const sample = await prisma.auditLog.findFirst({
      include: { user: true }
    })
    return NextResponse.json({ success: true, data: { count, sample } })
  } catch (error) {
    console.error("Error in /api/test-audit:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch audit log" },
      { status: 500 }
    )
  }
}