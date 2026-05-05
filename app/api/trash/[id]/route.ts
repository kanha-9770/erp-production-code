/**
 * DELETE /api/trash/[id] — permanently purge a trash entry (no restore).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { purgeTrashItem } from "@/lib/trash";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getAuthenticatedUser(_request);
  if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401, headers: NO_STORE });
  if (!user.organizationId) return NextResponse.json({ success: false, error: "No organization" }, { status: 403, headers: NO_STORE });
  if (!(await isUserAdmin(user.id, user.organizationId))) {
    return NextResponse.json({ success: false, error: "Admin only" }, { status: 403, headers: NO_STORE });
  }

  try {
    await purgeTrashItem(params.id, { organizationId: user.organizationId });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to purge" },
      { status: 500, headers: NO_STORE },
    );
  }
}
