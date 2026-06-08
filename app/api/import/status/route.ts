// app/api/import/status/route.ts
//
// Lightweight polling endpoint for the import wizard. Returns the job's live
// counters so the UI can show progress and a final summary — and works even
// after a page reload, since all state lives in the DB.

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const importJobId = request.nextUrl.searchParams.get("importJobId");
    if (!importJobId) {
      return NextResponse.json({ success: false, error: "importJobId is required" }, { status: 400 });
    }

    const job = await prisma.importJob.findUnique({
      where: { id: importJobId },
      select: {
        id: true, status: true, totalRows: true, processedRows: true,
        successRows: true, failedRows: true, fileName: true,
        startedAt: true, completedAt: true,
      },
    });
    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    const pending = await prisma.importRow.count({
      where: { importJobId, status: { in: ["PENDING", "PROCESSING"] } },
    });
    const skipped = await prisma.importRow.count({
      where: { importJobId, status: "SKIPPED" },
    });

    const total = job.totalRows || 0;
    const done = total - pending;
    const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    const isTerminal = job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED";

    return NextResponse.json({
      success: true,
      job: {
        ...job,
        skippedRows: skipped,
        pendingRows: pending,
        percent,
        isTerminal,
      },
    });
  } catch (error: any) {
    console.error("[IMPORT-STATUS] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch status", details: error.message },
      { status: 500 }
    );
  }
}
