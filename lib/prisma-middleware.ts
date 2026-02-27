import type { PrismaClient as PrismaClientType } from "@prisma/client"
import { prisma } from "./prisma"

const prismaClient = prisma

export function setupPrismaMiddleware() {
  prismaClient.$use(async (params, next) => {
    const before = Date.now()

    try {
      const result = await next(params)
      const after = Date.now()

      console.log(`Query ${params.model}.${params.action} took ${after - before}ms`)

      if (params.model === "FormField" && (params.action === "create" || params.action === "update")) {
        const field = params.args.data

        console.log("[Middleware] FormField operation started", {
          action: params.action,
          fieldId: field.id,
          type: field.type,
          sectionId: field.sectionId,
          subformId: field.subformId,
          sourceModule: field.sourceModule,
          sourceForm: field.sourceForm,
          lookup: field.lookup,
        })

        if (field.type !== "lookup") {
          console.log("[Middleware] Not a lookup field, skipping", { fieldId: field.id, type: field.type })
          return result
        }

        // For create operations, we need to let the field be created first
        if (params.action === "create") {
          console.log("[Middleware] Creating field first, will handle relations after")

          // Now handle the lookup relations with the created field
          if (result && result.id) {
            try {
              await handleLookupRelations(prismaClient, result, field)
            } catch (error: any) {
              console.error("[Middleware] Error handling lookup relations after create:", error.message)
            }
          }

          return result
        }

        // For update operations, handle relations before the update
        if (params.action === "update") {
          const fieldId = params.args.where?.id

          if (fieldId) {
            try {
              await handleLookupRelations(prismaClient, { id: fieldId }, field)
            } catch (error: any) {
              console.error("[Middleware] Error handling lookup relations before update:", error.message)
            }
          }
        }
      }

      return result
    } catch (error) {
      console.error(`Error in ${params.model}.${params.action}:`, error)
      throw error
    }
  })

  console.log("Prisma middleware setup complete")
}

