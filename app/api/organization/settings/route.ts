/**
 * Organization-wide settings.
 *
 *   GET  /api/organization/settings    — any authed member of an org
 *   PUT  /api/organization/settings    — org OWNER only
 *
 * Exposes:
 *   • `currency`     — ISO 4217 code; drives formatCurrency() app-wide
 *   • `name`         — display name shown across the app
 *
 * Plus read-only context the UI uses to render the identity card:
 *   • `ownerId`      — null for a legacy org without an explicit owner
 *   • `createdAt`    — ISO timestamp
 *   • `memberCount`  — number of users in the org (lightweight count, not the list)
 *
 * PUT accepts a partial body — only the supplied fields are updated.
 * Designed to keep accepting new org-wide settings (address, timezone,
 * logo, fiscal year, …) without breaking the wire format.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const CURRENCY_RE = /^[A-Z]{3}$/;
const NAME_MIN = 1;
const NAME_MAX = 120;

interface OrgSettings {
  currency: string;
  name: string;
  ownerId: string | null;
  createdAt: string;
  memberCount: number;
  selectedModules: string[];
}

function settingsResponse(s: OrgSettings) {
  return { success: true, settings: s };
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

  // Owner-only writes. Admins are allowed to *read* (above) but only the
  // owner can change org-wide settings. This is intentionally stricter
  // than isUserAdmin — see the page's permission question on /profile.
  const org = await prisma.organization.findUnique({
    where: { id: authUser.organizationId },
    select: { ownerId: true },
  });
  if (!org || org.ownerId !== authUser.id) {
    return NextResponse.json(
      { success: false, error: "Only the organization owner can change these settings" },
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

  const data: { currency?: string; name?: string } = {};

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
