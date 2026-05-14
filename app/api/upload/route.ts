import { NextResponse } from "next/server"
import { uploadToHostinger } from "@/lib/hostinger-upload"

/**
 * POST /api/upload — push a file to Hostinger FTP and return its public URL.
 *
 * Accepted form-field names:
 *   - `file`  — used by real-estate (compliance docs, property media,
 *               transaction docs). Files may be PDFs as well as images.
 *   - `image` — legacy form-builder callers (FileUploadZone, CameraCapture).
 *
 * Optional `type` field is used only to prefix the stored filename so
 * uploads from different surfaces are easier to triage on the bucket.
 *
 * Response shape: `{ success: true, imageUrl: "..." }` on 200. The field
 * is still called `imageUrl` even for PDFs so we don't break the legacy
 * callers that read `result.imageUrl`.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData()

    // Accept either `file` (new) or `image` (legacy). Whichever field the
    // caller used, we land on a single `File` and a single field name for
    // logging.
    const fileEntry =
      (formData.get("file") as File | null) ||
      (formData.get("image") as File | null)
    const type = (formData.get("type") as string | null) ?? ""

    if (!fileEntry || typeof fileEntry === "string") {
      return NextResponse.json(
        { success: false, error: "No file provided. Send it as `file` or `image`." },
        { status: 400 },
      )
    }

    const arrayBuffer = await fileEntry.arrayBuffer()
    if (arrayBuffer.byteLength === 0) {
      console.error("[API] Empty file buffer")
      return NextResponse.json(
        { success: false, error: "Empty file data" },
        { status: 400 },
      )
    }

    // Build a safe filename: strip path separators / control chars / weird
    // unicode, keep extension, and prefix with `type` (when provided) and
    // a millisecond timestamp so concurrent uploads of the same name don't
    // overwrite each other on the FTP bucket.
    const rawName = (fileEntry as File).name || "upload"
    const safeName =
      rawName
        .replace(/[\\/]/g, "_") // path separators
        .replace(/[^\w.\-]/g, "_") // anything not word/dot/hyphen → _
        .replace(/_+/g, "_") // collapse runs of underscores
        .slice(-120) || "upload" // bound length
    const prefix = type ? `${type.replace(/[^\w-]/g, "_")}_` : ""
    const filename = `${prefix}${Date.now()}_${safeName}`

    const buffer = Buffer.from(arrayBuffer)
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
