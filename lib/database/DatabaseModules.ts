import { prisma } from "@/lib/prisma";
import type {
  FormModule,
  Form,
  FormSection,
  FormField,
  FieldType,
  Subform,
} from "@/types/form-builder";
import { DatabaseTransforms } from "./DatabaseTransforms";
import {
  invalidateFormCache,
  invalidateFormCacheMany,
  resolveFormIdFromField,
  resolveFormIdFromSection,
  resolveFormIdFromSubform,
} from "@/lib/forms/form-cache";

export class DatabaseModules {
  // Module operations with hierarchy support
  static async createModule(data: {
    name: string;
    description?: string;
    parentId?: string;
    moduleType?: string;
    icon?: string;
    color?: string;
    organizationId: string;
  }): Promise<FormModule> {
    if (!data.name || data.name.trim() === "") {
      throw new Error("Module name is required");
    }
    if (!data.organizationId) {
      throw new Error("Organization ID is required");
    }

    try {
      // Validate organization exists
      const organization = await prisma.organization.findUnique({
        where: { id: data.organizationId },
        select: { id: true },
      });

      if (!organization) {
        throw new Error(`Organization with ID ${data.organizationId} does not exist`);
      }

      // Calculate hierarchy data
      let level = 0;
      let moduleType = data.moduleType || "standard";

      if (data.parentId) {
        // Get parent module to calculate level and validate organization
        const parentModule = await prisma.formModule.findUnique({
          where: { id: data.parentId },
          select: {
            level: true,
            organization: { select: { id: true } },
          },
        });

        if (!parentModule) {
          throw new Error(`Parent module with ID ${data.parentId} does not exist`);
        }

        if (parentModule.organization.id !== data.organizationId) {
          throw new Error("Parent module must belong to the same organization");
        }

        level = parentModule.level + 1;
        moduleType = "child";
      } else {
        moduleType = "master";
      }

      const module = await prisma.formModule.create({
        data: {
          name: data.name.trim(),
          organization: {
            connect: { id: data.organizationId },
          },
          description: data.description?.trim() || null,
          icon: data.icon || null,
          color: data.color || null,
          parent: data.parentId ? { connect: { id: data.parentId } } : undefined, // Use connect for parent relation
          moduleType,
          level,
          isActive: true,
          sortOrder: 0,
        },
        include: {
          forms: {
            include: {
              tableMapping: true,
              sections: {
                include: {
                  fields: true,
                
                },
                orderBy: { order: "asc" },
              },
            },
          },
        },
      });

      // Create a default form for the module
      const defaultForm = await this.createForm({
        moduleId: module.id,
        name: "Default Form",
        description: "Your first form in this module",
        organizationId: data.organizationId,
      });

      const transformedModule = DatabaseTransforms.transformModule(
        module,
        level
      );
      return {
        ...transformedModule,
        forms: [defaultForm],
      };
    } catch (error: any) {
      console.error("Database error creating module:", error);
      throw new Error(`Failed to create module: ${error?.message}`);
    }
  }
  // Get modules with proper hierarchy structure
  static async getModuleHierarchy(): Promise<FormModule[]> {
    try {
      // Get all modules
      const allModules = await prisma.formModule.findMany({
        include: {
          forms: {
            include: {
              tableMapping: true,
              sections: {
                include: {
                  fields: true,
                
                },
                orderBy: { order: "asc" },
              },
              _count: {
                select: {
                  // Unified table only — kept complete via dual-write. Counting
                  // all 15 shards too was 16 correlated COUNT subqueries per
                  // form; transformForm() reads this single `records` count.
                  records: true,
                },
              },
            },
          },
        },
        orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      });

      // Build hierarchy from flat list
      const moduleMap = new Map<string, any>();
      const rootModules: any[] = [];

      // First pass: create map and identify root modules
      allModules.forEach((module) => {
        moduleMap.set(module.id, { ...module, children: [] });

        if (!module.parentId) {
          rootModules.push(moduleMap.get(module.id));
        }
      });

      // Second pass: build parent-child relationships
      allModules.forEach((module) => {
        if (module.parentId && moduleMap.has(module.parentId)) {
          const parent = moduleMap.get(module.parentId);
          const child = moduleMap.get(module.id);
          parent.children.push(child);
        }
      });

      // Transform to proper format with hierarchy levels
      return rootModules.map((module) =>
        DatabaseTransforms.transformModuleHierarchy(module, 0)
      );
    } catch (error: any) {
      console.error("Database error fetching module hierarchy:", error);
      throw new Error(`Failed to fetch module hierarchy: ${error?.message}`);
    }
  }

  // Legacy method for backward compatibility - returns flat list
  static async getModules(): Promise<FormModule[]> {
    try {
      const hierarchyModules = await this.getModuleHierarchy();
      return DatabaseTransforms.flattenModuleHierarchy(hierarchyModules);
    } catch (error: any) {
      console.error("Database error fetching modules:", error);
      throw new Error(`Failed to fetch modules: ${error?.message}`);
    }
  }

