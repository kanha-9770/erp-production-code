import { prisma } from "@/lib/prisma"
import type {
  FormModule,
  Form,
  FormSection,
  FormField,
  Subform,
} from "@/types/form-builder";

export class DatabaseTransforms {
  // Transform database module to application format
  static transformModule(module: any, level?: number): FormModule {
    return {
      id: module.id,
      name: module.name,
      description: module.description,
      icon: module.icon,
      color: module.color,
      settings: (module.settings || {}) as Record<string, any>,
      parentId: module.parentId,
      moduleType: module.moduleType,
      level: level ?? module.level,
      path: module.path,
      isActive: module.isActive,
      sortOrder: module.sortOrder,
      createdAt: module.createdAt,
      updatedAt: module.updatedAt,
      forms: module.forms
        ? module.forms.map((form: any) => this.transformForm(form))
        : [],
      children: module.children || [],
    };
  }

  // Transform module hierarchy recursively
  static transformModuleHierarchy(module: any, level: number): FormModule {
    const transformed = this.transformModule(module, level);

    if (module.children && module.children.length > 0) {
      transformed.children = module.children.map((child: any) =>
        this.transformModuleHierarchy(child, level + 1)
      );
    }

    return transformed;
  }

  // Flatten module hierarchy to a simple list
  static flattenModuleHierarchy(modules: FormModule[]): FormModule[] {
    const flattened: FormModule[] = [];

    function flatten(moduleList: FormModule[]) {
      for (const module of moduleList) {
        flattened.push(module);
        if (module.children && module.children.length > 0) {
          flatten(module.children);
        }
      }
    }

    flatten(modules);
    return flattened;
  }

  // Transform database form to application format
  static transformForm(form: any): Form {
    // Calculate total records count across all record tables
    let totalRecords = 0;
    if (form._count) {
      totalRecords =
        (form._count.records1 || 0) +
        (form._count.records2 || 0) +
        (form._count.records3 || 0) +
        (form._count.records4 || 0) +
        (form._count.records5 || 0) +
        (form._count.records6 || 0) +
        (form._count.records7 || 0) +
        (form._count.records8 || 0) +
        (form._count.records9 || 0) +
        (form._count.records10 || 0) +
        (form._count.records11 || 0) +
        (form._count.records12 || 0) +
        (form._count.records13 || 0) +
        (form._count.records14 || 0) +
        (form._count.records15 || 0);
    }

    return {
      id: form.id,
      moduleId: form.moduleId,
      name: form.name,
      description: form.description,
      settings: (form.settings || {}) as Record<string, any>,
      isPublished: form.isPublished,
      publishedAt: form.publishedAt,
      formUrl: form.formUrl,
      allowAnonymous: form.allowAnonymous,
      requireLogin: form.requireLogin,
      maxSubmissions: form.maxSubmissions,
      submissionMessage: form.submissionMessage,
      conditional: form.conditional as Record<string, any> | null,
      styling: form.styling as Record<string, any> | null,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
      sections: form.sections
        ? form.sections.map((section: any) => this.transformSection(section))
        : [],
      tableMapping: form.tableMapping,
      totalRecords,
      isUserForm: form.isUserForm || false,
      isEmployeeForm: form.isEmployeeForm || false,
    };
  }

  // Enhanced transform section to handle complete subform hierarchy
  static transformSection(section: any): FormSection {
    return {
      id: section.id,
      formId: section.formId,
      title: section.title,
      description: section.description,
      order: section.order,
      columns: section.columns,
      visible: section.visible,
      collapsible: section.collapsible,
      collapsed: section.collapsed,
      conditional: section.conditional as Record<string, any> | null,
      styling: section.styling as Record<string, any> | null,
      createdAt: section.createdAt,
      updatedAt: section.updatedAt,
      fields: section.fields
        ? section.fields.map((field: any) => this.transformField(field))
        : [],
      subforms: section.subforms
        ? section.subforms.map((subform: any) => this.transformSubform(subform))
        : [],
    };
  }

  // Enhanced transform subform with complete hierarchy support
  static transformSubform(subform: any): Subform {
    return {
      id: subform.id,
      sectionId: subform.sectionId,
      parentSubformId: subform.parentSubformId,
      name: subform.name,
      description: subform.description,
      order: subform.order,
      level: subform.level,
      path: subform.path,
      columns: subform.columns,
      visible: subform.visible,
      collapsible: subform.collapsible,
      collapsed: subform.collapsed,
      styling: subform.styling as Record<string, any> | null,
      conditional: subform.conditional as Record<string, any> | null,
      createdAt: subform.createdAt,
      updatedAt: subform.updatedAt,
      fields: subform.fields
        ? subform.fields.map((field: any) => this.transformField(field))
        : [],
      records: subform.records || [],
      // Include parent information for context
      parentSubform: subform.parentSubform ? {
        id: subform.parentSubform.id,
        name: subform.parentSubform.name,
        level: subform.parentSubform.level,
        path: subform.parentSubform.path,
      } : null,
      // Recursively transform child subforms
      childSubforms: subform.childSubforms
        ? subform.childSubforms.map((child: any) => this.transformSubform(child))
        : [],
    };
  }

