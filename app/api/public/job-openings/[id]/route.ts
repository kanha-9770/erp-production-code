/**
 * Public job-opening details — powers the shareable application page
 * (/apply/[jobId]). No authentication: returns a job ONLY when it is OPEN and
 * explicitly published to the website. Exposes just what the public form needs
 * (no internal/org-sensitive fields beyond the org's display name + logo).
 *
 *   GET /api/public/job-openings/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const db = prisma as any;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const opening = await db.jobOpening.findFirst({
    where: { id, publishOnWebsite: true, status: "OPEN" },
    select: {
      id: true,
      profileName: true,
      department: true,
      designation: true,
      employmentType: true,
      salaryApprox: true,
      jobDescription: true,
      vacancies: true,
      organizationId: true,
    },
  });

  if (!opening) {
    return NextResponse.json(
      { success: false, error: "This job is not currently accepting applications." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  let organizationName: string | null = null;
  let logoUrl: string | null = null;
  if (opening.organizationId) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: opening.organizationId },
        select: { name: true, profile: true },
      });
      organizationName = org?.name ?? null;
      const profile = (org?.profile ?? {}) as Record<string, unknown>;
      logoUrl = typeof profile.logoUrl === "string" ? profile.logoUrl : null;
    } catch {
      /* non-fatal — page still renders without branding */
    }
  }

  return NextResponse.json(
    {
      success: true,
      job: {
        id: opening.id,
        title: opening.profileName,
        department: opening.department,
        designation: opening.designation,
        employmentType: opening.employmentType,
        salaryApprox: opening.salaryApprox,
        jobDescription: opening.jobDescription,
        vacancies: opening.vacancies,
        organizationName,
        logoUrl,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
