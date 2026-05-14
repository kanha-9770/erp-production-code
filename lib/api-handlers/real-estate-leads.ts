/**
 * Real Estate Brokerage — Lead, LeadActivity, PropertyViewing, Buyer handlers.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";
import {
  DHASH_HAMMING_THRESHOLD,
  PHASH_HAMMING_THRESHOLD,
  PHASH_HEX_LENGTH_COMBINED,
  PHASH_HEX_LENGTH_LEGACY,
  comparePhashes,
  findBestPhashMatch,
  parsePhashHex,
} from "@/lib/real-estate/perceptual-hash-match";

async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId)
    throw NextResponse.json(
      { error: "User is not associated with any organization" },
      { status: 403 },
    );
  return user as { id: string; email: string; organizationId: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Viewer-scope (admin / Managing Director / Principal Broker = privileged)
// ─────────────────────────────────────────────────────────────────────────────
//
// Mirrors the gate in real-estate-agents.ts so the two surfaces agree on who
// gets the cross-team view. Anyone who is NOT in this tier sees only:
//   • leads they own (assigned to, created by, or already won)
//   • leads in the company pool (origin = COMPANY)
// Duplicate links (`duplicateOfLeadId`) are stripped from every response a
// non-privileged caller receives — the original capturer and the second
// capturer each see their own lead and nothing more.
const PRIVILEGED_LEAD_ROLE_PATTERN = /^(managing director|director|principal broker)$/i;

async function isLeadPrivileged(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  if (await isUserAdmin(userId, organizationId)) return true;
  const roles = await prisma.$queryRaw<{ name: string }[]>`
    SELECT r.name AS name
    FROM user_unit_assignments uua
    JOIN roles r ON r.id = uua.role_id
    WHERE uua.user_id = ${userId}
  `;
  return roles.some((r) => PRIVILEGED_LEAD_ROLE_PATTERN.test((r.name ?? "").trim()));
}

// ─────────────────────────────────────────────────────────────────────────────
// Contact normalisation (for silent duplicate detection)
// ─────────────────────────────────────────────────────────────────────────────
//
// Two contacts are "the same person" when their normalised phone matches OR
// their normalised email matches. We index both columns separately on Lead
// so the lookup is O(1) for either side.
//
// Phone: strip every non-digit, then take the trailing 10 digits — handles
// country-code prefixes (`+91 99999 00000` vs `9999900000` both → 9999900000)
// and stray spaces / dashes / parentheses. We don't try to be fully E.164
// aware; we just need to recognise the same number written two ways.
//
// Email: trim + lowercase. Doesn't strip dots-in-Gmail because at this scale
// the false-positives from that rule cost more than the catches.

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, "");
  if (digits.length < 7) return null; // too short to be a real phone
  return digits.slice(-10);
}

function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  return trimmed || null;
}

/**
 * Returns the original lead this one is a silent duplicate of, or null if
 * no match in the same org. Run during AGENT-origin creates. Matching
 * happens on THREE independent signals — any one is enough for "same
 * person" by our rule, so an agent who deliberately mistypes the phone
 * to fool the dup-check still trips on the photo:
 *
 *   1. Normalised phone (`phoneNormalized` index lookup — fast)
 *   2. Normalised email (`emailNormalized` index lookup — fast)
 *   3. Perceptual photo hash within Hamming ≤ threshold (in-memory
 *      compare across org candidates with a non-null phash — fast
 *      enough for orgs up to ~10k leads).
 *
 * If multiple signals match, the earliest captured matching lead wins
 * — that's the "first capturer keeps ownership" rule.
 *
 * Excludes the lead being created (when called from update) by passing
 * its id. Also excludes leads that are themselves marked as duplicates
 * (`duplicateOfLeadId IS NOT NULL`) so chains collapse to the root.
 */
