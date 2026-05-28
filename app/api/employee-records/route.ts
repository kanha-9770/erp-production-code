// // app/api/employee-records/route.ts (or your API route file)
// export const dynamic = 'force-dynamic';
// import { NextRequest, NextResponse } from 'next/server';
// import { PrismaClient } from '@prisma/client';
// import { parseEmployeeData, analyzeRecordDataStructure } from '@/lib/employeeDataParser';

// const prisma = new PrismaClient();

// export async function GET(request: NextRequest) {
//   try {
//     console.log('Fetching employee records from FormRecord14...');
    
//     // Fetch employee records from FormRecord14
//     const records = await prisma.formRecord14.findMany({
//       select: {
//         id: true,
//         employee_id: true,
//         recordData: true,
//         submittedAt: true,
//         status: true,
//         userId: true,
//       },
//       where: {
//         status: 'submitted', // Only get submitted records
//       },
//       orderBy: {
//         submittedAt: 'desc',
//       },
//     });

//     console.log(`Found ${records.length} records in FormRecord14`);

//     // Parse records and collect all for return, with status
//     const processedRecords = [];
//     const skipReasons = [];
    
//     for (const record of records) {
//       // Parse the record data
//       const parsedData = parseEmployeeData(record.recordData);
      
//       // Debug: Analyze structure for the first record
//       if (processedRecords.length === 0) {
//         const analysis = analyzeRecordDataStructure(record.recordData);
//         console.log('Record structure analysis:', JSON.stringify(analysis, null, 2));
//       }

//       let status = 'valid';
//       let reason = null;

//       // Updated check: Only require name; email is optional but note if missing
//       if (!parsedData.employeeName) {
//         status = 'skipped';
//         reason = 'Missing essential data: employeeName';
//         console.log(`Record ${record.id}: ${reason}`);
//       } else if (!parsedData.email) {
//         status = 'warning';
//         reason = 'Missing email - can still create user but email recommended';
//         console.log(`Record ${record.id}: ${reason}`);
//       } else {
//         // Check if a user already exists with this email (only if email present)
//         const existingUser = await prisma.user.findUnique({
//           where: { email: parsedData.email }
//         });

//         if (existingUser) {
//           status = 'skipped';
//           reason = `User already exists with email ${parsedData.email}`;
//           console.log(`Record ${record.id}: ${reason}`);
//         }
//       }

//       if (reason && status === 'skipped') {
//         skipReasons.push({ recordId: record.id, reason });
//       }

//       // Check if employee record exists
//       let employee = null;
//       if (record.employee_id) {
//         employee = await prisma.employee.findUnique({
//           where: { id: record.employee_id }
//         });
//       }

//       // Always include the record, but mark status
//       processedRecords.push({
//         ...record,
//         parsedData,
//         hasEmployeeRecord: !!employee,
//         processStatus: status,
//         reason: reason, // Changed from skipReason to reason
//         // Include debug info
//         ...(process.env.NODE_ENV === 'development' && {
//           _debug: {
//             originalRecordData: record.recordData,
//             parsedFields: Object.keys(parsedData).filter(key => parsedData[key]),
//           }
//         })
//       });
//     }

//     // Filter valid and warning ones for main records (treat warning as usable)
//     const usableRecords = processedRecords.filter(r => r.processStatus === 'valid' || r.processStatus === 'warning');

//     console.log(`Returning ${usableRecords.length} usable records for user creation (total processed: ${processedRecords.length})`);

//     return NextResponse.json({
//       success: true,
//       records: usableRecords,
//       total: usableRecords.length,
//       allProcessedRecords: processedRecords, // Return all for debugging
//       // Include metadata
//       ...(process.env.NODE_ENV === 'development' && {
//         _metadata: {
//           totalRecordsInDB: records.length,
//           usableRecords: usableRecords.length,
//           skippedRecords: processedRecords.length - usableRecords.length,
//           skipReasons,
//         }
//       })
//     });
//   } catch (error) {
//     console.error('Error fetching employee records:', error);
//     return NextResponse.json(
//       { 
//         error: 'Failed to fetch employee records',
//         details: error instanceof Error ? error.message : 'Unknown error'
//       },
//       { status: 500 }
//     );
//   }
// }

// app/api/employee-records/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // ← use your shared prisma instance (preferred)
import { validateSession } from '@/lib/auth';
import { parseEmployeeData, analyzeRecordDataStructure } from '@/lib/employeeDataParser';
import { buildKey, cached } from '@/lib/cache';

// Employee-records is read on every visit to the employee-master page. The
// data CAN go stale (new form submissions arrive any time), but a 60-second
// TTL bounds the staleness while still skipping the heavy field-label scan
// and per-record N+1 walks on most reads. We don't wire explicit
// invalidation: the server-side duplicate-check on the eventual "Create
// User" action is the real correctness mechanism — the cache only affects
// what the table shows, not what creating users actually allows.
const EMPLOYEE_RECORDS_TTL_S = 60;
const employeeRecordsKey = (orgId: string) =>
  buildKey('hr', 'employee-records', orgId);

// Do NOT create new PrismaClient() here — use the shared instance from lib/prisma
// const prisma = new PrismaClient();  ← REMOVE THIS LINE

