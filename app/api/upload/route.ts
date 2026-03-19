import { NextResponse } from "next/server"
import { uploadToHostinger } from "@/lib/hostinger-upload"

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const image = formData.get("image") as File
    const type = formData.get("type") as string

    if (!image) {
      return NextResponse.json({ success: false, error: "No image provided" }, { status: 400 })
    }
    const arrayBuffer = await image.arrayBuffer()
    if (arrayBuffer.byteLength === 0) {
      console.error("[API] Empty array buffer")
      return NextResponse.json({ success: false, error: "Empty image data" }, { status: 400 })
    }

    const buffer = Buffer.from(arrayBuffer)
    const filename = `${type}_${Date.now()}_${image.name}`
    const imageUrl = await uploadToHostinger(buffer, filename)

    return NextResponse.json({ imageUrl })
  } catch (error) {
    console.error("[API] Upload error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to upload image",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
