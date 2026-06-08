// app/api/import/stage/route.ts
//
// Durably stages a batch of parsed source rows into the import_rows table as
// PENDING work items. The client uploads the whole file this way (in batches)
// BEFORE processing starts, so the actual import is driven server-side and
// survives the browser closing. Idempotency on retry is handled by the unique
// (importJobId, rowNumber) pairing — re-staging the same rowNumber is skipped.

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, hasFormPermission } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

    const { importJobId, rows, startRowNumber } = body as {
      importJobId?: string;
      rows?: Record<string, any>[];
      startRowNumber?: number;
    };

    if (!importJobId || !Array.isArray(rows)) {
      return NextResponse.json(
        { success: false, error: "importJobId and rows[] are required" },
        { status: 400 }
      );
    }
    if (rows.length === 0) {
      return NextResponse.json({ success: true, staged: 0 });
    }

    const job = await prisma.importJob.findUnique({ where: { id: importJobId } });
    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: `Cannot stage into a job that is ${job.status}` },
        { status: 409 }
      );
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

    const base = typeof startRowNumber === "number" ? startRowNumber : 0;
    const data = rows.map((raw, i) => ({
      importJobId,
      rowNumber: base + i,
      rawData: raw as any,
      status: "PENDING",
    }));

    const result = await prisma.importRow.createMany({ data, skipDuplicates: true });

    return NextResponse.json({ success: true, staged: result.count });
  } catch (error: any) {
    console.error("[IMPORT-STAGE] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to stage rows", details: error.message },
      { status: 500 }
    );
  }
}
