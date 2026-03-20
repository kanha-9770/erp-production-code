// // app/api/employee-records/route.ts (or your API route file)
// export const dynamic = 'force-dynamic';
// import { NextRequest, NextResponse } from 'next/server';
// import { PrismaClient } from '@prisma/client';
// import { parseEmployeeData } from '@/lib/employeeDataParser';

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
import { parseEmployeeData } from '@/lib/employeeDataParser';

// Do NOT create new PrismaClient() here — use the shared instance from lib/prisma
// const prisma = new PrismaClient();  ← REMOVE THIS LINE

export async function GET(request: NextRequest) {
  try {
    // 1. Auth
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Resolve org — owner users have organizationId = null; look up via ownedOrganization
    const fullUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { organizationId: true, ownedOrganization: { select: { id: true } } },
    });
    const orgId = fullUser?.organizationId ?? fullUser?.ownedOrganization?.id ?? null;

    if (!orgId) {
      return NextResponse.json({ error: 'No organization associated with this account' }, { status: 403 });
    }

    // 3. Fetch all submitted records from the employee form table (form_records_14)
    //    Try org-scoped first; fall back to all submitted records if none found
    //    (covers cases where organizationId wasn't set at submission time)
    let records = await prisma.formRecord14.findMany({
      select: { id: true, employee_id: true, recordData: true, submittedAt: true, status: true, userId: true, organizationId: true },
      where: { status: 'submitted', organizationId: orgId },
      orderBy: { submittedAt: 'desc' },
    });

    if (records.length === 0) {
      // fallback: return all submitted records so admins can still see data
      records = await prisma.formRecord14.findMany({
        select: { id: true, employee_id: true, recordData: true, submittedAt: true, status: true, userId: true, organizationId: true },
        where: { status: 'submitted' },
        orderBy: { submittedAt: 'desc' },
      });
    }

    // 4. Parse and classify each record
    const processedRecords = [];
    const skipReasons: { recordId: string; reason: string }[] = [];

    for (const record of records) {
      let parsedData: Record<string, any> = {};
      try {
        parsedData = parseEmployeeData(record.recordData) as Record<string, any>;
      } catch {
        parsedData = {};
      }

      let recStatus = 'valid';
      let reason: string | null = null;

      if (!parsedData.employeeName) {
        recStatus = 'skipped';
        reason = 'Missing employee name';
      } else if (!parsedData.email) {
        recStatus = 'warning';
        reason = 'Missing email';
      } else {
        try {
          const existingUser = await prisma.user.findUnique({ where: { email: parsedData.email as string } });
          if (existingUser) {
            recStatus = 'skipped';
            reason = `User already exists with email ${parsedData.email}`;
          }
        } catch { /* skip check on DB error */ }
      }

      if (recStatus === 'skipped' && reason) {
        skipReasons.push({ recordId: record.id, reason });
      }

      let hasEmployeeRecord = false;
      if (record.employee_id) {
        try {
          const emp = await prisma.employee.findUnique({ where: { id: record.employee_id } });
          hasEmployeeRecord = !!emp;
        } catch { /* ignore */ }
      }

      processedRecords.push({ ...record, parsedData, hasEmployeeRecord, processStatus: recStatus, reason });
    }

    const usableRecords = processedRecords.filter(r => r.processStatus === 'valid' || r.processStatus === 'warning');

    return NextResponse.json({
      success: true,
      records: usableRecords,
      total: usableRecords.length,
      _meta: { total: records.length, usable: usableRecords.length, skipped: skipReasons.length, orgId },
    });

  } catch (error) {
    console.error('[employee-records] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch employee records', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}