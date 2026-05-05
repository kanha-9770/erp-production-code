/**
 * GET  /api/static-page-anchors  — list anchor mappings for the caller's org.
 *   Authenticated only; any signed-in user can read so the sidebar can
 *   compose the nav. Per-leaf access is still gated by RoutePermission.
 *
 * PUT  /api/static-page-anchors  — admin-only, bulk replace.
 *   Body: { anchors: Array<{ path, moduleId, sortOrder? }> }
 *   Replaces the org's anchor set in a single transaction so we never leave
 *   half-saved state. Pass an empty array to clear all anchors (every static
 *   page becomes hidden from the sidebar).
 *
 *   The list is intersected with lib/static-pages.ts on save — unknown paths
 *   are silently dropped so you can't anchor to a typo.
 *
 *   Sets a Cache-Control: no-store header so the sidebar's next read isn't
 *   served stale data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { STATIC_PAGES } from '@/lib/static-pages';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401, headers: NO_STORE },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization' },
      { status: 403, headers: NO_STORE },
    );
  }

  const rows = await (prisma as any).staticPageAnchor.findMany({
    where: { organizationId: authUser.organizationId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json(
    { success: true, anchors: rows },
    { headers: NO_STORE },
  );
}

interface PutBody {
  anchors?: Array<{ path?: unknown; moduleId?: unknown; sortOrder?: unknown }>;
}

export async function PUT(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401, headers: NO_STORE },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization' },
      { status: 403, headers: NO_STORE },
    );
  }
  if (!(await isUserAdmin(authUser.id, authUser.organizationId))) {
    return NextResponse.json(
      { success: false, error: 'Admin only' },
      { status: 403, headers: NO_STORE },
    );
  }

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: NO_STORE },
    );
  }

  const knownPaths = new Set(STATIC_PAGES.map((p) => p.path));

  // Validate the input — drop unknown paths, coerce sortOrder, require non-empty
  // moduleId. We accept duplicates of `path` only as the LAST one wins.
  const dedup = new Map<string, { path: string; moduleId: string; sortOrder: number }>();
  for (const raw of body.anchors ?? []) {
    if (typeof raw?.path !== 'string' || !knownPaths.has(raw.path)) continue;
    if (typeof raw?.moduleId !== 'string' || !raw.moduleId.trim()) continue;
    const so = Number(raw?.sortOrder);
    dedup.set(raw.path, {
      path: raw.path,
      moduleId: raw.moduleId.trim(),
      sortOrder: Number.isFinite(so) ? so : 0,
    });
  }
  const sanitized = Array.from(dedup.values());

  // Verify every referenced module belongs to the caller's org so an admin
  // can't anchor a page under another tenant's module.
  if (sanitized.length > 0) {
    const moduleIds = Array.from(new Set(sanitized.map((a) => a.moduleId)));
    const owned = await prisma.formModule.findMany({
      where: { id: { in: moduleIds }, organizationId: authUser.organizationId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((m) => m.id));
    const orphaned = moduleIds.filter((id) => !ownedSet.has(id));
    if (orphaned.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Module(s) not in your organization: ${orphaned.join(', ')}`,
        },
        { status: 400, headers: NO_STORE },
      );
    }
  }

  // Atomic replace: delete all + create all. Small table (≤ 16 rows per org
  // today) so a delete-and-recreate is cheaper than diffing.
  const result = await prisma.$transaction(async (tx: any) => {
    await tx.staticPageAnchor.deleteMany({
      where: { organizationId: authUser.organizationId },
    });
    if (sanitized.length === 0) return [];
    await tx.staticPageAnchor.createMany({
      data: sanitized.map((a) => ({
        organizationId: authUser.organizationId,
        path: a.path,
        moduleId: a.moduleId,
        sortOrder: a.sortOrder,
      })),
    });
    return tx.staticPageAnchor.findMany({
      where: { organizationId: authUser.organizationId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });

  return NextResponse.json(
    { success: true, anchors: result },
    { headers: NO_STORE },
  );
}
