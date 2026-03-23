// app/api/master-data/route.ts
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma"
const extractValues = (staticData: any) => {
  if (!Array.isArray(staticData)) return []
  return staticData.map((item: any) => ({
    id: item.id || `temp-${Date.now()}-${Math.random()}`,
    value: item.label || "", // This is what user sees
    code: item.value || item.label || "",
  }))
}
async function getPermittedModulesFlat(userId: string, organizationId: string, isAdmin: boolean): Promise<any[]> {
  let finalModules: any[] = [];
  if (isAdmin) {
    // ADMIN gets all active modules for their organization
    finalModules = await prisma.$queryRaw`
      SELECT
        fm.id AS module_id,
        fm.name AS module_name,
        fm.description,
        fm.icon,
        fm.color,
        fm.path,
        fm.parent_id,
        fm.level,
        fm.sort_order,
        fm.module_type
      FROM form_modules fm
      WHERE fm.is_active = TRUE
      AND fm.organization_id = ${organizationId}
      ORDER BY fm.level ASC, fm.sort_order ASC
    `;
  } else {
    // Execute both role-based and user-based queries in parallel
    const [roleBasedModules, userBasedModules] = await Promise.all([
      prisma.$queryRaw`
        SELECT DISTINCT
          fm.id AS module_id,
          fm.name AS module_name,
          fm.description,
          fm.icon,
          fm.color,
          fm.path,
          fm.parent_id,
          fm.level,
          fm.sort_order,
          fm.module_type
        FROM users u
        JOIN user_unit_assignments uua ON uua.user_id = u.id
        JOIN roles r ON r.id = uua.role_id
        JOIN role_permissions rp ON rp.role_id = r.id AND rp.granted = TRUE
        JOIN form_modules fm ON fm.id = rp.module_id AND fm.is_active = TRUE
        WHERE u.id = ${userId}
        AND fm.organization_id = ${organizationId}
      `,
      prisma.$queryRaw`
        SELECT DISTINCT
          fm.id AS module_id,
          fm.name AS module_name,
          fm.description,
          fm.icon,
          fm.color,
          fm.path,
          fm.parent_id,
          fm.level,
          fm.sort_order,
          fm.module_type
        FROM users u
        JOIN user_permissions up ON up.user_id = u.id AND up.granted = TRUE
        JOIN form_modules fm ON fm.id = up.module_id AND fm.is_active = TRUE
        WHERE u.id = ${userId}
        AND fm.organization_id = ${organizationId}
      `,
    ]);
    // Deduplicate modules (faster using Map)
    const allModules = [...(roleBasedModules as any[]), ...(userBasedModules as any[])];
    const uniqueModulesMap = new Map(allModules.map((m) => [m.module_id, m]));
    const uniqueModules = Array.from(uniqueModulesMap.values());
    // Get child IDs
    const childModuleIds = uniqueModules.map((m) => m.module_id);
    if (childModuleIds.length > 0) {
      // Fetch parent hierarchy
      const parentModules = await prisma.$queryRaw`
        WITH RECURSIVE parent_hierarchy AS (
          SELECT DISTINCT
            fm.id AS module_id,
            fm.name AS module_name,
            fm.description,
            fm.icon,
            fm.color,
            fm.path,
            fm.parent_id,
            fm.level,
            fm.sort_order,
            fm.module_type
          FROM form_modules fm
          WHERE fm.id IN (
            SELECT DISTINCT parent_id
            FROM form_modules
            WHERE id = ANY(${childModuleIds}::text[])
            AND parent_id IS NOT NULL
            AND organization_id = ${organizationId}
          )
          AND fm.is_active = TRUE
          AND fm.organization_id = ${organizationId}
         
          UNION
         
          SELECT DISTINCT
            fm.id AS module_id,
            fm.name AS module_name,
            fm.description,
            fm.icon,
            fm.color,
            fm.path,
            fm.parent_id,
            fm.level,
            fm.sort_order,
            fm.module_type
          FROM form_modules fm
          INNER JOIN parent_hierarchy ph ON fm.id = ph.parent_id
          WHERE fm.is_active = TRUE
          AND fm.organization_id = ${organizationId}
        )
        SELECT * FROM parent_hierarchy
      `;
      // Merge + deduplicate again
      const mergedModules = [...uniqueModules, ...(parentModules as any[])];
      const finalModulesMap = new Map(mergedModules.map((m) => [m.module_id, m]));
      finalModules = Array.from(finalModulesMap.values());
    } else {
      finalModules = uniqueModules;
    }
    // Sort modules by hierarchy
    finalModules.sort(
      (a: any, b: any) => a.level - b.level || a.sort_order - b.sort_order
    );
  }
  return finalModules;
}
// Recursive hierarchy builder (filtered)
async function buildHierarchy(permittedIds: number[], organizationId: string) {
  // Fetch all permitted modules flat with forms and lookupSources
  const allPermittedModules = await prisma.formModule.findMany({
    where: {
      id: { in: permittedIds },
      organizationId,
      isActive: true
    },
    orderBy: { sortOrder: "asc" },
    include: {
      forms: {
        where: { isPublished: true },
        orderBy: { name: "asc" },
        include: {
          lookupSources: {
            where: { type: "static", active: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  // Build module map for quick lookup
  const moduleMap = new Map(allPermittedModules.map((mod: any) => [mod.id, { ...mod, children: [] }]));
  // Link children to parents
  allPermittedModules.forEach((mod: any) => {
    if (mod.parentId) {
      const parent = moduleMap.get(mod.parentId);
      if (parent) {
        parent.children.push(mod);
      }
    }
  });
  // Sort children for each parent
  moduleMap.forEach((mod: any) => {
    mod.children.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  });
  // Get root modules
  const rootModules = allPermittedModules
    .filter((mod: any) => !mod.parentId)
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
    .map((mod: any) => moduleMap.get(mod.id));
  const dropdowns: any[] = []
  let counter = 1
  const traverse = (node: any, path: { id: string; name: string }[] = []) => {
    const currentPath = [...path, { id: node.id, name: node.name }]
    if (node.forms && node.forms.length > 0) {
      node.forms.forEach((form: any) => {
        form.lookupSources?.forEach((ls: any) => {
          dropdowns.push({
            id: ls.id,
            sno: counter++,
            module_id: currentPath[0]?.id || "",
            module_name: currentPath[0]?.name || "",
            level2_id: currentPath[1]?.id || "",
            level2_name: currentPath[1]?.name || "",
            level3_id: currentPath[2]?.id || "",
            level3_name: currentPath[2]?.name || "",
            level4_id: currentPath[3]?.id || "",
            level4_name: currentPath[3]?.name || "",
            form_id: form.id,
            form_name: form.name,
            master_data_type_name: ls.name,
            values: extractValues(ls.staticData),
            isNew: false,
            isEditing: false,
          })
        })
      })
    }
    node.children?.forEach((child: any) => traverse(child, currentPath))
  }
  rootModules.forEach((mod) => traverse(mod))
  // Remove duplicates by unique id
  const uniqueDropdowns = Array.from(new Map(dropdowns.map(item => [item.id, item])).values())
  return { dropdowns: uniqueDropdowns, rootModules }
}
async function hasAccessToModule(userId: string, organizationId: string, moduleId: number, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const permittedModules = await getPermittedModulesFlat(userId, organizationId, isAdmin);
  return permittedModules.some((m: any) => m.module_id === moduleId);
}
async function getModulePath(moduleId: string) {
  const path: { id: string; name: string }[] = [];
  let currentId: string | null = moduleId;
  while (currentId) {
    const mod = await prisma.formModule.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true },
    });
    if (!mod) break;
    path.unshift({ id: mod.id, name: mod.name });
    currentId = mod.parentId;
  }
  return path;
}
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const userId = authUser.id;
    const organizationId = authUser.organizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: "User is not associated with any organization" },
        { status: 403 }
      );
    }
    // Fetch roles
    const roles = await prisma.$queryRaw<{ role_name: string }[]>`
      SELECT r.name AS role_name
      FROM user_unit_assignments uua
      JOIN roles r ON r.id = uua.role_id
      WHERE uua.user_id = ${userId}
    `;
    const isAdmin = roles.some((r) => r.role_name === "ADMIN");
    const permittedModules = await getPermittedModulesFlat(userId, organizationId, isAdmin);
    const permittedIds = permittedModules.map((m: any) => m.module_id);
    const { dropdowns, rootModules } = await buildHierarchy(permittedIds, organizationId);
    const allForms = await prisma.form.findMany({
      where: {
        isPublished: true,
        moduleId: { in: permittedIds }
      },
      select: { id: true, name: true, moduleId: true },
      orderBy: { name: "asc" },
    })
    return NextResponse.json({
      dropdowns,
      modules: rootModules,
      forms: allForms,
    })
  } catch (error) {
    console.error("Master data load error:", error)
    return NextResponse.json({ error: "Failed to load master data" }, { status: 500 })
  }
}
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const userId = authUser.id;
    const organizationId = authUser.organizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: "User is not associated with any organization" },
        { status: 403 }
      );
    }
    // Fetch roles
    const roles = await prisma.$queryRaw<{ role_name: string }[]>`
      SELECT r.name AS role_name
      FROM user_unit_assignments uua
      JOIN roles r ON r.id = uua.role_id
      WHERE uua.user_id = ${userId}
    `;
    const isAdmin = roles.some((r) => r.role_name === "ADMIN");
    const body = await req.json()
    const { form_id, master_data_type_name, values } = body
    if (!form_id || !master_data_type_name || !Array.isArray(values) || values.length === 0) {
      return NextResponse.json({ error: "Form, name, and at least one value required" }, { status: 400 })
    }
    // Get moduleId from form and check access
    const form = await prisma.form.findUnique({
      where: { id: form_id },
      include: { module: true },
    })
    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }
    if (!await hasAccessToModule(userId, organizationId, form.module.id, isAdmin)) {
      return NextResponse.json({ error: "No access to this form's module" }, { status: 403 })
    }
    const staticData = values.map((v: string, i: number) => ({
      id: `val-${Date.now()}-${i}`,
      label: v.trim(),
      value: v.trim(),
      order: i,
    }))
    const lookup = await prisma.lookupSource.create({
      data: {
        name: master_data_type_name,
        type: "static",
        sourceFormId: form_id,
        sourceModuleId: form.module.id,
        staticData,
        active: true,
      },
      include: {
        sourceForm: { select: { name: true, module: { select: { name: true } } } },
      },
    })
    // Construct dropdown in the same format as GET
    const path = await getModulePath(form.module.id);
    const newDropdown = {
      id: lookup.id,
      sno: 0, // Temporary sno; frontend can handle re-numbering if needed
      module_id: path[0]?.id || "",
      module_name: path[0]?.name || "",
      level2_id: path[1]?.id || "",
      level2_name: path[1]?.name || "",
      level3_id: path[2]?.id || "",
      level3_name: path[2]?.name || "",
      level4_id: path[3]?.id || "",
      level4_name: path[3]?.name || "",
      form_id: form.id,
      form_name: form.name,
      master_data_type_name: lookup.name,
      values: extractValues(lookup.staticData),
      isNew: false,
      isEditing: false,
    };
    return NextResponse.json({ success: true, dropdown: newDropdown })
  } catch (error) {
    console.error("Create master data error:", error)
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}
export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const userId = authUser.id;
    const organizationId = authUser.organizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: "User is not associated with any organization" },
        { status: 403 }
      );
    }
    // Fetch roles
    const roles = await prisma.$queryRaw<{ role_name: string }[]>`
      SELECT r.name AS role_name
      FROM user_unit_assignments uua
      JOIN roles r ON r.id = uua.role_id
      WHERE uua.user_id = ${userId}
    `;
    const isAdmin = roles.some((r) => r.role_name === "ADMIN");
    const body = await req.json()
    const { id, master_data_type_name, values } = body
    if (!id || !master_data_type_name || !Array.isArray(values)) {
      return NextResponse.json({ error: "ID, name, and values required" }, { status: 400 })
    }
    // Check access to the lookup's module
    const lookup = await prisma.lookupSource.findUnique({
      where: { id },
      include: {
        sourceForm: {
          include: { module: true }
        }
      },
    });
    if (!lookup) {
      return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
    }
    if (!await hasAccessToModule(userId, organizationId, lookup.sourceForm.module.id, isAdmin)) {
      return NextResponse.json({ error: "No access to this lookup's module" }, { status: 403 })
    }
    const staticData = values.map((v: string, i: number) => ({
      id: `val-${Date.now()}-${i}`,
      label: v.trim(),
      value: v.trim(),
      order: i,
    }))
    const updated = await prisma.lookupSource.update({
      where: { id },
      data: {
        name: master_data_type_name,
        staticData,
      },
    })
    // Re-fetch updated lookup with includes
    const updatedLookup = await prisma.lookupSource.findUnique({
      where: { id },
      include: {
        sourceForm: {
          include: { module: true }
        }
      },
    });
    // Construct dropdown in the same format as GET
    const path = await getModulePath(lookup.sourceForm.module.id);
    const updatedDropdown = {
      id: updatedLookup!.id,
      sno: 0, // Temporary sno; frontend can handle re-numbering if needed
      module_id: path[0]?.id || "",
      module_name: path[0]?.name || "",
      level2_id: path[1]?.id || "",
      level2_name: path[1]?.name || "",
      level3_id: path[2]?.id || "",
      level3_name: path[2]?.name || "",
      level4_id: path[3]?.id || "",
      level4_name: path[3]?.name || "",
      form_id: lookup.sourceForm.id,
      form_name: lookup.sourceForm.name,
      master_data_type_name: updatedLookup!.name,
      values: extractValues(updatedLookup!.staticData),
      isNew: false,
      isEditing: false,
    };
    return NextResponse.json({ success: true, dropdown: updatedDropdown })
  } catch (error) {
    console.error("Update master data error:", error)
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}
export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const userId = authUser.id;
    const organizationId = authUser.organizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: "User is not associated with any organization" },
        { status: 403 }
      );
    }
    // Fetch roles
    const roles = await prisma.$queryRaw<{ role_name: string }[]>`
      SELECT r.name AS role_name
      FROM user_unit_assignments uua
      JOIN roles r ON r.id = uua.role_id
      WHERE uua.user_id = ${userId}
    `;
    const isAdmin = roles.some((r) => r.role_name === "ADMIN");
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }
    // Check access to the lookup's module
    const lookup = await prisma.lookupSource.findUnique({
      where: { id },
      include: {
        sourceForm: {
          include: { module: true }
        }
      },
    });
    if (!lookup) {
      return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
    }
    if (!await hasAccessToModule(userId, organizationId, lookup.sourceForm.module.id, isAdmin)) {
      return NextResponse.json({ error: "No access to this lookup's module" }, { status: 403 })
    }
    await prisma.lookupSource.delete({
      where: { id },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete master data error:", error)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}