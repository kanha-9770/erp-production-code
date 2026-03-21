import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { v4 as uuidv4 } from "uuid"
import bcrypt from "bcrypt"
import type { FormRecord, FormEvent } from "@/types/form-builder"
import { DatabaseTransforms } from "./DatabaseTransforms"

export class DatabaseRecords {
  // User authentication methods for form_records_15
  static async getUserRecords(email: string): Promise<FormRecord[]> {
    try {
      console.log("[DatabaseService] Getting user records from form_records_15");
      console.log("[DatabaseService] Searching for email:", email);

      // Query form_records_15 for records where record_data.email matches
      const records = await prisma.formRecord15.findMany({
        where: {
          recordData: {
            path: ['email'],
            equals: email,
          },
        },
        orderBy: { createdAt: "desc" },
      });

      console.log(`[DatabaseService] Found ${records.length} matching user records`);

      // Transform records
      return records.map((record) => DatabaseTransforms.transformRecord(record));
    } catch (error: any) {
      console.error("Database error fetching user records:", error);
      throw new Error(`Failed to fetch user records: ${error?.message}`);
    }
  }

  static async updateUserLastLogin(recordId: string): Promise<void> {
    try {
      console.log("[DatabaseService] Updating last login for user:", recordId);

      const existingRecord = await prisma.formRecord15.findUnique({
        where: { id: recordId }
      });

      if (!existingRecord) {
        throw new Error(`User record not found: ${recordId}`);
      }

      const updatedRecordData = {
        ...(existingRecord.recordData as any),
        lastLogin: new Date().toISOString(),
        lastLoginDate: new Date().toISOString()
      };

      await prisma.formRecord15.update({
        where: { id: recordId },
        data: {
          recordData: updatedRecordData,
          updatedAt: new Date()
        }
      });

      console.log("[DatabaseService] Successfully updated last login");
    } catch (error: any) {
      console.error("Database error updating last login:", error);
      throw new Error(`Failed to update last login: ${error?.message}`);
    }
  }

