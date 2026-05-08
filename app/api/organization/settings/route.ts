/**
 * Organization-wide settings.
 *
 *   GET  /api/organization/settings    — any authed member of an org
 *   PUT  /api/organization/settings    — admins / org owners only
 *
 * Currently exposes the org's `currency` field (ISO 4217). Designed to
 * accept additional org-wide settings (locale, fiscal year, address,
 * etc.) without breaking the wire format — the response always returns
 * the full settings object so the client can hydrate every field in one
 * round-trip.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// Validates that a string looks like an ISO 4217 currency code. We
// don't try to enforce membership in a fixed list because new codes
// occasionally show up (e.g. UYW, VES) and the UI already validates
// against its own catalogue — server-side we just need to refuse
// obviously bogus inputs.
const CURRENCY_RE = /^[A-Z]{3}$/;

function settingsResponse(currency: string) {
  return { success: true, settings: { currency } };
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
    // No org → return defaults rather than 404. Lets the UI render in a
    // sensible state for users who haven't been added to an org yet.
    return NextResponse.json(settingsResponse("USD"));
  }

  const org = await prisma.organization.findUnique({
    where: { id: authUser.organizationId },
    select: { currency: true },
  });

  return NextResponse.json(
    settingsResponse(org?.currency ?? "USD"),
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

  const admin = await isUserAdmin(authUser.id, authUser.organizationId);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Admin access required" },
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

  // Build a partial update so we can extend this endpoint with more
  // fields (locale, address, etc.) without rewriting the validation
  // pipeline. Each field is parsed into a typed slot or quietly
  // dropped if the input is malformed.
  const data: { currency?: string } = {};

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

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { success: false, error: "No supported fields supplied" },
      { status: 400 },
    );
  }

  const updated = await prisma.organization.update({
    where: { id: authUser.organizationId },
    data,
    select: { currency: true },
  });

  return NextResponse.json(
    settingsResponse(updated.currency),
    { headers: { "Cache-Control": "no-store" } },
  );
}
