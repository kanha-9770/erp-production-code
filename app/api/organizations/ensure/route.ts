import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { id, name } = await request.json()

    // Ensure by ID, not by name. The previous implementation looked up by name
    // and created a new org when none matched — so a hardcoded "Default
    // Organization" name spawned a fresh orphan org on every load for any user
    // whose org had a different name. Upserting by id is idempotent and never
    // overwrites an existing org's name.
    if (!id) {
      return NextResponse.json(
        { error: "Organization id is required" },
        { status: 400 },
      )
    }

    const organization = await prisma.organization.upsert({
      where: { id },
      update: {}, // never clobber an existing org's name/details
      create: { id, name: name || "Organization" },
    })

    return NextResponse.json(organization)
  } catch (error) {
    console.error("Error ensuring organization:", error)
    return NextResponse.json({ error: "Failed to ensure organization" }, { status: 500 })
  }
}