export async function GET(request: NextRequest) {
  try {
    console.log('Fetching employee records from FormRecord14...');

    // ──────────────────────────────────────────────────────────────
    // 1. Authentication & get current organization
    // ──────────────────────────────────────────────────────────────
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await validateSession(token);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    // Extract organization ID — adjust path based on your session shape
    const orgId = session.user?.organization?.id ||
                  session.user?.organizationId ||
                  session.user?.orgId ||
                  session.user?.tenantId;

    if (!orgId) {
      console.warn("No organization context found in session", { userId: session.user.id });
      return NextResponse.json(
        { error: "No organization context available" },
        { status: 403 }
      );
    }

    console.log(`Fetching records for organization: ${orgId}`);

    // Cached body — produces the response payload shape below. Skipped on a
    // warm cache (24ms instead of the field-scan + N+1 walk).
    const payload = await cached(
      'hr',
      employeeRecordsKey(orgId),
      EMPLOYEE_RECORDS_TTL_S,
      () => buildEmployeeRecordsPayload(orgId),
    );

    return NextResponse.json({
      success: true,
      records: payload.usableRecords,
      total: payload.usableRecords.length,
      allProcessedRecords: payload.processedRecords,
      ...(process.env.NODE_ENV === 'development' && {
        _metadata: {
          totalRecordsInDB: payload.totalInDb,
          usableRecords: payload.usableRecords.length,
          skippedRecords: payload.processedRecords.length - payload.usableRecords.length,
          skipReasons: payload.skipReasons,
          organizationId: orgId,
        },
      }),
    });
  } catch (error) {
    console.error('Error fetching employee records:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch employee records',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

interface EmployeeRecordsPayload {
  usableRecords: any[];
  processedRecords: any[];
  skipReasons: Array<{ recordId: string; reason: string }>;
  totalInDb: number;
}

async function buildEmployeeRecordsPayload(orgId: string): Promise<EmployeeRecordsPayload> {
    // ──────────────────────────────────────────────────────────────
    // 2. Build fieldId → label lookup from FormField table
    //    This resolves Format B records (sections with plain values)
    // ──────────────────────────────────────────────────────────────
    const formFields = await prisma.formField.findMany({
      where: {
        section: {
          form: {
            module: { organizationId: orgId }
          }
        }
      },
      select: { id: true, label: true },
    });
    const fieldIdToLabel: Record<string, string> = {};
    for (const ff of formFields) {
      fieldIdToLabel[ff.id] = ff.label;
    }
    console.log(`Built fieldId→label map with ${formFields.length} entries`);

    // ──────────────────────────────────────────────────────────────
    // 3. Fetch ONLY records belonging to this organization
    // ──────────────────────────────────────────────────────────────
    const records = await prisma.formRecord14.findMany({
      select: {
        id: true,
        employee_id: true,
        recordData: true,
        submittedAt: true,
        status: true,
        userId: true,
        organizationId: true,  // optional — good for debugging
      },
      where: {
        status: 'submitted',
        organizationId: orgId,    // ← THIS IS THE CRITICAL CHANGE
      },
      orderBy: {
        submittedAt: 'desc',
      },
    });

    console.log(`Found ${records.length} records in FormRecord14 for org ${orgId}`);

    // ──────────────────────────────────────────────────────────────
    // 3. Process records (your original logic – unchanged)
    // ──────────────────────────────────────────────────────────────
    const processedRecords = [];
    const skipReasons = [];

    for (const record of records) {
      const parsedData = parseEmployeeData(record.recordData, fieldIdToLabel);

      // Debug: Analyze structure for the first record
      if (processedRecords.length === 0) {
        const analysis = analyzeRecordDataStructure(record.recordData, fieldIdToLabel);
        console.log('Record structure analysis:', JSON.stringify(analysis, null, 2));
      }

      let status = 'valid';
      let reason = null;

      if (!parsedData.employeeName) {
        status = 'skipped';
        reason = 'Missing essential data: employeeName';
        console.log(`Record ${record.id}: ${reason}`);
      } else if (!parsedData.email) {
        status = 'warning';
        reason = 'Missing email - can still create user but email recommended';
        console.log(`Record ${record.id}: ${reason}`);
      } else {
        const existingUser = await prisma.user.findUnique({
          where: { email: parsedData.email }
        });

        if (existingUser) {
          status = 'skipped';
          reason = `User already exists with email ${parsedData.email}`;
          console.log(`Record ${record.id}: ${reason}`);
        }
      }

      if (reason && status === 'skipped') {
        skipReasons.push({ recordId: record.id, reason });
      }

      let employee = null;
      if (record.employee_id) {
        employee = await prisma.employee.findUnique({
          where: { id: record.employee_id }
        });
      }

      processedRecords.push({
        ...record,
        parsedData,
        hasEmployeeRecord: !!employee,
        processStatus: status,
        reason: reason,
        ...(process.env.NODE_ENV === 'development' && {
          _debug: {
            originalRecordData: record.recordData,
            parsedFields: Object.keys(parsedData).filter(key => parsedData[key]),
          }
        })
      });
    }

    const usableRecords = processedRecords.filter(r =>
      r.processStatus === 'valid' || r.processStatus === 'warning'
    );

    console.log(
      `Returning ${usableRecords.length} usable records for user creation ` +
      `(total processed: ${processedRecords.length})`
    );

    return {
      usableRecords,
      processedRecords,
      skipReasons,
      totalInDb: records.length,
    };
}