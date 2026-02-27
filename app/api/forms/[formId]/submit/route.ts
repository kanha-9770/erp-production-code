// app/api/forms/[formId]/submit/route.ts
export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import crypto from "crypto";
import { validateSession } from "@/lib/auth";

// ──────────────────────────────────────────────
// Type definitions
// ──────────────────────────────────────────────

interface FormField {
  id: string;
  label: string;
  type: string;
  sectionId?: string | null;
  subformId?: string | null;
  placeholder?: string | null;
  description?: string | null;
  validation?: Record<string, any>;
  options?: any[];
  lookup?: any;
  properties?: Record<string, any> | null;
  order: number;
}

interface FormSection {
  id: string;
  title: string;
  description?: string | null;
  order: number;
  fields: FormField[];
}

interface Subform {
  id: string;
  name: string;
  description?: string | null;
  parentSubformId?: string | null;
  formId: string;
  order: number;
  level: number;
  path?: string | null;
  fields: FormField[];
  childSubforms?: Subform[];
}

interface Form {
  id: string;
  moduleId: string;
  name: string;
  description?: string | null;
  isPublished: boolean;
  requireLogin: boolean;
  maxSubmissions?: number | null;
  submissionMessage?: string | null;
  isEmployeeForm?: boolean;
  isUserForm?: boolean;
  sections: FormSection[];
  subforms: Subform[];
  module: {
    organizationId: string | null;
  } | null;
}

interface StructuredFieldData {
  fieldId: string;
  label: string;
  type: string;
  value: any;
  sectionId: string | null;
  sectionTitle: string;
  subformId: string | null;
  subformName: string | null;
  order: number;
  placeholder?: string | null;
  description?: string | null;
  validation?: Record<string, any>;
  options?: any[];
  lookup?: any;
}

interface StructuredSectionData {
  sectionId: string;
  sectionTitle: string;
  sectionDescription: string | null;
  order: number;
  fields: Record<string, StructuredFieldData>;
}

interface StructuredSubformData {
  subformId: string;
  subformName: string;
  subformDescription: string | null;
  parentSubformId: string | null;
  order: number;
  level: number;
  path: string | null;
  fields: Record<string, StructuredFieldData>;
  rows?: StructuredSubformRowData[];
  childSubforms?: Record<string, StructuredSubformData>;
}

interface StructuredSubformRowData {
  rowIndex: number;
  instanceId: string;
  fields: Record<string, StructuredFieldData>;
}

interface StructuredRecordData {
  formId: string;
  formName: string;
  sections: Record<string, StructuredSectionData>;
  subforms: Record<string, StructuredSubformData>;
  metadata: {
    submittedAt: string;
    submittedBy: string;
    totalFields: number;
    totalSections: number;
    totalSubforms: number;
  };
}

// ──────────────────────────────────────────────
// POST handler
// ──────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: { params: { formId: string } }) {
  try {
    const { formId } = params;
    const body = await request.json();

    console.log("[FORM SUBMIT] API called", {
      formId,
      recordDataKeys: Object.keys(body.recordData || {}),
    });

    // ─── 1. Authentication ──────────────────────────────────────
    const token = request.cookies.get("auth-token")?.value;
    let session = null;
    let currentUserId: string | undefined;
    let currentOrgId: string | undefined;
    let submittedByDisplay = "anonymous";

    if (token) {
      session = await validateSession(token);
      if (session?.user) {
        currentUserId = session.user.id;
        currentOrgId = session.user.organization?.id || session.user.organizationId || undefined;
        submittedByDisplay =
          [session.user.first_name, session.user.last_name].filter(Boolean).join(" ") ||
          session.user.email ||
          "user";
        console.log("[FORM SUBMIT] Authenticated user", { userId: currentUserId, orgId: currentOrgId });
      } else {
        console.log("[FORM SUBMIT] Invalid session for token");
      }
    } else {
      console.log("[FORM SUBMIT] No auth token – anonymous submission");
    }

    // ─── 2. Fetch form data ─────────────────────────────────────
    const form = await getFormWithStructure(formId);

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    if (!form.isPublished) {
      return NextResponse.json({ error: "Form is not published" }, { status: 403 });
    }

    if (form.requireLogin && !session) {
      return NextResponse.json(
        { error: "This form requires authentication" },
        { status: 401 }
      );
    }

    // ─── 3. Resolve organizationId ──────────────────────────────
    let organizationId = currentOrgId || form.module?.organizationId;

    // Employee forms strictly require organization
    const tableName = await getFormRecordTable(formId);
    if (tableName === "form_records_14" && !organizationId) {
      return NextResponse.json(
        { error: "Cannot submit employee form: no organization context available" },
        { status: 400 }
      );
    }

    // User forms (table 15) should have userId if possible
    if (tableName === "form_records_15" && !currentUserId) {
      console.warn("[FORM SUBMIT] User form submitted without userId – allowing but may be incorrect");
      // Optional: return error if you want to enforce
      // return NextResponse.json({ error: "Cannot submit user form: no user context" }, { status: 400 });
    }

    // ─── 4. Generate unique IDs ─────────────────────────────────
    const finalRecordData = await generateUniqueIds(form, body.recordData);

    // ─── 5. Build structured record data ────────────────────────
    const structuredRecordData = transformToStructuredData(
      form,
      finalRecordData,
      submittedByDisplay
    );

    // ─── 6. Client metadata ─────────────────────────────────────
    const headersList = headers();
    const userAgent = headersList.get("user-agent") || body.userAgent || "Unknown";
    const ipAddress =
      headersList.get("x-forwarded-for") ||
      headersList.get("x-real-ip") ||
      "::1";

    // ─── 7. Create record with conditional fields ───────────────
    const record = await createFormRecord(
      formId,
      tableName,
      structuredRecordData,
      submittedByDisplay,
      ipAddress,
      userAgent,
      organizationId,
      currentUserId
    );

    console.log("[FORM SUBMIT] Success", {
      recordId: record.id,
      formId,
      table: tableName,
      userId: currentUserId || "anonymous",
      organizationId: organizationId || "none",
    });

    return NextResponse.json({
      success: true,
      message: form.submissionMessage || "Form submitted successfully!",
      data: {
        id: record.id,
        recordData: structuredRecordData,
        submittedAt: record.submittedAt,
        form: {
          id: form.id,
          name: form.name,
        },
      },
    });
  } catch (error: any) {
    console.error("[FORM SUBMIT] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to submit form",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function getFormWithStructure(formId: string): Promise<Form | null> {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
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
        },
        orderBy: { order: "asc" },
      },
      module: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  return form as Form | null;
}

