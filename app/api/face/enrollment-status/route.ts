import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Returns whether the authenticated user has a FaceEnrollment row.
 *
 * Used by the attendance widget to decide whether to show the
 * "Enroll your face" banner before a check-in attempt under ENFORCE mode.
 *
 * Pass ?userId=... to query another user's status (admin only) — useful
 * for the team attendance page so HR can see who still needs enrollment.
 */
export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const requested = (searchParams.get("userId") ?? "").trim();

  let targetUserId = authUser.id;
  if (requested && requested !== authUser.id) {
    const { isUserAdmin } = await import("@/lib/api-helpers");
    const isAdmin = await isUserAdmin(authUser.id);
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: "Only admins can query another user" },
        { status: 403 },
      );
    }
    targetUserId = requested;
  }

  try {
    const row = await (prisma as any).faceEnrollment.findUnique({
      where: { userId: targetUserId },
      select: {
        enrolledAt: true,
        updatedAt: true,
        referencePhoto: true,
        consentAt: true,
      },
    });
    return NextResponse.json({
      success: true,
      userId: targetUserId,
      enrolled: !!row,
      enrolledAt: row?.enrolledAt ?? null,
      updatedAt: row?.updatedAt ?? null,
      referencePhoto: row?.referencePhoto ?? null,
      consented: !!row?.consentAt,
    });
  } catch (err) {
    console.error("[face/enrollment-status] failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load enrollment status" },
      { status: 500 },
    );
  }
}
