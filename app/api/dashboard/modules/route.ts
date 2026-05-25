import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/modules
 *
 * Returns the modules the current user is permitted to see, each with
 * its forms and aggregated record counts across the 15 FormRecord
 * partition tables. Heavy enough that the dashboard skips it on first
 * paint and triggers it on demand (RTK Query, lazy).
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

    const userId = authUser.id;
    const orgId = authUser.organizationId;

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
      include: {
        forms: {
          select: {
            id: true,
            name: true,
            isPublished: true,
            _count: {
              select: {
                records1: true, records2: true, records3: true, records4: true,
                records5: true, records6: true, records7: true, records8: true,
                records9: true, records10: true, records11: true, records12: true,
                records13: true, records14: true, records15: true,
                sections: true,
              },
            },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const formatted = modules.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      icon: m.icon,
      color: m.color,
      moduleType: m.moduleType,
      forms: m.forms.map((f) => {
        const totalRecords =
          f._count.records1 + f._count.records2 + f._count.records3 +
          f._count.records4 + f._count.records5 + f._count.records6 +
          f._count.records7 + f._count.records8 + f._count.records9 +
          f._count.records10 + f._count.records11 + f._count.records12 +
          f._count.records13 + f._count.records14 + f._count.records15;
        return {
          id: f.id,
          name: f.name,
          isPublished: f.isPublished,
          totalRecords,
          sectionCount: f._count.sections,
        };
      }),
      totalRecords: m.forms.reduce((sum, f) => {
        return (
          sum +
          f._count.records1 + f._count.records2 + f._count.records3 +
          f._count.records4 + f._count.records5 + f._count.records6 +
          f._count.records7 + f._count.records8 + f._count.records9 +
          f._count.records10 + f._count.records11 + f._count.records12 +
          f._count.records13 + f._count.records14 + f._count.records15
        );
      }, 0),
    }));

    return NextResponse.json({ success: true, modules: formatted });
  } catch (error) {
    console.error("[dashboard/modules] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load modules" },
      { status: 500 },
    );
  }
}

// Same permission resolver the server-side analytics action uses. Inlined
// here so this route is self-contained and the analytics module stays a
// pure server action (can't be imported from a route handler).
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