  static async createUser(userData: {
    email: string
    password: string
    name: string
    role?: string
    department?: string
    phone?: string
    status?: string
  }): Promise<FormRecord> {
    try {
      console.log("[DatabaseService] Creating new user record")

      // Hash password before storing
      const hashedPassword = await bcrypt.hash(userData.password, 12)

      const recordData = {
        email: userData.email,
        password: hashedPassword,
        name: userData.name,
        fullName: userData.name,
        role: userData.role || 'user',
        department: userData.department || '',
        phone: userData.phone || '',
        status: userData.status || 'active',
        createdDate: new Date().toISOString(),
        lastLogin: null
      }

      // Create user record in form_records_15
      const record = await prisma.formRecord15.create({
        data: {
          id: uuidv4(),
          formId: 'user-management-form', // You might want to create a specific user management form
          recordData,
          submittedBy: 'system',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      })

      console.log("[DatabaseService] User record created successfully:", record.id)
      return DatabaseTransforms.transformRecord(record)
    } catch (error: any) {
      console.error("Database error creating user:", error)
      throw new Error(`Failed to create user: ${error?.message}`)
    }
  }

  static async getUserById(userId: string): Promise<FormRecord | null> {
    try {
      const record = await prisma.formRecord15.findUnique({
        where: { id: userId }
      });

      if (!record) return null;
      return DatabaseTransforms.transformRecord(record);
    } catch (error: any) {
      console.error("Database error fetching user by ID:", error);
      throw new Error(`Failed to fetch user: ${error?.message}`);
    }
  }

 static async updateUserProfile(userId: string, updateData: {
    name?: string
    department?: string
    phone?: string
    role?: string
    status?: string
  }): Promise<FormRecord> {
    try {
      const existingRecord = await prisma.formRecord15.findUnique({
        where: { id: userId }
      });

      if (!existingRecord) {
        throw new Error(`User record not found: ${userId}`);
      }

      const updatedRecordData = {
        ...(existingRecord.recordData as any),
        ...updateData,
        updatedDate: new Date().toISOString()
      };

      const updatedRecord = await prisma.formRecord15.update({
        where: { id: userId },
        data: {
          recordData: updatedRecordData,
          updatedAt: new Date()
        }
      });

      return DatabaseTransforms.transformRecord(updatedRecord);
    } catch (error: any) {
      console.error("Database error updating user profile:", error);
      throw new Error(`Failed to update user profile: ${error?.message}`);
    }
  }


  static async createFormRecord(
    formId: string, recordData: any, submittedBy?: string, employeeId?: string, amount?: number, date?: Date, userId?: string,
  ): Promise<FormRecord> {
    try {
      console.log("DatabaseService.createFormRecord called with:", {
        formId,
        recordData,
        submittedBy,
        employeeId,
        amount,
        date,
        userId,
      })

      // Validate inputs
      if (!formId) {
        throw new Error("Form ID is required")
      }

      if (!recordData || typeof recordData !== "object") {
        throw new Error("Record data must be a valid object")
      }

      // Get the appropriate table for this form (now considers isUserForm)
      const tableName = await DatabaseTransforms.getFormRecordTable(formId)
      console.log(`Using table ${tableName} for form ${formId}`)

      // Base record data
      const recordParams = {
        id: uuidv4(),
        formId,
        recordData,
        submittedBy: submittedBy || "anonymous",
        employee_id: employeeId,
        amount: amount ? new Prisma.Decimal(amount) : null,
        date: date || null,
        submittedAt: new Date(),
        status: "submitted",
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Create record in the appropriate table
      let record

      switch (tableName) {
        case "form_records_1":
          record = await prisma.formRecord1.create({ data: recordParams })
          break
        case "form_records_2":
          record = await prisma.formRecord2.create({ data: recordParams })
          break
        case "form_records_3":
          record = await prisma.formRecord3.create({ data: recordParams })
          break
        case "form_records_4":
          record = await prisma.formRecord4.create({ data: recordParams })
          break
        case "form_records_5":
          record = await prisma.formRecord5.create({ data: recordParams })
          break
        case "form_records_6":
          record = await prisma.formRecord6.create({ data: recordParams })
          break
        case "form_records_7":
          record = await prisma.formRecord7.create({ data: recordParams })
          break
        case "form_records_8":
          record = await prisma.formRecord8.create({ data: recordParams })
          break
        case "form_records_9":
          record = await prisma.formRecord9.create({ data: recordParams })
          break
        case "form_records_10":
          record = await prisma.formRecord10.create({ data: recordParams })
          break
        case "form_records_11":
          record = await prisma.formRecord11.create({ data: recordParams })
          break
        case "form_records_12":
          record = await prisma.formRecord12.create({ data: recordParams })
          break
        case "form_records_13":
          record = await prisma.formRecord13.create({ data: recordParams })
          break
        case "form_records_14":
          record = await prisma.formRecord14.create({ data: recordParams })
          break
        case "form_records_15":
          record = await prisma.formRecord15.create({ data: recordParams })
          break
        default:
          throw new Error(`Invalid table name: ${tableName}`)
      }

      console.log("Record created successfully:", record.id)
      return DatabaseTransforms.transformRecord(record)
    } catch (error: any) {
      console.error("Error in DatabaseService.createFormRecord:", error)
      throw new Error(`Failed to create form record: ${error.message}`)
    }
  }

  static async getFormRecords(
    formId: string,
    options?: {
      page?: number
      limit?: number
      status?: string
      search?: string
      sortBy?: string
      sortOrder?: "asc" | "desc"
      employeeId?: string
      dateFrom?: Date
      dateTo?: Date
      userId?: string
    },
  ): Promise<FormRecord[]> {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        search,
        sortBy = "submittedAt",
        sortOrder = "desc",
        employeeId,
        dateFrom,
        dateTo,
        userId,
      } = options || {}

      console.log(`[DatabaseService] Getting form records for form: ${formId}`)

      // First, get the form structure with all fields
      const form = await prisma.form.findUnique({
        where: { id: formId },
        include: {
          module: {
            select: { id: true, name: true },
          },
          sections: {
            include: {
              fields: {
                orderBy: { order: "asc" },
              },
            },
            orderBy: { order: "asc" },
          },
        },
      })

      if (!form) {
        throw new Error(`Form not found: ${formId}`)
      }

      const tableName = await DatabaseTransforms.getFormRecordTable(formId)
      const skip = (page - 1) * limit

      // Build where clause
      const where: any = { formId }

      if (status && status !== "all") {
        where.status = status
      }

      if (employeeId) {
        where.employee_id = employeeId
      }

      if (userId) {
        where.userId = userId
      }

      if (dateFrom || dateTo) {
        where.date = {}
        if (dateFrom) where.date.gte = dateFrom
        if (dateTo) where.date.lte = dateTo
      }

      // Build orderBy
      const orderBy: any = {}
      orderBy[sortBy] = sortOrder

      // Execute query based on table name
      let records: any[] = []

      const queryParams = {
        where,
        orderBy,
        skip,
        take: limit,
      }

      console.log(`[DatabaseService] Querying table: ${tableName}`)

      switch (tableName) {
        case "form_records_1":
          records = await prisma.formRecord1.findMany(queryParams)
          break
        case "form_records_2":
          records = await prisma.formRecord2.findMany(queryParams)
          break
        case "form_records_3":
          records = await prisma.formRecord3.findMany(queryParams)
          break
        case "form_records_4":
          records = await prisma.formRecord4.findMany(queryParams)
          break
        case "form_records_5":
          records = await prisma.formRecord5.findMany(queryParams)
          break
        case "form_records_6":
          records = await prisma.formRecord6.findMany(queryParams)
          break
        case "form_records_7":
          records = await prisma.formRecord7.findMany(queryParams)
          break
        case "form_records_8":
          records = await prisma.formRecord8.findMany(queryParams)
          break
        case "form_records_9":
          records = await prisma.formRecord9.findMany(queryParams)
          break
        case "form_records_10":
          records = await prisma.formRecord10.findMany(queryParams)
          break
        case "form_records_11":
          records = await prisma.formRecord11.findMany(queryParams)
          break
        case "form_records_12":
          records = await prisma.formRecord12.findMany(queryParams)
          break
        case "form_records_13":
          records = await prisma.formRecord13.findMany(queryParams)
          break
        case "form_records_14":
          records = await prisma.formRecord14.findMany(queryParams)
          break
        case "form_records_15":
          records = await prisma.formRecord15.findMany(queryParams)
          break
        default:
          throw new Error(`Invalid table name: ${tableName}`)
      }

      console.log(`[DatabaseService] Found ${records.length} records in ${tableName}`)

      // Handle search if provided (client-side filtering since we can't easily search JSON)
      if (search && search.trim() !== "") {
        const searchLower = search.toLowerCase()
        records = records.filter((record) => {
          // Search in record data
          const recordDataStr = JSON.stringify(record.recordData).toLowerCase()
          if (recordDataStr.includes(searchLower)) return true

          // Search in other fields
          if (record.employee_id?.toLowerCase().includes(searchLower)) return true
          if (record.submittedBy?.toLowerCase().includes(searchLower)) return true
          if (record.status?.toLowerCase().includes(searchLower)) return true

          return false
        })
      }

      // Transform records and include form structure
      const transformedRecords = records.map((record) => {
        const transformedRecord = DatabaseTransforms.transformRecord(record)
        // Include the complete form structure with each record
        transformedRecord.form = DatabaseTransforms.transformForm(form)
        return transformedRecord
      })

      console.log(`[DatabaseService] Returning ${transformedRecords.length} transformed records with form structure`)

      return transformedRecords
    } catch (error: any) {
      console.error("Database error fetching form records:", error)
      throw new Error(`Failed to fetch form records: ${error?.message}`)
    }
  }
  static async getFormSubmissionCount(formId: string, userId: string | undefined): Promise<number> {
    try {
      const tableName = await DatabaseTransforms.getFormRecordTable(formId)

      let count = 0

      switch (tableName) {
        case "form_records_1":
          count = await prisma.formRecord1.count({ where: { formId } })
          break
        case "form_records_2":
          count = await prisma.formRecord2.count({ where: { formId } })
          break
        case "form_records_3":
          count = await prisma.formRecord3.count({ where: { formId } })
          break
        case "form_records_4":
          count = await prisma.formRecord4.count({ where: { formId } })
          break
        case "form_records_5":
          count = await prisma.formRecord5.count({ where: { formId } })
          break
        case "form_records_6":
          count = await prisma.formRecord6.count({ where: { formId } })
          break
        case "form_records_7":
          count = await prisma.formRecord7.count({ where: { formId } })
          break
        case "form_records_8":
          count = await prisma.formRecord8.count({ where: { formId } })
          break
        case "form_records_9":
          count = await prisma.formRecord9.count({ where: { formId } })
          break
        case "form_records_10":
          count = await prisma.formRecord10.count({ where: { formId } })
          break
        case "form_records_11":
          count = await prisma.formRecord11.count({ where: { formId } })
          break
        case "form_records_12":
          count = await prisma.formRecord12.count({ where: { formId } })
          break
        case "form_records_13":
          count = await prisma.formRecord13.count({ where: { formId } })
          break
        case "form_records_14":
          count = await prisma.formRecord14.count({ where: { formId } })
          break
        case "form_records_15":
          count = await prisma.formRecord15.count({ where: { formId } })
          break
        default:
          throw new Error(`Invalid table name: ${tableName}`)
      }

      return count
    } catch (error: any) {
      console.error("Database error getting form submission count:", error)
      throw new Error(`Failed to get form submission count: ${error?.message}`)
    }
  }

