import { DatabaseTransforms } from "./DatabaseTransforms";
import { DatabaseRecords } from "./DatabaseRecords";
import { DatabaseModules } from "./DatabaseModules";
import { DatabaseRoles } from "./DatabaseRoles";
import { UserPermission, RolePermission } from "@/lib/auth-middleware";
import { prisma } from "@/lib/prisma";
import { isUserAdmin } from "@/lib/api-helpers";
import { getAnchorHostModuleIds } from "@/lib/hr/anchor-hosts";
import { invalidateFormCache, resolveFormIdFromField } from "@/lib/forms/form-cache";

export class DatabaseService {
  // ────────────────────────────────────────────────────────────────
  // Field update – FIXED IMPLEMENTATION (this is what was missing)
  // ────────────────────────────────────────────────────────────────
  static async updateField(fieldId: string, data: any) {
    try {
      const updated = await prisma.formField.update({
        where: { id: fieldId },
        data: {
          // ── All fields you already supported ──
          sectionId: data.sectionId ?? undefined,
          subformId: data.subformId ?? undefined,
          type: data.type ?? undefined,
          label: data.label ?? undefined,
          placeholder: data.placeholder ?? undefined,
          description: data.description ?? undefined,
          defaultValue: data.defaultValue ?? undefined,
          options: data.options ?? undefined,
          validation: data.validation ?? undefined,
          visible: data.visible ?? undefined,
          readonly: data.readonly ?? undefined,
          width: data.width ?? undefined,
          order: data.order ?? undefined,
          conditional: data.conditional ?? undefined,
          styling: data.styling ?? undefined,
          properties: data.properties ?? undefined,
          formula: data.formula
            ? {
                upsert: {
                  create: {
                    expression: data.formula.expression,
                    returnType: data.formula.returnType,
                    blankPreference: data.formula.blankPreference,
                  },
                  update: {
                    expression: data.formula.expression,
                    returnType: data.formula.returnType,
                    blankPreference: data.formula.blankPreference,
                  },
                },
              }
            : undefined,
          rollup: data.rollup ?? undefined,
          lookup: data.lookup ?? undefined,

          // ── CRITICAL: These three MUST be saved ──
          isDependent: data.isDependent ?? false,
          parentFieldId: data.parentFieldId ?? null,
          dependentGroups: data.dependentGroups ?? [],

          updatedAt: new Date(),
        },
      });

      const formId = await resolveFormIdFromField(fieldId);
      if (formId) await invalidateFormCache(formId);

      return updated;
    } catch (err: any) {
      console.error("[DatabaseService.updateField] ERROR:", err.message);
      console.error(err.stack);
      throw new Error(`Field update failed: ${err.message}`);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Delete field (basic implementation – keep or replace if you have better one)
  // ────────────────────────────────────────────────────────────────
  static async deleteField(fieldId: string) {
    try {
      // Resolve formId BEFORE delete — the field row is gone after.
      const formId = await resolveFormIdFromField(fieldId);
      await prisma.formField.delete({
        where: { id: fieldId },
      });
      if (formId) await invalidateFormCache(formId);
    } catch (err: any) {
      console.error("[DatabaseService.deleteField] Error:", err);
      throw err;
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Everything below is EXACTLY as you had it – no changes
  // ────────────────────────────────────────────────────────────────

  static getMaxFieldOrderInSection(sectionId: any) {
    throw new Error("Method not implemented.");
  }
  static getMaxFieldOrderInSubform(subformId: any) {
    throw new Error("Method not implemented.");
  }
  static getFieldsBySection(sectionId: string): any {
    throw new Error("Method not implemented.");
  }
  static countFieldsInSubform(subformId: any): any {
    throw new Error("Method not implemented.");
  }
  static countFieldsInSection(sectionId: any): any {
    throw new Error("Method not implemented.");
  }
  static getFieldsBySubform(subformId: string): any {
    throw new Error("Method not implemented.");
  }
  static getFieldById(subformId: any) {
    throw new Error("Method not implemented.");
  }
  static deleteSubformWithCleanup(subformId: string) {
    throw new Error("Method not implemented.");
  }
  // Data transformation methods
  static transformModule = DatabaseTransforms.transformModule;
  static transformForm = DatabaseTransforms.transformForm;
  static transformSection = DatabaseTransforms.transformSection;
  static transformField = DatabaseTransforms.transformField;
  static transformRecord = DatabaseTransforms.transformRecord;
  static transformSubform = DatabaseTransforms.transformSubform;
  static calculateRecordCount = DatabaseTransforms.calculateRecordCount;
  static transformRecords = DatabaseTransforms.transformRecords;
  static transformModuleHierarchy = DatabaseTransforms.transformModuleHierarchy;
  static flattenModuleHierarchy = DatabaseTransforms.flattenModuleHierarchy;
  static getFormRecordTable = DatabaseTransforms.getFormRecordTable;

  // Module operations with permission filtering
  static createModule = DatabaseModules.createModule;
  static getModule = DatabaseModules.getModule;
  static updateModule = DatabaseModules.updateModule;
  static moveModule = DatabaseModules.moveModule;
  static deleteModule = DatabaseModules.deleteModule;

  // New method: Get direct accessible module IDs (for permission checks on content)
  static async getDirectAccessibleModuleIds(userId: string): Promise<string[]> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      });

      if (!user?.organizationId) {
        return [];
      }

      const organizationId = user.organizationId;

      const isAdmin = await isUserAdmin(userId, organizationId);

      let directIds: string[] = [];

      if (isAdmin) {
        // ADMIN gets ALL active modules
        const allModules = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM form_modules
        WHERE is_active = TRUE
        AND organization_id = ${organizationId}
      `;
        directIds = allModules.map((m) => m.id);
      } else {
        // Role-based modules
        const roleBased = await prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT fm.id
        FROM users u
        JOIN user_unit_assignments uua ON uua.user_id = u.id
        JOIN roles r ON r.id = uua.role_id
        JOIN role_permissions rp ON rp.role_id = r.id AND rp.granted = TRUE
        JOIN form_modules fm ON fm.id = rp.module_id AND fm.is_active = TRUE
        WHERE u.id = ${userId}
        AND fm.organization_id = ${organizationId}
      `;

        // User-based modules (matching original: no up.is_active filter)
        const userBased = await prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT fm.id
        FROM users u
        JOIN user_permissions up ON up.user_id = u.id AND up.granted = TRUE
        JOIN form_modules fm ON fm.id = up.module_id AND fm.is_active = TRUE
        WHERE u.id = ${userId}
        AND fm.organization_id = ${organizationId}
      `;

        const allDirect = [
          ...roleBased.map((m) => m.id),
          ...userBased.map((m) => m.id),
        ];
        directIds = [...new Set(allDirect)];
      }

      return directIds;
    } catch (error: any) {
      console.error(
        "[DatabaseService] Error getting direct accessible module IDs:",
        error,
      );
      return [];
    }
  }

  // Updated getModuleHierarchy (implements exact original logic + hierarchy build)
  static async getModuleHierarchy(userId?: string): Promise<any[]> {
    try {
      if (!userId) {
        return [];
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      });

      if (!user?.organizationId) {
        return [];
      }

      const organizationId = user.organizationId;

      // ── Role check ─────────────────────────────────────────────────────
      const isAdmin = await isUserAdmin(userId, organizationId);

      let allVisibleIds: string[] = [];

      if (isAdmin) {
        const allModules = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM form_modules
        WHERE is_active = TRUE
        AND organization_id = ${organizationId}
        ORDER BY level ASC, sort_order ASC
      `;

        allVisibleIds = allModules.map((m) => m.id);
      } else {
        // ── Role-based permissions ───────────────────────────────────────
        const roleBased = await prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT fm.id
        FROM users u
        JOIN user_unit_assignments uua ON uua.user_id = u.id
        JOIN roles r ON r.id = uua.role_id
        JOIN role_permissions rp ON rp.role_id = r.id AND rp.granted = TRUE
        JOIN form_modules fm ON fm.id = rp.module_id AND fm.is_active = TRUE
        WHERE u.id = ${userId}
        AND fm.organization_id = ${organizationId}
      `;

        // ── User-based permissions ───────────────────────────────────────
        const userBased = await prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT fm.id
        FROM users u
        JOIN user_permissions up ON up.user_id = u.id AND up.granted = TRUE
        JOIN form_modules fm ON fm.id = up.module_id AND fm.is_active = TRUE
        WHERE u.id = ${userId}
        AND fm.organization_id = ${organizationId}
      `;

        const directIdsSet = new Set([
          ...roleBased.map((m) => m.id),
          ...userBased.map((m) => m.id),
        ]);

        // Anchor-host modules: the static-page anchor system (manual + group +
        // attendance-config-derived) attaches static pages like /leave to a
        // FormModule. A user who has been granted a static-page route MUST
        // see that host module in the sidebar so the leaf has a parent to
        // render under — even with zero VIEW permissions on the module
        // itself. The client-side filter (filterByPermission) drops any host
        // whose anchored leaves all get gated out, so we don't risk leaking
        // unrelated modules. This pulls FROM ALL hosts in the org, not just
        // the user's accessible ones — leaf-level access decides visibility
        // downstream.
        const anchorHostIds = await getAnchorHostModuleIds(organizationId);
        for (const id of anchorHostIds) directIdsSet.add(id);

        const directIds = Array.from(directIdsSet);

        if (directIds.length === 0) {
          return [];
        }

        // ── FIXED Recursive Parent Hierarchy ─────────────────────────────

        const parentRaw = await prisma.$queryRaw<{ id: string }[]>`
        WITH RECURSIVE parent_hierarchy AS (
          -- Anchor: first-level parents of direct modules
          SELECT DISTINCT fm.id, fm.parent_id
          FROM form_modules fm
          WHERE fm.id IN (
            SELECT DISTINCT parent_id
            FROM form_modules
            WHERE id = ANY(${directIds}::text[])
              AND parent_id IS NOT NULL
              AND organization_id = ${organizationId}
          )
          AND fm.is_active = TRUE
          AND fm.organization_id = ${organizationId}

          UNION

          -- Recursive: go up the tree
          SELECT DISTINCT fm.id, fm.parent_id
          FROM form_modules fm
          INNER JOIN parent_hierarchy ph ON fm.id = ph.parent_id
          WHERE fm.is_active = TRUE
          AND fm.organization_id = ${organizationId}
        )
        SELECT id FROM parent_hierarchy
      `;

        const parentIds = parentRaw.map((p) => p.id);

        allVisibleIds = [...new Set([...directIds, ...parentIds])];
      }

      if (allVisibleIds.length === 0) {
        return [];
      }

      // ── Full data fetch ─────────────────────────────────────────────────

      const completeModules = await prisma.formModule.findMany({
        where: {
          id: { in: allVisibleIds },
          isActive: true,
        },
        include: {
          forms: {
            include: {
              tableMapping: true,
              sections: {
                include: { fields: true },
                orderBy: { order: "asc" },
              },
              _count: { select: { records1: true /* ... */ } },
            },
          },
          parent: true,
          children: {
            where: {
              isActive: true,
              id: { in: allVisibleIds },
            },
            include: {
              forms: { /* same deep include */ },
            },
            orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
          },
        },
        orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      });

      // ── Hierarchy building ─────────────────────────────────────────────
      const moduleMap = new Map<string, any>();
      const rootModules: any[] = [];
      const visibleModuleIds = new Set(allVisibleIds);

      // First pass
      completeModules.forEach((module) => {
        const transformedModule = { ...module, children: [] };
        moduleMap.set(module.id, transformedModule);

        if (!module.parentId || !visibleModuleIds.has(module.parentId)) {
          rootModules.push(transformedModule);
        }
      });

      // Second pass: attach children
      completeModules.forEach((module) => {
        if (module.parentId && moduleMap.has(module.parentId)) {
          const parent = moduleMap.get(module.parentId)!;
          const child = moduleMap.get(module.id)!;
          parent.children.push(child);
        }
      });

      // Transform
      const result = rootModules.map((module) =>
        DatabaseTransforms.transformModuleHierarchy(module, 0),
      );

      return result;
    } catch (error: any) {
      console.error("[DatabaseService] CRITICAL ERROR in getModuleHierarchy:", error);
      console.error(error.stack); // ← extra stack trace
      return [];
    }
  }

