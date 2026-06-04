/**
 * Organization Setup — configuration sections beyond the core identity that
 * lives on /api/organization/settings.
 *
 *   GET  /api/organization/setup    — any authed member of an org
 *   PUT  /api/organization/setup    — org OWNER only; body { section, data }
 *
 * All sections are persisted in the single `Organization.setup` JSON column,
 * keyed by section name. PUT replaces exactly one section (read-merge-write)
 * so saving Departments never touches Locations, etc.
 *
 * Sections:
 *   • policy         (object)  — working days, fiscal/leave year, timezone…
 *   • locations      (list)    — offices/sites
 *   • departments    (list)
 *   • designations   (list)
 *   • branding       (object)  — domain + rebranding
 *   • fromAddresses  (list)    — outgoing sender addresses
 *   • emailAuth      (object)  — sending domain + SPF/DKIM/DMARC state
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type SectionKind = "object" | "list";

const SECTIONS: Record<string, SectionKind> = {
  policy: "object",
  locations: "list",
  departments: "list",
  designations: "list",
  branding: "object",
  fromAddresses: "list",
  emailAuth: "object",
};

// Defensive bounds so a bad client can't write unbounded blobs into the column.
const MAX_LIST_ITEMS = 500;
const MAX_STRING_LEN = 2000;
const MAX_KEYS_PER_OBJECT = 60;

type SetupData = Record<string, unknown>;

function emptySetup(): SetupData {
  const out: SetupData = {};
  for (const [key, kind] of Object.entries(SECTIONS)) {
    out[key] = kind === "list" ? [] : {};
  }
  return out;
}

// Coerce the stored JSON into a clean object with every known section present.
function normalizeSetup(raw: unknown): SetupData {
  const base = emptySetup();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const src = raw as Record<string, unknown>;
  for (const [key, kind] of Object.entries(SECTIONS)) {
    const v = src[key];
    if (kind === "list" && Array.isArray(v)) base[key] = v;
    else if (kind === "object" && v && typeof v === "object" && !Array.isArray(v))
      base[key] = v;
  }
  return base;
}

// Sanitize a single value to a JSON-safe primitive. Returns undefined for
// anything we won't store (functions, nested arrays/objects too deep, etc.).
function sanitizeScalar(v: unknown): string | number | boolean | undefined {
  if (typeof v === "string") return v.slice(0, MAX_STRING_LEN);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v;
  return undefined;
}

// A "record" is a flat object of scalars (one list item, or one config object).
function sanitizeRecord(input: unknown): Record<string, string | number | boolean> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const src = input as Record<string, unknown>;
  const out: Record<string, string | number | boolean> = {};
  let count = 0;
  for (const [k, raw] of Object.entries(src)) {
    if (count >= MAX_KEYS_PER_OBJECT) break;
    if (typeof k !== "string" || k.length === 0 || k.length > 100) continue;
    const val = sanitizeScalar(raw);
    if (val === undefined) continue;
    out[k] = val;
    count++;
  }
  return out;
}

function validateSection(
  kind: SectionKind,
  data: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (kind === "object") {
    const rec = sanitizeRecord(data);
    if (rec === null) return { ok: false, error: "data must be an object" };
    return { ok: true, value: rec };
  }
  // list
  if (!Array.isArray(data)) return { ok: false, error: "data must be an array" };
  if (data.length > MAX_LIST_ITEMS)
    return { ok: false, error: `at most ${MAX_LIST_ITEMS} items allowed` };
  const cleaned: Array<Record<string, string | number | boolean>> = [];
  for (const item of data) {
    const rec = sanitizeRecord(item);
    if (rec === null) return { ok: false, error: "each item must be an object" };
    cleaned.push(rec);
  }
  return { ok: true, value: cleaned };
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: true, setup: emptySetup(), isOwner: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const [org, canEdit] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: authUser.organizationId },
      select: { setup: true },
    }),
    isUserAdmin(authUser.id, authUser.organizationId),
  ]);
  if (!org) {
    return NextResponse.json(
      { success: false, error: "Organization not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      setup: normalizeSetup(org.setup),
      // `isOwner` here means "may edit" — owner or org admin (isUserAdmin
      // treats the owner as an admin). Kept under this key for the client hook.
      isOwner: canEdit,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: "User is not a member of any organization" },
      { status: 403 },
    );
  }

  let body: { section?: unknown; data?: unknown };
  try {
    body = (await request.json()) as { section?: unknown; data?: unknown };
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const section = typeof body.section === "string" ? body.section : "";
  const kind = SECTIONS[section];
  if (!kind) {
    return NextResponse.json(
      { success: false, error: `Unknown section "${section}"` },
      { status: 400 },
    );
  }

  // Owner or org admin may write (org setup is admin configuration work,
  // consistent with editing the org structure).
  const [org, canEdit] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: authUser.organizationId },
      select: { setup: true },
    }),
    isUserAdmin(authUser.id, authUser.organizationId),
  ]);
  if (!org) {
    return NextResponse.json(
      { success: false, error: "Organization not found" },
      { status: 404 },
    );
  }
  if (!canEdit) {
    return NextResponse.json(
      { success: false, error: "You don't have permission to change these settings" },
      { status: 403 },
    );
  }

  const validated = validateSection(kind, body.data);
  if (!validated.ok) {
    return NextResponse.json(
      { success: false, error: validated.error },
      { status: 400 },
    );
  }

  const next = normalizeSetup(org.setup);
  next[section] = validated.value;

  await prisma.organization.update({
    where: { id: authUser.organizationId },
    data: { setup: next as object },
  });

  return NextResponse.json(
    { success: true, setup: next, isOwner: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
