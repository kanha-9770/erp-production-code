// app/api/auth/update-profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { syncUserToEmployee } from "@/lib/utils/user-employee-sync";
import { invalidateAllSessionsForUser } from "@/lib/auth";

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

    // Mirror the shared identity/contact fields onto the linked Employee record
    // so Employee Master reflects the profile edit. Only fields the client
    // actually sent are synced (the /profile form posts just the diff).
    const changes: Parameters<typeof syncUserToEmployee>[1] = {};
    if (first_name !== undefined) changes.first_name = first_name;
    if (last_name !== undefined) changes.last_name = last_name;
    if (department !== undefined) changes.department = department;
    if (phone !== undefined) changes.phone = phone;
    if (mobile !== undefined) changes.mobile = mobile;
    await syncUserToEmployee(authUser.id, changes);

    // Invalidate the cached session so the edited fields show immediately on
    // the next /api/auth/me read instead of the stale cached copy (5-min TTL).
    await invalidateAllSessionsForUser(authUser.id);

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