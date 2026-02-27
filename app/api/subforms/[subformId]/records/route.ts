export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request, { params }: { params: { subformId: string } }) {
  try {
    const records = await prisma.subformRecord.findMany({
      where: { subformId: params.subformId },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ success: true, data: records })
  } catch (error: any) {
    console.error("Error fetching subform records:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: { subformId: string } }) {
  try {
    const body = await request.json()
    const { recordData } = body

    if (!recordData) {
      return NextResponse.json({ success: false, error: "Record data is required" }, { status: 400 })
    }

    const record = await prisma.subformRecord.create({
      data: {
        subformId: params.subformId,
        recordData,
      },
    })

    return NextResponse.json({ success: true, data: record })
  } catch (error: any) {
    console.error("Error creating subform record:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
