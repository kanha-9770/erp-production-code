/**
 * GET  /api/static-page-anchors  — list anchor mappings for the caller's org.
 *   Authenticated only; any signed-in user can read so the sidebar can
 *   compose the nav. Per-leaf access is still gated by RoutePermission.
 *
 *   Anchors are resolved per static page using a priority chain:
 *     1. Page-level manual anchor (most specific — admin set this exact page).
 *     2. Group-level anchor (admin chose "anchor entire group to module M").
 *     3. Auto-derived anchor from PayrollConfiguration.attendanceFieldMappings
 *        — when a check-in / leave / holiday form is bound, the form's parent
 *        module becomes the implicit anchor for the matching group's pages.
 *     4. Hidden — page is URL-accessible but not in the sidebar.
 *
 *   Group anchors are stored in the same StaticPageAnchor table using the
 *   sentinel path `group:<groupName>` (e.g. `group:Attendance`). This lets the
 *   admin lock a whole group of pages to one module in one click — and any
 *   future static page added to that group inherits automatically.
 *
 *   The response shape:
 *     anchors        — resolved per-page list (what the sidebar consumes).
 *     groupAnchors   — Record<groupName, moduleId> for the admin UI.
 *     autoAnchors    — paths whose anchor was auto-derived (so UI can label).
 *     manualAnchors  — paths the admin explicitly anchored (overriding group).
 *
 * PUT  /api/static-page-anchors  — admin-only, bulk replace of explicit anchors.
 *   Body: {
 *     anchors?:      Array<{ path, moduleId, sortOrder? }>  // page-level
 *     groupAnchors?: Record<groupName, string | null>       // group-level
 *   }
 *   Both keys default to "no change" if absent. Sending an empty array for
 *   `anchors` clears all page-level overrides; sending `null` for a group
 *   clears that group anchor.
 *
 *   Atomically replaces the org's stored anchors so we never end up half-saved.
 *   Unknown paths and unknown group names are dropped (so a typo can't poison
 *   the table). Cross-tenant module IDs are rejected with 400.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import { STATIC_PAGES, STATIC_PAGE_GROUP_ORDER, type StaticPageGroup } from '@/lib/static-pages';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

// Sentinel prefix marking a row as a group-level anchor instead of a page
// anchor. The remainder is the group name (e.g. "Attendance").
const GROUP_PATH_PREFIX = 'group:';

function groupPath(group: StaticPageGroup): string {
  return `${GROUP_PATH_PREFIX}${group}`;
}

function parseGroupPath(path: string): StaticPageGroup | null {
  if (!path.startsWith(GROUP_PATH_PREFIX)) return null;
  const name = path.slice(GROUP_PATH_PREFIX.length) as StaticPageGroup;
  if (!STATIC_PAGE_GROUP_ORDER.includes(name)) return null;
  return name;
}

// Mapping from attendance-config slot → static-page paths whose anchor module
// should default to that slot's bound form's parent module. Order matters: the
// first slot in the list with a bound form wins (e.g. /attendance prefers
// checkIn but falls back to checkOut, then employee).
const AUTO_ANCHOR_RULES: Array<{
  path: string;
  fromSlots: Array<'checkIn' | 'checkOut' | 'leave' | 'holiday' | 'employee'>;
}> = [
  { path: '/attendance', fromSlots: ['checkIn', 'checkOut', 'employee'] },
  { path: '/attendance/regularizations', fromSlots: ['checkIn', 'checkOut'] },
  { path: '/attendance/team', fromSlots: ['checkIn', 'checkOut', 'employee'] },
  { path: '/settings/attendance-config', fromSlots: ['checkIn', 'checkOut'] },
  { path: '/leave', fromSlots: ['leave'] },
  { path: '/leave/approvals', fromSlots: ['leave'] },
  { path: '/leave/admin', fromSlots: ['leave'] },
  { path: '/settings/holidays', fromSlots: ['holiday', 'leave'] },
  { path: '/payroll', fromSlots: ['employee', 'checkIn'] },
  { path: '/payroll/configure', fromSlots: ['employee', 'checkIn'] },
];

interface SetupV2Lite {
  _meta?: unknown;
  employee?: { formId?: string | null };
  checkIn?: { formId?: string | null };
  checkOut?: { formId?: string | null };
  leave?: { formId?: string | null };
  holiday?: { formId?: string | null };
}

async function computeAutoAnchors(organizationId: string): Promise<
  Map<string, string>
> {
  const knownPaths = new Set(STATIC_PAGES.map((p) => p.path));
  const result = new Map<string, string>();

  const config = await prisma.payrollConfiguration.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { attendanceFieldMappings: true },
  });
  const setup = (config?.attendanceFieldMappings as SetupV2Lite | null) ?? {};

  const formIdBySlot: Record<string, string | null> = {
    employee: setup.employee?.formId ?? null,
    checkIn: setup.checkIn?.formId ?? null,
    checkOut: setup.checkOut?.formId ?? null,
    leave: setup.leave?.formId ?? null,
    holiday: setup.holiday?.formId ?? null,
  };

  const formIds = Array.from(
    new Set(Object.values(formIdBySlot).filter((x): x is string => Boolean(x))),
  );
  if (formIds.length === 0) return result;

  const forms = await prisma.form.findMany({
    where: { id: { in: formIds }, module: { organizationId } },
    select: { id: true, moduleId: true },
  });
  const moduleIdByForm = new Map(forms.map((f) => [f.id, f.moduleId]));

  for (const rule of AUTO_ANCHOR_RULES) {
    if (!knownPaths.has(rule.path)) continue;
    for (const slot of rule.fromSlots) {
      const formId = formIdBySlot[slot];
      if (!formId) continue;
      const mid = moduleIdByForm.get(formId);
      if (mid) {
        result.set(rule.path, mid);
        break;
      }
    }
  }
  return result;
}

interface ResolvedShape {
  anchors: Array<{
    path: string;
    moduleId: string;
    sortOrder: number;
    source: 'manual' | 'group' | 'auto';
  }>;
  groupAnchors: Record<string, string>;
  manualAnchors: Record<string, string>;
  autoAnchors: Record<string, string>;
}

/**
 * Read all StaticPageAnchor rows for an org, gracefully degrading to an empty
 * list if the table or Prisma model doesn't exist yet (admin hasn't run the
 * migration after pulling). Without this guard, a fresh checkout that hasn't
 * been `prisma migrate`-d crashes the entire sidebar fetch.
 */
