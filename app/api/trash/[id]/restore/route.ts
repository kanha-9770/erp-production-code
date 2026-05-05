/**
 * POST /api/trash/[id]/restore — re-create the trashed record from its
 * snapshot, then remove the trash entry.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { restoreFromTrash } from "@/lib/trash";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401, headers: NO_STORE });
  if (!user.organizationId) return NextResponse.json({ success: false, error: "No organization" }, { status: 403, headers: NO_STORE });
  if (!(await isUserAdmin(user.id, user.organizationId))) {
    return NextResponse.json({ success: false, error: "Admin only" }, { status: 403, headers: NO_STORE });
  }

  try {
    const result = await restoreFromTrash(params.id, {
      userId: user.id,
      userName: user.email,
      organizationId: user.organizationId,
    });
    return NextResponse.json({ success: true, data: result }, { headers: NO_STORE });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to restore" },
      { status: 500, headers: NO_STORE },
    );
  }
}
