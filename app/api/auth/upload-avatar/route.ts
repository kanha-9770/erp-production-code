// app/api/auth/upload-avatar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
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

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("avatar") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Invalid file type. Please upload an image." }, { status: 400 });
    }

    // Convert to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Generate unique filename
    const ext = path.extname(file.name) || ".jpg";
    const filename = `${session.user.id}-${Date.now()}${ext}`;
    
    // Define path
    const avatarsDir = path.join(process.cwd(), "public", "avatars");
    const filepath = path.join(avatarsDir, filename);

    // Ensure directory exists
    await mkdir(avatarsDir, { recursive: true });

    // Save file
    await writeFile(filepath, buffer);

    // Generate public URL
    const avatarUrl = `/avatars/${filename}`;

    // Update user in database
    await prisma.user.update({
      where: { id: session.user.id },
      data: { avatar: avatarUrl },
    });

    return NextResponse.json({ avatarUrl });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload avatar. Please try again." },
      { status: 500 }
    );
  }
}