async function readAnchorRows(
  organizationId: string,
): Promise<Array<{ path: string; moduleId: string; sortOrder: number }>> {
  const client = (prisma as any).staticPageAnchor;
  if (!client?.findMany) {
    // Prisma client wasn't regenerated after the model was added — the route
    // still serves auto-derived anchors so the sidebar isn't empty.
    return [];
  }
  try {
    return await client.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  } catch (err: any) {
    // P2021: table doesn't exist (migration not run). P2022: column missing.
    // Treat both as "no anchors yet" so reads stay green.
    if (err?.code === 'P2021' || err?.code === 'P2022') return [];
    throw err;
  }
}

/**
 * Resolve every static page to its effective anchor by chaining manual →
 * group → auto. Returns both the resolved list (sidebar fuel) and the raw
 * config (admin-UI fuel).
 */
async function resolveAnchors(organizationId: string): Promise<ResolvedShape> {
  const [allRows, autoMap] = await Promise.all([
    readAnchorRows(organizationId),
    computeAutoAnchors(organizationId),
  ]);

  const manualByPath = new Map<string, string>();
  const groupByName = new Map<StaticPageGroup, string>();
  for (const row of allRows) {
    const groupName = parseGroupPath(row.path);
    if (groupName) {
      groupByName.set(groupName, row.moduleId);
    } else {
      manualByPath.set(row.path, row.moduleId);
    }
  }

  const out: ResolvedShape = {
    anchors: [],
    groupAnchors: {},
    manualAnchors: {},
    autoAnchors: {},
  };

  for (const [name, moduleId] of groupByName) out.groupAnchors[name] = moduleId;
  for (const [path, moduleId] of manualByPath) out.manualAnchors[path] = moduleId;
  for (const [path, moduleId] of autoMap) out.autoAnchors[path] = moduleId;

  let so = 0;
  for (const page of STATIC_PAGES) {
    let moduleId: string | undefined;
    let source: 'manual' | 'group' | 'auto' | null = null;

    if (manualByPath.has(page.path)) {
      moduleId = manualByPath.get(page.path);
      source = 'manual';
    } else if (groupByName.has(page.group)) {
      moduleId = groupByName.get(page.group);
      source = 'group';
    } else if (autoMap.has(page.path)) {
      moduleId = autoMap.get(page.path);
      source = 'auto';
    }

    if (moduleId && source) {
      out.anchors.push({ path: page.path, moduleId, sortOrder: so++, source });
    }
  }

  return out;
}

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

  const resolved = await resolveAnchors(authUser.organizationId);
  return NextResponse.json(
    { success: true, ...resolved },
    { headers: NO_STORE },
  );
}

