// app/api/forms/records/route.ts
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseRecordData } from "@/lib/response-parser";
// Import the unified parser (adjust path to your parsers file, e.g., if it's lib/unified_parser.ts)

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 1. Auth
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await validateSession(token);
    if (!session?.user?.id) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const orgId = session.user.organization?.id;
    if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

    // 2. Get all user IDs in the organization (optimized: single query)
    const users = await prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    if (userIds.length === 0) {
      return NextResponse.json({ success: true, count: 0, grouped: {}, data: [] });
    }

    // 3. Find the specific forms by name (parallel queries for efficiency)
    const [checkinForm, checkoutForm, employeeProfileForm] = await Promise.all([
      prisma.form.findFirst({
        where: { name: "Check-In", module: { organizationId: orgId } },
        include: { tableMapping: true },
      }),
      prisma.form.findFirst({
        where: { name: "Check-Out", module: { organizationId: orgId } },
        include: { tableMapping: true },
      }),
      prisma.form.findFirst({
        where: { name: "Employee Profile", module: { organizationId: orgId } },
        include: { tableMapping: true },
      }),
    ]);

    if (!checkinForm || !checkoutForm || !employeeProfileForm) {
      return NextResponse.json({
        success: false,
        message: "Required forms not found",
        tip: "Ensure forms named exactly: Check-In, Check-Out, Employee Profile exist in the organization",
      }, { status: 404 });
    }

    const validTables = new Set([
      "form_records_1", "form_records_2", "form_records_3", "form_records_4",
      "form_records_5", "form_records_6", "form_records_7", "form_records_8",
      "form_records_9", "form_records_10", "form_records_11", "form_records_12",
      "form_records_13", "form_records_14", "form_records_15",
    ]);

    const checkinTable = checkinForm.tableMapping?.storageTable;
    const checkoutTable = checkoutForm.tableMapping?.storageTable;

    if (!checkinTable || !validTables.has(checkinTable) || !checkoutTable || !validTables.has(checkoutTable)) {
      return NextResponse.json({
        success: false,
        message: "Invalid table mappings for Check-In or Check-Out forms",
      }, { status: 400 });
    }

    // 4. Parallel raw queries for Check-In and Check-Out (efficient batching)
    const [checkinRaw, checkoutRaw] = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT 
          r.id,
          r.record_data AS "data",
          r.submitted_at AS "submittedAt",
          r.status,
          u.email AS "submittedByEmail",
          u.first_name || ' ' || COALESCE(u.last_name, '') AS "submittedByName",
          'Check-In' AS "formName"
        FROM "${checkinTable}" r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.user_id = ANY($1::text[])
        ORDER BY r.submitted_at DESC`,
        userIds
      ),
      prisma.$queryRawUnsafe(
        `SELECT 
          r.id,
          r.record_data AS "data",
          r.submitted_at AS "submittedAt",
          r.status,
          u.email AS "submittedByEmail",
          u.first_name || ' ' || COALESCE(u.last_name, '') AS "submittedByName",
          'Check-Out' AS "formName"
        FROM "${checkoutTable}" r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.user_id = ANY($1::text[])
        ORDER BY r.submitted_at DESC`,
        userIds
      ),
    ]);

    const checkinRecords = checkinRaw as any[];
    const checkoutRecords = checkoutRaw as any[];

    // 5. Query Employee Profile records (optimized: direct join)
    const profileRecordsRaw = await prisma.$queryRawUnsafe(
      `SELECT 
        r.id,
        r.record_data AS "data",
        r.submitted_at AS "submittedAt",
        r.status,
        su.email AS "submittedByEmail",
        su.first_name || ' ' || COALESCE(su.last_name, '') AS "submittedByName",
        'Employee Profile' AS "formName",
        e.user_id AS "employeeUserId"
      FROM form_records_14 r
      INNER JOIN employees e ON r.employee_id = e.id
      LEFT JOIN users su ON r.user_id = su.id
      WHERE e.user_id = ANY($1::text[])
      ORDER BY r.submitted_at DESC`,
      userIds
    );
    const profileRecords = profileRecordsRaw as any[];

    // 6. Combine all raw records
    const allRecords = [...checkinRecords, ...checkoutRecords, ...profileRecords];

    // 7. Parse using unified parser and return ONLY parsed data (no raw data)
    const responseData = allRecords.map((r: any) => {
      let formType: 'employee' | 'checkin' | 'checkout';
      switch (r.formName) {
        case "Employee Profile":
          formType = 'employee';
          break;
        case "Check-In":
          formType = 'checkin';
          break;
        case "Check-Out":
          formType = 'checkout';
          break;
        default:
          formType = 'employee'; // Fallback
      }
      const parsed = parseRecordData(r.data, formType, r.submittedAt);
      return {
        id: r.id,
        form: r.formName,
        submittedAt: r.submittedAt,
        submittedBy: {
          name: r.submittedByName?.trim() || "Unknown",
          email: r.submittedByEmail,
        },
        ...parsed, // Flatten parsed fields directly into the record (e.g., date, checkInTime, employeeName, etc.)
      };
    });

    // 8. Group parsed data for convenience (flattened)
    const grouped = {
      "Check-In": responseData.filter((r) => r.form === "Check-In"),
      "Check-Out": responseData.filter((r) => r.form === "Check-Out"),
      "Employee Profile": responseData.filter((r) => r.form === "Employee Profile"),
    };

    return NextResponse.json({
      success: true,
      count: allRecords.length,
      grouped,
      data: responseData,
    });

  } catch (error: any) {
    console.error("Form records error:", error);
    return NextResponse.json(
      { success: false, error: "Server error", details: error.message },
      { status: 500 }
    );
  }
}