  static async getFormRecord(recordId: string): Promise<FormRecord | null> {
    try {
      // Try each table until we find the record
      for (let i = 1; i <= 15; i++) {
        const currentTable = `formRecord${i}`
        try {
          const record = await (prisma as any)[currentTable].findUnique({
            where: { id: recordId },
          })

          if (record) {
            // Get the form structure for this record
            const form = await prisma.form.findUnique({
              where: { id: record.formId },
              include: {
                module: {
                  select: { id: true, name: true },
                },
                sections: {
                  include: {
                    fields: {
                      orderBy: { order: "asc" },
                    },
                  },
                  orderBy: { order: "asc" },
                },
              },
            })

            const transformedRecord = DatabaseTransforms.transformRecord(record)
            if (form) {
              transformedRecord.form = DatabaseTransforms.transformForm(form)
            }

            return transformedRecord
          }
        } catch (error) {
          // Continue to next table
        }
      }

      return null
    } catch (error: any) {
      console.error("Database error fetching form record:", error)
      throw new Error(`Failed to fetch form record: ${error?.message}`)
    }
  }

  static async updateFormRecord(recordId: string, data: Partial<FormRecord>): Promise<FormRecord> {
    try {
      // First, find which table contains this record
      let tableName = ""
      let record = null

      // Try each table until we find the record
      for (let i = 1; i <= 15; i++) {
        const currentTable = `formRecord${i}`
        try {
          record = await (prisma as any)[currentTable].findUnique({
            where: { id: recordId },
            select: { id: true, formId: true },
          })

          if (record) {
            tableName = `form_records_${i}`
            break
          }
        } catch (error) {
          // Continue to next table
        }
      }

      if (!record) {
        throw new Error(`Record not found: ${recordId}`)
      }

      // Update the record in the correct table
      const updateData = {
        recordData: data.recordData,
        employee_id: data.employee_id,
        amount: data.amount ? new Prisma.Decimal(data.amount) : undefined,
        date: data.date,
        submittedBy: data.submittedBy,
        status: data.status,
        updatedAt: new Date(),
      }

      let updatedRecord

      switch (tableName) {
        case "form_records_1":
          updatedRecord = await prisma.formRecord1.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_2":
          updatedRecord = await prisma.formRecord2.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_3":
          updatedRecord = await prisma.formRecord3.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_4":
          updatedRecord = await prisma.formRecord4.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_5":
          updatedRecord = await prisma.formRecord5.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_6":
          updatedRecord = await prisma.formRecord6.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_7":
          updatedRecord = await prisma.formRecord7.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_8":
          updatedRecord = await prisma.formRecord8.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_9":
          updatedRecord = await prisma.formRecord9.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_10":
          updatedRecord = await prisma.formRecord10.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_11":
          updatedRecord = await prisma.formRecord11.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_12":
          updatedRecord = await prisma.formRecord12.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_13":
          updatedRecord = await prisma.formRecord13.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_14":
          updatedRecord = await prisma.formRecord14.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        case "form_records_15":
          updatedRecord = await prisma.formRecord15.update({
            where: { id: recordId },
            data: updateData,
          })
          break
        default:
          throw new Error(`Invalid table name: ${tableName}`)
      }

      // Get the form structure for the updated record
      const form = await prisma.form.findUnique({
        where: { id: updatedRecord.formId },
        include: {
          module: {
            select: { id: true, name: true },
          },
          sections: {
            include: {
              fields: {
                orderBy: { order: "asc" },
              },
            },
            orderBy: { order: "asc" },
          },
        },
      })

      const transformedRecord = DatabaseTransforms.transformRecord(updatedRecord)
      if (form) {
        transformedRecord.form = DatabaseTransforms.transformForm(form)
      }

      return transformedRecord
    } catch (error: any) {
      console.error("Database error updating form record:", error)
      throw new Error(`Failed to update form record: ${error?.message}`)
    }
  }

