// app/api/auth/remove-avatar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const userId = authUser.id;

    // Get current avatar URL from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });

    if (user?.avatar) {
      // Extract filename from URL (e.g., /avatars/123-456789.jpg → 123-456789.jpg)
      const filename = user.avatar.split("/").pop();
      if (filename) {
        const filepath = path.join(process.cwd(), "public", "avatars", filename);

        // Delete the file (ignore if not found)
        try {
          await unlink(filepath);
        } catch (err) {
          // Continue — file might be missing, but we still want to clear DB
        }
      }
    }

    // Remove avatar from database
    await prisma.user.update({
      where: { id: userId },
      data: { avatar: null },
    });

    return NextResponse.json({ success: true, message: "Avatar removed successfully" });
  } catch (error) {
    console.error("Remove avatar error:", error);
    return NextResponse.json(
      { error: "Failed to remove avatar" },
      { status: 500 }
    );
  }
}