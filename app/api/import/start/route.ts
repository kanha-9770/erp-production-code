// app/api/import/start/route.ts
//
// Kicks off (or resumes) background processing of a staged import job. Returns
// immediately — the actual work runs in-process after the response is sent.
// On a long-lived Node server (VPS + PM2) the fired promise keeps running; if
// the process is restarted mid-import, calling this again resumes from the
// remaining PENDING rows (the engine only ever claims un-processed work).

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, hasFormPermission } from "@/lib/api-helpers";
import { processImportJob } from "@/lib/import/engine";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: any;
    try {
      body = JSON.parse(await request.text());
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }

    const { importJobId } = body as { importJobId?: string };
    if (!importJobId) {
      return NextResponse.json({ success: false, error: "importJobId is required" }, { status: 400 });
    }

    const job = await prisma.importJob.findUnique({ where: { id: importJobId } });
    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    const allowed = await hasFormPermission(
      authUser.id, authUser.organizationId, job.formId, "IMPORT"
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "You don't have permission to import into this form" },
        { status: 403 }
      );
    }

    if (job.status === "COMPLETED" || job.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, error: `Job already ${job.status}` },
        { status: 409 }
      );
    }

    // Lock in the real total from what was actually staged, so progress % is
    // accurate even if the client miscounted.
    const total = await prisma.importRow.count({ where: { importJobId } });
    if (total === 0) {
      return NextResponse.json(
        { success: false, error: "No rows have been staged for this job" },
        { status: 400 }
      );
    }
    await prisma.importJob.update({
      where: { id: importJobId },
      data: { totalRows: total, status: "PROCESSING", startedAt: job.startedAt ?? new Date() },
    });

    // Fire-and-forget. Errors are handled inside the engine; .catch is a final
    // backstop so an unhandled rejection never crashes the process.
    void processImportJob(importJobId).catch((e) =>
      console.error("[IMPORT-START] background job error:", e)
    );

    return NextResponse.json({ success: true, importJobId, totalRows: total });
  } catch (error: any) {
    console.error("[IMPORT-START] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to start import", details: error.message },
      { status: 500 }
    );
  }
}