async function generateUniqueIds(form: Form, recordData: Record<string, any>): Promise<Record<string, any>> {
  const finalRecordData = { ...recordData };

  const uniqueIdFields: FormField[] = [];

  form.sections.forEach((section) => {
    section.fields.forEach((field) => {
      if (field.type === "unique-id") uniqueIdFields.push(field);
    });
  });

  const collectFromSubforms = (subforms: Subform[]) => {
    subforms.forEach((subform) => {
      subform.fields.forEach((field) => {
        if (field.type === "unique-id") uniqueIdFields.push(field);
      });
      if (subform.childSubforms) collectFromSubforms(subform.childSubforms);
    });
  };

  if (form.subforms) collectFromSubforms(form.subforms);

  for (const field of uniqueIdFields) {
    const fieldId = field.id;
    if (finalRecordData[fieldId]) continue;

    const properties = field.properties || {};
    const mode = properties.uniqueIdMode || "uuid";
    const prefix = properties.uniqueIdPrefix || "";
    const minDigits = Number(properties.uniqueIdMinDigits) || 6;
    const startFrom = Number(properties.uniqueIdStart) || 1;

    let generatedId: string;

    if (mode === "uuid") {
      generatedId = crypto.randomUUID();
    } else {
      generatedId = await prisma.$transaction(async (tx) => {
        let counter = await tx.uniqueIdCounter.findUnique({ where: { fieldId } });

        if (!counter) {
          counter = await tx.uniqueIdCounter.create({
            data: { fieldId, lastNumber: BigInt(startFrom - 1) },
          });
        }

        counter = await tx.uniqueIdCounter.update({
          where: { id: counter.id },
          data: { lastNumber: { increment: BigInt(1) } },
        });

        const number = Number(counter.lastNumber);
        const padded = number.toString().padStart(minDigits, "0");
        return mode === "prefix" ? `${prefix}${padded}` : padded;
      });
    }

    finalRecordData[fieldId] = generatedId;
    console.log(`Generated unique ID for field ${fieldId}: ${generatedId}`);
  }

  return finalRecordData;
}

function transformToStructuredData(
  form: Form,
  recordData: Record<string, any>,
  submittedBy: string
): StructuredRecordData {
  const structured: StructuredRecordData = {
    formId: form.id,
    formName: form.name,
    sections: {},
    subforms: {},
    metadata: {
      submittedAt: new Date().toISOString(),
      submittedBy,
      totalFields: 0,
      totalSections: form.sections.length,
      totalSubforms: 0,
    },
  };

  let fieldCount = 0;
  let subformCount = 0;

  // Sections
  form.sections.forEach((section) => {
    const sectionData: StructuredSectionData = {
      sectionId: section.id,
      sectionTitle: section.title,
      sectionDescription: section.description || null,
      order: section.order,
      fields: {},
    };

    section.fields.forEach((field) => {
      const value = recordData[field.id];
      if (value !== undefined) {
        sectionData.fields[field.id] = {
          fieldId: field.id,
          label: field.label,
          type: field.type,
          value,
          sectionId: section.id,
          sectionTitle: section.title,
          subformId: null,
          subformName: null,
          order: field.order,
          placeholder: field.placeholder,
          description: field.description,
          validation: field.validation || {},
          options: field.options || [],
          lookup: field.lookup || null,
        };
        fieldCount++;
      }
    });

    structured.sections[section.id] = sectionData;
  });

  // Subforms recursive
  const processSubform = (subform: Subform, parentPath = ""): StructuredSubformData => {
    const currentPath = parentPath ? `${parentPath}/${subform.id}` : subform.id;
    subformCount++;

    const data: StructuredSubformData = {
      subformId: subform.id,
      subformName: subform.name,
      subformDescription: subform.description || null,
      parentSubformId: subform.parentSubformId || null,
      order: subform.order,
      level: subform.level,
      path: subform.path || currentPath,
      fields: {},
      rows: [],
      childSubforms: {},
    };

    // Static fields
    subform.fields.forEach((field) => {
      const value = recordData[field.id];
      if (value !== undefined) {
        data.fields[field.id] = {
          fieldId: field.id,
          label: field.label,
          type: field.type,
          value,
          sectionId: null,
          sectionTitle: "",
          subformId: subform.id,
          subformName: subform.name,
          order: field.order,
          placeholder: field.placeholder,
          description: field.description,
          validation: field.validation || {},
          options: field.options || [],
          lookup: field.lookup || null,
        };
        fieldCount++;
      }
    });

    // Dynamic rows
    const rowsKey = `_dynamicRows_${subform.id}`;
    const rows = recordData[rowsKey];

    if (Array.isArray(rows) && rows.length > 0) {
      rows.forEach((row: any, idx: number) => {
        const rowFields: Record<string, StructuredFieldData> = {};

        subform.fields.forEach((field) => {
          const val = row[field.id];
          if (val !== undefined) {
            rowFields[field.id] = {
              fieldId: field.id,
              label: field.label,
              type: field.type,
              value: val,
              sectionId: null,
              sectionTitle: "",
              subformId: subform.id,
              subformName: subform.name,
              order: field.order,
              placeholder: field.placeholder,
              description: field.description,
              validation: field.validation || {},
              options: field.options || [],
              lookup: field.lookup || null,
            };
            fieldCount++;
          }
        });

        data.rows!.push({
          rowIndex: row._rowIndex || idx + 1,
          instanceId: row._instanceId || `row_${idx}`,
          fields: rowFields,
        });
      });
    }

    // Children
    if (subform.childSubforms?.length) {
      subform.childSubforms.forEach((child) => {
        data.childSubforms![child.id] = processSubform(child, currentPath);
      });
    }

    return data;
  };

  if (form.subforms) {
    form.subforms.forEach((subform) => {
      structured.subforms[subform.id] = processSubform(subform);
    });
  }

  structured.metadata.totalFields = fieldCount;
  structured.metadata.totalSubforms = subformCount;

  return structured;
}

async function getFormRecordTable(formId: string): Promise<string> {
  try {
    const mapping = await prisma.formTableMapping.findUnique({
      where: { formId },
    });

    if (mapping) return mapping.storageTable;

    const form = await prisma.form.findUnique({
      where: { id: formId },
      select: { isUserForm: true, isEmployeeForm: true },
    });

    if (form?.isUserForm) {
      const name = "form_records_15";
      await createTableMapping(formId, name);
      return name;
    }

    if (form?.isEmployeeForm) {
      const name = "form_records_14";
      await createTableMapping(formId, name);
      return name;
    }

    const counts = await Promise.all([
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
    ]);

    const min = Math.min(...counts);
    const index = counts.indexOf(min) + 1;
    const name = `form_records_${index}`;

    await createTableMapping(formId, name);
    return name;
  } catch (err) {
    console.error("Error selecting table:", err);
    return "form_records_1";
  }
}

async function createTableMapping(formId: string, tableName: string): Promise<void> {
  try {
    await prisma.formTableMapping.upsert({
      where: { formId },
      update: { storageTable: tableName },
      create: { formId, storageTable: tableName },
    });
  } catch (err) {
    console.error("Error creating table mapping:", err);
  }
}

