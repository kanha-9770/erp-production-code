export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from "next/server";
import { LookupService } from "@/lib/lookup-service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get("sourceId");
    const search = searchParams.get("search") || "";
    const limit = Number.parseInt(searchParams.get("limit") || "50");
    const offset = Number.parseInt(searchParams.get("offset") || "0");

    if (!sourceId) {
      return NextResponse.json({ success: false, error: "sourceId is required" }, { status: 400 });
    }

    const lookupService = new LookupService();
    const data = await lookupService.getData(sourceId, { search, limit, offset });

    return NextResponse.json({
      success: true,
      data,
      cached: false,           // We disabled cache for now
    });
  } catch (error) {
    console.error("Error fetching lookup data:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch lookup data" },
      { status: 500 }
    );
  }
}