  static async getModule(id: string): Promise<FormModule | null> {
    try {
      const module = await prisma.formModule.findUnique({
        where: { id },
        include: {
          forms: {
            include: {
              tableMapping: true,
              sections: {
                include: {
                  fields: { orderBy: { order: "asc" } },
                },
                orderBy: { order: "asc" },
              },
              subforms: {
                where: { parentSubformId: null },
                include: {
                  fields: { orderBy: { order: "asc" } },
                  childSubforms: {
                    include: {
                      fields: { orderBy: { order: "asc" } },
                      childSubforms: {
                        include: {
                          fields: { orderBy: { order: "asc" } },
                        },
                        orderBy: { order: "asc" },
                      },
                    },
                    orderBy: { order: "asc" },
                  },
                },
                orderBy: { order: "asc" },
              },
              _count: {
                select: {
                  // Unified table only — kept complete via dual-write. Counting
                  // all 15 shards too was 16 correlated COUNT subqueries per
                  // form; transformForm() reads this single `records` count.
                  records: true,
                },
              },
            },
          },
        },
      });

      if (!module) return null;
      return DatabaseTransforms.transformModule(module);
    } catch (error: any) {
      console.error("Database error fetching module:", error);
      throw new Error(`Failed to fetch module: ${error?.message}`);
    }
  }