interface PutBody {
  anchors?: Array<{ path?: unknown; moduleId?: unknown; sortOrder?: unknown }>;
  groupAnchors?: Record<string, unknown>;
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

  const knownPagePaths = new Set(STATIC_PAGES.map((p) => p.path));
  const knownGroups = new Set<StaticPageGroup>(STATIC_PAGE_GROUP_ORDER);

  // Page-level anchors. Drop unknown / malformed entries silently — last
  // duplicate wins per path.
  const pageAnchors = new Map<string, { path: string; moduleId: string; sortOrder: number }>();
  for (const raw of body.anchors ?? []) {
    if (typeof raw?.path !== 'string' || !knownPagePaths.has(raw.path)) continue;
    if (typeof raw?.moduleId !== 'string' || !raw.moduleId.trim()) continue;
    const so = Number(raw?.sortOrder);
    pageAnchors.set(raw.path, {
      path: raw.path,
      moduleId: raw.moduleId.trim(),
      sortOrder: Number.isFinite(so) ? so : 0,
    });
  }

  // Group-level anchors. `null` means "clear this group anchor"; absent means
  // "leave whatever is in the DB". To keep the PUT a bulk replace we treat
  // absent as well as null-or-empty-string as "clear" and only persist truthy
  // module IDs. (If the admin partial-updates, they should call PUT with the
  // full state from the UI — same pattern as page anchors.)
  const groupAnchors = new Map<StaticPageGroup, string>();
  if (body.groupAnchors && typeof body.groupAnchors === 'object') {
    for (const [name, raw] of Object.entries(body.groupAnchors)) {
      if (!knownGroups.has(name as StaticPageGroup)) continue;
      if (typeof raw === 'string' && raw.trim()) {
        groupAnchors.set(name as StaticPageGroup, raw.trim());
      }
    }
  }

  // Cross-tenant guard: every referenced module ID must belong to the caller's
  // org. Collect both page and group module IDs in one query.
  const allModuleIds = Array.from(
    new Set([
      ...Array.from(pageAnchors.values()).map((a) => a.moduleId),
      ...Array.from(groupAnchors.values()),
    ]),
  );
  if (allModuleIds.length > 0) {
    const owned = await prisma.formModule.findMany({
      where: { id: { in: allModuleIds }, organizationId: authUser.organizationId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((m) => m.id));
    const orphaned = allModuleIds.filter((id) => !ownedSet.has(id));
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

  // Atomic replace of the org's full anchor state — page-level + group-level
  // share one table, distinguished by the `group:` path prefix.
  const data: Array<{ organizationId: string; path: string; moduleId: string; sortOrder: number }> = [];
  for (const a of pageAnchors.values()) {
    data.push({
      organizationId: authUser.organizationId,
      path: a.path,
      moduleId: a.moduleId,
      sortOrder: a.sortOrder,
    });
  }
  let so = 0;
  for (const [name, moduleId] of groupAnchors) {
    data.push({
      organizationId: authUser.organizationId,
      path: groupPath(name),
      moduleId,
      sortOrder: so++,
    });
  }

  // Surface a useful error if the model/table isn't ready yet — without this
  // the failure mode is "Cannot read properties of undefined (reading
  // 'deleteMany')" which gives the admin no clue what to do.
  if (!(prisma as any).staticPageAnchor?.deleteMany) {
    return NextResponse.json(
      {
        success: false,
        error:
          'StaticPageAnchor model is not in the Prisma client yet. Run `npx prisma generate && npx prisma migrate dev --name add_static_page_anchors` and reload.',
      },
      { status: 500, headers: NO_STORE },
    );
  }

  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.staticPageAnchor.deleteMany({
        where: { organizationId: authUser.organizationId },
      });
      if (data.length === 0) return;
      await tx.staticPageAnchor.createMany({ data });
    });
  } catch (err: any) {
    // P2021: table doesn't exist — schema is in place but migration hasn't run.
    if (err?.code === 'P2021') {
      return NextResponse.json(
        {
          success: false,
          error:
            'static_page_anchors table is missing. Run `npx prisma migrate dev --name add_static_page_anchors` and reload.',
        },
        { status: 500, headers: NO_STORE },
      );
    }
    throw err;
  }

  const resolved = await resolveAnchors(authUser.organizationId);
  return NextResponse.json(
    { success: true, ...resolved },
    { headers: NO_STORE },
  );
}
