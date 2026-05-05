/**
 * GET    /api/trash         — list everything in the recycle bin (scoped to org).
 * DELETE /api/trash         — empty the recycle bin entirely (admin only).
 *
 * Both branches are wrapped in try/catch so the response is always valid JSON,
 * even when the underlying Prisma client is missing the TrashBin model (i.e.
 * `prisma generate` hasn't been re-run since the schema change). Without this
 * wrapper, the page sees a zero-byte 500 body and breaks with "Unexpected end
 * of JSON input".
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { listTrash, emptyTrash } from "@/lib/trash";

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

    const items = await listTrash({ organizationId: user.organizationId });
    return NextResponse.json({ success: true, data: items }, { headers: NO_STORE });
  } catch (err: any) {
    console.error("[GET /api/trash]", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to load trash" },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401, headers: NO_STORE });
    if (!user.organizationId) return NextResponse.json({ success: false, error: "No organization" }, { status: 403, headers: NO_STORE });
    if (!(await isUserAdmin(user.id, user.organizationId))) {
      return NextResponse.json({ success: false, error: "Admin only" }, { status: 403, headers: NO_STORE });
    }

    const result = await emptyTrash({ organizationId: user.organizationId });
    return NextResponse.json({ success: true, data: result }, { headers: NO_STORE });
  } catch (err: any) {
    console.error("[DELETE /api/trash]", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to empty trash" },
      { status: 500, headers: NO_STORE },
    );
  }
}
