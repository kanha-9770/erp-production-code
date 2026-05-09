/**
 * One-click installer for the REBM module.
 *
 * Anchors every static page registered in lib/static-pages.ts under the
 * "Real Estate" group to a top-level FormModule with the same name. If the
 * module doesn't exist, we create it so the sidebar has a parent to nest
 * the REBM pages under.
 *
 * Why this exists: page entries in lib/static-pages.ts are URL-accessible
 * without an anchor, but the sidebar only renders them once a
 * StaticPageAnchor row connects them to a FormModule. The admin UI at
 * /settings/permission/static-pages can do this manually — this handler
 * just makes the common case ("anchor the whole REBM group") a single
 * button click.
 *
 * Idempotent: running it twice does not duplicate the module or the anchor.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";

async function requireAdmin(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId)
    throw NextResponse.json(
      { error: "User is not associated with any organization" },
      { status: 403 },
    );
  const admin = await isUserAdmin(user.id, user.organizationId);
  if (!admin)
    throw NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  return user as { id: string; email: string; organizationId: string };
}

const MODULE_NAME = "Real Estate";
const GROUP_PATH = "group:Real Estate";

export const RealEstateInstallHandlers = {
  // GET /api/real-estate/install — status check ("is the sidebar wired up?")
  async status(request: NextRequest): Promise<NextResponse> {
    try {
      const auth = await requireAdmin(request);

      const moduleRow = await prisma.formModule.findFirst({
        where: { organizationId: auth.organizationId, name: MODULE_NAME },
        select: { id: true, name: true },
      });

      let anchor: { moduleId: string } | null = null;
      const anchorClient = (prisma as any).staticPageAnchor;
      if (anchorClient?.findFirst) {
        try {
          anchor = await anchorClient.findFirst({
            where: { organizationId: auth.organizationId, path: GROUP_PATH },
            select: { moduleId: true },
          });
        } catch {
          // Table may be missing if `prisma db push` / `migrate` hasn't run.
          anchor = null;
        }
      }

      return NextResponse.json({
        success: true,
        installed: !!(moduleRow && anchor && anchor.moduleId === moduleRow.id),
        moduleId: moduleRow?.id ?? null,
        moduleName: moduleRow?.name ?? null,
        anchored: !!anchor,
      });
    } catch (e: any) {
      if (e instanceof NextResponse) return e;
      return NextResponse.json(
        { error: e?.message || "Internal server error" },
        { status: 500 },
      );
    }
  },

  // POST /api/real-estate/install
  async install(request: NextRequest): Promise<NextResponse> {
    try {
      const auth = await requireAdmin(request);

      // Surface a useful error if the StaticPageAnchor table is missing —
      // happens when the schema is up to date but the DB hasn't been pushed.
      const anchorClient = (prisma as any).staticPageAnchor;
      if (!anchorClient?.upsert) {
        return NextResponse.json(
          {
            error:
              "StaticPageAnchor model is not in the Prisma client. Run `npx prisma generate` and reload.",
          },
          { status: 500 },
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1. Ensure a top-level "Real Estate" FormModule exists.
        let moduleRow = await tx.formModule.findFirst({
          where: { organizationId: auth.organizationId, name: MODULE_NAME },
        });
        if (!moduleRow) {
          // Place at the end of the existing top-level list.
          const maxSort = await tx.formModule.aggregate({
            where: { organizationId: auth.organizationId, parentId: null },
            _max: { sortOrder: true },
          });
          moduleRow = await tx.formModule.create({
            data: {
              name: MODULE_NAME,
              organizationId: auth.organizationId,
              description:
                "Property inventory, agents, leads, transactions, and commissions.",
              icon: "building2",
              moduleType: "standard",
              level: 0,
              isActive: true,
              sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
              path: "/real-estate",
            },
          });
        }

        // 2. Upsert a group anchor so every page in the "Real Estate" group
        //    nests under that module.
        await tx.staticPageAnchor.upsert({
          where: {
            organizationId_path: {
              organizationId: auth.organizationId,
              path: GROUP_PATH,
            },
          },
          update: { moduleId: moduleRow.id, sortOrder: 0 },
          create: {
            organizationId: auth.organizationId,
            path: GROUP_PATH,
            moduleId: moduleRow.id,
            sortOrder: 0,
          },
        });

        return { moduleRow };
      });

      return NextResponse.json({
        success: true,
        installed: true,
        moduleId: result.moduleRow.id,
        moduleName: result.moduleRow.name,
      });
    } catch (e: any) {
      if (e instanceof NextResponse) return e;
      console.error("[RealEstateInstall]", e?.message);
      // P2021 = table missing
      if (e?.code === "P2021")
        return NextResponse.json(
          {
            error:
              "Database tables are missing. Run `npx prisma db push` (or `npx prisma migrate dev`) and reload.",
          },
          { status: 500 },
        );
      return NextResponse.json(
        { error: e?.message || "Internal server error" },
        { status: 500 },
      );
    }
  },
};
