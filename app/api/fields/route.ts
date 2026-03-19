export const dynamic = 'force-dynamic';
import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/lib/database-service";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    // Enhanced validation for lookup fields
    if (data.type === "lookup") {
      if (!data.lookup?.sourceId) {
        return NextResponse.json(
          {
            success: false,
            error: "Lookup source is required for lookup fields",
          },
          { status: 400 }
        );
      }

      // Validate field mapping
      if (
        !data.lookup.fieldMapping?.display ||
        !data.lookup.fieldMapping?.value
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Display and value field mappings are required",
          },
          { status: 400 }
        );
      }
    }

    const field = await DatabaseService.createField(data);

    return NextResponse.json({ success: true, data: field });
  } catch (error: any) {
    console.error("Error creating field:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get("sectionId");

    if (!sectionId) {
      return NextResponse.json(
        { success: false, error: "Section ID is required" },
        { status: 400 }
      );
    }

    const fields = await DatabaseService.getFields(sectionId);
    return NextResponse.json({ success: true, data: fields });
  } catch (error: any) {
    console.error("Error fetching fields:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
