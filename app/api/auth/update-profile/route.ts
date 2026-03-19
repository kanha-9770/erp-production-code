// app/api/auth/update-profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Parse form data
    const body = await request.json();

    const {
      first_name,
      last_name,
      username,
      phone,
      mobile,
      location,
      department,
    } = body;

    // Update user in database
    await prisma.user.update({
      where: { id: authUser.id },
      data: {
        first_name,
        last_name,
        username,
        phone,
        mobile,
        location,
        department,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}