  static async deleteFormRecord(recordId: string): Promise<void> {
    try {
      // First, find which table contains this record
      let tableName = ""
      let record = null

      // Try each table until we find the record
      for (let i = 1; i <= 15; i++) {
        const currentTable = `formRecord${i}`
        try {
          record = await (prisma as any)[currentTable].findUnique({
            where: { id: recordId },
            select: { id: true },
          })

          if (record) {
            tableName = `form_records_${i}`
            break
          }
        } catch (error) {
          // Continue to next table
        }
      }

      if (!record) {
        throw new Error(`Record not found: ${recordId}`)
      }

      // Delete the record from the correct table
      switch (tableName) {
        case "form_records_1":
          await prisma.formRecord1.delete({ where: { id: recordId } })
          break
        case "form_records_2":
          await prisma.formRecord2.delete({ where: { id: recordId } })
          break
        case "form_records_3":
          await prisma.formRecord3.delete({ where: { id: recordId } })
          break
        case "form_records_4":
          await prisma.formRecord4.delete({ where: { id: recordId } })
          break
        case "form_records_5":
          await prisma.formRecord5.delete({ where: { id: recordId } })
          break
        case "form_records_6":
          await prisma.formRecord6.delete({ where: { id: recordId } })
          break
        case "form_records_7":
          await prisma.formRecord7.delete({ where: { id: recordId } })
          break
        case "form_records_8":
          await prisma.formRecord8.delete({ where: { id: recordId } })
          break
        case "form_records_9":
          await prisma.formRecord9.delete({ where: { id: recordId } })
          break
        case "form_records_10":
          await prisma.formRecord10.delete({ where: { id: recordId } })
          break
        case "form_records_11":
          await prisma.formRecord11.delete({ where: { id: recordId } })
          break
        case "form_records_12":
          await prisma.formRecord12.delete({ where: { id: recordId } })
          break
        case "form_records_13":
          await prisma.formRecord13.delete({ where: { id: recordId } })
          break
        case "form_records_14":
          await prisma.formRecord14.delete({ where: { id: recordId } })
          break
        case "form_records_15":
          await prisma.formRecord15.delete({ where: { id: recordId } })
          break
        default:
          throw new Error(`Invalid table name: ${tableName}`)
      }
    } catch (error: any) {
      console.error("Database error deleting form record:", error)
      throw new Error(`Failed to delete form record: ${error?.message}`)
    }
  }

