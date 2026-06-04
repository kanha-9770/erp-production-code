/**
 * Organization-wide settings.
 *
 *   GET  /api/organization/settings    — any authed member of an org
 *   PUT  /api/organization/settings    — org OWNER only
 *
 * Exposes:
 *   • `currency`     — ISO 4217 code; drives formatCurrency() app-wide
 *   • `name`         — display name shown across the app
 *   • `profile`      — free-form identity object surfaced on the
 *                      Organization Setup → Organization Details screen
 *                      (website, type, contact person/number/email,
 *                      primary address, logo URL, …)
 *
 * Plus read-only context the UI uses to render the identity card:
 *   • `ownerId`      — null for a legacy org without an explicit owner
 *   • `createdAt`    — ISO timestamp
 *   • `memberCount`  — number of users in the org (lightweight count, not the list)
 *
 * PUT accepts a partial body — only the supplied fields are updated.
 * `profile` is shallow-merged into the existing JSON so partial saves of a
 * single field never clobber the rest. Designed to keep accepting new
 * org-wide settings without breaking the wire format.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const CURRENCY_RE = /^[A-Z]{3}$/;
const NAME_MIN = 1;
const NAME_MAX = 120;

// Per-field caps for the free-form profile. Keep generous but bounded so a
// bad client can't write unbounded blobs into the JSON column.
const PROFILE_STRING_MAX = 500;

// Whitelist of profile keys we persist. Anything else in the body is ignored
// rather than rejected, so older/newer clients interoperate cleanly.
const PROFILE_FIELDS = [
  "website",
  "type",
  "contactPerson",
  "contactNumber",
  "contactEmail",
  "logoUrl",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "country",
  "zip",
] as const;

type ProfileField = (typeof PROFILE_FIELDS)[number];
type OrgProfile = Partial<Record<ProfileField, string>>;

interface OrgSettings {
  currency: string;
  name: string;
  ownerId: string | null;
  createdAt: string;
  memberCount: number;
  selectedModules: string[];
  profile: OrgProfile;
}

function settingsResponse(s: OrgSettings) {
  return { success: true, settings: s };
}

// Coerce whatever is stored in the JSON column into a clean string→string map
// over the known fields. Tolerant of legacy nulls / non-object shapes.
function normalizeProfile(raw: unknown): OrgProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: OrgProfile = {};
  for (const key of PROFILE_FIELDS) {
    const v = src[key];
    if (typeof v === "string" && v.length > 0) out[key] = v;
  }
  return out;
}

async function loadSettings(organizationId: string): Promise<OrgSettings | null> {
  const [org, memberCount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        currency: true,
        name: true,
        ownerId: true,
        createdAt: true,
        selectedModules: true,
        profile: true,
      },
    }),
    prisma.user.count({ where: { organizationId } }),
  ]);
  if (!org) return null;
  return {
    currency: org.currency ?? "USD",
    name: org.name,
    ownerId: org.ownerId,
    createdAt: org.createdAt.toISOString(),
    memberCount,
    selectedModules: Array.isArray(org.selectedModules) ? org.selectedModules : [],
    profile: normalizeProfile(org.profile),
  };
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
    // No org yet — return safe defaults so the UI renders.
    return NextResponse.json(
      settingsResponse({
        currency: "USD",
        name: "",
        ownerId: null,
        createdAt: new Date().toISOString(),
        memberCount: 0,
        selectedModules: [],
        profile: {},
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const settings = await loadSettings(authUser.organizationId);
  if (!settings) {
    return NextResponse.json(
      { success: false, error: "Organization not found" },
      { status: 404 },
    );
  }
  return NextResponse.json(settingsResponse(settings), {
    headers: { "Cache-Control": "no-store" },
  });
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

  // Owner or org admin may change org-wide settings (isUserAdmin treats the
  // owner as an admin). This powers the Organization Setup → Organization
  // Details form, which is admin configuration work.
  const [org, canEdit] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: authUser.organizationId },
      select: { profile: true },
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const data: { currency?: string; name?: string; profile?: OrgProfile } = {};

  if (body.currency !== undefined) {
    if (typeof body.currency !== "string") {
      return NextResponse.json(
        { success: false, error: "currency must be a 3-letter string" },
        { status: 400 },
      );
    }
    const code = body.currency.trim().toUpperCase();
    if (!CURRENCY_RE.test(code)) {
      return NextResponse.json(
        { success: false, error: "currency must be a valid ISO 4217 code (e.g. USD, INR, EUR)" },
        { status: 400 },
      );
    }
    data.currency = code;
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return NextResponse.json(
        { success: false, error: "name must be a string" },
        { status: 400 },
      );
    }
    const trimmed = body.name.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
      return NextResponse.json(
        { success: false, error: `name must be between ${NAME_MIN} and ${NAME_MAX} characters` },
        { status: 400 },
      );
    }
    data.name = trimmed;
  }

  if (body.profile !== undefined) {
    if (
      body.profile === null ||
      typeof body.profile !== "object" ||
      Array.isArray(body.profile)
    ) {
      return NextResponse.json(
        { success: false, error: "profile must be an object" },
        { status: 400 },
      );
    }
    const incoming = body.profile as Record<string, unknown>;
    const cleaned: OrgProfile = {};
    for (const key of PROFILE_FIELDS) {
      if (!(key in incoming)) continue;
      const v = incoming[key];
      // Allow clearing a field with "" / null; otherwise must be a string.
      if (v === null || v === "") {
        cleaned[key] = "";
        continue;
      }
      if (typeof v !== "string") {
        return NextResponse.json(
          { success: false, error: `profile.${key} must be a string` },
          { status: 400 },
        );
      }
      const trimmed = v.trim();
      if (trimmed.length > PROFILE_STRING_MAX) {
        return NextResponse.json(
          {
            success: false,
            error: `profile.${key} must be ${PROFILE_STRING_MAX} characters or fewer`,
          },
          { status: 400 },
        );
      }
      cleaned[key] = trimmed;
    }

    // Shallow-merge onto whatever is stored, then drop emptied keys so the
    // column stays tidy. A partial save of one field never wipes the rest.
    const merged: OrgProfile = { ...normalizeProfile(org.profile), ...cleaned };
    for (const key of PROFILE_FIELDS) {
      if (merged[key] === "" || merged[key] === undefined) delete merged[key];
    }
    data.profile = merged;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { success: false, error: "No supported fields supplied" },
      { status: 400 },
    );
  }

  await prisma.organization.update({
    where: { id: authUser.organizationId },
    data,
  });

  const fresh = await loadSettings(authUser.organizationId);
  if (!fresh) {
    return NextResponse.json(
      { success: false, error: "Organization vanished after update" },
      { status: 500 },
    );
  }
  return NextResponse.json(settingsResponse(fresh), {
    headers: { "Cache-Control": "no-store" },
  });
}