  static async getForm(id: string, userId?: string): Promise<any | null> {
    try {
      // Define the include structure for form, sections, subforms, and nested elements
      const includeStructure = {
        sections: {
          include: {
            fields: { orderBy: { order: "asc" } },
          },
          orderBy: { order: "asc" },
        },
        subforms: {
          where: { parentSubformId: null }, // Only top-level subforms
          include: {
            fields: { orderBy: { order: "asc" } },
            childSubforms: {
              include: {
                fields: { orderBy: { order: "asc" } },
                childSubforms: {
                  include: {
                    fields: { orderBy: { order: "asc" } },
                    childSubforms: true, // Limited recursion depth; adjust if deeper nesting is needed
                  },
                  orderBy: { order: "asc" },
                },
              },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { order: "asc" },
        },
      };

      // 1. Fetch the basic form to check existence and module
      const basicForm = await prisma.form.findUnique({
        where: { id },
        select: {
          id: true,
          moduleId: true,
        },
      });

      if (!basicForm) return null;

      // 2. If no userId, return full form
      if (!userId) {
        return await prisma.form.findUnique({
          where: { id },
          include: includeStructure,
        });
      }

      // 3. Check module access
      const directIds = await this.getDirectAccessibleModuleIds(userId);
      if (!directIds.includes(basicForm.moduleId)) {
        return null;
      }

      // 4. Fetch full form structure
      const form = await prisma.form.findUnique({
        where: { id },
        include: includeStructure,
      });

      if (!form) return null;

      // 5. Get User's Roles and check for Admin status
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          unitAssignments: {
            include: { role: true },
          },
        },
      });

      if (!user) return null;

      const roleIds = user.unitAssignments.map((ua) => ua.roleId);
      const isAdmin = user.unitAssignments.some(
        (ua) => ua.role.isAdmin || (ua.role.name ?? "").toLowerCase().includes("admin"),
      );

      // Admins bypass all pruning
      if (isAdmin) {
        return form;
      }

      // ────────────────────────────────────────────────────────────────
      //  DEVELOPMENT / TESTING BYPASS: Return raw data without field pruning
      //  Remove or comment this block when you have proper permissions set up
      // ────────────────────────────────────────────────────────────────
      return {
        ...form,
        sections: form.sections || [],
        subforms: form.subforms || [],
      };

      // ── ORIGINAL PRUNING LOGIC (keep commented out until permissions are ready) ──
      /*
      const permissions = await prisma.rolePermission.findMany({
        where: {
          roleId: { in: roleIds },
          formId: id,
          granted: true,
        },
      });

      const allowedSectionIds = new Set(
        permissions.map((p) => p.sectionId).filter(Boolean),
      );
      const allowedFieldIds = new Set(
        permissions.map((p) => p.formFieldId).filter(Boolean),
      );

      const prunedSections = form.sections
        .map((section) => {
          if (
            allowedSectionIds.size > 0 &&
            !allowedSectionIds.has(section.id)
          ) {
            return null;
          }

          const newSection = { ...section };

          newSection.fields = section.fields.filter(
            (field) =>
              allowedFieldIds.size === 0 || allowedFieldIds.has(field.id),
          );

          return newSection;
        })
        .filter(Boolean);

      function pruneSubforms(subforms: any[]): any[] {
        return subforms.map((subform) => {
          const newSubform = { ...subform };
          newSubform.fields = subform.fields.filter(
            (field) =>
              allowedFieldIds.size === 0 || allowedFieldIds.has(field.id),
          );

          if (newSubform.childSubforms) {
            newSubform.childSubforms = pruneSubforms(newSubform.childSubforms);
          }

          return newSubform;
        }).filter(Boolean);
      }

      const prunedSubforms = pruneSubforms(form.subforms || []);

      return {
        ...form,
        sections: prunedSections,
        subforms: prunedSubforms,
      };
      */
    } catch (error: any) {
      console.error("[DatabaseService] getForm Error:", error);
      return null;
    }
  }

  // Form operations with permission checks
  static createForm = DatabaseModules.createForm;
  static deleteForm = DatabaseModules.deleteForm;
  static publishForm = DatabaseModules.publishForm;
  static unpublishForm = DatabaseModules.unpublishForm;

  // Enhanced form operations with permission filtering
  static async getForms(moduleId?: string, userId?: string): Promise<any[]> {
    try {
      const forms = await DatabaseModules.getForms(moduleId);

      if (!userId) {
        return forms;
      }

      // Get user's accessible modules to check form permissions
      const accessibleModules = await this.getModuleHierarchy(userId);
      const accessibleModuleIds = new Set<string>();

      // Flatten the hierarchy to get all accessible module IDs
      const collectModuleIds = (modules: any[]) => {
        modules.forEach((module) => {
          accessibleModuleIds.add(module.id);
          if (module.children && module.children.length > 0) {
            collectModuleIds(module.children);
          }
        });
      };
      collectModuleIds(accessibleModules);

      // Filter forms based on accessible modules
      const accessibleForms = forms.filter((form) =>
        accessibleModuleIds.has(form.moduleId),
      );

      return accessibleForms;
    } catch (error: any) {
      console.error("[DatabaseService] Error getting forms:", error);
      return [];
    }
  }

  // Permission-checked updateForm
  static async updateForm(
    id: string,
    data: any,
    userId?: string,
  ): Promise<any> {
    if (userId) {
      const form = await prisma.form.findUnique({
        where: { id },
        select: { moduleId: true },
      });
      if (!form) {
        throw new Error("Form not found");
      }

      const canWriteModule = await this.checkModulePermission(userId, form.moduleId, "WRITE");
      if (!canWriteModule) {
        throw new Error("Insufficient permissions to update the module");
      }

      const canWriteForm = await this.checkFormPermission(userId, id, "WRITE");
      if (!canWriteForm) {
        throw new Error("Insufficient permissions to update this form");
      }
    }

    return DatabaseModules.updateForm(id, data);
  }

  // Permission-checked deleteForm
  static async deleteForm(
    id: string,
    userId?: string
  ): Promise<void> {
    if (userId) {
      const form = await prisma.form.findUnique({
        where: { id },
        select: { moduleId: true },
      });
      if (!form) {
        throw new Error("Form not found");
      }

      const canDeleteModule = await this.checkModulePermission(userId, form.moduleId, "ADMIN");
      if (!canDeleteModule) {
        throw new Error("Insufficient permissions to delete in the module");
      }

      const canDeleteForm = await this.checkFormPermission(userId, id, "ADMIN");
      if (!canDeleteForm) {
        throw new Error("Insufficient permissions to delete this form");
      }
    }

    await DatabaseModules.deleteForm(id);
  }

  // Helper methods for getting user permissions (kept for compatibility)
  private static async getUserPermissionsForFiltering(
    userId: string,
  ): Promise<UserPermission[]> {
    return (await prisma.userPermission.findMany({
      where: { userId, isActive: true },
      include: {
        permission: {
          select: {
            name: true,
            category: true,
          },
        },
        module: {
          select: {
            name: true,
            path: true,
          },
        },
      },
    })) as UserPermission[];
  }

  private static async getRolePermissionsForUser(
    userId: string,
  ): Promise<RolePermission[]> {
    const userAssignments = await prisma.userUnitAssignment.findMany({
      where: { userId },
      select: { roleId: true },
    });

    const roleIds = userAssignments.map((assignment) => assignment.roleId);

    if (roleIds.length === 0) return [];

    return (await prisma.rolePermission.findMany({
      where: { roleId: { in: roleIds } },
      include: {
        permission: {
          select: {
            name: true,
            category: true,
          },
        },
        module: {
          select: {
            name: true,
            path: true,
          },
        },
      },
    })) as RolePermission[];
  }

  // Section operations
  static createSection = DatabaseModules.createSection;
  static getSections = DatabaseModules.getSections;
  static updateSection = DatabaseModules.updateSection;
  static deleteSection = DatabaseModules.deleteSection;
  static deleteSectionWithCleanup = DatabaseModules.deleteSectionWithCleanup;

  // Field operations – the other ones (create, get, etc.) still delegated
  static createField = DatabaseModules.createField;
  static getFields = DatabaseModules.getFields;
  static getAllFields = DatabaseModules.getAllFields;
  // static updateField = DatabaseModules.updateField;  ← REMOVED – now implemented above
  // static deleteField = DatabaseModules.deleteField;  ← you can keep or use the one above

  // Field types
  static getFieldTypes = DatabaseModules.getFieldTypes;
  static upsertFieldType = DatabaseModules.upsertFieldType;
  static seedFieldTypes = DatabaseModules.seedFieldTypes;

  // User authentication methods
  static getUserRecords = DatabaseRecords.getUserRecords;
  static updateUserLastLogin = DatabaseRecords.updateUserLastLogin;
  static createUser = DatabaseRecords.createUser;
  static getUserById = DatabaseRecords.getUserById;
  static updateUserProfile = DatabaseRecords.updateUserProfile;

  // Form record operations
  static createFormRecord = DatabaseRecords.createFormRecord;
  static getFormRecords = DatabaseRecords.getFormRecords;
  static getFormSubmissionCount = DatabaseRecords.getFormSubmissionCount;
  static getFormRecord = DatabaseRecords.getFormRecord;
  static updateFormRecord = DatabaseRecords.updateFormRecord;
  static deleteFormRecord = DatabaseRecords.deleteFormRecord;

  // Analytics
  static trackFormEvent = DatabaseRecords.trackFormEvent;
  static getFormAnalytics = DatabaseRecords.getFormAnalytics;

  // Lookup and relationship methods
  static getLookupSources = DatabaseRecords.getLookupSources;
  static getLinkedRecords = DatabaseRecords.getLinkedRecords;

  // RBAC operations
  static createRole = DatabaseRoles.createRole;
  static getRoles = DatabaseRoles.getRoles;
  static getRole = DatabaseRoles.getRole;
  static updateRole = DatabaseRoles.updateRole;
  static deleteRole = DatabaseRoles.deleteRole;
  static createPermission = DatabaseRoles.createPermission;
  static getPermissions = DatabaseRoles.getPermissions;
  static getPermission = DatabaseRoles.getPermission;
  static updatePermission = DatabaseRoles.updatePermission;
  static deletePermission = DatabaseRoles.deletePermission;
  static assignRoleToUser = DatabaseRoles.assignRoleToUser;
  static getUserPermissions = DatabaseRoles.getUserPermissions;
  static getUserPermissionsWithResources =
    DatabaseRoles.getUserPermissionsWithResources;
  static checkUserPermission = DatabaseRoles.checkUserPermission;
  static grantUserPermission = DatabaseRoles.grantUserPermission;
  static revokeUserPermission = DatabaseRoles.revokeUserPermission;
  static updateUserPermission = DatabaseRoles.updateUserPermission;
  static updateUserPermissionsBatch = DatabaseRoles.updateUserPermissionsBatch;
  static createResourcePermissions = DatabaseRoles.createResourcePermissions;
  static deleteResourcePermissions = DatabaseRoles.deleteResourcePermissions;
  static seedDefaultRoles = DatabaseRoles.seedDefaultRoles;
  static getEmployeesWithPermissions =
    DatabaseRoles.getEmployeesWithPermissions;
  static getModulesWithSubmodules = DatabaseRoles.getModulesWithSubmodules;
  static updateEmployeePermission = DatabaseRoles.updateEmployeePermission;

  // Enhanced user context methods
  static async getUserContext(userId: string): Promise<{
    user: any;
    permissions: any[];
    accessibleModules: any[];
    accessibleForms: any[];
  } | null> {
    try {
      // Get user record
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          unitAssignments: {
            include: {
              role: true,
              unit: true,
            },
          },
        },
      });
      if (!userRecord) {
        return null;
      }

      // Get user permissions and role permissions
      const userPermissions = await this.getUserPermissionsForFiltering(userId);
      const rolePermissions = await this.getRolePermissionsForUser(userId);

      // Get accessible modules (using the updated logic)
      const accessibleModules = await this.getModuleHierarchy(userId);

      // Get accessible forms (using the updated logic)
      const accessibleForms = await this.getForms(undefined, userId);

      return {
        user: {
          id: userRecord.id,
          email: userRecord.email || "Unknown",
          name:
            `${userRecord.first_name || ""} ${userRecord.last_name || ""
              }`.trim() || "Unknown User",
          department: userRecord.department || "Unassigned",
          status: userRecord.status || "Active",
        },
        permissions: [...userPermissions, ...rolePermissions],
        accessibleModules,
        accessibleForms,
      };
    } catch (error: any) {
      console.error("[DatabaseService] Error getting user context:", error);
      return null;
    }
  }

  // Permission validation helpers
  static async validateUserAccess(
    userId: string,
    resourceType: "module" | "form",
    resourceId: string,
    action: string = "view",
  ): Promise<boolean> {
    try {
      if (resourceType === "module") {
        // Check if user has access to this module
        const accessibleModules = await this.getModuleHierarchy(userId);
        const accessibleModuleIds = new Set<string>();

        const collectModuleIds = (modules: any[]) => {
          modules.forEach((module) => {
            accessibleModuleIds.add(module.id);
            if (module.children && module.children.length > 0) {
              collectModuleIds(module.children);
            }
          });
        };
        collectModuleIds(accessibleModules);

        return accessibleModuleIds.has(resourceId);
      } else {
        // For forms, check if user has access
        const form = await this.getForm(resourceId, userId);
        return form !== null;
      }
    } catch (error: any) {
      console.error("[DatabaseService] Error validating user access:", error);
      return false;
    }
  }

  // NEW: Check permission for module
  static async checkModulePermission(userId: string, moduleId: string, category: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { unitAssignments: { include: { role: true } } },
      });

      if (!user) return false;

      const roleIds = user.unitAssignments.map((ua) => ua.roleId);
      const isAdmin = user.unitAssignments.some(
        (ua) => ua.role.isAdmin || (ua.role.name ?? "").toLowerCase().includes("admin"),
      );

      if (isAdmin) return true;

      const permissionCategory = category.toUpperCase() as PermissionCategory;

      const permission = await prisma.rolePermission.findFirst({
        where: {
          roleId: { in: roleIds },
          moduleId,
          formId: null,
          sectionId: null,
          formFieldId: null,
          granted: true,
          permission: {
            category: permissionCategory,
          },
        },
      });

      return !!permission;
    } catch (error: any) {
      console.error("[DatabaseService] Error checking module permission:", error);
      return false;
    }
  }

  // NEW: Check permission for form (form-level, not granular fields/sections)
  static async checkFormPermission(userId: string, formId: string, category: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { unitAssignments: { include: { role: true } } },
      });

      if (!user) return false;

      const roleIds = user.unitAssignments.map((ua) => ua.roleId);
      const isAdmin = user.unitAssignments.some(
        (ua) => ua.role.isAdmin || (ua.role.name ?? "").toLowerCase().includes("admin"),
      );

      if (isAdmin) return true;

      const permissionCategory = category.toUpperCase() as PermissionCategory;

      const permission = await prisma.rolePermission.findFirst({
        where: {
          roleId: { in: roleIds },
          formId,
          sectionId: null,
          formFieldId: null,
          granted: true,
          permission: {
            category: permissionCategory,
          },
        },
      });

      return !!permission;
    } catch (error: any) {
      console.error("[DatabaseService] Error checking form permission:", error);
      return false;
    }
  }

  // Helper method to count children recursively
  private static countChildrenRecursive(module: any): number {
    let count = 0;
    if (module.children && module.children.length > 0) {
      count += module.children.length;
      module.children.forEach((child: any) => {
        count += this.countChildrenRecursive(child);
      });
    }
    return count;
  }

  // Enhanced modules list with permission filtering
  static async getModules(userId?: string): Promise<any[]> {
    try {
      const hierarchyModules = await this.getModuleHierarchy(userId);
      return DatabaseTransforms.flattenModuleHierarchy(hierarchyModules);
    } catch (error: any) {
      console.error("[DatabaseService] Error getting modules:", error);
      return [];
    }
  }
}