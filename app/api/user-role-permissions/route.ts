export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { validateSession } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    // Validate the session
    const token = request.cookies.get('auth-token')?.value;
    
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const session = await validateSession(token);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Get user's role-based permissions through unit assignments
    const userWithRolePermissions = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        unitAssignments: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
            unit: true,
          },
        },
      },
    });

    if (!userWithRolePermissions) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Flatten all role permissions
    const rolePermissions = userWithRolePermissions.unitAssignments
      .filter(assignment => 
        assignment.role.isActive && 
        assignment.unit.isActive
      )
      .flatMap(assignment =>
        assignment.role.rolePermissions.map(rolePermission => ({
          roleId: assignment.role.id,
          roleName: assignment.role.name,
          unitId: assignment.unit.id,
          unitName: assignment.unit.name,
          permissionId: rolePermission.permission.id,
          permissionName: rolePermission.permission.name,
          moduleId: rolePermission.moduleId,
          formId: rolePermission.formId,
          granted: rolePermission.granted,
          canDelegate: rolePermission.canDelegate,
          category: rolePermission.permission.category,
          resource: rolePermission.permission.resource,
        }))
      );

    return NextResponse.json({
      success: true,
      data: rolePermissions,
      metadata: {
        userId,
        totalRolePermissions: rolePermissions.length,
        activeRoles: userWithRolePermissions.unitAssignments
          .filter(a => a.role.isActive && a.unit.isActive)
          .length,
      },
    });

  } catch (error) {
    console.error('Get user role permissions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}