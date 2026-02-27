export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from "next/server";
import { LookupService } from "@/lib/lookup-service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get("sourceId");
    let sectionId = searchParams.get("sectionId");

    if (!sourceId) {
      return NextResponse.json(
        { error: "sourceId is required" },
        { status: 400 }
      );
    }

    // Normalize: treat missing or empty sectionId as "all"
    if (!sectionId || sectionId.trim() === "") {
      sectionId = "all";
    }

    const lookupService = new LookupService();

    console.log(`[API] Calling getFields → sourceId=${sourceId}, sectionId=${sectionId}`);

    const result = await lookupService.getFields(sourceId, sectionId);

    let responseData: any;

    if (Array.isArray(result)) {
      responseData = result;
    } else if (result && typeof result === "object") {
      responseData = {
        fields: result.fields ?? result,
        staticData: result.staticData ?? [],
      };
    } else {
      responseData = [];
    }

    console.log(`[API] Final response data length: ${Array.isArray(responseData) ? responseData.length : 'N/A'}`);

    return NextResponse.json({
      success: true,
      data: responseData,
      cached: false,           // Always false now
    });
  } catch (error) {
    console.error("Error fetching lookup fields:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch lookup fields",
      },
      { status: 500 }
    );
  }
}