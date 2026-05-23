/**
 * Resume scanning — turns an uploaded resume file into structured data.
 *
 * Two stages:
 *   1. extractResumeText() — pull raw text out of a PDF / DOCX / TXT buffer.
 *      PDF goes through pdf-parse, DOCX through mammoth. Old binary .doc and
 *      anything we can't read returns "" so the caller degrades gracefully
 *      (resume still gets stored, just without parsed data).
 *   2. parseResumeWithAI() — hand that text to the org's configured LLM
 *      provider (same providers/keys used by the chatbot) and ask for a
 *      strict JSON object describing the candidate.
 *
 * The AI call reuses lib/ai/llm-client `chat()`, so it inherits provider
 * resolution, key rotation and multi-provider failover for free. No separate
 * API key is needed.
 */

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { chat } from "./llm-client";
import type { ChatMessage } from "./types";

/** Structured shape we ask the LLM to return and persist as `resumeData`. */
export interface ParsedResume {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  currentTitle: string | null;
  totalExperience: string | null; // human phrase, e.g. "6 years"
  summary: string | null; // 1–2 lines
  skills: string[];
  education: Array<{
    degree: string | null;
    institution: string | null;
    year: string | null;
  }>;
  experience: Array<{
    company: string | null;
    role: string | null;
    duration: string | null;
  }>;
  certifications: string[];
  languages: string[];
}

/** What the API route persists onto the JobApplication row. */
export interface ResumeScanResult {
  text: string; // raw extracted text (may be "")
  data: ParsedResume | null; // null when AI parsing failed
  // Denormalised, flat copies for the list table.
  skills: string | null;
  totalExperience: string | null;
  education: string | null;
  summary: string | null;
}

const EMPTY_PARSED: ParsedResume = {
  fullName: null,
  email: null,
  phone: null,
  location: null,
  currentTitle: null,
  totalExperience: null,
  summary: null,
  skills: [],
  education: [],
  experience: [],
  certifications: [],
  languages: [],
};

/**
 * Extract plain text from a resume buffer based on its filename / mime type.
 * Returns "" for unsupported or unreadable files rather than throwing, so an
 * upload never fails just because we couldn't read it.
 */
export async function extractResumeText(
  buffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<string> {
  const lower = (filename || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  try {
    if (lower.endsWith(".pdf") || mime === "application/pdf") {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const res = await parser.getText();
        return (res.text || "").trim();
      } finally {
        await parser.destroy().catch(() => {});
      }
    }

    if (
      lower.endsWith(".docx") ||
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const res = await mammoth.extractRawText({ buffer });
      return (res.value || "").trim();
    }

    if (lower.endsWith(".txt") || mime.startsWith("text/")) {
      return buffer.toString("utf8").trim();
    }
  } catch (err) {
    console.error("[resume-parser] text extraction failed:", err);
    return "";
  }

  // Old binary .doc (application/msword) and other formats aren't supported.
  return "";
}

/** Strip ```json fences / stray prose so JSON.parse has a clean object. */
function extractJsonObject(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim();
  // Remove markdown code fences if the model wrapped its answer.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Fall back to the first {...last } span.
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim()))
    .filter(Boolean);
}

function coerceParsed(obj: Record<string, unknown>): ParsedResume {
  const str = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s : null;
  };

  const education = Array.isArray(obj.education)
    ? (obj.education as Record<string, unknown>[]).slice(0, 20).map((e) => ({
        degree: str(e?.degree),
        institution: str(e?.institution),
        year: str(e?.year),
      }))
    : [];

  const experience = Array.isArray(obj.experience)
    ? (obj.experience as Record<string, unknown>[]).slice(0, 30).map((e) => ({
        company: str(e?.company),
        role: str(e?.role),
        duration: str(e?.duration),
      }))
    : [];

  return {
    fullName: str(obj.fullName),
    email: str(obj.email),
    phone: str(obj.phone),
    location: str(obj.location),
    currentTitle: str(obj.currentTitle),
    totalExperience: str(obj.totalExperience),
    summary: str(obj.summary),
    skills: toStringArray(obj.skills).slice(0, 60),
    education,
    experience,
    certifications: toStringArray(obj.certifications).slice(0, 40),
    languages: toStringArray(obj.languages).slice(0, 20),
  };
}

const SYSTEM_PROMPT = `You are a resume parser. You are given the raw text of a candidate's resume.
Extract the information into a single JSON object and return ONLY that JSON — no prose, no markdown fences.
Use this exact schema (use null for unknown scalar fields, [] for unknown arrays):
{
  "fullName": string|null,
  "email": string|null,
  "phone": string|null,
  "location": string|null,
  "currentTitle": string|null,
  "totalExperience": string|null,   // human phrase like "6 years", best estimate
  "summary": string|null,           // 1-2 sentence professional summary
  "skills": string[],
  "education": [{ "degree": string|null, "institution": string|null, "year": string|null }],
  "experience": [{ "company": string|null, "role": string|null, "duration": string|null }],
  "certifications": string[],
  "languages": string[]
}
Do not invent data that is not present in the resume.`;

// Resume text can be long; cap what we send so we stay within context limits
// and keep the call cheap. The first ~24k chars hold the meaningful content
// of virtually all real resumes.
const MAX_TEXT_CHARS = 24_000;

/**
 * Send extracted resume text to the org's LLM provider and parse the JSON it
 * returns. Returns null on any failure (no provider configured, provider
 * error, unparseable output) so the caller can still save the resume.
 */
export async function parseResumeWithAI(
  organizationId: string,
  text: string,
): Promise<ParsedResume | null> {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Resume text:\n\n${trimmed.slice(0, MAX_TEXT_CHARS)}`,
    },
  ];

  try {
    const { content } = await chat(organizationId, {
      messages,
      temperature: 0,
      maxTokens: 1500,
    });
    const json = extractJsonObject(content);
    if (!json) return null;
    const obj = JSON.parse(json) as Record<string, unknown>;
    return coerceParsed(obj);
  } catch (err) {
    console.error("[resume-parser] AI parse failed:", err);
    return null;
  }
}

/**
 * End-to-end: extract text from the buffer, run the AI parse, and shape the
 * result (including denormalised flat fields) for persistence.
 */
export async function scanResume(
  organizationId: string,
  buffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<ResumeScanResult> {
  const text = await extractResumeText(buffer, filename, mimeType);
  const data = text ? await parseResumeWithAI(organizationId, text) : null;
  const d = data ?? EMPTY_PARSED;

  const educationSummary =
    d.education
      .map((e) =>
        [e.degree, e.institution, e.year].filter(Boolean).join(", "),
      )
      .filter(Boolean)
      .join(" | ") || null;

  return {
    text,
    data,
    skills: d.skills.length ? d.skills.join(", ") : null,
    totalExperience: d.totalExperience,
    education: educationSummary,
    summary: d.summary,
  };
}
