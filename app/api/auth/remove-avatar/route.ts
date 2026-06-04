// app/api/auth/remove-avatar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { syncUserToEmployee } from "@/lib/utils/user-employee-sync";
import { invalidateAllSessionsForUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Clear the avatar reference. Avatars live on the Hostinger CDN now
    // (same bucket as attendance / employee photos), so we don't attempt to
    // delete the underlying file — orphans there are an accepted trade-off,
    // matching how `attendance/photo` and `employee-master` handle replaced
    // images.
    await prisma.user.update({
      where: { id: authUser.id },
      data: { avatar: null },
    });

    await syncUserToEmployee(authUser.id, { avatar: null });

    // Drop the cached session so /api/auth/me reads the freshly-cleared
    // avatar from the DB immediately. Without this the session cache (5-min
    // TTL) keeps serving the old avatar, so the photo "comes back" on
    // refresh until the cache expires.
    await invalidateAllSessionsForUser(authUser.id);

    return NextResponse.json({
      success: true,
      message: "Avatar removed successfully",
    });
  } catch (error) {
    console.error("Remove avatar error:", error);
    return NextResponse.json(
      { error: "Failed to remove avatar" },
      { status: 500 },
    );
  }
}