async function findDuplicateLead(args: {
  organizationId: string;
  phoneNormalized: string | null;
  emailNormalized: string | null;
  photoPhash: string | null;
  excludeLeadId?: string;
}): Promise<{ id: string; assignedAgentId: string | null; matchedBy: "phone" | "email" | "photo" } | null> {
  const { organizationId, phoneNormalized, emailNormalized, photoPhash, excludeLeadId } = args;

  // ── Phase 1: exact normalised-contact lookup (cheap, indexed) ────────
  const or: any[] = [];
  if (phoneNormalized) or.push({ phoneNormalized });
  if (emailNormalized) or.push({ emailNormalized });

  if (or.length > 0) {
    const exactMatch = await (prisma as any).lead.findFirst({
      where: {
        organizationId,
        duplicateOfLeadId: null,
        ...(excludeLeadId ? { NOT: { id: excludeLeadId } } : {}),
        OR: or,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        assignedAgentId: true,
        phoneNormalized: true,
        emailNormalized: true,
      },
    });
    if (exactMatch) {
      // Decide which signal hit so we can log it on the duplicate record
      // for admin diagnostics.
      const matchedBy: "phone" | "email" =
        phoneNormalized && exactMatch.phoneNormalized === phoneNormalized
          ? "phone"
          : "email";
      return {
        id: exactMatch.id,
        assignedAgentId: exactMatch.assignedAgentId,
        matchedBy,
      };
    }
  }

  // ── Phase 2: perceptual-hash sweep (only if phone/email missed) ──────
  // We deliberately run this AFTER the indexed lookup so the common
  // case (agent typed the right phone, no spoofing) costs a single
  // indexed query. Only the suspicious cases — different phone, no
  // email, but same photo — pay the in-memory bit-compare cost.
  //
  // Target hash is the 32-char dHash+pHash compound the new browser
  // hasher emits. Legacy 16-char rows (dHash-only) are also handled
  // by parsePhashHex / comparePhashes — they just match on dHash.
  const targetParsed = parsePhashHex(photoPhash);
  if (targetParsed.dhash == null && targetParsed.phash == null) return null;

  const candidates: { id: string; assignedAgentId: string | null; photoPhash: string | null }[] =
    await (prisma as any).lead.findMany({
      where: {
        organizationId,
        duplicateOfLeadId: null,
        photoPhash: { not: null },
        ...(excludeLeadId ? { NOT: { id: excludeLeadId } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        assignedAgentId: true,
        photoPhash: true,
      },
    });

  const best = findBestPhashMatch(
    targetParsed,
    candidates.map((c) => ({
      id: c.id,
      assignedAgentId: c.assignedAgentId,
      phash: c.photoPhash,
    })),
    DHASH_HAMMING_THRESHOLD,
    PHASH_HAMMING_THRESHOLD,
  );
  if (!best) return null;

  // Console log so the admin can tail the server output and confirm
  // the dup-detection actually fired (useful while validating the
  // feature works on real data).
  if (typeof console !== "undefined") {
    console.log(
      `[lead-dup] photo match: lead ${best.candidate.id} via ${best.signal} distance ${best.distance}`,
    );
  }

  return {
    id: best.candidate.id,
    assignedAgentId: best.candidate.assignedAgentId,
    matchedBy: "photo",
  };
}

/**
 * Validate a perceptual hash from the client. Accepts either the
 * legacy 16-char dHash-only format (old rows + older clients) or the
 * current 32-char dHash+pHash compound. Anything else is dropped
 * silently so a bad client doesn't blow up the create endpoint.
 */
function sanitisePhotoPhash(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (
    s.length !== PHASH_HEX_LENGTH_LEGACY &&
    s.length !== PHASH_HEX_LENGTH_COMBINED
  ) {
    return null;
  }
  if (!/^[0-9a-f]+$/.test(s)) return null;
  return s;
}

async function handle(fn: () => Promise<NextResponse>, label: string) {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[LeadHandlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json({ error: "Duplicate value" }, { status: 409 });
    if (e?.code === "P2025")
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

function serializeLead<T extends Record<string, any>>(l: T): any {
  if (!l) return l;
  return {
    ...l,
    budgetMin: l.budgetMin != null ? Number(l.budgetMin) : null,
    budgetMax: l.budgetMax != null ? Number(l.budgetMax) : null,
  };
}

/**
 * Strip fields that non-privileged callers must never see — specifically
 * the `duplicateOfLeadId` pointer (so a regular agent can't infer that
 * someone else also captured the same person). Also clears the related
 * `duplicateOf` / `duplicates` relations when they're hydrated by an
 * `include`.
 */
function redactForViewer<T extends Record<string, any>>(l: T, isPrivileged: boolean): any {
  if (!l || isPrivileged) return l;
  const out: any = { ...l };
  delete out.duplicateOfLeadId;
  delete out.duplicateOf;
  delete out.duplicates;
  // Normalised contact columns are an internal index — no reason to ship them.
  delete out.phoneNormalized;
  delete out.emailNormalized;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAD HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const LeadHandlers = {
  // GET /api/real-estate/leads
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const isPrivileged = await isLeadPrivileged(auth.id, auth.organizationId);
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const score = url.searchParams.get("score") ?? undefined;
      const source = url.searchParams.get("source") ?? undefined;
      const origin = url.searchParams.get("origin") ?? undefined; // AGENT | COMPANY
      // `pool` is the UI's coarse filter: "mine" | "company" | "all". Defaults
      // to "all" for privileged users, "mine" for agents (most useful first).
      const poolRaw = url.searchParams.get("pool");
      const pool = poolRaw ?? (isPrivileged ? "all" : "mine");
      const assignedAgentId = url.searchParams.get("assignedAgentId") ?? undefined;
      const search = url.searchParams.get("search") ?? undefined;
      const followupBefore = url.searchParams.get("followupBefore") ?? undefined;
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
      const offset = Number(url.searchParams.get("offset") ?? 0);

      // ── Visibility scoping ────────────────────────────────────────────
      // The OR cascade encodes: "this row is visible to the caller if it's
      // mine (assigned/created/won) OR it's in the company pool". Admins
      // and MD-tier roles skip this and see everything.
      const ownershipOr: any[] = [
        { assignedAgentId: auth.id },
        { createdById: auth.id },
        { ownerAgentId: auth.id } as any,
      ];

      let visibilityFilter: Prisma.LeadWhereInput | null = null;
      if (!isPrivileged) {
        const poolPart: any = { origin: "COMPANY" }; // every agent sees the open pool
        const minePart: any = { OR: ownershipOr };
        if (pool === "mine") visibilityFilter = minePart;
        else if (pool === "company") visibilityFilter = poolPart;
        else visibilityFilter = { OR: [minePart, poolPart] }; // "all"
        // Always hide leads that are themselves silent duplicates pointing
        // OFF the viewer's ownership. Concretely: the original is shown to
        // its owner; a duplicate is shown to ITS own owner. Neither agent
        // ever sees the other's row.
      }

      const where: Prisma.LeadWhereInput = {
        organizationId: auth.organizationId,
        ...(visibilityFilter ?? {}),
        ...(origin ? ({ origin: origin as any } as any) : {}),
        ...(status ? { status: status as any } : {}),
        ...(score ? { score: score as any } : {}),
        ...(source ? { source: source as any } : {}),
        ...(assignedAgentId ? { assignedAgentId } : {}),
        ...(followupBefore
          ? { nextFollowUpAt: { lte: new Date(followupBefore) } }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const [items, total] = await Promise.all([
        prisma.lead.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { activities: true, viewings: true } },
          },
        }),
        prisma.lead.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        data: items.map((l) => redactForViewer(serializeLead(l), isPrivileged)),
        meta: { total, limit, offset, isPrivileged, pool },
      });
    }, "list");
  },

  // POST /api/real-estate/leads
  //
  // Two origin modes:
  //   AGENT   (default)  — agent captures a lead. The new row is assigned
  //                        to the caller (or `body.assignedAgentId`). We
  //                        silently check for an existing lead in the org
  //                        with the same normalised phone/email; if found,
  //                        the new row gets `duplicateOfLeadId` set. The
  //                        agent is never told.
  //   COMPANY            — admin/MD opens the lead to the org. Any agent
  //                        can pick it up later via /claim. No
  //                        auto-assignment, no duplicate-detection (the
  //                        company pool is by definition open to multiple
  //                        agents working in parallel).
  //
  // Non-privileged callers are forced into AGENT mode even if they pass
  // origin=COMPANY — only admin/MD-tier roles may open company-pool leads.
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();
      if (!body.name)
        return NextResponse.json({ error: "name is required" }, { status: 400 });

      const isPrivileged = await isLeadPrivileged(auth.id, auth.organizationId);
      const requestedOrigin = body.origin === "COMPANY" ? "COMPANY" : "AGENT";
      const origin: "AGENT" | "COMPANY" =
        requestedOrigin === "COMPANY" && isPrivileged ? "COMPANY" : "AGENT";

      const phoneNormalized = normalizePhone(body.phone);
      const emailNormalized = normalizeEmail(body.email);
      // Trust the client-computed dHash but validate its shape. If the
      // agent didn't snap a photo, the field is null — phone/email still
      // protect us in that case.
      const photoPhash = sanitisePhotoPhash(body.photoPhash);
      const photoUrl = typeof body.photoUrl === "string" && body.photoUrl.trim()
        ? body.photoUrl.trim()
        : null;

      // For AGENT-origin captures: identify the silent-duplicate parent (if
      // any) BEFORE the insert. Doing it pre-insert means we can stamp the
      // pointer in the same write and don't need a second update step.
      // Three signals — phone, email, photo — any one match is enough.
      const duplicateOf =
        origin === "AGENT"
          ? await findDuplicateLead({
              organizationId: auth.organizationId,
              phoneNormalized,
              emailNormalized,
              photoPhash,
            })
          : null;

      // Assignment rules:
      //   - COMPANY origin: never auto-assign; leave it in the pool until
      //     an agent claims it.
      //   - AGENT origin: respect explicit assignedAgentId, otherwise
      //     assign to the capturing user. This is the existing behaviour.
      const resolvedAssignedAgentId =
        origin === "COMPANY"
          ? null
          : body.assignedAgentId || auth.id;

      const lead = await (prisma as any).lead.create({
        data: {
          organizationId: auth.organizationId,
          origin,
          // ownerAgentId stays NULL until conversion; for COMPANY this is
          // the "no winner yet" state, for AGENT it's "we'll set it when
          // the transaction closes".
          ownerAgentId: null,
          duplicateOfLeadId: duplicateOf?.id ?? null,
          name: body.name,
          email: body.email || null,
          phone: body.phone || null,
          altPhone: body.altPhone || null,
          phoneNormalized,
          emailNormalized,
          photoUrl,
          photoPhash,
          budgetMin:
            body.budgetMin != null ? new Prisma.Decimal(body.budgetMin) : null,
          budgetMax:
            body.budgetMax != null ? new Prisma.Decimal(body.budgetMax) : null,
          preferredCities: Array.isArray(body.preferredCities)
            ? body.preferredCities
            : [],
          propertyTypes: Array.isArray(body.propertyTypes)
            ? body.propertyTypes
            : [],
          bedroomsMin: body.bedroomsMin ?? null,
          status: body.status || "NEW",
          score: body.score || "WARM",
          source: body.source || "OTHER",
          sourceDetails: body.sourceDetails || null,
          assignedAgentId: resolvedAssignedAgentId,
          assignedAt: resolvedAssignedAgentId ? new Date() : null,
          nextFollowUpAt: body.nextFollowUpAt
            ? new Date(body.nextFollowUpAt)
            : null,
          notes: body.notes || null,
          createdById: auth.id,
        },
      });

      // Seed activity entries. For duplicates we still seed an assignment
      // activity for the capturing agent — they don't know it's a dup so
      // their timeline must look like a normal capture. We do NOT log
      // anything that mentions the duplicate; that record lives only on
      // the row's `duplicateOfLeadId` column for admin visibility.
      if (lead.assignedAgentId) {
        await prisma.leadActivity.create({
          data: {
            leadId: lead.id,
            type: "ASSIGNMENT",
            agentId: lead.assignedAgentId,
            subject: "Lead assigned",
            data: { fromAgentId: null, toAgentId: lead.assignedAgentId },
          },
        });
      }

      return NextResponse.json(
        { success: true, data: redactForViewer(serializeLead(lead), isPrivileged) },
        { status: 201 },
      );
    }, "create");
  },

  // GET /api/real-estate/leads/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const isPrivileged = await isLeadPrivileged(auth.id, auth.organizationId);

      const lead: any = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
        include: {
          activities: { orderBy: { occurredAt: "desc" } },
          viewings: {
            orderBy: { scheduledAt: "desc" },
            include: {
              property: {
                select: { id: true, title: true, code: true, primaryImageUrl: true, city: true },
              },
            },
          },
          buyer: true,
        },
      });
      if (!lead)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Non-privileged callers may only view a lead they own or one that's
      // in the company pool. We return 404 (not 403) for everything else
      // so the endpoint never confirms the existence of an out-of-scope
      // lead — important for the silent-duplicate guarantee.
      if (!isPrivileged) {
        const isOwn =
          lead.assignedAgentId === auth.id ||
          lead.createdById === auth.id ||
          lead.ownerAgentId === auth.id;
        const isCompanyPool = lead.origin === "COMPANY";
        if (!isOwn && !isCompanyPool) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
      }

      return NextResponse.json({
        success: true,
        data: redactForViewer(serializeLead(lead), isPrivileged),
      });
    }, "get");
  },

  // PUT /api/real-estate/leads/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const isPrivileged = await isLeadPrivileged(auth.id, auth.organizationId);
      const existing: any = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Same gate as `get`: non-privileged callers may only mutate a lead
      // they own. COMPANY-pool leads can be mutated by any agent (e.g. to
      // update notes / follow-up while they're working it). Out-of-scope
      // edits return 404 to preserve the silent-duplicate guarantee.
      if (!isPrivileged) {
        const isOwn =
          existing.assignedAgentId === auth.id ||
          existing.createdById === auth.id ||
          existing.ownerAgentId === auth.id;
        const isCompanyPool = existing.origin === "COMPANY";
        if (!isOwn && !isCompanyPool) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
      }

      const body = await request.json();
      const data: Prisma.LeadUpdateInput = {};
      const setIf = (k: string, v: any) => {
        if (v !== undefined) (data as any)[k] = v;
      };

      setIf("name", body.name);
      setIf("email", body.email);
      setIf("phone", body.phone);
      setIf("altPhone", body.altPhone);

      // Keep the normalised lookup keys in sync with phone/email changes
      // so future duplicate-detection sweeps see the current values.
      if (body.phone !== undefined) {
        (data as any).phoneNormalized = normalizePhone(body.phone);
      }
      if (body.email !== undefined) {
        (data as any).emailNormalized = normalizeEmail(body.email);
      }
      // Photo + perceptual hash. Re-checking duplicates on photo
      // update would be a separate feature (an edit is the agent's
      // choice, not a fresh capture) — for now we just keep the data
      // current so subsequent CAPTURES will dup-check against it.
      if (body.photoUrl !== undefined) {
        (data as any).photoUrl =
          typeof body.photoUrl === "string" && body.photoUrl.trim()
            ? body.photoUrl.trim()
            : null;
      }
      if (body.photoPhash !== undefined) {
        (data as any).photoPhash = sanitisePhotoPhash(body.photoPhash);
      }
      setIf("preferredCities", body.preferredCities);
      setIf("propertyTypes", body.propertyTypes);
      setIf("bedroomsMin", body.bedroomsMin);
      setIf("score", body.score);
      setIf("source", body.source);
      setIf("sourceDetails", body.sourceDetails);
      setIf("notes", body.notes);
      setIf("lostReason", body.lostReason);

      if (body.budgetMin !== undefined)
        data.budgetMin =
          body.budgetMin == null ? null : new Prisma.Decimal(body.budgetMin);
      if (body.budgetMax !== undefined)
        data.budgetMax =
          body.budgetMax == null ? null : new Prisma.Decimal(body.budgetMax);
      if (body.nextFollowUpAt !== undefined)
        data.nextFollowUpAt = body.nextFollowUpAt
          ? new Date(body.nextFollowUpAt)
          : null;

      // Status side-effects.
      if (body.status !== undefined && body.status !== existing.status) {
        // BR-13 — converting requires a transaction reference (Phase 2). For
        // Phase 1 we accept CONVERTED via the explicit /convert endpoint only;
        // the generic update reroutes mistaken use back to NEGOTIATING.
        if (body.status === "CONVERTED") {
          return NextResponse.json(
            { error: "Use POST /convert to mark a lead as Converted." },
            { status: 400 },
          );
        }
        data.status = body.status;
      }

      // Re-assignment activity.
      if (body.assignedAgentId !== undefined && body.assignedAgentId !== existing.assignedAgentId) {
        data.assignedAgentId = body.assignedAgentId || null;
        data.assignedAt = body.assignedAgentId ? new Date() : null;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.lead.update({ where: { id }, data });

        if (data.status && data.status !== existing.status) {
          await tx.leadActivity.create({
            data: {
              leadId: id,
              type: "STATUS_CHANGE",
              agentId: existing.assignedAgentId ?? auth.id,
              subject: `${existing.status} → ${data.status}`,
              data: { fromStatus: existing.status, toStatus: data.status },
            },
          });
        }

        if (
          data.assignedAgentId !== undefined &&
          data.assignedAgentId !== existing.assignedAgentId
        ) {
          await tx.leadActivity.create({
            data: {
              leadId: id,
              type: "ASSIGNMENT",
              agentId: (data.assignedAgentId as string) ?? auth.id,
              subject: "Lead reassigned",
              data: {
                fromAgentId: existing.assignedAgentId,
                toAgentId: data.assignedAgentId,
              },
            },
          });
        }

        return u;
      });

      return NextResponse.json({ success: true, data: serializeLead(updated) });
    }, "update");
  },

  // DELETE /api/real-estate/leads/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const isPrivileged = await isLeadPrivileged(auth.id, auth.organizationId);
      const lead: any = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!lead)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Only the owning agent (for AGENT leads) or a privileged user can
      // delete. COMPANY-pool leads must only be deleted by admin/MD —
      // an agent who claimed it doesn't get to bin it for everyone.
      if (!isPrivileged) {
        const isOwn =
          lead.assignedAgentId === auth.id ||
          lead.createdById === auth.id ||
          lead.ownerAgentId === auth.id;
        if (!isOwn || lead.origin === "COMPANY") {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
      }

      await prisma.lead.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }, "remove");
  },

  // POST /api/real-estate/leads/[id]/claim — for COMPANY-origin leads only.
  // Lets an agent pick up a pool lead and start working it. Idempotent for
  // the claiming agent; refuses if a different agent already owns or has
  // claimed it (to prevent two agents working the same row by accident
  // — for that case admin can re-open the pool by clearing the assignment).
  async claim(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const lead: any = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!lead)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      if (lead.origin !== "COMPANY") {
        return NextResponse.json(
          { error: "Only company-pool leads can be claimed." },
          { status: 400 },
        );
      }
      if (lead.assignedAgentId && lead.assignedAgentId !== auth.id) {
        return NextResponse.json(
          { error: "This lead has already been claimed by another agent." },
          { status: 409 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.lead.update({
          where: { id },
          data: {
            assignedAgentId: auth.id,
            assignedAt: new Date(),
            // ownerAgentId stays NULL — the winner is only stamped when
            // the linked transaction closes. Claiming != owning.
            status: lead.status === "NEW" ? "CONTACTED" : lead.status,
          },
        });
        await tx.leadActivity.create({
          data: {
            leadId: id,
            type: "ASSIGNMENT",
            agentId: auth.id,
            subject: "Claimed from company pool",
            data: { fromAgentId: null, toAgentId: auth.id, claimedFromPool: true },
          },
        });
        return u;
      });

      const isPrivileged = await isLeadPrivileged(auth.id, auth.organizationId);
      return NextResponse.json({
        success: true,
        data: redactForViewer(serializeLead(updated), isPrivileged),
      });
    }, "claim");
  },

  // POST /api/real-estate/leads/[id]/convert — BR-13 entry point. Phase 1 just
  // stamps the conversion + creates a Buyer; Phase 2 will require a
  // Transaction reference too.
  async convert(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const isPrivileged = await isLeadPrivileged(auth.id, auth.organizationId);
      const body = await request.json().catch(() => ({}));
      const existing: any = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (existing.status === "CONVERTED")
        return NextResponse.json({ error: "Already converted" }, { status: 409 });

      // Same access gate as update/get.
      if (!isPrivileged) {
        const isOwn =
          existing.assignedAgentId === auth.id ||
          existing.createdById === auth.id ||
          existing.ownerAgentId === auth.id;
        const isCompanyPool = existing.origin === "COMPANY";
        if (!isOwn && !isCompanyPool) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        let buyerId = existing.buyerId;
        if (!buyerId) {
          const buyer = await tx.buyer.create({
            data: {
              organizationId: auth.organizationId,
              name: body.buyer?.name || existing.name,
              email: body.buyer?.email ?? existing.email,
              phone: body.buyer?.phone ?? existing.phone,
              panOrTaxId: body.buyer?.panOrTaxId || null,
              addressLine1: body.buyer?.addressLine1 || null,
              city: body.buyer?.city || null,
              country: body.buyer?.country || null,
              createdById: auth.id,
            },
          });
          buyerId = buyer.id;
        }

        // The closing rule the user asked for: whoever closes the lead
        // becomes its owner. For COMPANY-pool leads in particular this is
        // the moment the lead gets a final owner (assignment alone isn't
        // enough). For AGENT-origin we stamp it too so the data stays
        // consistent across the two origins.
        const closer = existing.assignedAgentId ?? auth.id;

        const lead: any = await (tx as any).lead.update({
          where: { id },
          data: {
            status: "CONVERTED",
            convertedAt: new Date(),
            buyerId,
            ownerAgentId: closer,
          },
          include: { buyer: true },
        });

        await tx.leadActivity.create({
          data: {
            leadId: id,
            type: "STATUS_CHANGE",
            agentId: closer,
            subject: `Converted (${existing.status} → CONVERTED)`,
            data: {
              fromStatus: existing.status,
              toStatus: "CONVERTED",
              buyerId,
              ownerAgentId: closer,
            },
          },
        });

        return lead;
      });

      return NextResponse.json({
        success: true,
        data: redactForViewer(serializeLead(updated), isPrivileged),
      });
    }, "convert");
  },

  // GET /api/real-estate/admin/lead-duplicates — admin-only.
  // Surfaces every AGENT-origin lead that was created as a silent duplicate
  // of an earlier capture, grouped by their parent (the original) so the
  // admin can review who's stepping on whose toes.
  //
  // Per duplicate we also compute and return `matchedBy` ("phone" | "email"
  // | "photo") plus, for photo matches, the actual Hamming distance — so
  // the review page can show *why* each pair flagged.
  async duplicates(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const isAdmin = await isLeadPrivileged(auth.id, auth.organizationId);
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Pull all duplicate rows + their originals, plus enough Lead
      // columns on the original that we can recompute the matched-by
      // signal client-side (we need phoneNormalized / emailNormalized /
      // photoPhash on both sides).
      const PARENT_FIELDS = {
        id: true,
        name: true,
        email: true,
        phone: true,
        phoneNormalized: true,
        emailNormalized: true,
        photoUrl: true,
        photoPhash: true,
        assignedAgentId: true,
        createdById: true,
        createdAt: true,
        status: true,
      } as const;

      const dups: any[] = await (prisma as any).lead.findMany({
        where: {
          organizationId: auth.organizationId,
          duplicateOfLeadId: { not: null },
        },
        orderBy: { createdAt: "desc" },
        include: {
          duplicateOf: { select: PARENT_FIELDS },
        },
      });

      // Look up the human-readable names for every agent referenced
      // (assignedAgentId / createdById on both the duplicate and its
      // parent). One query, mapped client-side.
      const agentUserIds = new Set<string>();
      for (const d of dups) {
        if (d.assignedAgentId) agentUserIds.add(d.assignedAgentId);
        if (d.createdById) agentUserIds.add(d.createdById);
        if (d.duplicateOf?.assignedAgentId) agentUserIds.add(d.duplicateOf.assignedAgentId);
        if (d.duplicateOf?.createdById) agentUserIds.add(d.duplicateOf.createdById);
      }
      const users =
        agentUserIds.size > 0
          ? await prisma.user.findMany({
              where: { id: { in: Array.from(agentUserIds) } },
              select: { id: true, first_name: true, last_name: true, email: true },
            })
          : [];
      const userById = new Map(users.map((u) => [u.id, u]));

      const decorateAgent = (userId: string | null) => {
        if (!userId) return null;
        const u = userById.get(userId);
        if (!u) return { id: userId, name: null, email: null };
        const name =
          [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null;
        return { id: u.id, name, email: u.email };
      };

      // Decide which signal made each pair match. Phone wins over email
      // wins over photo (cheapest-to-detect first; reflects the order
      // findDuplicateLead runs). For photo matches we also surface
      // WHICH hash signalled (dHash byte-level vs pHash perceptual)
      // and the exact distance — admin uses this to verify the
      // algorithm is doing what they expect.
      const computeMatchedBy = (
        child: any,
        parent: any,
      ): {
        matchedBy: "phone" | "email" | "photo" | null;
        phashDistance: number | null;
        phashSignal: "dhash" | "phash" | null;
      } => {
        if (
          child.phoneNormalized &&
          parent.phoneNormalized &&
          child.phoneNormalized === parent.phoneNormalized
        ) {
          return { matchedBy: "phone", phashDistance: null, phashSignal: null };
        }
        if (
          child.emailNormalized &&
          parent.emailNormalized &&
          child.emailNormalized === parent.emailNormalized
        ) {
          return { matchedBy: "email", phashDistance: null, phashSignal: null };
        }
        const a = parsePhashHex(child.photoPhash);
        const b = parsePhashHex(parent.photoPhash);
        const hit = comparePhashes(a, b);
        if (hit) {
          return {
            matchedBy: "photo",
            phashDistance: hit.distance,
            phashSignal: hit.signal,
          };
        }
        // Fall-through: the row was flagged historically but no signal
        // currently agrees (e.g. admin edited the original's phone after
        // the flag was set). Returning null tells the UI "we don't know
        // why this is here anymore" so admin can choose to unflag.
        return { matchedBy: null, phashDistance: null, phashSignal: null };
      };

      const byParent = new Map<
        string,
        { original: any; duplicates: any[] }
      >();
      for (const d of dups) {
        const parent = d.duplicateOf;
        if (!parent) continue;
        let group = byParent.get(parent.id);
        if (!group) {
          const { phoneNormalized: _pn, emailNormalized: _en, ...originalPublic } = parent;
          group = {
            original: {
              ...originalPublic,
              capturedBy: decorateAgent(parent.assignedAgentId ?? parent.createdById),
            },
            duplicates: [],
          };
          byParent.set(parent.id, group);
        }
        const { matchedBy, phashDistance, phashSignal } = computeMatchedBy(d, parent);
        const {
          duplicateOf: _drop,
          phoneNormalized: _pn2,
          emailNormalized: _en2,
          ...childPublic
        } = d;
        group.duplicates.push({
          ...serializeLead(childPublic),
          capturedBy: decorateAgent(d.assignedAgentId ?? d.createdById),
          matchedBy,
          phashDistance,
          phashSignal,
        });
      }

      return NextResponse.json({
        success: true,
        data: Array.from(byParent.values()),
      });
    }, "duplicates");
  },

  // ─── ACTIVITIES ────────────────────────────────────────────────────────────

  // GET /api/real-estate/leads/[id]/activities
  async listActivities(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const lead = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true },
      });
      if (!lead)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const activities = await prisma.leadActivity.findMany({
        where: { leadId: id },
        orderBy: { occurredAt: "desc" },
      });
      return NextResponse.json({ success: true, data: activities });
    }, "listActivities");
  },

  // POST /api/real-estate/leads/[id]/activities
  async addActivity(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const lead = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true, assignedAgentId: true },
      });
      if (!lead)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      if (!body.type)
        return NextResponse.json({ error: "type is required" }, { status: 400 });

      const activity = await prisma.$transaction(async (tx) => {
        const a = await tx.leadActivity.create({
          data: {
            leadId: id,
            type: body.type,
            agentId: body.agentId || lead.assignedAgentId || auth.id,
            occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
            subject: body.subject || null,
            content: body.content || null,
            outcome: body.outcome || null,
            data: body.data ?? undefined,
          },
        });
        // Touch lastContactedAt for any contact-style activity so the lead
        // list can sort/filter by recency.
        if (["CALL", "EMAIL", "MEETING", "VIEWING"].includes(body.type)) {
          await tx.lead.update({
            where: { id },
            data: { lastContactedAt: new Date() },
          });
        }
        return a;
      });

      return NextResponse.json(
        { success: true, data: activity },
        { status: 201 },
      );
    }, "addActivity");
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// VIEWING HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const ViewingHandlers = {
  // GET /api/real-estate/viewings
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const agentId = url.searchParams.get("agentId") ?? undefined;
      const propertyId = url.searchParams.get("propertyId") ?? undefined;
      const leadId = url.searchParams.get("leadId") ?? undefined;
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

      const where: Prisma.PropertyViewingWhereInput = {
        organizationId: auth.organizationId,
        ...(status ? { status: status as any } : {}),
        ...(agentId ? { agentId } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(leadId ? { leadId } : {}),
        ...(from || to
          ? {
              scheduledAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      };

      const items = await prisma.propertyViewing.findMany({
        where,
        take: limit,
        orderBy: { scheduledAt: "asc" },
        include: {
          property: {
            select: { id: true, title: true, code: true, city: true, primaryImageUrl: true },
          },
          lead: { select: { id: true, name: true, phone: true, email: true } },
        },
      });

      return NextResponse.json({ success: true, data: items });
    }, "list");
  },

  // POST /api/real-estate/viewings
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();
      if (!body.leadId || !body.propertyId || !body.scheduledAt)
        return NextResponse.json(
          { error: "leadId, propertyId, scheduledAt are required" },
          { status: 400 },
        );

      const [lead, property] = await Promise.all([
        prisma.lead.findFirst({
          where: { id: body.leadId, organizationId: auth.organizationId },
          select: { id: true, status: true, assignedAgentId: true },
        }),
        prisma.property.findFirst({
          where: { id: body.propertyId, organizationId: auth.organizationId },
          select: { id: true, listingAgentId: true },
        }),
      ]);
      if (!lead || !property)
        return NextResponse.json(
          { error: "Invalid lead or property" },
          { status: 404 },
        );

      // Only advance the pipeline forward: don't downgrade a lead that's
      // already in NEGOTIATING / CONVERTED back to VIEWING_SCHEDULED.
      const earlyStages = new Set(["NEW", "CONTACTED", "QUALIFIED"]);
      const shouldAdvanceStatus = earlyStages.has(lead.status);

      const viewing = await prisma.$transaction(async (tx) => {
        const v = await tx.propertyViewing.create({
          data: {
            organizationId: auth.organizationId,
            leadId: body.leadId,
            propertyId: body.propertyId,
            agentId:
              body.agentId ||
              lead.assignedAgentId ||
              property.listingAgentId ||
              auth.id,
            scheduledAt: new Date(body.scheduledAt),
            durationMin: body.durationMin ?? 30,
            status: "SCHEDULED",
          },
        });
        await tx.leadActivity.create({
          data: {
            leadId: body.leadId,
            type: "VIEWING",
            agentId: v.agentId,
            subject: "Viewing scheduled",
            data: { propertyId: body.propertyId, viewingId: v.id },
          },
        });
        if (shouldAdvanceStatus) {
          await tx.lead.update({
            where: { id: body.leadId },
            data: { status: "VIEWING_SCHEDULED" },
          });
        }
        return v;
      });

      return NextResponse.json(
        { success: true, data: viewing },
        { status: 201 },
      );
    }, "create");
  },

  // PUT /api/real-estate/viewings/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.propertyViewing.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      const data: Prisma.PropertyViewingUpdateInput = {};
      const setIf = (k: string, v: any) => {
        if (v !== undefined) (data as any)[k] = v;
      };

      setIf("status", body.status);
      setIf("durationMin", body.durationMin);
      setIf("feedback", body.feedback);
      setIf("outcomeRating", body.outcomeRating);
      if (body.scheduledAt !== undefined)
        data.scheduledAt = new Date(body.scheduledAt);

      const updated = await prisma.propertyViewing.update({
        where: { id },
        data,
      });
      return NextResponse.json({ success: true, data: updated });
    }, "update");
  },

  // DELETE /api/real-estate/viewings/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.propertyViewing.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      await prisma.propertyViewing.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }, "remove");
  },
};
