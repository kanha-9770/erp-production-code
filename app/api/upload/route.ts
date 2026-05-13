import { NextResponse } from "next/server"
import { uploadToHostinger } from "@/lib/hostinger-upload"

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    // Accept either field name — older callers (image/camera widgets) use
    // "image", newer ones (resume, document uploaders) use "file".
    const upload = (formData.get("file") || formData.get("image")) as File | null
    const type = (formData.get("type") as string) || "upload"

    if (!upload) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 },
      )
    }
    const arrayBuffer = await upload.arrayBuffer()
    if (arrayBuffer.byteLength === 0) {
      console.error("[API] Empty array buffer")
      return NextResponse.json(
        { success: false, error: "Empty file data" },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(arrayBuffer)
    const filename = `${type}_${Date.now()}_${upload.name}`
    const imageUrl = await uploadToHostinger(buffer, filename)

    return NextResponse.json({ success: true, imageUrl })
  } catch (error) {
    console.error("[API] Upload error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to upload file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
