/**
 * Onboarding Template handlers.
 *
 * Templates are a named bundle of default tasks. Each org can have several
 * (e.g. "Engineering Hire", "Sales Hire"); exactly one is marked
 * `isDefault` and is used by the AppointmentLetter SIGNED trigger when no
 * template is selected explicitly.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { moveToTrash } from "@/lib/trash";

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

async function handle(fn: () => Promise<NextResponse>, label: string) {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[OnboardingTemplateHandlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json(
        { error: "A template with that name already exists" },
        { status: 409 },
      );
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

function sanitize(body: Record<string, any>, opts: { partial?: boolean } = {}) {
  const data: Record<string, any> = {};
  const partial = opts.partial ?? false;

  if ("name" in body) {
    const v = String(body.name ?? "").trim();
    if (!v)
      throw NextResponse.json(
        { error: "name is required" },
        { status: 400 },
      );
    data.name = v;
  } else if (!partial) {
    throw NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if ("description" in body) {
    const v = body.description;
    data.description =
      v === null || v === undefined || String(v).trim() === ""
        ? null
        : String(v).trim();
  }

  if ("isDefault" in body) data.isDefault = !!body.isDefault;

  if ("defaultTasks" in body) {
    const v = body.defaultTasks;
    if (!Array.isArray(v))
      throw NextResponse.json(
        { error: "defaultTasks must be an array" },
        { status: 400 },
      );
    data.defaultTasks = v;
  } else if (!partial) {
    data.defaultTasks = [];
  }

  return data;
}

export const OnboardingTemplateHandlers = {
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const items = await (prisma as any).onboardingTemplate.findMany({
        where: { organizationId: authUser.organizationId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });
      return NextResponse.json({ success: true, items });
    }, "list");
  },

  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const data = sanitize(await request.json());

      // If this template is being marked default, demote any other defaults
      // in the same org so the trigger only ever has one to pick from.
      if (data.isDefault) {
        await (prisma as any).onboardingTemplate.updateMany({
          where: { organizationId: authUser.organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const item = await (prisma as any).onboardingTemplate.create({
        data: {
          ...data,
          organizationId: authUser.organizationId,
          createdById: authUser.id,
        },
      });
      return NextResponse.json({ success: true, item }, { status: 201 });
    }, "create");
  },

  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const item = await (prisma as any).onboardingTemplate.findFirst({
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
      const existing = await (prisma as any).onboardingTemplate.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const data = sanitize(await request.json(), { partial: true });

      if (data.isDefault === true) {
        await (prisma as any).onboardingTemplate.updateMany({
          where: {
            organizationId: authUser.organizationId,
            isDefault: true,
            NOT: { id },
          },
          data: { isDefault: false },
        });
      }

      const item = await (prisma as any).onboardingTemplate.update({
        where: { id },
        data,
      });
      return NextResponse.json({ success: true, item });
    }, "update");
  },

  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).onboardingTemplate.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      await moveToTrash("OnboardingTemplate", id, {
        userId: authUser.id,
        userName: authUser.email,
        organizationId: authUser.organizationId,
      });
      return NextResponse.json({ success: true });
    }, "remove");
  },
};
