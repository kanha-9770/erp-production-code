import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { getDateRange } from "@/lib/utils/date-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/time-series
 *
 * Daily submission counts (the user's own submissions) across the 15
 * FormRecord partition tables, restricted to forms the user has VIEW
 * access to. Heavy enough that the dashboard fetches it on-demand only
 * when the user opens the "Submission Trend" panel.
 *
 * Query params:
 *   - dateRange: any value accepted by getDateRange (defaults to "30days")
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const dateRange = url.searchParams.get("dateRange") || "30days";
    const { startDate, endDate } = getDateRange(dateRange);

    const userId = authUser.id;
    const orgId = authUser.organizationId;

    // Re-resolve permitted form IDs here. We can't share the modules
    // response because the time-series endpoint can be called without
    // the modules panel ever opening.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        unitAssignments: {
          include: {
            role: { select: { id: true, isActive: true } },
            unit: { select: { id: true, isActive: true } },
          },
        },
      },
    });
    const roleIds =
      user?.unitAssignments
        .filter((ua) => ua.role.isActive && ua.unit.isActive)
        .map((ua) => ua.role.id) || [];
    const permittedModuleIds = await getPermittedModuleIds(userId, roleIds);

    const modules = await prisma.formModule.findMany({
      where: {
        isActive: true,
        ...(orgId && { organizationId: orgId }),
        ...(permittedModuleIds.length > 0
          ? { id: { in: permittedModuleIds } }
          : { id: { in: [] } }),
      },
      select: { forms: { select: { id: true } } },
    });
    const permittedFormIds = modules.flatMap((m) => m.forms.map((f) => f.id));

    // Submission counts across 15 partition tables. Also returns the
    // total submission count so the client can fill in the
    // "My Submissions" tile that summary deferred.
    const timeSeries: Record<string, number> = {};
    let totalSubmissions = 0;
    if (permittedFormIds.length > 0) {
      for (let t = 1; t <= 15; t++) {
        const model = `formRecord${t}` as keyof typeof prisma;
        const records = await (prisma[model] as any).findMany({
          where: {
            userId,
            formId: { in: permittedFormIds },
            submittedAt: { gte: startDate, lte: endDate },
          },
          select: { submittedAt: true },
        });
        records.forEach((r: any) => {
          const d = new Date(r.submittedAt).toISOString().split("T")[0];
          timeSeries[d] = (timeSeries[d] || 0) + 1;
          totalSubmissions += 1;
        });
      }
    }

    const series = Object.entries(timeSeries)
      .map(([date, count]) => ({ date, submissions: count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      timeSeries: series,
      totalSubmissions,
    });
  } catch (error) {
    console.error("[dashboard/time-series] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load submission trend" },
      { status: 500 },
    );
  }
}

async function getPermittedModuleIds(
  userId: string,
  roleIds: string[],
): Promise<string[]> {
  const allowedSet = new Set<string>();

  if (roleIds.length > 0) {
    const roleModulePerms = await prisma.rolePermission.findMany({
      where: {
        roleId: { in: roleIds },
        granted: true,
        moduleId: { not: null },
        permission: { name: "VIEW" },
      },
      select: { moduleId: true },
    });
    for (const rmp of roleModulePerms) {
      if (rmp.moduleId) allowedSet.add(rmp.moduleId);
    }
  }

  const userModulePerms = await prisma.userPermission.findMany({
    where: {
      userId,
      isActive: true,
      moduleId: { not: null },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { moduleId: true, canView: true, granted: true },
  });

  for (const ump of userModulePerms) {
    if (!ump.moduleId) continue;
    if (ump.canView && ump.granted) {
      allowedSet.add(ump.moduleId);
    } else {
      allowedSet.delete(ump.moduleId);
    }
  }

  return [...allowedSet];
}
