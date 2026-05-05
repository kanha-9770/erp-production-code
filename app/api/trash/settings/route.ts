/**
 * GET /api/trash/settings — read the org's recycle-bin retention policy.
 * PUT /api/trash/settings — admin-only update; body: { retentionDays: number }
 *
 * `retentionDays === 0` means "never auto-delete". Otherwise items in the
 * recycle bin are purged once they're older than `retentionDays`. The purge
 * runs lazily inside `listTrash`, so the next time anyone loads /api/trash
 * the cleanup happens — no separate cron job is required.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { getTrashRetentionDays, setTrashRetentionDays } from "@/lib/trash";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401, headers: NO_STORE });
    if (!user.organizationId) return NextResponse.json({ success: false, error: "No organization" }, { status: 403, headers: NO_STORE });
    if (!(await isUserAdmin(user.id, user.organizationId))) {
      return NextResponse.json({ success: false, error: "Admin only" }, { status: 403, headers: NO_STORE });
    }

    const retentionDays = await getTrashRetentionDays(user.organizationId);
    return NextResponse.json({ success: true, data: { retentionDays } }, { headers: NO_STORE });
  } catch (err: any) {
    console.error("[GET /api/trash/settings]", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to read trash settings" },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401, headers: NO_STORE });
    if (!user.organizationId) return NextResponse.json({ success: false, error: "No organization" }, { status: 403, headers: NO_STORE });
    if (!(await isUserAdmin(user.id, user.organizationId))) {
      return NextResponse.json({ success: false, error: "Admin only" }, { status: 403, headers: NO_STORE });
    }

    const body = await request.json().catch(() => ({}));
    const days = Number(body?.retentionDays);
    if (!Number.isFinite(days) || days < 0) {
      return NextResponse.json(
        { success: false, error: "retentionDays must be a non-negative number (0 = never auto-delete)" },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = await setTrashRetentionDays(user.organizationId, days, user.id);
    return NextResponse.json({ success: true, data: result }, { headers: NO_STORE });
  } catch (err: any) {
    console.error("[PUT /api/trash/settings]", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to update trash settings" },
      { status: 500, headers: NO_STORE },
    );
  }
}
