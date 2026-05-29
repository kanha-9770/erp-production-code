/**
 * GET /api/forms/by-kind/[kind]
 *
 * Returns the customizable (non-core) sections + fields for the static form
 * matching a given kind (e.g. "jobApplication", "employee"). The companion
 * to /api/forms/ensure-*-form endpoints: those create the form on first use
 * of the "Customize form" button, this one reads it back so the static React
 * form can render whatever extra fields an admin has added in the builder.
 *
 * Match criteria: `Form.settings.staticFormKind === kind` for the caller's
 * org (or, for backwards compat, `isEmployeeForm = true` when kind = "employee").
 * Pre-existing seeded fields carry `properties.isCore = true` and are filtered
 * out of the response — they're already rendered by the static form.
 *
 * Auth: any signed-in user with an org (read-only — they need it to see their
 * own custom fields when filling out the form).
 */

export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export async function GET(request: NextRequest, props: { params: Promise<{ kind: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }
    if (!user.organizationId) {
      return NextResponse.json(
        { success: false, error: "No organization" },
        { status: 403 },
      );
    }

    const kind = params.kind;
    if (!kind) {
      return NextResponse.json(
        { success: false, error: "Missing kind" },
        { status: 400 },
      );
    }

    // Pull all org forms with their sections + fields. The match is on a JSON
    // path that Prisma versions filter inconsistently, so we filter in JS.
    // For backwards compat, "employee" also matches the legacy isEmployeeForm
    // flag (predates the settings.staticFormKind scheme).
    const candidates = await prisma.form.findMany({
      where: { module: { organizationId: user.organizationId } },
      include: {
        sections: {
          include: { fields: { orderBy: { order: "asc" } } },
          orderBy: { order: "asc" },
        },
      },
    });
    const form = candidates.find((f) => {
      if ((f.settings as any)?.staticFormKind === kind) return true;
      if (kind === "employee" && f.isEmployeeForm) return true;
      return false;
    });

    if (!form) {
      // No custom form yet — return an empty list. Front-end treats this as
      // "no extra fields to render", which is the right behaviour before the
      // user has ever clicked "Customize form".
      return NextResponse.json({
        success: true,
        formId: null,
        sections: [],
      });
    }

    // Strip core fields (they're already rendered by the static form) and any
    // section that becomes empty as a result.
    const customSections = form.sections
      .map((s) => ({
        id: s.id,
        title: s.title,
        order: s.order,
        columns: s.columns,
        fields: s.fields
          .filter((f) => (f.properties as any)?.isCore !== true)
          .map((f) => ({
            id: f.id,
            label: f.label,
            type: f.type,
            placeholder: f.placeholder ?? null,
            // FormField.options / validation are Json — pass through verbatim.
            options: (f.options as any) ?? null,
            validation: (f.validation as any) ?? null,
          })),
      }))
      .filter((s) => s.fields.length > 0);

    return NextResponse.json({
      success: true,
      formId: form.id,
      sections: customSections,
    });
  } catch (err: any) {
    console.error("[GET /api/forms/by-kind/[kind]]", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to load custom fields" },
      { status: 500 },
    );
  }
}
