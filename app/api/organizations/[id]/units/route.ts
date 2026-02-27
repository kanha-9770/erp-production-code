// app/api/organizations/[id]/units/route.ts

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const organizationId = params.id;

    // Validate organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      return NextResponse.json(
        { error: `Organization with id ${organizationId} not found` },
        { status: 404 }
      );
    }

    const units = await prisma.organizationUnit.findMany({
      where: {
        organizationId,
      },
      include: {
        unitRoles: {
          include: {
            role: true,
          },
        },
        userAssignments: {
          include: {
            user: true,
            role: true,
          },
        },
        children: {
          include: {
            unitRoles: {
              include: {
                role: true,
              },
            },
            userAssignments: {
              include: {
                user: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });

    // Build hierarchical structure
    const buildHierarchy = (units: any[], parentId: string | null = null): any[] => {
      return units
        .filter((unit) => unit.parentId === parentId)
        .map((unit) => ({
          ...unit,
          children: buildHierarchy(units, unit.id),
          assignedRoles: unit.unitRoles?.map((ur: any) => ur.roleId) || [],
          assignedUsers:
            unit.userAssignments?.map((ua: any) => ({
              userId: ua.userId,
              roleId: ua.roleId,
            })) || [],
        }));
    };

    const hierarchicalUnits = buildHierarchy(units);

    return NextResponse.json(hierarchicalUnits);
  } catch (error) {
    console.error("Error fetching organization units:", error);
    return NextResponse.json({ error: "Failed to fetch organization units" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const organizationId = params.id;
    const { name, description, parentId, assignedRoles, assignedUsers } = await request.json();

    // Validate organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      return NextResponse.json(
        { error: `Organization with id ${organizationId} not found` },
        { status: 404 }
      );
    }

    // Validate parentId if provided
    let level = 0;
    if (parentId) {
      const parent = await prisma.organizationUnit.findUnique({
        where: { id: parentId },
      });
      if (!parent) {
        return NextResponse.json(
          { error: `Parent unit with id ${parentId} not found` },
          { status: 404 }
        );
      }
      level = parent.level + 1;
    }

    // Create the unit
    const unit = await prisma.organizationUnit.create({
      data: {
        name,
        description: description || "",
        organizationId,
        parentId,
        level,
      },
    });

    // Validate and assign roles to unit
    if (assignedRoles && assignedRoles.length > 0) {
      const roles = await prisma.role.findMany({
        where: { id: { in: assignedRoles } },
      });
      if (roles.length !== assignedRoles.length) {
        return NextResponse.json(
          { error: "One or more role IDs are invalid" },
          { status: 400 }
        );
      }
      await Promise.all(
        assignedRoles.map((roleId: string) =>
          prisma.unitRoleAssignment.create({
            data: {
              unitId: unit.id,
              roleId,
            },
          })
        )
      );
    }

    // Validate and assign users to unit
    if (assignedUsers && assignedUsers.length > 0) {
      const userIds = assignedUsers.map((assignment: { userId: string }) => assignment.userId);
      const roleIds = assignedUsers.map((assignment: { roleId: string }) => assignment.roleId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
      });
      const roles = await prisma.role.findMany({
        where: { id: { in: roleIds } },
      });
      if (users.length !== userIds.length || roles.length !== roleIds.length) {
        return NextResponse.json(
          { error: "One or more user or role IDs are invalid" },
          { status: 400 }
        );
      }
      await Promise.all(
        assignedUsers.map((assignment: { userId: string; roleId: string }) =>
          prisma.userUnitAssignment.create({
            data: {
              userId: assignment.userId,
              unitId: unit.id,
              roleId: assignment.roleId,
            },
          })
        )
      );
    }

    // Return the created unit with all relationships
    const createdUnit = await prisma.organizationUnit.findUnique({
      where: { id: unit.id },
      include: {
        unitRoles: {
          include: {
            role: true,
          },
        },
        userAssignments: {
          include: {
            user: true,
            role: true,
          },
        },
        children: true,
      },
    });

    return NextResponse.json(createdUnit);
  } catch (error: any) {
    console.error("Error creating organization unit:", error);
    if (error.code === "P2003") {
      return NextResponse.json(
        { error: `Foreign key constraint failed: ${error.meta?.field_name || "unknown field"}` },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Failed to create organization unit" }, { status: 500 });
  }
}