  static transformField(field: any): FormField {
    return {
      id: field.id,
      sectionId: field.sectionId,
      subformId: field.subformId,
      type: field.type,
      label: field.label,
      placeholder: field.placeholder,
      description: field.description,
      defaultValue: field.defaultValue,
      options: Array.isArray(field.options) ? field.options : [],
      validation: (field.validation || {}) as Record<string, any>,
      visible: field.visible,
      readonly: field.readonly,
      width: field.width,
      order: field.order,
      conditional: field.conditional as Record<string, any> | null,
      styling: field.styling as Record<string, any> | null,
      properties: field.properties as Record<string, any> | null,
      formula: field.formula,  // Now includes the full FormulaField object (with expression, etc.)
      rollup: field.rollup as Record<string, any> | null,
      lookup: field.lookup as Record<string, any> | null,
      decimalPlaces: field.decimalPlaces,  // NEW: Added for schema update
      createdAt: field.createdAt,
      updatedAt: field.updatedAt,
    };
  }

  // Transform database record to frontend format
  static transformRecord(rawRecord: any): any {
    return {
      id: rawRecord.id,
      formId: rawRecord.formId,
      recordData: rawRecord.recordData || {},
      employee_id: rawRecord.employee_id,
      amount: rawRecord.amount ? parseFloat(rawRecord.amount.toString()) : null,
      date: rawRecord.date,
      submittedBy: rawRecord.submittedBy,
      submittedAt: rawRecord.submittedAt,
      ipAddress: rawRecord.ipAddress,
      userAgent: rawRecord.userAgent,
      status: rawRecord.status || "submitted",
      createdAt: rawRecord.createdAt,
      updatedAt: rawRecord.updatedAt
    }
  }

  // Calculate record count from _count or records array
  static calculateRecordCount(entity: any): number {
    if (entity._count) {
      // Sum all record counts from different tables
      return Object.keys(entity._count)
        .filter(key => key.startsWith('records'))
        .reduce((sum, key) => sum + (entity._count[key] || 0), 0)
    }

    if (entity.records && Array.isArray(entity.records)) {
      return entity.records.length
    }

    return 0
  }

  // Transform multiple records
  static transformRecords(rawRecords: any[]): any[] {
    return rawRecords.map(record => this.transformRecord(record))
  }

  // Get the appropriate table name for form records
  static async getFormRecordTable(formId: string): Promise<string> {
    try {
      // Check if form has a specific table mapping
      const tableMapping = await prisma.formTableMapping.findUnique({
        where: { formId }
      })

      if (tableMapping) {
        console.log(`Form ${formId} mapped to table: ${tableMapping.storageTable}`)
        return tableMapping.storageTable
      }

      // Check if this is a user form or employee form
      const form = await prisma.form.findUnique({
        where: { id: formId },
        select: { isUserForm: true, isEmployeeForm: true }
      })

      if (form?.isUserForm) {
        // User forms go to form_records_15
        const tableName = "form_records_15"
        await this.createTableMapping(formId, tableName)
        return tableName
      }

      if (form?.isEmployeeForm) {
        // Employee forms go to form_records_14
        const tableName = "form_records_14"
        await this.createTableMapping(formId, tableName)
        return tableName
      }

      // For regular forms, find the least used table (1-13)
      const tableCounts = await Promise.all([
        prisma.formRecord1.count(),
        prisma.formRecord2.count(),
        prisma.formRecord3.count(),
        prisma.formRecord4.count(),
        prisma.formRecord5.count(),
        prisma.formRecord6.count(),
        prisma.formRecord7.count(),
        prisma.formRecord8.count(),
        prisma.formRecord9.count(),
        prisma.formRecord10.count(),
        prisma.formRecord11.count(),
        prisma.formRecord12.count(),
        prisma.formRecord13.count(),
      ])

      // Find the table with the least records
      const minCount = Math.min(...tableCounts)
      const tableIndex = tableCounts.indexOf(minCount) + 1
      const tableName = `form_records_${tableIndex}`

      // Create mapping
      await this.createTableMapping(formId, tableName)

      console.log(`Assigned form ${formId} to table: ${tableName}`)
      return tableName
    } catch (error: any) {
      console.error("Error determining form record table:", error)
      // Default fallback
      return "form_records_1"
    }
  }

  // Create table mapping
  private static async createTableMapping(formId: string, tableName: string): Promise<void> {
    try {
      await prisma.formTableMapping.upsert({
        where: { formId },
        update: { storageTable: tableName },
        create: { formId, storageTable: tableName }
      })
    } catch (error: any) {
      console.error("Error creating table mapping:", error)
    }
  }
}