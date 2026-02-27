// app/api/auth/update-profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth"; // Your custom session validator
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    // Get auth token from cookie
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Validate session
    const session = await validateSession(token);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: "Invalid session" },
        { status: 401 }
      );
    }

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
      where: { id: session.user.id },
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