/**
 * POST /api/parse-resume — scan an uploaded resume into structured data.
 *
 * Body: multipart/form-data with a `file` field (PDF / DOCX / TXT).
 * Auth: same cookie session as the rest of the API; the caller's
 * organization decides which AI provider + key is used for parsing.
 *
 * Response: { success: true, result: { text, data, skills,
 *   totalExperience, education, summary } }. `data` is null when no AI
 * provider is configured or parsing failed — the resume can still be saved.
 *
 * Runs on the Node.js runtime because pdf-parse / mammoth need Node APIs.
 */

import { type NextRequest } from "next/server";
import { getAuthenticatedUser, apiError, apiSuccess, unauthorized } from "@/lib/api-helpers";
import { scanResume } from "@/lib/ai/resume-parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Guard against giant uploads tying up the parser. 10 MB covers any real
// resume; bigger files are almost certainly not resumes.
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    if (!user.organizationId) return apiError("No organization", 400);

    const formData = await request.formData();
    const fileEntry = formData.get("file") as File | null;
    if (!fileEntry || typeof fileEntry === "string") {
      return apiError("No file provided. Send it as `file`.", 400);
    }

    const arrayBuffer = await fileEntry.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return apiError("Empty file", 400);
    if (arrayBuffer.byteLength > MAX_BYTES) return apiError("File too large", 413);

    const buffer = Buffer.from(arrayBuffer);
    const result = await scanResume(
      user.organizationId,
      buffer,
      fileEntry.name || "resume",
      fileEntry.type,
    );

    return apiSuccess({ result });
  } catch (err) {
    console.error("[api/parse-resume] error:", err);
    return apiError("Failed to parse resume", 500);
  }
}
