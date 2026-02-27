// app/api/auth/remove-avatar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    // Get token from cookie
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Validate session
    const session = await validateSession(token);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const userId = session.user.id;

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
          console.warn("Avatar file not found or already deleted:", filepath);
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