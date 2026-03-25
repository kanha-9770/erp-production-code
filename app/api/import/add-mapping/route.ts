// app/api/import/add-mapping/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const normalizeKey = (str: string | undefined): string => {
  if (typeof str !== "string") return "";
  return str
    .replace(/[\u2018\u2019]/g, "'")     // smart quotes → normal
    .trim()
    .replace(/\s+/g, " ");
};

export async function POST(request: Request) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error("[ADD-MAPPINGS] JSON parse error:", parseError);
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid payload: expected object" },
        { status: 400 }
      );
    }

    const { importJobId, mappings } = body;

    if (!importJobId || typeof importJobId !== "string") {
      console.error("[ADD-MAPPINGS] Missing or invalid importJobId");
      return NextResponse.json(
        { success: false, error: "Missing or invalid importJobId" },
        { status: 400 }
      );
    }

    if (!Array.isArray(mappings) || mappings.length === 0) {
      console.error("[ADD-MAPPINGS] Mappings missing or not an array");
      return NextResponse.json(
        { success: false, error: "Mappings must be a non-empty array" },
        { status: 400 }
      );
    }

    const validMappings = mappings
      .map((m: any, index: number) => {
        // Support BOTH naming conventions your frontend might send
        const sourceColumnRaw = m.sourceColumn ?? m.source ?? "";
        const sectionId = typeof m.sectionId === "string" ? m.sectionId.trim() : "";
        const fieldIdRaw = m.fieldId ?? m.targetFieldId ?? m.target?.fieldId ?? "";

        const sourceColumn = normalizeKey(sourceColumnRaw);
        const targetFieldId = typeof fieldIdRaw === "string" ? fieldIdRaw.trim() : "";

        const isValid =
          sourceColumn !== "" &&
          targetFieldId !== "";

        if (!isValid) {
          return null;
        }

        return {
          importJobId,
          sourceColumn,
          targetFieldId,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (validMappings.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid mappings after validation" },
        { status: 400 }
      );
    }

    // ── Atomic transaction ────────────────────────────────────────
    const transactionResult = await prisma.$transaction(async (tx) => {
      // Optional: clear previous mappings for this job
      const deleted = await tx.importFieldMapping.deleteMany({
        where: { importJobId },
      });

      const created = await tx.importFieldMapping.createMany({
        data: validMappings,
        skipDuplicates: true, // safety if somehow duplicated
      });

      return {
        deleted: deleted.count,
        inserted: created.count,
      };
    });

    return NextResponse.json(
      {
        success: true,
        count: validMappings.length,
        importJobId,
        transaction: transactionResult,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[ADD-MAPPINGS] Server error:", {
      message: err.message,
      code: err.code,
      stack: err.stack?.substring(0, 600),
    });

    return NextResponse.json(
      {
        success: false,
        error: "Failed to save mappings",
        details: process.env.NODE_ENV === "development" ? err.message : undefined,
      },
      { status: 500 }
    );
  }
}