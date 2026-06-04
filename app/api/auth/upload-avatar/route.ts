// app/api/auth/upload-avatar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { syncUserToEmployee } from "@/lib/utils/user-employee-sync";
import { invalidateAllSessionsForUser } from "@/lib/auth";
import { uploadToHostinger } from "@/lib/hostinger-upload";
import path from "path";

export const runtime = "nodejs";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("avatar") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const mime = (file.type || "").toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { error: "Invalid file type. Use JPG, PNG, or WebP." },
        { status: 415 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image too large. Max 5 MB." },
        { status: 413 },
      );
    }

    // Push to the same Hostinger bucket the rest of the app uses for user
    // uploads (employee photos, attendance captures, form attachments). Two
    // benefits over writing into public/avatars/:
    //   1. Returns a real CDN URL that's fetchable from any environment,
    //      including `next dev` — public/ files created at runtime are not
    //      reliably served by the dev server, which is why uploads here
    //      appeared "successful" but never previewed.
    //   2. Survives redeploys / multi-instance hosting where the per-instance
    //      filesystem isn't a persistent store.
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name) || ".jpg";
    const filename = `avatar_${authUser.id}_${Date.now()}${ext}`;

    let avatarUrl: string;
    try {
      avatarUrl = await uploadToHostinger(buffer, filename);
    } catch (err) {
      console.error("[upload-avatar] FTP upload failed:", err);
      return NextResponse.json(
        { error: "Photo upload failed. Try again." },
        { status: 502 },
      );
    }

    await prisma.user.update({
      where: { id: authUser.id },
      data: { avatar: avatarUrl },
    });

    // Mirror the photo onto the linked Employee record (employeeImage) so
    // Employee Master shows the same image the user just picked.
    await syncUserToEmployee(authUser.id, { avatar: avatarUrl });

    // Invalidate the cached session so /api/auth/me returns the new avatar
    // right away instead of the stale cached value (5-min TTL).
    await invalidateAllSessionsForUser(authUser.id);

    return NextResponse.json({ success: true, url: avatarUrl });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload avatar. Please try again." },
      { status: 500 },
    );
  }
}
