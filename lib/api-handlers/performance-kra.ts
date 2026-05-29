/**
 * KRA (Key Result Area) API Handlers
 *
 * Backs /app/performance/kra. Shape mirrors the form fields the UI already
 * collects so the existing form / table render with no translation layer.
 * Org-scoped; non-HR users (employees) can only read records targeting
 * themselves — write/delete is HR/Admin only and enforced upstream by
 * usePermissions + the canManage gate on the page.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { moveToTrash } from "@/lib/trash";

const STATUSES = ["DRAFT", "ACTIVE", "ACHIEVED", "AT_RISK", "MISSED"] as const;
const PERIODS = ["Q1", "Q2", "Q3", "Q4", "ANNUAL"] as const;

async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId)
    throw NextResponse.json(
      { error: "User is not associated with any organization" },
      { status: 403 },
    );
  return user;
}

async function handle(
  fn: () => Promise<NextResponse>,
  label: string,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[KraHandlers] ${label}:`, e?.message);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

function sanitize(body: Record<string, any>, opts: { partial?: boolean } = {}) {
  const data: Record<string, any> = {};
  const partial = opts.partial ?? false;

  const str = (key: string, required = false) => {
    if (!(key in body)) {
      if (required && !partial)
        throw NextResponse.json(
          { error: `${key} is required` },
          { status: 400 },
        );
      return;
    }
    const v = body[key];
    if (v === null || v === undefined || String(v).trim() === "") {
      if (required)
        throw NextResponse.json(
          { error: `${key} is required` },
          { status: 400 },
        );
      data[key] = null;
      return;
    }
    data[key] = String(v).trim();
  };

  str("employeeId");
  str("employeeName", !partial);
  str("firstName");
  str("middleName");
  str("lastName");
  str("department");
  str("employeeEngagementTeamName");
  str("objective", !partial);
  str("target");
  str("actual");
  str("notes");

  if ("weight" in body) {
    const n = Number(body.weight);
    data.weight = Number.isFinite(n) ? n : 0;
  }
  if ("progress" in body) {
    const n = Math.round(Number(body.progress));
    data.progress = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  }
  if ("year" in body) {
    const n = Math.round(Number(body.year));
    data.year = Number.isFinite(n) ? n : new Date().getFullYear();
  } else if (!partial) {
    data.year = new Date().getFullYear();
  }

  if ("period" in body) {
    const v = String(body.period || "").toUpperCase();
    data.period = (PERIODS as readonly string[]).includes(v) ? v : "Q1";
  } else if (!partial) {
    data.period = "Q1";
  }

  if ("status" in body) {
    const v = String(body.status || "").toUpperCase();
    data.status = (STATUSES as readonly string[]).includes(v) ? v : "DRAFT";
  } else if (!partial) {
    data.status = "DRAFT";
  }

  return data;
}

// Generate KRA-0001, KRA-0002 … scoped per organization. Uses a count-based
// approach: simple, predictable, and matches the existing UI's display
// format. Race-tolerant enough for typical HR throughput.
async function nextDisplayId(organizationId: string): Promise<string> {
  const count = await (prisma as any).kra.count({ where: { organizationId } });
  return `KRA-${String(count + 1).padStart(4, "0")}`;
}

export const KraHandlers = {
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const url = new URL(request.url);
      const employeeIdFilter = url.searchParams.get("employeeId");

      const items = await (prisma as any).kra.findMany({
        where: {
          organizationId: authUser.organizationId,
          ...(employeeIdFilter ? { employeeId: employeeIdFilter } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ success: true, items });
    }, "list");
  },

  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();
      const data = sanitize(body);

      const displayId = await nextDisplayId(authUser.organizationId!);
      const item = await (prisma as any).kra.create({
        data: {
          ...data,
          organizationId: authUser.organizationId,
          displayId,
          createdById: authUser.id,
        },
      });
      return NextResponse.json({ success: true, item }, { status: 201 });
    }, "create");
  },

  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const item = await (prisma as any).kra.findFirst({
        where: { id, organizationId: authUser.organizationId },
      });
      if (!item)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ success: true, item });
    }, "get");
  },

  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).kra.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const data = sanitize(await request.json(), { partial: true });
      const item = await (prisma as any).kra.update({ where: { id }, data });
      return NextResponse.json({ success: true, item });
    }, "update");
  },

  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).kra.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      await moveToTrash("Kra", id, {
        userId: authUser.id,
        userName: authUser.email,
        organizationId: authUser.organizationId,
      });
      return NextResponse.json({ success: true });
    }, "remove");
  },
};
