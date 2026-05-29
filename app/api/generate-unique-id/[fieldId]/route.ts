// app/api/generate-unique-id/[fieldId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // ← your prisma client import
import crypto from "crypto";

export async function POST(request: NextRequest, props: { params: Promise<{ fieldId: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json();
    const {
      mode,           // "uuid" | "sequential" | "prefix"
      prefix = "",
      minDigits = 6,
      startFrom = 1   // optional - you can add this later
    } = body;

    if (!["uuid", "sequential", "prefix"].includes(mode)) {
      return NextResponse.json(
        { success: false, error: "Invalid generation mode" },
        { status: 400 }
      );
    }

    let generatedId: string;

    if (mode === "uuid") {
      generatedId = crypto.randomUUID();
    } 
    else {
      // Sequential or Prefix mode → atomic increment
      const result = await prisma.$transaction(async (tx) => {
        let counter = await tx.uniqueIdCounter.findUnique({
          where: { fieldId: params.fieldId },
        });

        if (!counter) {
          counter = await tx.uniqueIdCounter.create({
            data: {
              fieldId: params.fieldId,
              lastNumber: BigInt(startFrom - 1), // so first increment gives startFrom
            },
          });
        }

        // Atomically increment
        counter = await tx.uniqueIdCounter.update({
          where: { id: counter.id },
          data: {
            lastNumber: { increment: BigInt(1) },
          },
        });

        const number = Number(counter.lastNumber); // safe until ~9 quadrillion
        const padded = number.toString().padStart(minDigits, "0");

        const id = mode === "prefix" 
          ? `${prefix}${padded}`
          : padded;

        return { id, sequenceNumber: number };
      });

      generatedId = result.id;
    }

    return NextResponse.json({
      success: true,
      id: generatedId,
    });

  } catch (error: any) {
    console.error("Generate Unique ID Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate unique ID",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}