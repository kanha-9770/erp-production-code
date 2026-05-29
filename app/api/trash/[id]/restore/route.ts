/**
 * POST /api/trash/[id]/restore — re-create the trashed record from its
 * snapshot, then remove the trash entry.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { restoreFromTrash } from "@/lib/trash";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    // Without server-side logging, restore failures show as a generic toast
    // and the underlying Prisma error (FK violation, unique conflict, etc.)
    // is lost. Log it so it's visible in `pnpm dev` output.
    console.error(`[POST /api/trash/${params.id}/restore]`, err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to restore" },
      { status: 500, headers: NO_STORE },
    );
  }
}
