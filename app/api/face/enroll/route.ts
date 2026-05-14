import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { uploadToHostinger } from "@/lib/hostinger-upload";
import {
  decodeDescriptor,
  descriptorToBytes,
  DESCRIPTOR_LENGTH,
} from "@/lib/face/verify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Enroll (or re-enroll) the authenticated user's face descriptor.
 *
 * Accepts a multipart/form-data body:
 *   - descriptor   (required) base64-encoded Float32Array of length 128
 *   - photo        (optional) the image the descriptor was computed from;
 *                  uploaded to Hostinger so admins can re-review
 *   - targetUserId (optional, admin-only) enroll another user — used by
 *                  the employee-master form so HR can enroll on behalf of
 *                  a newly created employee
 *   - consent      (optional) "true" if the user explicitly consented;
 *                  stamps consentAt so audits can prove acknowledgement
 *
 * Returns { success, enrolled: true, referencePhoto } on success.
 *
 * This route stays small — descriptor extraction happens client-side, the
 * server only persists the 512-byte fingerprint and optionally the photo.
 */

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function extFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid multipart body" },
      { status: 400 },
    );
  }

  const descriptor = decodeDescriptor(formData.get("descriptor"));
  if (!descriptor) {
    return NextResponse.json(
      {
        success: false,
        error: `Field 'descriptor' is required (base64 of ${DESCRIPTOR_LENGTH} float32 values)`,
      },
      { status: 400 },
    );
  }

  // Admin can enroll another user (used by the employee-master flow). We
  // gate that on the "users.update" permission shape this codebase uses
  // for admin checks — see api-helpers.isUserAdmin. Plain users always
  // self-enroll regardless of what they pass.
  const requestedTarget = String(formData.get("targetUserId") ?? "").trim();
  let targetUserId = authUser.id;
  let enrolledBy: string = authUser.id;
  if (requestedTarget && requestedTarget !== authUser.id) {
    const { isUserAdmin } = await import("@/lib/api-helpers");
    const isAdmin = await isUserAdmin(authUser.id);
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: "Only admins can enroll another user" },
        { status: 403 },
      );
    }
    // Validate that the target user exists and is in the same org as the
    // admin (multi-tenant boundary).
    const target = await prisma.user.findUnique({
      where: { id: requestedTarget },
      select: { id: true, organizationId: true },
    });
    if (!target) {
      return NextResponse.json(
        { success: false, error: "Target user not found" },
        { status: 404 },
      );
    }
    if (
      authUser.organizationId &&
      target.organizationId &&
      target.organizationId !== authUser.organizationId
    ) {
      return NextResponse.json(
        { success: false, error: "Target user is in a different organization" },
        { status: 403 },
      );
    }
    targetUserId = target.id;
    enrolledBy = authUser.id;
  }

  // Optional reference photo upload. Uses the same Hostinger uploader the
  // attendance pipeline already uses; nothing new about the storage path.
  let referencePhotoUrl: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const mime = (photo.type || "").toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { success: false, error: "Photo must be JPEG, PNG, or WebP" },
        { status: 415 },
      );
    }
    // Cap at 2 MB — enrollment photos can be larger than punch selfies
    // because they're captured once and become the baseline.
    if (photo.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "Enrollment photo too large (max 2 MB)" },
        { status: 413 },
      );
    }
    try {
      const buf = Buffer.from(await photo.arrayBuffer());
      const safeUserId = targetUserId.replace(/[^a-zA-Z0-9_-]/g, "");
      const filename = `face_${safeUserId}_${Date.now()}.${extFor(mime)}`;
      referencePhotoUrl = await uploadToHostinger(buf, filename);
    } catch (err) {
      console.error("[face/enroll] photo upload failed:", err);
      // Photo upload failure shouldn't block the enrollment — the
      // descriptor is what gates verification.
      referencePhotoUrl = null;
    }
  }

  const consent = String(formData.get("consent") ?? "").toLowerCase() === "true";
  const consentAt = consent ? new Date() : null;

  // Look up the org for the target user so the FaceEnrollment row is
  // tagged correctly when an admin enrolls a teammate.
  let organizationId: string | null = authUser.organizationId;
  if (targetUserId !== authUser.id) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { organizationId: true },
    });
    organizationId = target?.organizationId ?? null;
  }

  const descriptorBytes = descriptorToBytes(descriptor);

  try {
    const existing = await (prisma as any).faceEnrollment.findUnique({
      where: { userId: targetUserId },
    });

    const data: Record<string, unknown> = {
      descriptor: descriptorBytes,
      organizationId,
      enrolledBy,
    };
    if (referencePhotoUrl) data.referencePhoto = referencePhotoUrl;
    // Only stamp consentAt on first enrollment or when consent=true was
    // passed; don't overwrite a previously-recorded consent with null.
    if (consentAt) data.consentAt = consentAt;

    const saved = existing
      ? await (prisma as any).faceEnrollment.update({
          where: { userId: targetUserId },
          data,
        })
      : await (prisma as any).faceEnrollment.create({
          data: {
            ...data,
            userId: targetUserId,
            consentAt: consentAt ?? null,
          },
        });

    return NextResponse.json({
      success: true,
      enrolled: true,
      reEnrolled: !!existing,
      referencePhoto: saved.referencePhoto ?? null,
    });
  } catch (err) {
    console.error("[face/enroll] save failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save enrollment" },
      { status: 500 },
    );
  }
}
