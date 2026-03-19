import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/lib/database-service";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, getRequestMeta, logAudit } from "@/lib/api-helpers";

// GET: List all modules (hierarchy)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!user.organizationId) {
      return NextResponse.json(
        { error: "User is not associated with an organization" },
        { status: 403 }
      );
    }

    const modules = await DatabaseService.getModuleHierarchy(user.id);

    const validatedModules = modules.map((module: any) => ({
      id: module.id,
      name: module.name,
      description: module.description || null,
      icon: module.icon || null,
      color: module.color || null,
      moduleType: module.moduleType || "standard",
      level: module.level || 0,
      path: module.path || module.id,
      isActive: module.isActive ?? true,
      forms: Array.isArray(module.forms) ? module.forms : [],
      children: Array.isArray(module.children) ? module.children : [],
    }));

    return NextResponse.json({
      success: true,
      data: validatedModules,
      meta: { moduleCount: validatedModules.length },
    });
  } catch (error: any) {
    console.error("[API] /api/modules GET - Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch modules" },
      { status: 500 }
    );
  }
}

// POST: Create new module
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!user.organizationId) {
      return NextResponse.json(
        { error: "User is not associated with an organization" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, parentId, moduleType, icon, color, organizationId } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
    }

    if (!organizationId || organizationId !== user.organizationId) {
      return NextResponse.json(
        { success: false, error: "Invalid organization ID" },
        { status: 403 }
      );
    }

    const { ipAddress, userAgent } = getRequestMeta(request);

    const module = await DatabaseService.createModule({
      name,
      description,
      parentId,
      moduleType: moduleType || "standard",
      icon,
      color,
      organizationId,
    });

    // Now correctly logs organizationId
    await logAudit({
      userId: user.id,
      organizationId: user.organizationId,
      performedBy: user.email,
      action: "Created",
      module: "Form Modules",
      details: `Created module "${name}"${parentId ? " as child module" : ""}`,
      ipAddress,
      userAgent,
      recordId: module.id,
      recordName: name,
    });

    return NextResponse.json({ success: true, data: module });
  } catch (error: any) {
    console.error("[API] /api/modules POST - Error:", error);

    const { ipAddress, userAgent } = getRequestMeta(request);

    const user = await getAuthenticatedUser(request);
    if (user) {
      await logAudit({
        userId: user.id,
        organizationId: user.organizationId,
        performedBy: user.email,
        action: "Create Failed",
        module: "Form Modules",
        details: `Failed to create module: ${error.message}`,
        ipAddress,
        userAgent,
      });
    }

    return NextResponse.json(
      { success: false, error: error.message || "Failed to create module" },
      { status: 500 }
    );
  }
}

// DELETE: Delete module (bulk/single via body)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const moduleId = body.id || body.moduleId;

    if (!moduleId) {
      return NextResponse.json({ error: "Module ID is required" }, { status: 400 });
    }

    const module = await prisma.formModule.findUnique({
      where: { id: moduleId },
      select: { name: true, organizationId: true },
    });

    if (!module) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    if (module.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { ipAddress, userAgent } = getRequestMeta(request);

    await DatabaseService.deleteModule(moduleId);

    await logAudit({
      userId: user.id,
      organizationId: user.organizationId,
      performedBy: user.email,
      action: "Deleted",
      module: "Form Modules",
      details: `Deleted module "${module.name}"`,
      ipAddress,
      userAgent,
      recordId: moduleId,
      recordName: module.name,
    });

    return NextResponse.json({
      success: true,
      message: "Module deleted successfully",
    });
  } catch (error: any) {
    console.error("[API] /api/modules DELETE - Error:", error);

    const { ipAddress, userAgent } = getRequestMeta(request);

    const user = await getAuthenticatedUser(request);
    if (user) {
      await logAudit({
        userId: user.id,
        organizationId: user.organizationId,
        performedBy: user.email,
        action: "Delete Failed",
        module: "Form Modules",
        details: `Failed to delete module: ${error.message}`,
        ipAddress,
        userAgent,
        recordId: body?.id || body?.moduleId,
      });
    }

    return NextResponse.json(
      { error: error.message || "Failed to delete module" },
      { status: 500 }
    );
  }
}