async function createFormRecord(
  formId: string,
  tableName: string,
  structuredRecordData: StructuredRecordData,
  submittedBy: string,
  ipAddress: string,
  userAgent: string,
  organizationId?: string,
  userId?: string
): Promise<any> {
  const baseData = {
    id: crypto.randomUUID(),
    formId,
    recordData: structuredRecordData as any,
    submittedBy,
    submittedAt: new Date(),
    status: "submitted",
    ipAddress,
    userAgent,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const extra: Record<string, any> = {};

  if (tableName === "form_records_14") {
    if (!organizationId) {
      throw new Error("organizationId is required for employee forms (form_records_14)");
    }
    extra.organizationId = organizationId;
  }

  if (userId) {
    extra.userId = userId;
  }

  const finalData = { ...baseData, ...extra };

  console.log("[FORM SUBMIT] Creating record in", tableName, "with userId:", userId, "orgId:", organizationId);

  switch (tableName) {
    case "form_records_1":  return prisma.formRecord1.create({ data: finalData });
    case "form_records_2":  return prisma.formRecord2.create({ data: finalData });
    case "form_records_3":  return prisma.formRecord3.create({ data: finalData });
    case "form_records_4":  return prisma.formRecord4.create({ data: finalData });
    case "form_records_5":  return prisma.formRecord5.create({ data: finalData });
    case "form_records_6":  return prisma.formRecord6.create({ data: finalData });
    case "form_records_7":  return prisma.formRecord7.create({ data: finalData });
    case "form_records_8":  return prisma.formRecord8.create({ data: finalData });
    case "form_records_9":  return prisma.formRecord9.create({ data: finalData });
    case "form_records_10": return prisma.formRecord10.create({ data: finalData });
    case "form_records_11": return prisma.formRecord11.create({ data: finalData });
    case "form_records_12": return prisma.formRecord12.create({ data: finalData });
    case "form_records_13": return prisma.formRecord13.create({ data: finalData });
    case "form_records_14": return prisma.formRecord14.create({ data: finalData });
    case "form_records_15": return prisma.formRecord15.create({ data: finalData });
    default:
      throw new Error(`Unsupported table: ${tableName}`);
  }
}

// import { type NextRequest, NextResponse } from "next/server"
// import { prisma } from "@/lib/prisma"
// import { headers } from "next/headers"
// import crypto from "crypto"
// import { validateSession } from "@/lib/auth"  // ← make sure this import exists

// // Type definitions for form structure
// interface FormField {
//   id: string
//   label: string
//   type: string
//   sectionId?: string | null
//   subformId?: string | null
//   placeholder?: string | null
//   description?: string | null
//   validation?: Record<string, any>
//   options?: any[]
//   lookup?: any
//   properties?: Record<string, any> | null
//   order: number
// }

// interface FormSection {
//   id: string
//   title: string
//   description?: string | null
//   order: number
//   fields: FormField[]
// }

// interface Subform {
//   id: string
//   name: string
//   description?: string | null
//   parentSubformId?: string | null
//   formId: string
//   order: number
//   level: number
//   path?: string | null
//   fields: FormField[]
//   childSubforms?: Subform[]
// }

// interface Form {
//   id: string
//   moduleId: string
//   name: string
//   description?: string | null
//   isPublished: boolean
//   requireLogin: boolean
//   maxSubmissions?: number | null
//   submissionMessage?: string | null
//   sections: FormSection[]
//   subforms: Subform[]
// }

// interface StructuredFieldData {
//   fieldId: string
//   label: string
//   type: string
//   value: any
//   sectionId: string | null
//   sectionTitle: string
//   subformId: string | null
//   subformName: string | null
//   order: number
//   placeholder?: string | null
//   description?: string | null
//   validation?: Record<string, any>
//   options?: any[]
//   lookup?: any
// }

// interface StructuredSectionData {
//   sectionId: string
//   sectionTitle: string
//   sectionDescription: string | null
//   order: number
//   fields: Record<string, StructuredFieldData>
// }

// interface StructuredSubformData {
//   subformId: string
//   subformName: string
//   subformDescription: string | null
//   parentSubformId: string | null
//   order: number
//   level: number
//   path: string | null
//   fields: Record<string, StructuredFieldData>
//   rows?: StructuredSubformRowData[]
//   childSubforms?: Record<string, StructuredSubformData>
// }

// interface StructuredSubformRowData {
//   rowIndex: number
//   instanceId: string
//   fields: Record<string, StructuredFieldData>
// }

// interface StructuredRecordData {
//   formId: string
//   formName: string
//   sections: Record<string, StructuredSectionData>
//   subforms: Record<string, StructuredSubformData>
//   metadata: {
//     submittedAt: string
//     submittedBy: string
//     totalFields: number
//     totalSections: number
//     totalSubforms: number
//   }
// }

// export async function POST(request: NextRequest, { params }: { params: { formId: string } }) {
//   try {
//     const { formId } = params  // ← correct usage – no await

//     const body = await request.json()

//     console.log("[v0] Form submission API called", {
//       formId,
//       recordDataKeys: Object.keys(body.recordData || {}),
//     })

//     // Validate required fields
//     if (!formId) {
//       return NextResponse.json({ error: "Form ID is required" }, { status: 400 })
//     }

//     if (!body.recordData || typeof body.recordData !== "object") {
//       return NextResponse.json({ error: "Record data is required and must be an object" }, { status: 400 })
//     }

//     // ───────────────────────────────────────────────────────────────
//     //  AUTHENTICATION + ORGANIZATION CONTEXT
//     // ───────────────────────────────────────────────────────────────
//     const token = request.cookies.get("auth-token")?.value
//     if (!token) {
//       return NextResponse.json({ error: "Authentication required for employee form submission" }, { status: 401 })
//     }

//     const session = await validateSession(token)
//     if (!session || !session.user) {
//       return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 })
//     }

//     // Get organizationId from session (adjust path if needed)
//     const organizationId =
//       session.user?.organizationId ||
//       session.user?.organization?.id ||
//       session.user?.orgId ||
//       session.user?.tenantId

//     if (!organizationId) {
//       console.warn("[Form Submit] No organizationId found in session", {
//         userId: session.user?.id,
//         sessionKeys: Object.keys(session.user || {})
//       })
//       return NextResponse.json(
//         { error: "No organization associated with your account" },
//         { status: 403 }
//       )
//     }

//     console.log(`[v0] Form submission for organizationId: ${organizationId}`)

//     // Get form with full structure
//     const form = await getFormWithStructure(formId)

//     if (!form) {
//       return NextResponse.json({ error: "Form not found" }, { status: 404 })
//     }

//     if (!form.isPublished) {
//       return NextResponse.json({ error: "Form is not published" }, { status: 403 })
//     }

//     // Generate unique IDs for unique-id fields
//     const finalRecordData = await generateUniqueIds(form, body.recordData)

//     // Transform flat field data to structured format matching form hierarchy
//     const structuredRecordData = transformToStructuredData(form, finalRecordData, session.user.email || session.user.id || "anonymous")

//     console.log("[v0] Structured record data:", JSON.stringify(structuredRecordData, null, 2))

//     // Get client information
//     const headersList = headers()
//     const userAgent = headersList.get("user-agent") || body.userAgent || "Unknown"
//     const ipAddress = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "Unknown"

//     // Get table mapping for this form
//     const tableName = await getFormRecordTable(formId)

//     // Create the record – now passing organizationId
//     const record = await createFormRecord(
//       formId,
//       tableName,
//       structuredRecordData,
//       session.user.email || session.user.id || "anonymous",
//       ipAddress,
//       userAgent,
//       organizationId  // ← passed here
//     )

//     console.log("[v0] Form submission successful:", {
//       recordId: record.id,
//       formId,
//     })

//     return NextResponse.json({
//       success: true,
//       message: form.submissionMessage || "Form submitted successfully!",
//       data: {
//         id: record.id,
//         recordData: structuredRecordData,
//         submittedAt: record.submittedAt,
//         form: {
//           id: form.id,
//           name: form.name,
//         },
//       },
//     })
//   } catch (error: any) {
//     console.error("[v0] Form submission error", {
//       error: error.message,
//       stack: error.stack,
//     })

//     return NextResponse.json(
//       {
//         error: "Failed to submit form",
//         details: process.env.NODE_ENV === "development" ? error.message : undefined,
//       },
//       { status: 500 },
//     )
//   }
// }

// // Get form with complete structure including sections, subforms, and fields
// async function getFormWithStructure(formId: string): Promise<Form | null> {
//   const form = await prisma.form.findUnique({
//     where: { id: formId },
//     include: {
//       sections: {
//         include: {
//           fields: { orderBy: { order: "asc" } },
//         },
//         orderBy: { order: "asc" },
//       },
//       subforms: {
//         where: { parentSubformId: null }, // Only top-level subforms
//         include: {
//           fields: { orderBy: { order: "asc" } },
//           childSubforms: {
//             include: {
//               fields: { orderBy: { order: "asc" } },
//               childSubforms: {
//                 include: {
//                   fields: { orderBy: { order: "asc" } },
//                   childSubforms: {
//                     include: {
//                       fields: { orderBy: { order: "asc" } },
//                     },
//                     orderBy: { order: "asc" },
//                   },
//                 },
//                 orderBy: { order: "asc" },
//               },
//             },
//             orderBy: { order: "asc" },
//           },
//         },
//         orderBy: { order: "asc" },
//       },
//     },
//   })

//   return form as Form | null
// }

// // Generate unique IDs for unique-id type fields
// async function generateUniqueIds(form: Form, recordData: Record<string, any>): Promise<Record<string, any>> {
//   const finalRecordData = { ...recordData }

//   // Collect all unique-id fields from sections
//   const uniqueIdFields: FormField[] = []

//   form.sections.forEach((section) => {
//     section.fields.forEach((field) => {
//       if (field.type === "unique-id") {
//         uniqueIdFields.push(field)
//       }
//     })
//   })

//   // Collect from subforms recursively
//   const collectSubformUniqueIdFields = (subforms: Subform[]) => {
//     subforms.forEach((subform) => {
//       subform.fields.forEach((field) => {
//         if (field.type === "unique-id") {
//           uniqueIdFields.push(field)
//         }
//       })
//       if (subform.childSubforms) {
//         collectSubformUniqueIdFields(subform.childSubforms)
//       }
//     })
//   }

//   if (form.subforms) {
//     collectSubformUniqueIdFields(form.subforms)
//   }

//   // Generate IDs for each unique-id field
//   for (const field of uniqueIdFields) {
//     const fieldId = field.id

//     // Only generate if value is missing/empty
//     if (finalRecordData[fieldId]) continue

//     const properties = field.properties || {}
//     const mode = properties.uniqueIdMode || "uuid"
//     const prefix = properties.uniqueIdPrefix || ""
//     const minDigits = Number(properties.uniqueIdMinDigits) || 6
//     const startFrom = Number(properties.uniqueIdStart) || 1

//     let generatedId: string

//     if (mode === "uuid") {
//       generatedId = crypto.randomUUID()
//     } else {
//       // Sequential ID with counter
//       generatedId = await prisma.$transaction(async (tx) => {
//         let counter = await tx.uniqueIdCounter.findUnique({
//           where: { fieldId },
//         })

//         if (!counter) {
//           counter = await tx.uniqueIdCounter.create({
//             data: {
//               fieldId,
//               lastNumber: BigInt(startFrom - 1),
//             },
//           })
//         }

//         counter = await tx.uniqueIdCounter.update({
//           where: { id: counter.id },
//           data: { lastNumber: { increment: BigInt(1) } },
//         })

//         const number = Number(counter.lastNumber)
//         const padded = number.toString().padStart(minDigits, "0")
//         return mode === "prefix" ? `${prefix}${padded}` : padded
//       })
//     }

//     finalRecordData[fieldId] = generatedId
//     console.log(`[v0] Generated unique ID for field ${fieldId}: ${generatedId}`)
//   }

//   return finalRecordData
// }

// // Transform flat form data to structured format matching form hierarchy
// function transformToStructuredData(
//   form: Form,
//   recordData: Record<string, any>,
//   submittedBy: string
// ): StructuredRecordData {
//   const structuredData: StructuredRecordData = {
//     formId: form.id,
//     formName: form.name,
//     sections: {},
//     subforms: {},
//     metadata: {
//       submittedAt: new Date().toISOString(),
//       submittedBy,
//       totalFields: 0,
//       totalSections: form.sections.length,
//       totalSubforms: 0,
//     },
//   }

//   let fieldCount = 0
//   let subformCount = 0

//   // Process sections
//   form.sections.forEach((section) => {
//     const sectionData: StructuredSectionData = {
//       sectionId: section.id,
//       sectionTitle: section.title,
//       sectionDescription: section.description || null,
//       order: section.order,
//       fields: {},
//     }

//     section.fields.forEach((field) => {
//       const value = recordData[field.id]
//       if (value !== undefined) {
//         sectionData.fields[field.id] = {
//           fieldId: field.id,
//           label: field.label,
//           type: field.type,
//           value: value,
//           sectionId: section.id,
//           sectionTitle: section.title,
//           subformId: null,
//           subformName: null,
//           order: field.order,
//           placeholder: field.placeholder,
//           description: field.description,
//           validation: field.validation || {},
//           options: field.options || [],
//           lookup: field.lookup || null,
//         }
//         fieldCount++
//       }
//     })

//     structuredData.sections[section.id] = sectionData
//   })

//   // Process subforms recursively
//   const processSubform = (subform: Subform, parentPath: string = ""): StructuredSubformData => {
//     const currentPath = parentPath ? `${parentPath}/${subform.id}` : subform.id
//     subformCount++

//     const subformData: StructuredSubformData = {
//       subformId: subform.id,
//       subformName: subform.name,
//       subformDescription: subform.description || null,
//       parentSubformId: subform.parentSubformId || null,
//       order: subform.order,
//       level: subform.level,
//       path: subform.path || currentPath,
//       fields: {},
//       rows: [],
//       childSubforms: {},
//     }

//     // Process subform's own fields (static row / original row)
//     subform.fields.forEach((field) => {
//       const value = recordData[field.id]
//       if (value !== undefined) {
//         subformData.fields[field.id] = {
//           fieldId: field.id,
//           label: field.label,
//           type: field.type,
//           value: value,
//           sectionId: null,
//           sectionTitle: "",
//           subformId: subform.id,
//           subformName: subform.name,
//           order: field.order,
//           placeholder: field.placeholder,
//           description: field.description,
//           validation: field.validation || {},
//           options: field.options || [],
//           lookup: field.lookup || null,
//         }
//         fieldCount++
//       }
//     })

//     // Process dynamic rows for this subform
//     const dynamicRowsKey = `_dynamicRows_${subform.id}`
//     const dynamicRows = recordData[dynamicRowsKey]

//     if (Array.isArray(dynamicRows) && dynamicRows.length > 0) {
//       dynamicRows.forEach((rowData: any, index: number) => {
//         const rowFields: Record<string, StructuredFieldData> = {}

//         // Map row data back to field structure
//         subform.fields.forEach((field) => {
//           const rowValue = rowData[field.id]
//           if (rowValue !== undefined) {
//             rowFields[field.id] = {
//               fieldId: field.id,
//               label: field.label,
//               type: field.type,
//               value: rowValue,
//               sectionId: null,
//               sectionTitle: "",
//               subformId: subform.id,
//               subformName: subform.name,
//               order: field.order,
//               placeholder: field.placeholder,
//               description: field.description,
//               validation: field.validation || {},
//               options: field.options || [],
//               lookup: field.lookup || null,
//             }
//             fieldCount++
//           }
//         })

//         subformData.rows!.push({
//           rowIndex: rowData._rowIndex || index + 1,
//           instanceId: rowData._instanceId || `row_${index}`,
//           fields: rowFields,
//         })
//       })
//     }

//     // Process child subforms recursively
//     if (subform.childSubforms && subform.childSubforms.length > 0) {
//       subform.childSubforms.forEach((childSubform) => {
//         subformData.childSubforms![childSubform.id] = processSubform(childSubform, currentPath)
//       })
//     }

//     return subformData
//   }

//   // Process all top-level subforms
//   if (form.subforms) {
//     form.subforms.forEach((subform) => {
//       structuredData.subforms[subform.id] = processSubform(subform)
//     })
//   }

//   // Update metadata counts
//   structuredData.metadata.totalFields = fieldCount
//   structuredData.metadata.totalSubforms = subformCount

//   return structuredData
// }

// // Get the appropriate table name for form records
// async function getFormRecordTable(formId: string): Promise<string> {
//   try {
//     // Check if form has a specific table mapping
//     const tableMapping = await prisma.formTableMapping.findUnique({
//       where: { formId }
//     })

//     if (tableMapping) {
//       return tableMapping.storageTable
//     }

//     // Check if this is a user form or employee form
//     const form = await prisma.form.findUnique({
//       where: { id: formId },
//       select: { isUserForm: true, isEmployeeForm: true }
//     })

//     if (form?.isUserForm) {
//       const tableName = "form_records_15"
//       await createTableMapping(formId, tableName)
//       return tableName
//     }

//     if (form?.isEmployeeForm) {
//       const tableName = "form_records_14"
//       await createTableMapping(formId, tableName)
//       return tableName
//     }

//     // For regular forms, find the least used table (1-13)
//     const tableCounts = await Promise.all([
//       prisma.formRecord1.count(),
//       prisma.formRecord2.count(),
//       prisma.formRecord3.count(),
//       prisma.formRecord4.count(),
//       prisma.formRecord5.count(),
//       prisma.formRecord6.count(),
//       prisma.formRecord7.count(),
//       prisma.formRecord8.count(),
//       prisma.formRecord9.count(),
//       prisma.formRecord10.count(),
//       prisma.formRecord11.count(),
//       prisma.formRecord12.count(),
//       prisma.formRecord13.count(),
//     ])

//     const minCount = Math.min(...tableCounts)
//     const tableIndex = tableCounts.indexOf(minCount) + 1
//     const tableName = `form_records_${tableIndex}`

//     await createTableMapping(formId, tableName)
//     return tableName
//   } catch (error: any) {
//     console.error("[v0] Error determining form record table:", error)
//     return "form_records_1"
//   }
// }

// // Create table mapping
// async function createTableMapping(formId: string, tableName: string): Promise<void> {
//   try {
//     await prisma.formTableMapping.upsert({
//       where: { formId },
//       update: { storageTable: tableName },
//       create: { formId, storageTable: tableName }
//     })
//   } catch (error: any) {
//     console.error("[v0] Error creating table mapping:", error)
//   }
// }

// // FIXED: Now accepts organizationId
// async function createFormRecord(
//   formId: string,
//   tableName: string,
//   structuredRecordData: StructuredRecordData,
//   submittedBy: string,
//   ipAddress: string,
//   userAgent: string,
//   organizationId: string   // ← added parameter
// ): Promise<any> {
//   const recordParams = {
//     id: crypto.randomUUID(),
//     formId,
//     recordData: structuredRecordData as any,
//     submittedBy,
//     submittedAt: new Date(),
//     status: "submitted",
//     ipAddress,
//     userAgent,
//     createdAt: new Date(),
//     updatedAt: new Date(),
//     organizationId,  // ← FIXED: now included in data
//   }

//   let record

//   switch (tableName) {
//     case "form_records_1":
//       record = await prisma.formRecord1.create({ data: recordParams })
//       break
//     case "form_records_2":
//       record = await prisma.formRecord2.create({ data: recordParams })
//       break
//     case "form_records_3":
//       record = await prisma.formRecord3.create({ data: recordParams })
//       break
//     case "form_records_4":
//       record = await prisma.formRecord4.create({ data: recordParams })
//       break
//     case "form_records_5":
//       record = await prisma.formRecord5.create({ data: recordParams })
//       break
//     case "form_records_6":
//       record = await prisma.formRecord6.create({ data: recordParams })
//       break
//     case "form_records_7":
//       record = await prisma.formRecord7.create({ data: recordParams })
//       break
//     case "form_records_8":
//       record = await prisma.formRecord8.create({ data: recordParams })
//       break
//     case "form_records_9":
//       record = await prisma.formRecord9.create({ data: recordParams })
//       break
//     case "form_records_10":
//       record = await prisma.formRecord10.create({ data: recordParams })
//       break
//     case "form_records_11":
//       record = await prisma.formRecord11.create({ data: recordParams })
//       break
//     case "form_records_12":
//       record = await prisma.formRecord12.create({ data: recordParams })
//       break
//     case "form_records_13":
//       record = await prisma.formRecord13.create({ data: recordParams })
//       break
//     case "form_records_14":
//       record = await prisma.formRecord14.create({ data: recordParams })
//       break
//     case "form_records_15":
//       record = await prisma.formRecord15.create({ data: recordParams })
//       break
//     default:
//       throw new Error(`Invalid table name: ${tableName}`)
//   }

//   return record
// }


// import { type NextRequest, NextResponse } from "next/server"
// import { prisma } from "@/lib/prisma"
// import { headers } from "next/headers"
// import crypto from "crypto"
// import { validateSession } from "@/lib/auth"

// // ───────────────────────────────────────────────────────────────────────
// // INTERFACES (unchanged from your code)
// // ───────────────────────────────────────────────────────────────────────
// interface FormField {
//   id: string
//   label: string
//   type: string
//   sectionId?: string | null
//   subformId?: string | null
//   placeholder?: string | null
//   description?: string | null
//   validation?: Record<string, any>
//   options?: any[]
//   lookup?: any
//   properties?: Record<string, any> | null
//   order: number
// }

// interface FormSection {
//   id: string
//   title: string
//   description?: string | null
//   order: number
//   fields: FormField[]
// }

// interface Subform {
//   id: string
//   name: string
//   description?: string | null
//   parentSubformId?: string | null
//   formId: string
//   order: number
//   level: number
//   path?: string | null
//   fields: FormField[]
//   childSubforms?: Subform[]
// }

// interface Form {
//   id: string
//   moduleId: string
//   name: string
//   description?: string | null
//   isPublished: boolean
//   requireLogin: boolean
//   maxSubmissions?: number | null
//   submissionMessage?: string | null
//   isEmployeeForm?: boolean
//   isUserForm?: boolean
//   sections: FormSection[]
//   subforms: Subform[]
// }

// interface StructuredFieldData {
//   fieldId: string
//   label: string
//   type: string
//   value: any
//   sectionId: string | null
//   sectionTitle: string
//   subformId: string | null
//   subformName: string | null
//   order: number
//   placeholder?: string | null
//   description?: string | null
//   validation?: Record<string, any>
//   options?: any[]
//   lookup?: any
// }

// interface StructuredSectionData {
//   sectionId: string
//   sectionTitle: string
//   sectionDescription: string | null
//   order: number
//   fields: Record<string, StructuredFieldData>
// }

// interface StructuredSubformData {
//   subformId: string
//   subformName: string
//   subformDescription: string | null
//   parentSubformId: string | null
//   order: number
//   level: number
//   path: string | null
//   fields: Record<string, StructuredFieldData>
//   rows?: StructuredSubformRowData[]
//   childSubforms?: Record<string, StructuredSubformData>
// }

// interface StructuredSubformRowData {
//   rowIndex: number
//   instanceId: string
//   fields: Record<string, StructuredFieldData>
// }

// interface StructuredRecordData {
//   formId: string
//   formName: string
//   sections: Record<string, StructuredSectionData>
//   subforms: Record<string, StructuredSubformData>
//   metadata: {
//     submittedAt: string
//     submittedBy: string
//     totalFields: number
//     totalSections: number
//     totalSubforms: number
//   }
// }

// export async function POST(request: NextRequest, { params }: { params: { formId: string } }) {
//   try {
//     const { formId } = params

//     const body = await request.json()

//     console.log("[Form Submission] API called", {
//       formId,
//       recordDataKeys: Object.keys(body.recordData || {}),
//     })

//     // Validate required fields
//     if (!formId) {
//       return NextResponse.json({ error: "Form ID is required" }, { status: 400 })
//     }

//     if (!body.recordData || typeof body.recordData !== "object") {
//       return NextResponse.json({ error: "Record data is required and must be an object" }, { status: 400 })
//     }

//     // ───────────────────────────────────────────────────────────────
//     // AUTHENTICATION + ORGANIZATION CONTEXT
//     // ───────────────────────────────────────────────────────────────
//     let userId: string | null = null
//     let organizationId: string | null = null
//     let submittedBy: string = "anonymous"

//     const token = request.cookies.get("auth-token")?.value

//     // Get form to determine type
//     const form = await getFormWithStructure(formId)
//     if (!form) {
//       return NextResponse.json({ error: "Form not found" }, { status: 404 })
//     }

//     if (!form.isPublished) {
//       return NextResponse.json({ error: "Form is not published" }, { status: 403 })
//     }

//     // Employee forms REQUIRE login
//     if (form.isEmployeeForm) {
//       if (!token) {
//         return NextResponse.json(
//           { error: "Authentication required for employee form submission" },
//           { status: 401 }
//         )
//       }

//       const session = await validateSession(token)
//       if (!session || !session.user) {
//         return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 })
//       }

//       userId = session.user.id
//       organizationId =
//         session.user?.organizationId ||
//         session.user?.organization?.id ||
//         session.user?.orgId ||
//         session.user?.tenantId

//       submittedBy = session.user.email || session.user.id || "logged-in-user"

//       if (!organizationId) {
//         console.warn("[Form Submit] No organizationId found in session", {
//           userId: session.user?.id,
//           sessionKeys: Object.keys(session.user || {})
//         })
//         return NextResponse.json(
//           { error: "No organization associated with your account" },
//           { status: 403 }
//         )
//       }
//     } else {
//       // Normal forms allow anonymous submission
//       // Optional: use session if user is logged in
//       if (token) {
//         const session = await validateSession(token).catch(() => null)
//         if (session?.user) {
//           userId = session.user.id
//           submittedBy = session.user.email || session.user.id || "logged-in-user"
//           organizationId =
//             session.user?.organizationId ||
//             session.user?.organization?.id ||
//             session.user?.orgId ||
//             session.user?.tenantId
//         }
//       }

//       // Fallback: org from form's module
//       if (!organizationId) {
//         const module = await prisma.formModule.findUnique({
//           where: { id: form.moduleId },
//           select: { organizationId: true }
//         })
//         organizationId = module?.organizationId || "default-org"
//       }
//     }

//     console.log(`[Form Submission] Form type: ${form.isEmployeeForm ? "Employee" : "Normal"}`)
//     console.log(`[Form Submission] Organization: ${organizationId}`)
//     console.log(`[Form Submission] Submitted by: ${submittedBy}`)

//     // Handle dynamic rows from frontend (flatten or keep nested)
//     const recordDataWithRows = body.recordData
//     // Example: flatten dynamic rows if needed
//     // (you can adjust this based on how you want to store dynamic rows in DB)
//     const flattenedRecordData = { ...recordDataWithRows }
//     Object.keys(recordDataWithRows).forEach(key => {
//       if (key.startsWith('_dynamicRows_')) {
//         const subformId = key.replace('_dynamicRows_', '')
//         const rows = recordDataWithRows[key]
//         if (Array.isArray(rows)) {
//           rows.forEach((row: any, index: number) => {
//             Object.keys(row).forEach(fieldKey => {
//               if (fieldKey !== '_rowIndex' && fieldKey !== '_instanceId') {
//                 flattenedRecordData[`${subformId}_row_${index + 1}_${fieldKey}`] = row[fieldKey]
//               }
//             })
//           })
//           delete flattenedRecordData[key] // remove original key after flattening
//         }
//       }
//     })

//     // Generate unique IDs for unique-id fields
//     const finalRecordData = await generateUniqueIds(form, flattenedRecordData)

//     // Transform to structured format
//     const structuredRecordData = transformToStructuredData(form, finalRecordData, submittedBy)

//     console.log("[Form Submission] Structured record data prepared")

//     // Get client information
//     const headersList = headers()
//     const userAgent = headersList.get("user-agent") || body.userAgent || "Unknown"
//     const ipAddress = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "Unknown"

//     // Get table mapping
//     const tableName = await getFormRecordTable(formId)

//     // Create the record
//     const record = await createFormRecord(
//       formId,
//       tableName,
//       structuredRecordData,
//       submittedBy,
//       ipAddress,
//       userAgent,
//       organizationId
//     )

//     console.log("[Form Submission] Success", { recordId: record.id, formId })

//     return NextResponse.json({
//       success: true,
//       message: form.submissionMessage || "Form submitted successfully!",
//       data: {
//         id: record.id,
//         recordData: structuredRecordData,
//         submittedAt: record.submittedAt,
//         form: {
//           id: form.id,
//           name: form.name,
//         },
//       },
//     })
//   } catch (error: any) {
//     console.error("[Form Submission] Error:", {
//       error: error.message,
//       stack: error.stack,
//     })

//     return NextResponse.json(
//       {
//         error: "Failed to submit form",
//         details: process.env.NODE_ENV === "development" ? error.message : undefined,
//       },
//       { status: 500 }
//     )
//   }
// }

// // ───────────────────────────────────────────────────────────────────────
// // ALL HELPER FUNCTIONS (kept exactly as in your code)
// // ───────────────────────────────────────────────────────────────────────

// async function getFormWithStructure(formId: string): Promise<Form | null> {
//   const form = await prisma.form.findUnique({
//     where: { id: formId },
//     include: {
//       sections: {
//         include: {
//           fields: { orderBy: { order: "asc" } },
//         },
//         orderBy: { order: "asc" },
//       },
//       subforms: {
//         where: { parentSubformId: null },
//         include: {
//           fields: { orderBy: { order: "asc" } },
//           childSubforms: {
//             include: {
//               fields: { orderBy: { order: "asc" } },
//               childSubforms: {
//                 include: {
//                   fields: { orderBy: { order: "asc" } },
//                   childSubforms: {
//                     include: {
//                       fields: { orderBy: { order: "asc" } },
//                     },
//                     orderBy: { order: "asc" },
//                   },
//                 },
//                 orderBy: { order: "asc" },
//               },
//             },
//             orderBy: { order: "asc" },
//           },
//         },
//         orderBy: { order: "asc" },
//       },
//     },
//   })

//   return form as Form | null
// }

// async function generateUniqueIds(form: Form, recordData: Record<string, any>): Promise<Record<string, any>> {
//   const finalRecordData = { ...recordData }

//   const uniqueIdFields: FormField[] = []

//   form.sections.forEach((section) => {
//     section.fields.forEach((field) => {
//       if (field.type === "unique-id") {
//         uniqueIdFields.push(field)
//       }
//     })
//   })

//   const collectSubformUniqueIdFields = (subforms: Subform[]) => {
//     subforms.forEach((subform) => {
//       subform.fields.forEach((field) => {
//         if (field.type === "unique-id") {
//           uniqueIdFields.push(field)
//         }
//       })
//       if (subform.childSubforms) {
//         collectSubformUniqueIdFields(subform.childSubforms)
//       }
//     })
//   }

//   if (form.subforms) {
//     collectSubformUniqueIdFields(form.subforms)
//   }

//   for (const field of uniqueIdFields) {
//     const fieldId = field.id

//     if (finalRecordData[fieldId]) continue

//     const properties = field.properties || {}
//     const mode = properties.uniqueIdMode || "uuid"
//     const prefix = properties.uniqueIdPrefix || ""
//     const minDigits = Number(properties.uniqueIdMinDigits) || 6
//     const startFrom = Number(properties.uniqueIdStart) || 1

//     let generatedId: string

//     if (mode === "uuid") {
//       generatedId = crypto.randomUUID()
//     } else {
//       generatedId = await prisma.$transaction(async (tx) => {
//         let counter = await tx.uniqueIdCounter.findUnique({
//           where: { fieldId },
//         })

//         if (!counter) {
//           counter = await tx.uniqueIdCounter.create({
//             data: {
//               fieldId,
//               lastNumber: BigInt(startFrom - 1),
//             },
//           })
//         }

//         counter = await tx.uniqueIdCounter.update({
//           where: { id: counter.id },
//           data: { lastNumber: { increment: BigInt(1) } },
//         })

//         const number = Number(counter.lastNumber)
//         const padded = number.toString().padStart(minDigits, "0")
//         return mode === "prefix" ? `${prefix}${padded}` : padded
//       })
//     }

//     finalRecordData[fieldId] = generatedId
//     console.log(`[Form Submission] Generated unique ID for field ${fieldId}: ${generatedId}`)
//   }

//   return finalRecordData
// }

// function transformToStructuredData(
//   form: Form,
//   recordData: Record<string, any>,
//   submittedBy: string
// ): StructuredRecordData {
//   const structuredData: StructuredRecordData = {
//     formId: form.id,
//     formName: form.name,
//     sections: {},
//     subforms: {},
//     metadata: {
//       submittedAt: new Date().toISOString(),
//       submittedBy,
//       totalFields: 0,
//       totalSections: form.sections.length,
//       totalSubforms: 0,
//     },
//   }

//   let fieldCount = 0
//   let subformCount = 0

//   form.sections.forEach((section) => {
//     const sectionData: StructuredSectionData = {
//       sectionId: section.id,
//       sectionTitle: section.title,
//       sectionDescription: section.description || null,
//       order: section.order,
//       fields: {},
//     }

//     section.fields.forEach((field) => {
//       const value = recordData[field.id]
//       if (value !== undefined) {
//         sectionData.fields[field.id] = {
//           fieldId: field.id,
//           label: field.label,
//           type: field.type,
//           value: value,
//           sectionId: section.id,
//           sectionTitle: section.title,
//           subformId: null,
//           subformName: null,
//           order: field.order,
//           placeholder: field.placeholder,
//           description: field.description,
//           validation: field.validation || {},
//           options: field.options || [],
//           lookup: field.lookup || null,
//         }
//         fieldCount++
//       }
//     })

//     structuredData.sections[section.id] = sectionData
//   })

//   const processSubform = (subform: Subform, parentPath: string = ""): StructuredSubformData => {
//     const currentPath = parentPath ? `${parentPath}/${subform.id}` : subform.id
//     subformCount++

//     const subformData: StructuredSubformData = {
//       subformId: subform.id,
//       subformName: subform.name,
//       subformDescription: subform.description || null,
//       parentSubformId: subform.parentSubformId || null,
//       order: subform.order,
//       level: subform.level,
//       path: subform.path || currentPath,
//       fields: {},
//       rows: [],
//       childSubforms: {},
//     }

//     subform.fields.forEach((field) => {
//       const value = recordData[field.id]
//       if (value !== undefined) {
//         subformData.fields[field.id] = {
//           fieldId: field.id,
//           label: field.label,
//           type: field.type,
//           value: value,
//           sectionId: null,
//           sectionTitle: "",
//           subformId: subform.id,
//           subformName: subform.name,
//           order: field.order,
//           placeholder: field.placeholder,
//           description: field.description,
//           validation: field.validation || {},
//           options: field.options || [],
//           lookup: field.lookup || null,
//         }
//         fieldCount++
//       }
//     })

//     const dynamicRowsKey = `_dynamicRows_${subform.id}`
//     const dynamicRows = recordData[dynamicRowsKey]

//     if (Array.isArray(dynamicRows) && dynamicRows.length > 0) {
//       dynamicRows.forEach((rowData: any, index: number) => {
//         const rowFields: Record<string, StructuredFieldData> = {}

//         subform.fields.forEach((field) => {
//           const rowValue = rowData[field.id]
//           if (rowValue !== undefined) {
//             rowFields[field.id] = {
//               fieldId: field.id,
//               label: field.label,
//               type: field.type,
//               value: rowValue,
//               sectionId: null,
//               sectionTitle: "",
//               subformId: subform.id,
//               subformName: subform.name,
//               order: field.order,
//               placeholder: field.placeholder,
//               description: field.description,
//               validation: field.validation || {},
//               options: field.options || [],
//               lookup: field.lookup || null,
//             }
//             fieldCount++
//           }
//         })

//         subformData.rows!.push({
//           rowIndex: rowData._rowIndex || index + 1,
//           instanceId: rowData._instanceId || `row_${index}`,
//           fields: rowFields,
//         })
//       })
//     }

//     if (subform.childSubforms && subform.childSubforms.length > 0) {
//       subform.childSubforms.forEach((childSubform) => {
//         subformData.childSubforms![childSubform.id] = processSubform(childSubform, currentPath)
//       })
//     }

//     return subformData
//   }

//   if (form.subforms) {
//     form.subforms.forEach((subform) => {
//       structuredData.subforms[subform.id] = processSubform(subform)
//     })
//   }

//   structuredData.metadata.totalFields = fieldCount
//   structuredData.metadata.totalSubforms = subformCount

//   return structuredData
// }

// async function getFormRecordTable(formId: string): Promise<string> {
//   try {
//     const tableMapping = await prisma.formTableMapping.findUnique({
//       where: { formId }
//     })

//     if (tableMapping) {
//       return tableMapping.storageTable
//     }

//     const form = await prisma.form.findUnique({
//       where: { id: formId },
//       select: { isUserForm: true, isEmployeeForm: true }
//     })

//     if (form?.isUserForm) {
//       const tableName = "form_records_15"
//       await createTableMapping(formId, tableName)
//       return tableName
//     }

//     if (form?.isEmployeeForm) {
//       const tableName = "form_records_14"
//       await createTableMapping(formId, tableName)
//       return tableName
//     }

//     const tableCounts = await Promise.all([
//       prisma.formRecord1.count(),
//       prisma.formRecord2.count(),
//       prisma.formRecord3.count(),
//       prisma.formRecord4.count(),
//       prisma.formRecord5.count(),
//       prisma.formRecord6.count(),
//       prisma.formRecord7.count(),
//       prisma.formRecord8.count(),
//       prisma.formRecord9.count(),
//       prisma.formRecord10.count(),
//       prisma.formRecord11.count(),
//       prisma.formRecord12.count(),
//       prisma.formRecord13.count(),
//     ])

//     const minCount = Math.min(...tableCounts)
//     const tableIndex = tableCounts.indexOf(minCount) + 1
//     const tableName = `form_records_${tableIndex}`

//     await createTableMapping(formId, tableName)
//     return tableName
//   } catch (error: any) {
//     console.error("[Form Submission] Error determining form record table:", error)
//     return "form_records_1"
//   }
// }

// async function createTableMapping(formId: string, tableName: string): Promise<void> {
//   try {
//     await prisma.formTableMapping.upsert({
//       where: { formId },
//       update: { storageTable: tableName },
//       create: { formId, storageTable: tableName }
//     })
//   } catch (error: any) {
//     console.error("[Form Submission] Error creating table mapping:", error)
//   }
// }

// async function createFormRecord(
//   formId: string,
//   tableName: string,
//   structuredRecordData: StructuredRecordData,
//   submittedBy: string,
//   ipAddress: string,
//   userAgent: string,
//   organizationId: string
// ): Promise<any> {
//   const recordParams = {
//     id: crypto.randomUUID(),
//     formId,
//     recordData: structuredRecordData as any,
//     submittedBy,
//     submittedAt: new Date(),
//     status: "submitted",
//     ipAddress,
//     userAgent,
//     createdAt: new Date(),
//     updatedAt: new Date(),
//     organizationId,
//   }

//   let record

//   switch (tableName) {
//     case "form_records_1":
//       record = await prisma.formRecord1.create({ data: recordParams })
//       break
//     case "form_records_2":
//       record = await prisma.formRecord2.create({ data: recordParams })
//       break
//     case "form_records_3":
//       record = await prisma.formRecord3.create({ data: recordParams })
//       break
//     case "form_records_4":
//       record = await prisma.formRecord4.create({ data: recordParams })
//       break
//     case "form_records_5":
//       record = await prisma.formRecord5.create({ data: recordParams })
//       break
//     case "form_records_6":
//       record = await prisma.formRecord6.create({ data: recordParams })
//       break
//     case "form_records_7":
//       record = await prisma.formRecord7.create({ data: recordParams })
//       break
//     case "form_records_8":
//       record = await prisma.formRecord8.create({ data: recordParams })
//       break
//     case "form_records_9":
//       record = await prisma.formRecord9.create({ data: recordParams })
//       break
//     case "form_records_10":
//       record = await prisma.formRecord10.create({ data: recordParams })
//       break
//     case "form_records_11":
//       record = await prisma.formRecord11.create({ data: recordParams })
//       break
//     case "form_records_12":
//       record = await prisma.formRecord12.create({ data: recordParams })
//       break
//     case "form_records_13":
//       record = await prisma.formRecord13.create({ data: recordParams })
//       break
//     case "form_records_14":
//       record = await prisma.formRecord14.create({ data: recordParams })
//       break
//     case "form_records_15":
//       record = await prisma.formRecord15.create({ data: recordParams })
//       break
//     default:
//       throw new Error(`Invalid table name: ${tableName}`)
//   }

//   return record
// }