  static async updateModule(
    id: string,
    data: Partial<FormModule>
  ): Promise<FormModule> {
    try {
      const module = await prisma.formModule.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          icon: data.icon,
          color: data.color,
          parentId: data.parentId,
          moduleType: data.moduleType,
          level: data.level,
          path: data.path,
          isActive: data.isActive,
          sortOrder: data.sortOrder,
        },
        include: {
          forms: {
            include: {
              tableMapping: true,
              sections: {
                include: {
                  fields: true,
               
                },
                orderBy: { order: "asc" },
              },
              _count: {
                select: {
                  // Unified table only — kept complete via dual-write. Counting
                  // all 15 shards too was 16 correlated COUNT subqueries per
                  // form; transformForm() reads this single `records` count.
                  records: true,
                },
              },
            },
          },
        },
      });

      return DatabaseTransforms.transformModule(module);
    } catch (error: any) {
      console.error("Database error updating module:", error);
      throw new Error(`Failed to update module: ${error?.message}`);
    }
  }

  static async moveModule(
    moduleId: string,
    newParentId?: string
  ): Promise<FormModule> {
    try {
      // Calculate new level
      let level = 0;

      if (newParentId) {
        const parent = await prisma.formModule.findUnique({
          where: { id: newParentId },
          select: { level: true },
        });

        if (parent) {
          level = parent.level + 1;
        }
      }

      // Update module
      const module = await prisma.formModule.update({
        where: { id: moduleId },
        data: {
          parentId: newParentId || null,
          level,
          moduleType: newParentId ? "child" : "master",
        },
        include: {
          forms: {
            include: {
              tableMapping: true,
              sections: {
                include: {
                  fields: true,
               
                },
                orderBy: { order: "asc" },
              },
              _count: {
                select: {
                  // Unified table only — kept complete via dual-write. Counting
                  // all 15 shards too was 16 correlated COUNT subqueries per
                  // form; transformForm() reads this single `records` count.
                  records: true,
                },
              },
            },
          },
        },
      });

      return DatabaseTransforms.transformModule(module, level);
    } catch (error: any) {
      console.error("Database error moving module:", error);
      throw new Error(`Failed to move module: ${error?.message}`);
    }
  }

  static async deleteModule(id: string): Promise<void> {
    try {
      // Check if module has children
      const childrenCount = await prisma.formModule.count({
        where: { parentId: id },
      });

      if (childrenCount > 0) {
        throw new Error(
          "Cannot delete module with child modules. Please delete or move child modules first."
        );
      }

      await prisma.formModule.delete({
        where: { id },
      });
    } catch (error: any) {
      console.error("Database error deleting module:", error);
      throw new Error(`Failed to delete module: ${error?.message}`);
    }
  }

  // Form operations
  static async createForm(data: {
    moduleId: string;
    name: string;
    description?: string;
    isUserForm?: boolean;
    isEmployeeForm?: boolean;
  }): Promise<Form> {
    try {
      const form = await prisma.form.create({
        data: {
          moduleId: data.moduleId,
          name: data.name,
          description: data.description,
          settings: {},
          isPublished: false,
          allowAnonymous: true,
          requireLogin: false,
          submissionMessage: "Thank you for your submission!",
          isUserForm: data.isUserForm || false,
          isEmployeeForm: data.isEmployeeForm || false,
        },
        include: {
          tableMapping: true,
          sections: {
            include: {
              fields: true,
           
            },
            orderBy: { order: "asc" },
          },
        },
      });

      // Create a default section for the form
      const defaultSection = await this.createSection({
        formId: form.id,
        title: "Default Section",
        description: "Your first section",
        columns: 1,
        order: 0,
      });

      return {
        ...DatabaseTransforms.transformForm(form),
        sections: [defaultSection],
      };
    } catch (error: any) {
      console.error("Database error creating form:", error);
      throw new Error(`Failed to create form: ${error?.message}`);
    }
  }

  static async getForms(moduleId?: string): Promise<Form[]> {
    try {
      const forms = await prisma.form.findMany({
        where: moduleId ? { moduleId } : undefined,
        include: {
          tableMapping: true,
          sections: {
            include: {
              fields: {
                include: { formula: true },
                orderBy: { order: "asc" },
              },

            },
            orderBy: { order: "asc" },
          },
          _count: {
            select: {
              // Unified table only — kept complete via dual-write (was 16
              // correlated COUNT subqueries per form); transformForm() reads
              // this single `records` count.
              records: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return forms.map((form) => DatabaseTransforms.transformForm(form));
    } catch (error: any) {
      console.error("Database error fetching forms:", error);
      throw new Error(`Failed to fetch forms: ${error.message}`);
    }
  }

  // Enhanced getForm method with complete subform hierarchy
  static async getForm(id: string): Promise<Form | null> {
    try {
      const form = await prisma.form.findUnique({
        where: { id },
        include: {
          tableMapping: true,
          sections: {
            include: {
              fields: {
                include: { formula: true },
                orderBy: { order: "asc" },
              },

            },
            orderBy: { order: "asc" },
          },
          _count: {
            select: {
              // Unified table only — kept complete via dual-write (was 16
              // correlated COUNT subqueries per form); transformForm() reads
              // this single `records` count.
              records: true,
            },
          },
        },
      });

      if (!form) {
        return null;
      }

      return DatabaseTransforms.transformForm(form);
    } catch (error: any) {
      console.error("Database error fetching form:", error);
      throw new Error(`Failed to fetch form: ${error?.message}`);
    }
  }

  static async updateForm(id: string, data: Partial<Form>): Promise<Form> {
    try {
      // Handle isUserForm and isEmployeeForm changes and update table mapping accordingly
      if (data.isUserForm !== undefined || data.isEmployeeForm !== undefined) {
        const currentForm = await prisma.form.findUnique({
          where: { id },
          select: { isUserForm: true, isEmployeeForm: true, moduleId: true },
        });

        // Validate: only one employee form per organization
        if (data.isEmployeeForm && currentForm && !currentForm.isEmployeeForm) {
          const formModule = await prisma.formModule.findUnique({
            where: { id: currentForm.moduleId },
            select: { organizationId: true },
          });

          if (formModule?.organizationId) {
            const existingEmployeeForm = await prisma.form.findFirst({
              where: {
                isEmployeeForm: true,
                id: { not: id },
                module: { organizationId: formModule.organizationId },
              },
              select: { id: true, name: true },
            });

            if (existingEmployeeForm) {
              throw new Error(
                `Another employee form "${existingEmployeeForm.name}" already exists in this organization. Only one employee form is allowed per organization.`
              );
            }
          }
        }

        // If isUserForm or isEmployeeForm status is changing, update table mapping
        if (
          currentForm &&
          (currentForm.isUserForm !== data.isUserForm ||
            currentForm.isEmployeeForm !== data.isEmployeeForm)
        ) {
          let targetTable = null;

          if (data.isUserForm) {
            targetTable = "form_records_15";
          } else if (data.isEmployeeForm) {
            targetTable = "form_records_14";
          }

          if (targetTable) {
            // Update or create mapping for user/employee form
            await prisma.formTableMapping.upsert({
              where: { formId: id },
              update: { storageTable: targetTable },
              create: { formId: id, storageTable: targetTable },
            });
          } else {
            // For non-user/non-employee forms, let getFormRecordTable handle the assignment
            const existingMapping = await prisma.formTableMapping.findUnique({
              where: { formId: id },
            });

            if (
              existingMapping &&
              (existingMapping.storageTable === "form_records_15" ||
                existingMapping.storageTable === "form_records_14")
            ) {
              // Remove the mapping so it can be reassigned to a regular table
              await prisma.formTableMapping.delete({
                where: { formId: id },
              });
            }
          }
        }
      }

      const form = await prisma.form.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          settings: data.settings,
          isPublished: data.isPublished,
          publishedAt: data.publishedAt,
          formUrl: data.formUrl,
          allowAnonymous: data.allowAnonymous,
          requireLogin: data.requireLogin,
          maxSubmissions: data.maxSubmissions,
          submissionMessage: data.submissionMessage,
          conditional: data.conditional ?? undefined,
          styling: data.styling === null ? undefined : data.styling,
          isUserForm: data.isUserForm,
          isEmployeeForm: data.isEmployeeForm,
        },
        include: {
          tableMapping: true,
          sections: {
            include: {
              fields: {
                orderBy: { order: "asc" },
              }
            },
            orderBy: { order: "asc" },
          },
          subforms: {
            where: { parentSubformId: null },
            include: {
              fields: { orderBy: { order: "asc" } },
              childSubforms: {
                include: {
                  fields: { orderBy: { order: "asc" } },
                  childSubforms: {
                    include: {
                      fields: { orderBy: { order: "asc" } },
                    },
                    orderBy: { order: "asc" },
                  },
                },
                orderBy: { order: "asc" },
              },
            },
            orderBy: { order: "asc" },
          },
          _count: {
            select: {
              // Unified table only — kept complete via dual-write (was 16
              // correlated COUNT subqueries per form); transformForm() reads
              // this single `records` count.
              records: true,
            },
          },
        },
      });

      // Form/table-mapping shape changed — drop any cached structure.
      await invalidateFormCache(id);

      return DatabaseTransforms.transformForm(form);
    } catch (error: any) {
      console.error("Database error updating form:", error);
      throw new Error(`Failed to update form: ${error?.message}`);
    }
  }

  static async deleteForm(id: string): Promise<void> {
    try {
      await prisma.form.delete({
        where: { id },
      });
      // Drop the cache so any pending reads miss instead of serving ghost data.
      await invalidateFormCache(id);
    } catch (error: any) {
      console.error("Database error deleting form:", error);
      throw new Error(`Failed to delete form: ${error?.message}`);
    }
  }

  static async publishForm(
    id: string,
    settings: {
      allowAnonymous?: boolean;
      requireLogin?: boolean;
      maxSubmissions?: number | null;
      submissionMessage?: string;
    },
    baseUrlOverride?: string,
  ): Promise<Form> {
    try {
      const baseUrl = (
        baseUrlOverride ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:3000"
      ).replace(/\/+$/, "");
      const formUrl = `${baseUrl}/form/${id}`;

      const form = await this.updateForm(id, {
        isPublished: true,
        publishedAt: new Date(),
        formUrl,
        ...settings,
      });

      return form;
    } catch (error: any) {
      console.error("Database error publishing form:", error);
      throw new Error(`Failed to publish form: ${error?.message}`);
    }
  }

  static async unpublishForm(id: string): Promise<Form> {
    try {
      const form = await this.updateForm(id, {
        isPublished: false,
        publishedAt: undefined,
        formUrl: undefined,
      });

      return form;
    } catch (error: any) {
      console.error("Database error unpublishing form:", error);
      throw new Error(`Failed to unpublish form: ${error?.message}`);
    }
  }

  // Section operations
  static async createSection(data: {
    formId: string;
    title: string;
    description?: string;
    columns?: number;
    order?: number;
  }): Promise<FormSection> {
    try {
      const section = await prisma.formSection.create({
        data: {
          formId: data.formId,
          title: data.title,
          description: data.description,
          columns: data.columns || 1,
          order: data.order || 0,
          visible: true,
          collapsible: false,
          collapsed: false,
        },
        include: {
          fields: {
            orderBy: { order: "asc" },
          },
        
        },
      });

      // New section in an existing form — invalidate so the next read picks it up.
      await invalidateFormCache(data.formId);

      return DatabaseTransforms.transformSection(section);
    } catch (error: any) {
      console.error("Database error creating section:", error);
      throw new Error(`Failed to create section: ${error?.message}`);
    }
  }

  static async getSections(formId: string): Promise<FormSection[]> {
    try {
      const sections = await prisma.formSection.findMany({
        where: { formId },
        include: {
          fields: {
            orderBy: { order: "asc" },
          },
       
        },
        orderBy: { order: "asc" },
      });

      return sections.map((section) =>
        DatabaseTransforms.transformSection(section)
      );
    } catch (error: any) {
      console.error("Database error fetching sections:", error);
      throw new Error(`Failed to fetch sections: ${error.message}`);
    }
  }

  static async updateSection(
    id: string,
    data: Partial<FormSection>
  ): Promise<FormSection> {
    try {
      const section = await prisma.formSection.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          columns: data.columns,
          order: data.order,
          visible: data.visible,
          collapsible: data.collapsible,
          collapsed: data.collapsed,
          // Per-section opt-out for hierarchical record inheritance.
          // When true, fields in this section are stripped from rows the
          // viewer is seeing through inheritance (handled in the records
          // list endpoint). The original creator always sees the full row.
          excludeFromInheritance: (data as any).excludeFromInheritance,
          conditional: data.conditional || undefined,
          styling: data.styling || undefined,
        },
        include: {
          fields: {
            orderBy: { order: "asc" },
          },
         
        },
      });

      await invalidateFormCache(section.formId);

      return DatabaseTransforms.transformSection(section);
    } catch (error: any) {
      console.error("Database error updating section:", error);
      throw new Error(`Failed to update section: ${error?.message}`);
    }
  }

  static async deleteSection(id: string): Promise<void> {
    try {
      // Resolve the formId BEFORE delete (section.formId becomes unreadable after).
      const formId = await resolveFormIdFromSection(id);
      await prisma.formSection.delete({
        where: { id },
      });
      if (formId) await invalidateFormCache(formId);
    } catch (error: any) {
      console.error("Database error deleting section:", error);
      throw new Error(`Failed to delete section: ${error?.message}`);
    }
  }

  /**
   * Enhanced section deletion with complete cleanup of associated records
   */
  static async deleteSectionWithCleanup(sectionId: string): Promise<void> {
    try {
      // First, get the section with all its fields to know what to clean up
      const section = await prisma.formSection.findUnique({
        where: { id: sectionId },
        include: {
          fields: true,
          form: {
            select: { id: true, name: true, tableMapping: true },
          },
        },
      });

      if (!section) {
        throw new Error(`Section with ID ${sectionId} not found`);
      }

      const formId = section.formId;
      const fieldLabels = section.fields.map((f) => f.label);

      // Step 1: Clean up form records - remove field data for deleted fields
      if (fieldLabels.length > 0 && section.form.tableMapping) {
        const records = await this.getFormRecords(formId);

        // Clean each record by removing data for deleted fields
        for (const record of records) {
          const recordData = (record.recordData as any) || {};
          let hasChanges = false;

          for (const fieldLabel of fieldLabels) {
            if (recordData[fieldLabel]) {
              delete recordData[fieldLabel];
              hasChanges = true;
            }
          }

          if (hasChanges) {
            await this.updateFormRecord(record.id, {
              recordData,
              updatedAt: new Date(),
            });
          }
        }
      }

      // Step 2: Clean up lookup relations for deleted fields
      const fieldIds = section.fields.map((f) => f.id);
      if (fieldIds.length > 0) {
        await prisma.lookupFieldRelation.deleteMany({
          where: {
            formFieldId: { in: fieldIds },
          },
        });
      }

      // Step 3: Delete the section (this will cascade delete fields due to foreign key constraints)
      await prisma.formSection.delete({
        where: { id: sectionId },
      });

      // Step 4: Reorder remaining sections
      const remainingSections = await prisma.formSection.findMany({
        where: { formId },
        orderBy: { order: "asc" },
      });

      for (let i = 0; i < remainingSections.length; i++) {
        if (remainingSections[i].order !== i) {
          await prisma.formSection.update({
            where: { id: remainingSections[i].id },
            data: { order: i },
          });
        }
      }

      // Section + fields + lookups + reorders all changed structure.
      await invalidateFormCache(formId);
    } catch (error: any) {
      console.error("Database error deleting section with cleanup:", error);
      throw new Error(
        `Failed to delete section with cleanup: ${error?.message}`
      );
    }
  }

  // Subform operations
  static async createSubform(data: {
    sectionId?: string;
    parentSubformId?: string;
    name: string;
    description?: string;
    columns?: number;
    order?: number;
  }): Promise<Subform> {
    try {
      // Calculate level and path based on parent
      let level = 0;
      let path = "1";

      if (data.parentSubformId) {
        const parent = await prisma.subform.findUnique({
          where: { id: data.parentSubformId },
          select: { level: true, path: true },
        });

        if (parent) {
          level = parent.level + 1;
          // Count siblings to determine the next path segment
          const siblingCount = await prisma.subform.count({
            where: { parentSubformId: data.parentSubformId },
          });
          path = parent.path ? `${parent.path}.${siblingCount + 1}` : `${siblingCount + 1}`;
        }
      } else if (data.sectionId) {
        // Count root-level subforms in the section
        const siblingCount = await prisma.subform.count({
          where: {
            sectionId: data.sectionId,
            parentSubformId: null
          },
        });
        path = `${siblingCount + 1}`;
      }

      const subform = await prisma.subform.create({
        data: {
          sectionId: data.sectionId,
          parentSubformId: data.parentSubformId,
          name: data.name,
          description: data.description,
          columns: data.columns || 1,
          order: data.order || 0,
          level,
          path,
          visible: true,
          collapsible: true,
          collapsed: false,
        },
        include: {
          fields: {
            orderBy: { order: "asc" },
          },
          records: true,
          parentSubform: {
            select: {
              id: true,
              name: true,
              level: true,
              path: true,
            },
          },
          childSubforms: {
            include: {
              fields: {
                orderBy: { order: "asc" },
              },
              records: true,
            },
            orderBy: { order: "asc" },
          },
        },
      });

      // Drop the parent form's cached structure so the new subform appears.
      if ((subform as any).formId) {
        await invalidateFormCache((subform as any).formId);
      }

      return DatabaseTransforms.transformSubform(subform);
    } catch (error: any) {
      console.error("Database error creating subform:", error);
      throw new Error(`Failed to create subform: ${error?.message}`);
    }
  }

  static async updateSubform(
    id: string,
    data: Partial<Subform>
  ): Promise<Subform> {
    try {
      const subform = await prisma.subform.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          columns: data.columns,
          order: data.order,
          visible: data.visible,
          collapsible: data.collapsible,
          collapsed: data.collapsed,
          styling: data.styling,
          conditional: data.conditional,
        },
        include: {
          fields: {
            orderBy: { order: "asc" },
          },
          records: true,
          parentSubform: {
            select: {
              id: true,
              name: true,
              level: true,
              path: true,
            },
          },
          childSubforms: {
            include: {
              fields: {
                orderBy: { order: "asc" },
              },
              records: true,
              childSubforms: {
                include: {
                  fields: {
                    orderBy: { order: "asc" },
                  },
                  records: true,
                },
                orderBy: { order: "asc" },
              },
            },
            orderBy: { order: "asc" },
          },
        },
      });

      if ((subform as any).formId) {
        await invalidateFormCache((subform as any).formId);
      }

      return DatabaseTransforms.transformSubform(subform);
    } catch (error: any) {
      console.error("Database error updating subform:", error);
      throw new Error(`Failed to update subform: ${error?.message}`);
    }
  }

  static async deleteSubform(id: string): Promise<void> {
    try {
      // Capture formId BEFORE delete so we can invalidate the parent form's cache.
      const formId = await resolveFormIdFromSubform(id);
      await prisma.subform.delete({
        where: { id },
      });
      if (formId) await invalidateFormCache(formId);
    } catch (error: any) {
      console.error("Database error deleting subform:", error);
      throw new Error(`Failed to delete subform: ${error?.message}`);
    }
  }

  // Field operations
  static async createField(data: {
    sectionId?: string;
    subformId?: string;
    type: string;
    label: string;
    placeholder?: string;
    description?: string;
    defaultValue?: string;
    options?: any[];
    validation?: Record<string, any>;
    visible?: boolean;
    readonly?: boolean;
    width?: string;
    order?: number;
    lookup?: any;
    isDependent?: boolean;
    parentFieldId?: string | null;
  }): Promise<FormField> {
    try {
      const field = await prisma.formField.create({
        data: {
          sectionId: data.sectionId,
          subformId: data.subformId,
          type: data.type,
          label: data.label,
          placeholder: data.placeholder,
          description: data.description,
          defaultValue: data.defaultValue,
          options: data.options || [],
          validation: data.validation || {},
          visible: data.visible ?? true,
          readonly: data.readonly ?? false,
          width: data.width || "full",
          order: data.order || 0,
          lookup: data.lookup, // Store complete lookup configuration
          isDependent: data.isDependent ?? false,
          parentFieldId: data.parentFieldId ?? null,
        },
      });

      // Handle lookup relations after field creation
      if (data.type === "lookup" && data.lookup?.sourceId) {
        try {
          await this.handleLookupRelations(field.id, data);
        } catch (error: any) {
          console.error(
            "[DatabaseService] Error handling lookup relations:",
            error.message
          );
          // Don't fail the field creation if lookup relations fail
        }
      }

      // Resolve which form this field belongs to (it could be attached to a
      // section or to a subform) and drop that form's cached structure.
      const formId = await resolveFormIdFromField(field.id);
      if (formId) await invalidateFormCache(formId);

      return DatabaseTransforms.transformField(field);
    } catch (error: any) {
      console.error("Database error creating field:", error);
      throw new Error(`Failed to create field: ${error?.message}`);
    }
  }

  private static async handleLookupRelations(
    fieldId: string,
    fieldData: any
  ): Promise<void> {
    if (!fieldData.lookup?.sourceId) {
      console.error(
        "[DatabaseService] Lookup field missing source information",
        { fieldId }
      );
      return;
    }

    const lookupSourceId = fieldData.lookup.sourceId;

    // Get form and module info from the field's section
    let formId: string | null = null;
    let moduleId: string | null = null;

    if (fieldData.sectionId) {
      const section = await prisma.formSection.findUnique({
        where: { id: fieldData.sectionId },
        select: { formId: true, form: { select: { moduleId: true } } },
      });
      if (section) {
        formId = section.formId;
        moduleId = section.form.moduleId;
      }
    } else if (fieldData.subformId) {
      const subform = await prisma.subform.findUnique({
        where: { id: fieldData.subformId },
        select: {
          section: {
            select: { formId: true, form: { select: { moduleId: true } } },
          },
        },
      });
      if (subform?.section) {
        formId = subform.section.formId;
        moduleId = subform.section.form.moduleId;
      }
    }

    if (!formId || !moduleId) {
      console.error(
        "[DatabaseService] Could not determine form/module for field",
        { fieldId }
      );
      return;
    }

    // Ensure LookupSource exists
    let lookupSource = await prisma.lookupSource.findUnique({
      where: { id: lookupSourceId },
    });

    if (!lookupSource) {
      if (lookupSourceId.startsWith("module_")) {
        const sourceModuleId = lookupSourceId.replace("module_", "");
        const module = await prisma.formModule.findUnique({
          where: { id: sourceModuleId },
        });

        if (module) {
          lookupSource = await prisma.lookupSource.create({
            data: {
              id: lookupSourceId,
              name: module.name,
              type: "module",
              sourceModuleId: module.id,
              description: module.description || `Module with forms`,
              active: true,
            },
          });
        }
      } else if (lookupSourceId.startsWith("form_")) {
        const sourceFormId = lookupSourceId.replace("form_", "");
        const sourceForm = await prisma.form.findUnique({
          where: { id: sourceFormId },
        });

        if (sourceForm) {
          lookupSource = await prisma.lookupSource.create({
            data: {
              id: lookupSourceId,
              name: sourceForm.name,
              type: "form",
              sourceFormId: sourceForm.id,
              description: sourceForm.description || `Form source`,
              active: true,
            },
          });
        }
      }
    }

    if (!lookupSource) {
      console.error("[DatabaseService] Failed to create/find LookupSource", {
        lookupSourceId,
      }); // Keep this error log - it signals a real problem
      return;
    }

    // Create LookupFieldRelation
    const relationId = `lfr_${lookupSourceId}_${fieldId}`;
    await prisma.lookupFieldRelation.upsert({
      where: { id: relationId },
      update: {
        lookupSourceId,
        formFieldId: fieldId,
        formId,
        moduleId,
        displayField: fieldData.lookup.fieldMapping?.display,
        valueField: fieldData.lookup.fieldMapping?.value,
        multiple: fieldData.lookup.multiple,
        searchable: fieldData.lookup.searchable,
        filters: fieldData.lookup.filters || {},
        updatedAt: new Date(),
      },
      create: {
        id: relationId,
        lookupSourceId,
        formFieldId: fieldId,
        formId,
        moduleId,
        displayField: fieldData.lookup.fieldMapping?.display,
        valueField: fieldData.lookup.fieldMapping?.value,
        multiple: fieldData.lookup.multiple,
        searchable: fieldData.lookup.searchable,
        filters: fieldData.lookup.filters || {},
      },
    });

  }

  static async getFields(sectionId: string): Promise<FormField[]> {
    try {
      const fields = await prisma.formField.findMany({
        where: { sectionId },
        orderBy: { order: "asc" },
      });

      return fields.map((field) => DatabaseTransforms.transformField(field));
    } catch (error: any) {
      console.error("Database error fetching fields:", error);
      throw new Error(`Failed to fetch fields: ${error.message}`);
    }
  }

  /**
   * Get all fields in the system or scoped by formId or moduleId.
   * - If `formId` is provided, returns fields for that form (including subforms).
   * - Else if `moduleId` is provided, returns fields for all forms in that module.
   * - If neither is provided, returns all fields.
   */
  static async getAllFields(options?: {
    moduleId?: string;
    formId?: string;
  }): Promise<FormField[]> {
    try {
      const opts = options || {};

      let where: any = {};

      if (opts.formId) {
        where = {
          OR: [
            { section: { formId: opts.formId } },
            { subform: { section: { formId: opts.formId } } },
          ],
        };
      } else if (opts.moduleId) {
        where = {
          OR: [
            { section: { form: { moduleId: opts.moduleId } } },
            { subform: { section: { form: { moduleId: opts.moduleId } } } },
          ],
        };
      }

      const fields = await prisma.formField.findMany({
        where: Object.keys(where).length ? where : undefined,
        orderBy: { order: "asc" },
      });

      return fields.map((field) => DatabaseTransforms.transformField(field));
    } catch (error: any) {
      console.error("Database error fetching all fields:", error);
      throw new Error(`Failed to fetch all fields: ${error?.message}`);
    }
  }

  static async updateField(
    id: string,
    data: Partial<FormField>
  ): Promise<FormField> {
    try {
      // Fetch existing field first for type validation and formula check
      const existingField = await prisma.formField.findUnique({
        where: { id },
        include: { formula: true },
      });

      if (!existingField) {
        throw new Error('Field not found');
      }

      // Prepare base update data, ignoring undefined values to avoid overwrites
      const updateData: any = {};
      const directKeys = [
        'sectionId', 'subformId', 'label', 'placeholder', 'description',
        'defaultValue', 'options', 'validation', 'visible', 'readonly', 'width',
        'order', 'conditional', 'styling', 'properties', 'rollup', 'lookup', 'decimalPlaces'
      ];
      directKeys.forEach(key => {
        if (data[key] !== undefined) {
          updateData[key] = data[key];
        }
      });

      // Handle type update separately if provided
      if (data.type !== undefined) {
        updateData.type = data.type;
      }

      // Handle formula relation specially if provided
      if (data.formula) {
        const formulaPayload = data.formula as any; // { expression, returnType, blankPreference }

        // Validate field type (use existing if not updating type)
        const currentType = updateData.type ?? existingField.type;
        if (currentType !== 'formula') {
          throw new Error('Formula configuration can only be set on formula-type fields');
        }

        if (existingField.formula) {
          // Update existing FormulaField
          updateData.formula = {
            update: {
              expression: formulaPayload.expression,
              returnType: formulaPayload.returnType,
              blankPreference: formulaPayload.blankPreference,
              // Preserve or update other fields if provided
              autoRefresh: formulaPayload.autoRefresh ?? existingField.formula.autoRefresh,
              showTooltip: formulaPayload.showTooltip ?? existingField.formula.showTooltip,
            },
          };
        } else {
          // Create new FormulaField
          updateData.formula = {
            create: {
              expression: formulaPayload.expression,
              returnType: formulaPayload.returnType,
              blankPreference: formulaPayload.blankPreference,
              // Other fields use schema defaults
            },
          };
        }
      }

      // Perform the update with includes to fetch relations
      const field = await prisma.formField.update({
        where: { id },
        data: updateData,
        include: {
          formula: true,  // Include updated/created formula
        },
      });

      // Update lookup relations if needed
      if (data.lookup?.sourceId) {
        try {
          await this.handleLookupRelations(id, data);
        } catch (error: any) {
          console.error(
            "[DatabaseService] Error updating lookup relations:",
            error.message
          );
        }
      }

      const formId = await resolveFormIdFromField(id);
      if (formId) await invalidateFormCache(formId);

      return DatabaseTransforms.transformField(field);
    } catch (error: any) {
      console.error("Database error updating field:", error);
      throw new Error(`Failed to update field: ${error?.message}`);
    }
  }

  static async deleteField(id: string): Promise<void> {
    try {
      // Resolve formId BEFORE delete — afterwards the field row is gone.
      const formId = await resolveFormIdFromField(id);
      await prisma.formField.delete({
        where: { id },
      });
      if (formId) await invalidateFormCache(formId);
    } catch (error: any) {
      console.error("Database error deleting field:", error);
      throw new Error(`Failed to delete field: ${error?.message}`);
    }
  }

  // Field types
  static async getFieldTypes(): Promise<FieldType[]> {
    try {
      const fieldTypes = await prisma.fieldType.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      });

      return fieldTypes.map((ft) => ({
        ...ft,
        description: ft.description || "",
        defaultProps: (ft.defaultProps || {}) as Record<string, any>,
      }));
    } catch (error: any) {
      console.error("Database error fetching field types:", error);
      throw new Error(`Failed to fetch field types: ${error?.message}`);
    }
  }

  static async upsertFieldType(data: {
    name: string;
    label: string;
    category: string;
    icon: string;
    description: string;
    defaultProps: Record<string, any>;
    active: boolean;
  }): Promise<FieldType> {
    try {
      const fieldType = await prisma.fieldType.upsert({
        where: { name: data.name },
        update: data,
        create: data,
      });

      return {
        ...fieldType,
        description: fieldType.description || "",
        defaultProps: (fieldType.defaultProps || {}) as Record<string, any>,
      };
    } catch (error: any) {
      console.error("Database error upserting field type:", error);
      throw new Error(`Failed to upsert field type: ${error?.message}`);
    }
  }

  static async seedFieldTypes(): Promise<void> {
    try {
      const defaultFieldTypes = [
        {
          name: "text",
          label: "Text Input",
          category: "basic",
          icon: "Type",
          description: "Single line text input",
          defaultProps: {
            type: "text",
            label: "Text Field",
            validation: {},
            width: "full",
            visible: true,
            readonly: false,
          },
          active: true,
        },
        {
          name: "textarea",
          label: "Text Area",
          category: "basic",
          icon: "AlignLeft",
          description: "Multi-line text input",
          defaultProps: {
            type: "textarea",
            label: "Text Area",
            validation: {},
            width: "full",
            visible: true,
            readonly: false,
            rows: 3,
          },
          active: true,
        },
        {
          name: "number",
          label: "Number",
          category: "basic",
          icon: "Hash",
          description: "Numeric input field",
          defaultProps: {
            type: "number",
            label: "Number Field",
            validation: {},
            width: "full",
            visible: true,
            readonly: false,
          },
          active: true,
        },
        {
          name: "email",
          label: "Email",
          category: "basic",
          icon: "Mail",
          description: "Email address input",
          defaultProps: {
            type: "email",
            label: "Email Field",
            validation: { email: true },
            width: "full",
            visible: true,
            readonly: false,
          },
          active: true,
        },
        {
          name: "date",
          label: "Date",
          category: "basic",
          icon: "Calendar",
          description: "Date picker field",
          defaultProps: {
            type: "date",
            label: "Date Field",
            validation: {},
            width: "full",
            visible: true,
            readonly: false,
          },
          active: true,
        },
        {
          name: "checkbox",
          label: "Checkbox",
          category: "choice",
          icon: "CheckSquare",
          description: "Single checkbox",
          defaultProps: {
            type: "checkbox",
            label: "Checkbox",
            validation: {},
            width: "full",
            visible: true,
            readonly: false,
          },
          active: true,
        },
        {
          name: "radio",
          label: "Radio Buttons",
          category: "choice",
          icon: "Radio",
          description: "Multiple choice (single select)",
          defaultProps: {
            type: "radio",
            label: "Radio Group",
            validation: {},
            width: "full",
            visible: true,
            readonly: false,
            options: [
              { id: "opt1", label: "Option 1", value: "option1" },
              { id: "opt2", label: "Option 2", value: "option2" },
            ],
          },
          active: true,
        },
        {
          name: "select",
          label: "Dropdown",
          category: "choice",
          icon: "ChevronDown",
          description: "Dropdown select list",
          defaultProps: {
            type: "select",
            label: "Dropdown",
            validation: {},
            width: "full",
            visible: true,
            readonly: false,
            options: [
              { id: "opt1", label: "Option 1", value: "option1" },
              { id: "opt2", label: "Option 2", value: "option2" },
            ],
          },
          active: true,
        },
        {
          name: "file",
          label: "File Upload",
          category: "advanced",
          icon: "Upload",
          description: "Upload files",
          defaultProps: {
            type: "file",
            label: "File Upload",
            validation: {},
            width: "full",
            visible: true,
            readonly: false,
            multiple: false,
          },
          active: true,
        },
        {
          name: "lookup",
          label: "Lookup",
          category: "advanced",
          icon: "Search",
          description: "Reference data from other sources",
          defaultProps: {
            type: "lookup",
            label: "Lookup Field",
            validation: {},
            width: "full",
            visible: true,
            readonly: false,
          },
          active: true,
        },
      ];

      for (const fieldType of defaultFieldTypes) {
        await this.upsertFieldType(fieldType);
      }
    } catch (error: any) {
      console.error("Database error seeding field types:", error);
      throw new Error(`Failed to seed field types: ${error?.message}`);
    }
  }

  // Helper methods needed by DatabaseRecords
  static async getFormRecords(formId: string): Promise<any[]> {
    // This is a placeholder - the actual implementation will be in DatabaseRecords
    // but we need this method here for the cleanup functionality
    return [];
  }

  static async updateFormRecord(recordId: string, data: any): Promise<any> {
    // This is a placeholder - the actual implementation will be in DatabaseRecords
    // but we need this method here for the cleanup functionality
    return null;
  }
}