async function handleLookupRelations(prismaClient: PrismaClientType, fieldResult: any, fieldData: any) {
  const fieldId = fieldResult.id

  console.log("[Middleware] Handling lookup relations for field:", fieldId)

  if (!fieldData.sourceModule && !fieldData.sourceForm && !fieldData.lookup?.sourceId) {
    console.error("[Middleware] Lookup field missing source information", { fieldId })
    return
  }

  // Derive lookupSourceId
  let lookupSourceId = fieldData.lookup?.sourceId

  if (!lookupSourceId) {
    lookupSourceId = fieldData.sourceModule
      ? `module_${fieldData.sourceModule}`
      : fieldData.sourceForm
        ? `form_${fieldData.sourceForm}`
        : null
  }

  if (!lookupSourceId) {
    console.error("[Middleware] Failed to derive lookupSourceId", {
      fieldId,
      sourceModule: fieldData.sourceModule,
      sourceForm: fieldData.sourceForm,
      lookup: fieldData.lookup,
    })
    return
  }

  console.log("[Middleware] Derived lookupSourceId", { lookupSourceId })

  // Derive formId and moduleId from the field's section or subform
  let formId: string | null = null
  let moduleId: string | null = null

  try {
    if (fieldData.sectionId) {
      console.log("[Middleware] Querying FormSection", { sectionId: fieldData.sectionId })
      const section = await prismaClient.formSection.findUnique({
        where: { id: fieldData.sectionId },
        select: { formId: true, form: { select: { moduleId: true } } },
      })

      if (!section) {
        console.error("[Middleware] FormSection not found", { sectionId: fieldData.sectionId })
        return
      }

      formId = section.formId
      moduleId = section.form.moduleId

      console.log("[Middleware] Derived from FormSection", { formId, moduleId })
    } else if (fieldData.subformId) {
      console.log("[Middleware] Querying Subform", { subformId: fieldData.subformId })
      const subform = await prismaClient.subform.findUnique({
        where: { id: fieldData.subformId },
        select: { section: { select: { formId: true, form: { select: { moduleId: true } } } } },
      })

      if (!subform || !subform.section) {
        console.error("[Middleware] Subform or its section not found", { subformId: fieldData.subformId })
        return
      }

      formId = subform.section.formId
      moduleId = subform.section.form.moduleId

      console.log("[Middleware] Derived from Subform", { formId, moduleId })
    } else {
      // Try to get the existing field to find the section
      console.log("[Middleware] Trying to find existing field", { fieldId })
      const existingField = await prismaClient.formField.findUnique({
        where: { id: fieldId },
        select: {
          sectionId: true,
          subformId: true,
          section: {
            select: {
              formId: true,
              form: { select: { moduleId: true } },
            },
          },
          subform: {
            select: {
              section: {
                select: {
                  formId: true,
                  form: { select: { moduleId: true } },
                },
              },
            },
          },
        },
      })

      if (existingField?.sectionId && existingField.section) {
        formId = existingField.section.formId
        moduleId = existingField.section.form.moduleId
        console.log("[Middleware] Derived from existing field section", { formId, moduleId })
      } else if (existingField?.subformId && existingField.subform?.section) {
        formId = existingField.subform.section.formId
        moduleId = existingField.subform.section.form.moduleId
        console.log("[Middleware] Derived from existing field subform", { formId, moduleId })
      } else {
        console.error("[Middleware] Could not find section or subform for existing field", {
          fieldId,
          existingField: existingField
            ? {
                sectionId: existingField.sectionId,
                subformId: existingField.subformId,
                hasSection: !!existingField.section,
                hasSubform: !!existingField.subform,
              }
            : null,
        })
        return
      }
    }

    if (!formId || !moduleId) {
      console.error("[Middleware] Failed to derive formId or moduleId", {
        fieldId,
        sectionId: fieldData.sectionId,
        subformId: fieldData.subformId,
        formId,
        moduleId,
      })
      return
    }

    // Ensure LookupSource exists
    let lookupSource = await prismaClient.lookupSource.findUnique({
      where: { id: lookupSourceId },
    })

    if (!lookupSource) {
      console.log("[Middleware] Creating new LookupSource", { lookupSourceId })
      try {
        if (fieldData.sourceModule || lookupSourceId.startsWith("module_")) {
          const sourceModuleId = fieldData.sourceModule || lookupSourceId.replace("module_", "")
          console.log("[Middleware] Looking for source module:", sourceModuleId)

          const module = await prismaClient.formModule.findUnique({
            where: { id: sourceModuleId },
          })

          if (!module) {
            console.error("[Middleware] Source module not found", { sourceModule: sourceModuleId })
            return
          }

          lookupSource = await prismaClient.lookupSource.upsert({
            where: { id: lookupSourceId },
            update: {
              name: module.name,
              type: "module",
              description: module.description || `Module with forms`,
              active: true,
              updatedAt: new Date(),
            },
            create: {
              id: lookupSourceId,
              name: module.name,
              type: "module",
              sourceModuleId: module.id,
              description: module.description || `Module with forms`,
              active: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          })

          console.log("[Middleware] Created LookupSource for module", { lookupSourceId, moduleId: module.id })
        } else if (fieldData.sourceForm || lookupSourceId.startsWith("form_")) {
          const sourceFormId = fieldData.sourceForm || lookupSourceId.replace("form_", "")
          console.log("[Middleware] Looking for source form:", sourceFormId)

          const sourceForm = await prismaClient.form.findUnique({
            where: { id: sourceFormId },
          })

          if (!sourceForm) {
            console.error("[Middleware] Source form not found", { sourceForm: sourceFormId })
            return
          }

          lookupSource = await prismaClient.lookupSource.upsert({
            where: { id: lookupSourceId },
            update: {
              name: sourceForm.name,
              type: "form",
              description: sourceForm.description || `Form source`,
              active: true,
              updatedAt: new Date(),
            },
            create: {
              id: lookupSourceId,
              name: sourceForm.name,
              type: "form",
              sourceFormId: sourceForm.id,
              description: sourceForm.description || `Form source`,
              active: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          })

          console.log("[Middleware] Created LookupSource for form", { lookupSourceId, formId: sourceForm.id })
        }
      } catch (error: any) {
        console.error("[Middleware] Error creating LookupSource", {
          lookupSourceId,
          error: error.message,
          stack: error.stack,
        })
        return
      }
    }

    if (!lookupSource) {
      console.error("[Middleware] LookupSource creation failed", { lookupSourceId })
      return
    }

    // Create or update LookupFieldRelation
    const relationId = `lfr_${lookupSourceId}_${fieldId}`

    console.log("[Middleware] Creating/updating LookupFieldRelation", {
      relationId,
      lookupSourceId,
      formFieldId: fieldId,
      formId,
      moduleId,
      displayField: fieldData.displayField,
      valueField: fieldData.valueField,
      multiple: fieldData.multiple,
      searchable: fieldData.searchable,
    })

    try {
      await prismaClient.lookupFieldRelation.upsert({
        where: { id: relationId },
        update: {
          lookupSourceId,
          formFieldId: fieldId,
          formId,
          moduleId,
          displayField: fieldData.displayField,
          valueField: fieldData.valueField,
          multiple: fieldData.multiple,
          searchable: fieldData.searchable,
          filters: fieldData.filters || {},
          updatedAt: new Date(),
        },
        create: {
          id: relationId,
          lookupSourceId,
          formFieldId: fieldId,
          formId,
          moduleId,
          displayField: fieldData.displayField,
          valueField: fieldData.valueField,
          multiple: fieldData.multiple,
          searchable: fieldData.searchable,
          filters: fieldData.filters || {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })

      console.log("[Middleware] Successfully created/updated LookupFieldRelation", { relationId })
    } catch (error: any) {
      console.error("[Middleware] Error creating LookupFieldRelation", {
        relationId,
        error: error.message,
        stack: error.stack,
      })
    }
  } catch (error: any) {
    console.error("[Middleware] Unexpected error in handleLookupRelations", {
      fieldId,
      error: error.message,
      stack: error.stack,
    })
  }
}
