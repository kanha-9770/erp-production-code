// Temporary test route: app/api/test-audit/route.ts
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  const count = await prisma.auditLog.count()
  const sample = await prisma.auditLog.findFirst({
    include: { user: true }
  })
  return NextResponse.json({ count, sample })
}