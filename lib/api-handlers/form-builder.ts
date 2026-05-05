/**
 * Form Builder API Handlers
 * Centralized business logic for: Modules, Forms, Sections, Fields
 *
 * Usage in route files:
 *   import { FormBuilderHandlers as H } from "@/lib/api-handlers/form-builder"
 *   export const GET = (req, ctx) => H.getModules(req)
 */

import { NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/lib/database/database-service";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, getRequestMeta, logAudit } from "@/lib/api-helpers";
import { moveToTrash } from "@/lib/trash";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Authenticate + require org. Returns { user } on success or throws NextResponse. */
async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId)
    throw NextResponse.json(
      { error: "User is not associated with an organization" },
      { status: 403 }
    );
  return user;
}

/** Wraps a handler body in try/catch and returns a 500 on unhandled errors. */
async function handle(
  fn: () => Promise<NextResponse>,
  label: string
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e; // auth guard short-circuit
    console.error(`[FormBuilderHandlers] ${label}:`, e?.message);
    return NextResponse.json(
      { success: false, error: e?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const FormBuilderHandlers = {
  // GET /api/modules
  async getModules(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const user = await requireAuth(request);
      const modules = await DatabaseService.getModuleHierarchy(user.id);
      const data = modules.map((m: any) => ({
        id: m.id,
        name: m.name,
        description: m.description || null,
        icon: m.icon || null,
        color: m.color || null,
        moduleType: m.moduleType || "standard",
        level: m.level || 0,
        path: m.path || m.id,
        isActive: m.isActive ?? true,
        forms: Array.isArray(m.forms) ? m.forms : [],
        children: Array.isArray(m.children) ? m.children : [],
      }));
      return NextResponse.json({
        success: true,
        data,
        meta: { moduleCount: data.length },
      });
    }, "getModules");
  },

  // POST /api/modules
  async createModule(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const user = await requireAuth(request);
      const body = await request.json();
      const { name, description, parentId, moduleType, icon, color, organizationId } = body;

      if (!name)
        return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
      if (!organizationId || organizationId !== user.organizationId)
        return NextResponse.json({ success: false, error: "Invalid organization ID" }, { status: 403 });

      const { ipAddress, userAgent } = getRequestMeta(request);
      const module = await DatabaseService.createModule({
        name, description, parentId,
        moduleType: moduleType || "standard",
        icon, color, organizationId,
      });

      await logAudit({
        userId: user.id, organizationId: user.organizationId, performedBy: user.email,
        action: "Created", module: "Form Modules",
        details: `Created module "${name}"${parentId ? " as child module" : ""}`,
        ipAddress, userAgent, recordId: module.id, recordName: name,
      });

      return NextResponse.json({ success: true, data: module });
    }, "createModule");
  },

  // DELETE /api/modules  (moduleId in body)
  async deleteModule(request: NextRequest): Promise<NextResponse> {
    let moduleId: string | undefined;
    return handle(async () => {
      const user = await requireAuth(request);
      const body = await request.json().catch(() => ({}));
      moduleId = body.id || body.moduleId;

      if (!moduleId)
        return NextResponse.json({ error: "Module ID is required" }, { status: 400 });

      const mod = await prisma.formModule.findUnique({
        where: { id: moduleId },
        select: { name: true, organizationId: true },
      });
      if (!mod)
        return NextResponse.json({ error: "Module not found" }, { status: 404 });
      if (mod.organizationId !== user.organizationId)
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

      const { ipAddress, userAgent } = getRequestMeta(request);
      await moveToTrash("FormModule", moduleId, {
        userId: user.id,
        userName: user.email,
        organizationId: user.organizationId,
      });

      await logAudit({
        userId: user.id, organizationId: user.organizationId, performedBy: user.email,
        action: "Moved to Trash", module: "Form Modules",
        details: `Moved module "${mod.name}" to recycle bin`,
        ipAddress, userAgent, recordId: moduleId, recordName: mod.name,
      });

      return NextResponse.json({ success: true, message: "Module moved to recycle bin" });
    }, "deleteModule");
  },

  // GET /api/modules/[moduleId]
  async getModule(_request: NextRequest, moduleId: string): Promise<NextResponse> {
    return handle(async () => {
      const module = await DatabaseService.getModule(moduleId);
      if (!module)
        return NextResponse.json({ success: false, error: "Module not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: module });
    }, "getModule");
  },

  // PUT /api/modules/[moduleId]
  async updateModule(request: NextRequest, moduleId: string): Promise<NextResponse> {
    return handle(async () => {
      const user = await requireAuth(request);
      const data = await request.json();
      const { ipAddress, userAgent } = getRequestMeta(request);

      const oldModule = await DatabaseService.getModule(moduleId);
      if (!oldModule)
        return NextResponse.json({ error: "Module not found" }, { status: 404 });

      const updatedModule = await DatabaseService.updateModule(moduleId, data);

      const changes = Object.keys(data)
        .map((k) => `${k}: "${(oldModule as any)[k]}" → "${data[k]}"`)
        .join("; ") || "No changes detected";

      await logAudit({
        userId: user.id, organizationId: user.organizationId, performedBy: user.email,
        action: "Updated", details: `Module updated: ${changes}`,
        ipAddress, userAgent, recordId: moduleId, recordName: updatedModule.name,
      });

      return NextResponse.json({ success: true, data: updatedModule });
    }, "updateModule");
  },

  // DELETE /api/modules/[moduleId]
  async deleteModuleById(request: NextRequest, moduleId: string): Promise<NextResponse> {
    return handle(async () => {
      const user = await requireAuth(request);
      if (!moduleId)
        return NextResponse.json({ error: "Module ID is required" }, { status: 400 });

      const module = await DatabaseService.getModule(moduleId);
      if (!module)
        return NextResponse.json({ error: "Module not found" }, { status: 404 });

      const { ipAddress, userAgent } = getRequestMeta(request);
      await moveToTrash("FormModule", moduleId, {
        userId: user.id,
        userName: user.email,
        organizationId: user.organizationId,
      });

      await logAudit({
        userId: user.id, organizationId: user.organizationId, performedBy: user.email,
        action: "Moved to Trash", details: `Moved module "${module.name}" to recycle bin`,
        ipAddress, userAgent, recordId: moduleId, recordName: module.name,
      });

      return NextResponse.json({ success: true, message: "Module deleted successfully" });
    }, "deleteModuleById");
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FORM HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/forms/[formId]
  async getForm(_request: NextRequest, formId: string): Promise<NextResponse> {
    return handle(async () => {
      const form = await DatabaseService.getForm(formId);
      if (!form)
        return NextResponse.json({ success: false, error: "Form not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: form });
    }, "getForm");
  },

  // PUT /api/forms/[formId]
  async updateForm(request: NextRequest, formId: string): Promise<NextResponse> {
    return handle(async () => {
      const body = await request.json();
      const form = await DatabaseService.updateForm(formId, body);
      return NextResponse.json({ success: true, data: form });
    }, "updateForm");
  },

  // DELETE /api/forms/[formId]
  async deleteForm(request: NextRequest, formId: string): Promise<NextResponse> {
    return handle(async () => {
      const user = await requireAuth(request);
      await moveToTrash("Form", formId, {
        userId: user.id,
        userName: user.email,
        organizationId: user.organizationId,
      });
      return NextResponse.json({ success: true });
    }, "deleteForm");
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  // POST /api/sections
  async createSection(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const body = await request.json();
      const section = await DatabaseService.createSection({
        formId: body.formId, title: body.title, description: body.description,
        columns: body.columns, order: body.order,
      });
      return NextResponse.json({ success: true, data: section });
    }, "createSection");
  },

  // PUT /api/sections/[sectionId]
  async updateSection(request: NextRequest, sectionId: string): Promise<NextResponse> {
    return handle(async () => {
      const body = await request.json();
      const section = await DatabaseService.updateSection(sectionId, {
        title: body.title, description: body.description, columns: body.columns,
        order: body.order, visible: body.visible, collapsible: body.collapsible,
        collapsed: body.collapsed, conditional: body.conditional, styling: body.styling,
        // Per-section opt-out for hierarchical record inheritance.
        excludeFromInheritance: body.excludeFromInheritance,
      } as any);
      return NextResponse.json({ success: true, data: section });
    }, "updateSection");
  },

  // DELETE /api/sections/[sectionId]
  async deleteSection(request: NextRequest, sectionId: string): Promise<NextResponse> {
    return handle(async () => {
      const user = await requireAuth(request);
      await moveToTrash("FormSection", sectionId, {
        userId: user.id,
        userName: user.email,
        organizationId: user.organizationId,
      });
      return NextResponse.json({ success: true, message: "Section moved to recycle bin" });
    }, "deleteSection");
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FIELD HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  // POST /api/fields
  async createField(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const data = await request.json();
      if (data.type === "lookup") {
        if (!data.lookup?.sourceId)
          return NextResponse.json({ success: false, error: "Lookup source is required for lookup fields" }, { status: 400 });
        if (!data.lookup.fieldMapping?.display || !data.lookup.fieldMapping?.value)
          return NextResponse.json({ success: false, error: "Display and value field mappings are required" }, { status: 400 });
      }
      const field = await DatabaseService.createField(data);
      return NextResponse.json({ success: true, data: field });
    }, "createField");
  },

  // PUT /api/fields/[fieldId]
  async updateField(request: NextRequest, fieldId: string): Promise<NextResponse> {
    return handle(async () => {
      const body = await request.json();
      const field = await DatabaseService.updateField(fieldId, {
        sectionId: body.sectionId, subformId: body.subformId,
        type: body.type, label: body.label, placeholder: body.placeholder,
        description: body.description, defaultValue: body.defaultValue,
        options: body.options, validation: body.validation,
        visible: body.visible, readonly: body.readonly,
        width: body.width, order: body.order,
        conditional: body.conditional, styling: body.styling,
        properties: body.properties, formula: body.formula,
        rollup: body.rollup, lookup: body.lookup,
        isDependent: body.isDependent ?? false,
        parentFieldId: body.parentFieldId ?? null,
        dependentGroups: body.dependentGroups ?? [],
      });
      return NextResponse.json({ success: true, data: field });
    }, "updateField");
  },

  // DELETE /api/fields/[fieldId]
  async deleteField(request: NextRequest, fieldId: string): Promise<NextResponse> {
    return handle(async () => {
      const user = await requireAuth(request);
      await moveToTrash("FormField", fieldId, {
        userId: user.id,
        userName: user.email,
        organizationId: user.organizationId,
      });
      return NextResponse.json({ success: true });
    }, "deleteField");
  },
};