  // Analytics
  static async trackFormEvent(
    formId: string,
    eventType: string,
    payload?: Record<string, any>,
    sessionId?: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<FormEvent> {
    try {
      const event = await prisma.formEvent.create({
        data: {
          formId: formId,
          eventType: eventType,
          payload: payload || {},
          sessionId: sessionId,
          userAgent: userAgent,
          ipAddress: ipAddress,
        },
      })

      return {
        ...event,
        payload: (event.payload || {}) as Record<string, any>,
        ipAddress: event.ipAddress || undefined,
        userAgent: event.userAgent || undefined,
        sessionId: event.sessionId || undefined,
      }
    } catch (error: any) {
      console.error("Database error tracking form event:", error)
      throw new Error(`Failed to track form event: ${error?.message}`)
    }
  }

  static async getFormAnalytics(formId: string): Promise<{
    totalViews: number
    totalSubmissions: number
    conversionRate: number
    events: FormEvent[]
  }> {
    try {
      const events = await prisma.formEvent.findMany({
        where: { formId },
        orderBy: { createdAt: "desc" },
      })

      const totalViews = events.filter((e) => e.eventType === "view").length
      const totalSubmissions = await this.getFormSubmissionCount(formId)
      const conversionRate = totalViews > 0 ? (totalSubmissions / totalViews) * 100 : 0

      return {
        totalViews,
        totalSubmissions,
        conversionRate,
        events: events.map((e) => ({
          ...e,
          payload: (e.payload || {}) as Record<string, any>,
          ipAddress: e.ipAddress || undefined,
          userAgent: e.userAgent || undefined,
          sessionId: e.sessionId || undefined,
        })),
      }
    } catch (error: any) {
      console.error("Database error fetching form analytics:", error)
      throw new Error(`Failed to fetch form analytics: ${error?.message}`)
    }
  }

  // Enhanced relationship methods for the records page with detailed module/form information
  static async getLookupSources(formId: string): Promise<{
    sources: Array<{
      id: string
      name: string
      type: "form" | "module"
      recordCount: number
      description?: string
      moduleName?: string
      moduleId?: string
      breadcrumb: string
      createdAt: Date
      updatedAt: Date
      isPublished?: boolean
      fieldCount?: number
    }>
  }> {
    try {
      console.log("[DatabaseService] Getting detailed lookup sources for form:", formId)

      // Get all lookup fields in this form
      const form = await prisma.form.findUnique({
        where: { id: formId },
        include: {
          sections: {
            include: {
              fields: {
                where: { type: "lookup" },
              },
            },
          },
        },
      })

      if (!form) {
        return { sources: [] }
      }

      const lookupFields = form.sections.flatMap((section) => section.fields)

      const sources: Array<{
        id: string
        name: string
        type: "form" | "module"
        recordCount: number
        description?: string
        moduleName?: string
        moduleId?: string
        breadcrumb: string
        createdAt: Date
        updatedAt: Date
        isPublished?: boolean
        fieldCount?: number
      }> = []

      for (const field of lookupFields) {
        const lookupConfig = field.lookup as any
        if (!lookupConfig?.sourceId) continue

        if (lookupConfig.sourceId.startsWith("form_")) {
          const sourceFormId = lookupConfig.sourceId.replace("form_", "")
          const sourceForm = await prisma.form.findUnique({
            where: { id: sourceFormId },
            include: {
              module: true,
              tableMapping: true,
              _count: {
                select: {
                  sections: true,
                },
              },
              sections: {
                include: {
                  _count: {
                    select: { fields: true },
                  },
                },
              },
            },
          })

          if (sourceForm) {
            const totalFields = sourceForm.sections.reduce((sum, section) => sum + section._count.fields, 0)
            const recordCount = await this.getFormSubmissionCount(sourceFormId)

            sources.push({
              id: sourceForm.id,
              name: sourceForm.name,
              type: "form",
              recordCount,
              description: sourceForm.description || undefined,
              moduleName: sourceForm.module?.name,
              moduleId: sourceForm.module?.id,
              breadcrumb: `${sourceForm.module?.name} > ${sourceForm.name}`,
              createdAt: sourceForm.createdAt,
              updatedAt: sourceForm.updatedAt,
              isPublished: sourceForm.isPublished,
              fieldCount: totalFields,
            })
          }
        } else if (lookupConfig.sourceId.startsWith("module_")) {
          const sourceModuleId = lookupConfig.sourceId.replace("module_", "")
          const sourceModule = await prisma.formModule.findUnique({
            where: { id: sourceModuleId },
            include: {
              forms: {
                include: {
                  tableMapping: true,
                  _count: {
                    select: {
                      sections: true,
                    },
                  },
                  sections: {
                    include: {
                      _count: {
                        select: { fields: true },
                      },
                    },
                  },
                },
              },
            },
          })

          if (sourceModule) {
            let totalRecords = 0
            for (const form of sourceModule.forms) {
              totalRecords += await this.getFormSubmissionCount(form.id)
            }

            const totalFields = sourceModule.forms.reduce(
              (sum, form) => sum + form.sections.reduce((sectionSum, section) => sectionSum + section._count.fields, 0),
              0,
            )

            sources.push({
              id: sourceModule.id,
              name: sourceModule.name,
              type: "module",
              recordCount: totalRecords,
              description: sourceModule.description || undefined,
              moduleName: sourceModule.name,
              moduleId: sourceModule.id,
              breadcrumb: `${sourceModule.name} (Module)`,
              createdAt: sourceModule.createdAt,
              updatedAt: sourceModule.updatedAt,
              fieldCount: totalFields,
            })
          }
        }
      }

      // Remove duplicates
      const uniqueSources = sources.filter(
        (source, index, self) => index === self.findIndex((s) => s.id === source.id && s.type === source.type),
      )

      console.log("[DatabaseService] Found detailed lookup sources:", uniqueSources.length)
      return { sources: uniqueSources }
    } catch (error: any) {
      console.error("Database error getting lookup sources:", error)
      return { sources: [] }
    }
  }

  static async getLinkedRecords(formId: string): Promise<{
    linkedForms: Array<{
      id: string
      name: string
      recordCount: number
      description?: string
      moduleName?: string
      moduleId?: string
      breadcrumb: string
      createdAt: Date
      updatedAt: Date
      isPublished?: boolean
      fieldCount?: number
      lookupFieldsCount?: number
    }>
  }> {
    try {
      console.log("[DatabaseService] Getting detailed linked records for form:", formId)

      // Find all forms that have lookup fields pointing to this form
      const formsWithLookups = await prisma.form.findMany({
        include: {
          module: true,
          tableMapping: true,
          sections: {
            include: {
              fields: {
                where: { type: "lookup" },
              },
              _count: {
                select: { fields: true },
              },
            },
          },
        },
      })

      const linkedForms: Array<{
        id: string
        name: string
        recordCount: number
        description?: string
        moduleName?: string
        moduleId?: string
        breadcrumb: string
        createdAt: Date
        updatedAt: Date
        isPublished?: boolean
        fieldCount?: number
        lookupFieldsCount?: number
      }> = []

      for (const form of formsWithLookups) {
        if (form.id === formId) continue // Skip self

        const lookupFieldsToThisForm = form.sections.flatMap((section) =>
          section.fields.filter((field) => {
            const lookupConfig = field.lookup as any
            return lookupConfig?.sourceId === `form_${formId}`
          }),
        )

        if (lookupFieldsToThisForm.length > 0) {
          const totalFields = form.sections.reduce((sum, section) => sum + section._count.fields, 0)
          const recordCount = await this.getFormSubmissionCount(form.id)

          linkedForms.push({
            id: form.id,
            name: form.name,
            recordCount,
            description: form.description || undefined,
            moduleName: form.module?.name,
            moduleId: form.module?.id,
            breadcrumb: `${form.module?.name} > ${form.name}`,
            createdAt: form.createdAt,
            updatedAt: form.updatedAt,
            isPublished: form.isPublished,
            fieldCount: totalFields,
            lookupFieldsCount: lookupFieldsToThisForm.length,
          })
        }
      }

      console.log("[DatabaseService] Found detailed linked forms:", linkedForms.length)
      return { linkedForms }
    } catch (error: any) {
      console.error("Database error getting linked records:", error)
      return { linkedForms: [] }
    }
  }
}