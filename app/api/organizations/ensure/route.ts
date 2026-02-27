import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json()

    // Check if organization already exists
    let organization = await prisma.organization.findFirst({
      where: { name },
    })

    if (!organization) {
      // Create new organization
      organization = await prisma.organization.create({
        data: {
          name,
        },
      })
    }

    return NextResponse.json(organization)
  } catch (error) {
    console.error("Error ensuring organization:", error)
    return NextResponse.json({ error: "Failed to ensure organization" }, { status: 500 })
  }
}
