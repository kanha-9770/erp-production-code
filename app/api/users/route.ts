// app/api/users/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import bcrypt from "bcryptjs"; // ← for password hashing

// Optional: validation schema (add zod if you want stricter input)
const createUserSchema = {
  email: (v: string) => typeof v === "string" && v.includes("@"),
  firstName: (v: string) => typeof v === "string" && v.trim().length > 0,
  lastName: (v: string) => typeof v === "string" && v.trim().length > 0,
  department: (v?: string) => true, // optional
  password: (v?: string) => true,   // optional — can be OTP only
};

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getAuthenticatedUser(request);

    if (!currentUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { organizationId } = currentUser;

    if (!organizationId) {
      return NextResponse.json(
        { error: "User is not associated with any organization" },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      where: {
        organizationId,
      },
      include: {
        unitAssignments: {
          include: {
            unit: true,
            role: true,
          },
        },
        organization: true,
        permissionOverrides: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const transformedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      avatar: user.avatar,
      department: user.department || "",
      unitAssignments: user.unitAssignments,
      email_verified: user.email_verified, // ← expose it so frontend can show
    }));

    return NextResponse.json(transformedUsers);
  } catch (error) {
    console.error("[GET /api/users] Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getAuthenticatedUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { organizationId } = currentUser;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Admin user is not associated with any organization" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Use snake_case to match frontend form names
    const { 
      email, 
      first_name, 
      last_name, 
      department, 
      password,
      unitId,     // ← now used
      roleId      // ← now used
    } = body;

    // Basic validation
    if (!email || !first_name || !last_name) {
      return NextResponse.json(
        { error: "Email, first name, and last name are required" },
        { status: 400 }
      );
    }

    // Check duplicate email
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }

    // Hash password if provided
    let hashedPassword: string | null = null;
    if (password && password.trim().length > 0) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    // Create user + auto-assign unit/role if provided
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        first_name,
        last_name,
        department: department || null,
        organizationId,
        email_verified: true,     // always true for admin-created
        status: "ACTIVE",
        // Auto-create UserUnitAssignment if unitId + roleId are sent
        unitAssignments: unitId && roleId ? {
          create: {
            unitId,
            roleId,
          },
        } : undefined,
      },
      include: {
        unitAssignments: {
          include: {
            unit: true,
            role: true,
          },
        },
      },
    });

    const transformedUser = {
      id: user.id,
      email: user.email,
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      avatar: user.avatar,
      department: user.department || "",
      unitAssignments: user.unitAssignments.map(ua => ({
        id: ua.id,
        unit: {
          id: ua.unit.id,
          name: ua.unit.name,
          level: ua.unit.level || 0,
        },
        role: {
          id: ua.role.id,
          name: ua.role.name,
          isAdmin: ua.role.isAdmin || false,
          level: ua.role.level || 0,
        },
        notes: ua.notes || "",
      })),
      email_verified: user.email_verified,
    };

    return NextResponse.json(transformedUser, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/users] Error creating user:", error);

    if (error.code === "P2002") {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }

    return NextResponse.json(
      { error: "Failed to create user", details: error.message },
      { status: 500 }
    );
  }
}