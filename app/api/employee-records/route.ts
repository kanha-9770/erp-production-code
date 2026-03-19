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
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { parseEmployeeData, analyzeRecordDataStructure } from '@/lib/employeeDataParser';

// Do NOT create new PrismaClient() here — use the shared instance from lib/prisma
// const prisma = new PrismaClient();  ← REMOVE THIS LINE

export async function GET(request: NextRequest) {
  try {
    // ──────────────────────────────────────────────────────────────
    // 1. Authentication & get current organization
    // ──────────────────────────────────────────────────────────────
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const orgId = authUser.organizationId;

    if (!orgId) {
      return NextResponse.json(
        { error: "No organization context available" },
        { status: 403 }
      );
    }

    // ──────────────────────────────────────────────────────────────
    // 2. Fetch ONLY records belonging to this organization
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

    // ──────────────────────────────────────────────────────────────
    // 3. Process records (your original logic – unchanged)
    // ──────────────────────────────────────────────────────────────
    const processedRecords = [];
    const skipReasons = [];

    for (const record of records) {
      const parsedData = parseEmployeeData(record.recordData);

      let status = 'valid';
      let reason = null;

      if (!parsedData.employeeName) {
        status = 'skipped';
        reason = 'Missing essential data: employeeName';
      } else if (!parsedData.email) {
        status = 'warning';
        reason = 'Missing email - can still create user but email recommended';
      } else {
        const existingUser = await prisma.user.findUnique({
          where: { email: parsedData.email }
        });

        if (existingUser) {
          status = 'skipped';
          reason = `User already exists with email ${parsedData.email}`;
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

    return NextResponse.json({
      success: true,
      records: usableRecords,
      total: usableRecords.length,
      allProcessedRecords: processedRecords,
      ...(process.env.NODE_ENV === 'development' && {
        _metadata: {
          totalRecordsInDB: records.length,
          usableRecords: usableRecords.length,
          skippedRecords: processedRecords.length - usableRecords.length,
          skipReasons,
          organizationId: orgId,  // helps debugging
        }
      })
    });
  } catch (error) {
    console.error('Error fetching employee records:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch employee records',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}