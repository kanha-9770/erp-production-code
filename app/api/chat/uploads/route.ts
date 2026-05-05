/**
 * POST /api/chat/uploads
 *
 * Receives multipart/form-data with one or more `files` parts.
 * Stores them under `public/uploads/chat/<userId>/<uuid>.<ext>` and returns
 * metadata the client uses to attach refs to the next chat message. The chat
 * route reads the same paths back to enrich the user message before it goes
 * to the LLM (see app/api/chat/route.ts).
 *
 * Limits: 25 MB per file, 8 files per request, 50 MB combined per request.
 * Allowed MIME categories: image/*, audio/*, video/*, plus a curated list of
 * document / spreadsheet / code / archive types.
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 8;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB

/** Explicit allow-list for non-image/audio/video MIME types. */
const ALLOWED_DOC_MIMES = new Set<string>([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-7z-compressed",
  "application/octet-stream",
]);

const ALLOWED_TEXT_PREFIXES = ["text/"]; // text/plain, text/csv, text/markdown, text/html, etc.

function isAllowedMime(mime: string): boolean {
  if (!mime) return false;
  if (mime.startsWith("image/")) return true;
  if (mime.startsWith("audio/")) return true;
  if (mime.startsWith("video/")) return true;
  if (ALLOWED_TEXT_PREFIXES.some((p) => mime.startsWith(p))) return true;
  return ALLOWED_DOC_MIMES.has(mime);
}

function classifyKind(mime: string, name: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("text/")) {
    if (/\.(csv|tsv)$/i.test(name)) return "spreadsheet";
    if (/\.(js|ts|tsx|jsx|py|rb|go|rs|java|c|cpp|h|sh|sql|html|css|md|json|yaml|yml|xml)$/i.test(name))
      return "code";
    return "document";
  }
  if (
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return "spreadsheet";
  if (
    mime === "application/zip" ||
    mime === "application/x-zip-compressed" ||
    mime === "application/x-tar" ||
    mime === "application/gzip" ||
    mime === "application/x-7z-compressed"
  )
    return "archive";
  if (
    mime === "application/json" ||
    mime === "application/xml" ||
    mime.includes("yaml")
  )
    return "code";
  return "document";
}

function safeExt(filename: string, mime: string): string {
  const fromName = path.extname(filename).toLowerCase();
  if (fromName && /^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  // crude mime → ext fallback
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "audio/mpeg") return ".mp3";
  if (mime === "audio/wav") return ".wav";
  if (mime === "video/mp4") return ".mp4";
  if (mime === "application/pdf") return ".pdf";
  if (mime === "text/plain") return ".txt";
  if (mime === "text/csv") return ".csv";
  if (mime === "application/json") return ".json";
  return ".bin";
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const files = form.getAll("files").filter((v): v is File => v instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Too many files (max ${MAX_FILES} per request)` },
        { status: 400 }
      );
    }

    let totalBytes = 0;
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          {
            error: `"${f.name}" exceeds the ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} MB per-file limit.`,
          },
          { status: 400 }
        );
      }
      if (!isAllowedMime(f.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${f.type || "unknown"} (${f.name})` },
          { status: 400 }
        );
      }
      totalBytes += f.size;
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: `Combined upload exceeds ${Math.floor(MAX_TOTAL_BYTES / 1024 / 1024)} MB.` },
        { status: 400 }
      );
    }

    const userDir = path.join(process.cwd(), "public", "uploads", "chat", user.id);
    await mkdir(userDir, { recursive: true });

    const out: Array<{
      id: string;
      name: string;
      mimeType: string;
      size: number;
      url: string;
      kind: string;
    }> = [];

    for (const file of files) {
      const id = crypto.randomUUID();
      const ext = safeExt(file.name, file.type);
      const stored = `${id}${ext}`;
      const fullPath = path.join(userDir, stored);
      const buf = Buffer.from(await file.arrayBuffer());
      await writeFile(fullPath, buf);

      out.push({
        id,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        url: `/uploads/chat/${user.id}/${stored}`,
        kind: classifyKind(file.type || "", file.name),
      });
    }

    return NextResponse.json({ files: out });
  } catch (err) {
    console.error("[api/chat/uploads] error", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
