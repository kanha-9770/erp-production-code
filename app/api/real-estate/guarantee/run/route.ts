/**
 * POST /api/real-estate/guarantee/run
 * Admin: trigger monthly leader guarantee payouts for a given period.
 * Body: { year: number, month: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processMonthlyGuarantees } from "@/lib/real-estate/slab-engine";

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const year = Number(body.year);
  const month = Number(body.month);

  if (!year || month < 1 || month > 12) {
    return NextResponse.json({ error: "Valid year and month (1-12) required." }, { status: 400 });
  }

  const result = await (prisma as any).$transaction(async (tx: any) => {
    return processMonthlyGuarantees(tx, session.organizationId, year, month, session.userId);
  });

  return NextResponse.json({ data: result });
}
