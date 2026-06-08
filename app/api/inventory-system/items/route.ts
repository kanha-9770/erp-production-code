export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { getOrgCtx, fail } from "@/lib/api-handlers/with-org";
import { InventoryHandlers, type ListItemsQuery } from "@/lib/api-handlers/inventory-system";
import type { SubmoduleKey } from "@/lib/inventory-system/types";

// GET /api/inventory-system/items?submodule=&page=&pageSize=&search=&status=&masters=&sortKey=&sortDir=
//   → one paginated page { rows, total, lowCount, outCount, page, pageSize }
export async function GET(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const sp = request.nextUrl.searchParams;
    let masters: Record<string, string> | undefined;
    const mastersRaw = sp.get("masters");
    if (mastersRaw) {
      try {
        const parsed = JSON.parse(mastersRaw);
        if (parsed && typeof parsed === "object") masters = parsed as Record<string, string>;
      } catch {
        /* ignore malformed filter param */
      }
    }
    const q: ListItemsQuery = {
      submodule: (sp.get("submodule") ?? "store") as SubmoduleKey,
      page: parseInt(sp.get("page") ?? "0", 10) || 0,
      pageSize: parseInt(sp.get("pageSize") ?? "100", 10) || 100,
      search: sp.get("search") ?? undefined,
      status: sp.get("status") ?? undefined,
      masters,
      sortKey: sp.get("sortKey") ?? undefined,
      sortDir: sp.get("sortDir") === "asc" ? "asc" : "desc",
    };
    const data = await InventoryHandlers.listItems(auth.ctx, q);
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("[inventory-system/items GET]", e);
    return fail(e?.message || "Failed to list items", /invalid/i.test(e?.message || "") ? 400 : 500);
  }
}

// POST /api/inventory-system/items → create one item; body { submodule, data }
export async function POST(request: NextRequest) {
  const auth = await getOrgCtx(request);
  if (!auth.ok) return auth.res;
  try {
    const { submodule, data } = await request.json();
    const rec = await InventoryHandlers.createItem(auth.ctx, submodule, data ?? {});
    return NextResponse.json({ success: true, data: rec }, { status: 201 });
  } catch (e: any) {
    console.error("[inventory-system/items POST]", e);
    return fail(e?.message || "Failed to create item", /not found|invalid/i.test(e?.message || "") ? 400 : 500);
  }
}
