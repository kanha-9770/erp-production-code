// app/api/import/errors/route.ts
//
// Streams a CSV of the rows that failed during an import — the original source
// columns plus the row number and the failure reason — so the user can fix and
// re-import just the failures.

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, hasFormPermission } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

function csvCell(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote if the value contains a comma, quote, or newline; double inner quotes.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const importJobId = request.nextUrl.searchParams.get("importJobId");
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
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const failedRows = await prisma.importRow.findMany({
    where: { importJobId, status: "FAILED" },
    orderBy: { rowNumber: "asc" },
    select: { rowNumber: true, errorMessage: true, rawData: true },
  });

  // Union of all source columns across the failed rows so nothing is dropped.
  const columns = new Set<string>();
  for (const r of failedRows) {
    const data = (r.rawData || {}) as Record<string, any>;
    Object.keys(data).forEach((k) => columns.add(k));
  }
  const cols = Array.from(columns);

  const headerLine = ["Row #", "Error", ...cols].map(csvCell).join(",");
  const lines = failedRows.map((r) => {
    const data = (r.rawData || {}) as Record<string, any>;
    return [r.rowNumber, r.errorMessage || "Unknown error", ...cols.map((c) => data[c])]
      .map(csvCell)
      .join(",");
  });

  const csv = [headerLine, ...lines].join("\r\n");
  const safeName = (job.fileName || "import").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}_errors.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
