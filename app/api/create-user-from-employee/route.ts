// app/api/create-user-from-employee/route.ts
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { parseEmployeeData } from '@/lib/employeeDataParser';
import { generateJWT, generateSessionToken } from '@/lib/auth';
import { validateSession } from '@/lib/auth'; // Add this import if not present

export async function POST(request: NextRequest) {
  try {
    console.log('Creating user from employee record...');

    // Get auth token
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Validate session
    const userSession = await validateSession(token);
    console.log("this is the session data", userSession);
    if (!userSession) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // Get current user's organization ID
    const currentUser = await prisma.user.findUnique({
      where: { id: userSession.user.id },
      select: {
        organizationId: true,
        ownedOrganization: { select: { id: true } }
      }
    });

    const orgId = currentUser?.organizationId || currentUser?.ownedOrganization?.id;
    console.log(`Retrieved orgId for POST: ${orgId}`);

    if (!orgId) {
      return NextResponse.json({ error: "No organization associated with user" }, { status: 400 });
    }

    const body = await request.json();
    const {
      employeeRecordId,
      employee_id,
      employeeName,
      email,
      password,
      confirmPassword,
      roleId,
      unitId,
    } = body;

    console.log('Request data:', { employeeRecordId, employee_id, employeeName, email, hasPassword: !!password });

    // Validate required fields
    if (!employeeRecordId || !employee_id || !employeeName || !email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if user already exists with this email
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Verify the form record exists in FormRecord14
    const formRecord = await prisma.formRecord14.findUnique({
      where: { id: employeeRecordId }
    });

    if (!formRecord) {
      return NextResponse.json(
        { error: 'Employee form record not found' },
        { status: 404 }
      );
    }

    // Build fieldId → label map so Format B records (nested sections) can be parsed
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

    // Parse the form record data with label resolution
    const parsedData = parseEmployeeData(formRecord.recordData, fieldIdToLabel);

    // Use request body values as fallback — the user already entered these in the UI
    if (!parsedData.employeeName) parsedData.employeeName = employeeName;
    if (!parsedData.email) parsedData.email = email;

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Extract names
    const nameParts = employeeName.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    // Convert date strings to Date objects
    const dobDate = parsedData.dob && parsedData.dob !== '0000-00-00' ? new Date(parsedData.dob) : null;
    const joiningDate = parsedData.dateOfJoining && parsedData.dateOfJoining !== '0000-00-00' ? new Date(parsedData.dateOfJoining) : null;
    const leavingDate = parsedData.dateOfLeaving && parsedData.dateOfLeaving !== '0000-00-00' ? new Date(parsedData.dateOfLeaving) : null;

    // Map status and gender
    const mapEmployeeStatus = (status: string | undefined) => {
      switch (status?.toLowerCase()) {
        case 'active': return 'ACTIVE';
        case 'inactive': return 'INACTIVE';
        case 'on leave': return 'ON_LEAVE';
        default: return 'ACTIVE';
      }
    };

    const mapGender = (gender: string | undefined) => {
      switch (gender?.toLowerCase()) {
        case 'male': return 'MALE';
        case 'female': return 'FEMALE';
        default: return 'OTHER';
      }
    };

    console.log('Starting database transaction...');

    // Main transaction: Create User + Employee + Link FormRecord14
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the User with organizationId
      const newUser = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          first_name: firstName,
          last_name: lastName || null,
          email_verified: true,
          status: 'ACTIVE',
          provider: 'EMAIL',
          department: parsedData.department || null,
          phone: parsedData.phone || null,
          joinDate: joiningDate,
          organizationId: orgId,  // Set the organization ID here
        }
      });

      console.log('User created:', newUser.id);

      let employee;

      // 2. Find existing employee by ID (if provided)
      if (employee_id) {
        employee = await tx.employee.findUnique({
          where: { id: employee_id }
        });
      }

      if (employee) {
        console.log('Updating existing employee:', employee_id);
        // Update existing employee → overwrites old userId
        employee = await tx.employee.update({
          where: { id: employee_id },
          data: {
            userId: newUser.id,  // OVERWRITES any previous userId
            employeeName: parsedData.employeeName,
            emailAddress1: parsedData.email,
            emailAddress2: parsedData.emailAddress2 || null,
            department: parsedData.department || null,
            designation: parsedData.designation || null,
            personalContact: parsedData.phone || null,
            alternateNo1: parsedData.alternateNo1 || null,
            alternateNo2: parsedData.alternateNo2 || null,
          }
        });
      } else {
        console.log('Creating new employee record');
        // Create new employee
        employee = await tx.employee.create({
          data: {
            userId: newUser.id,
            employeeName: parsedData.employeeName || employeeName,
            gender: mapGender(parsedData.gender),
            department: parsedData.department || null,
            designation: parsedData.designation || null,
            dob: dobDate,
            nativePlace: parsedData.nativePlace || null,
            country: parsedData.country || null,
            permanentAddress: parsedData.permanentAddress || null,
            currentAddress: parsedData.currentAddress || null,
            personalContact: parsedData.phone || null,
            alternateNo1: parsedData.alternateNo1 || null,
            alternateNo2: parsedData.alternateNo2 || null,
            emailAddress1: parsedData.email || email,
            emailAddress2: parsedData.emailAddress2 || null,
            bankName: parsedData.bankName || null,
            bankAccountNo: parsedData.bankAccountNo || null,
            ifscCode: parsedData.ifscCode || null,
            status: mapEmployeeStatus(parsedData.status),
            shiftType: parsedData.shiftType || null,
            inTime: parsedData.inTime || null,
            outTime: parsedData.outTime || null,
            dateOfJoining: joiningDate,
            dateOfLeaving: leavingDate,
            totalSalary: parsedData.totalSalary ? parseFloat(parsedData.totalSalary) : null,
            givenSalary: parsedData.givenSalary ? parseFloat(parsedData.givenSalary) : null,
            bonusAmount: parsedData.bonusAmount ? parseFloat(parsedData.bonusAmount) : null,
            nightAllowance: parsedData.nightAllowance ? parseFloat(parsedData.nightAllowance) : null,
            overTime: parsedData.overTime ? parseFloat(parsedData.overTime) : null,
            oneHourExtra: parsedData.oneHourExtra ? parseFloat(parsedData.oneHourExtra) : null,
            incrementMonth: parsedData.incrementMonth ? parseInt(parsedData.incrementMonth) || null : null,
            yearsOfAgreement: parsedData.yearsOfAgreement ? parseInt(parsedData.yearsOfAgreement) || null : null,
            bonusAfterYears: parsedData.bonusAfterYears ? parseInt(parsedData.bonusAfterYears) || null : null,
            companyName: parsedData.companyName || null,
            aadharCardUpload: parsedData.aadharCardUpload || null,
            aadharCardNo: parsedData.aadharCardNo || null,
            panCardUpload: parsedData.panCardUpload || null,
            passportUpload: parsedData.passportUpload || null,
            companySimIssue: parsedData.companySimIssue,
          }
        });
      }

      // 3. CRITICAL: Update FormRecord14 to link BOTH employee_id AND userId
      await tx.formRecord14.update({
        where: { id: employeeRecordId },
        data: {
          employee_id: employee.id,     // Link to employee
          userId: newUser.id,           // LINK TO USER (OVERWRITES old userId)
        },
      });

      console.log('FormRecord14 updated with employee_id and userId');

      // 4. Assign role & unit if provided
      if (roleId && unitId) {
        await tx.userUnitAssignment.create({
          data: {
            userId: newUser.id,
            unitId: unitId,
            roleId: roleId,
          },
        });
        console.log(`Assigned user ${newUser.id} to unit=${unitId} role=${roleId}`);
      }

      return { user: newUser, employee };
    });

    console.log('Transaction completed successfully');

    // Create session
    const sessionToken = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const newSession = await prisma.userSession.create({
      data: {
        userId: result.user.id,
        token: sessionToken,
        expiresAt,
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      }
    });

    // Generate JWT
    const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-key';
    const jwtToken = generateJWT(
      {
        userId: result.user.id,
        email: result.user.email,
        employeeId: result.employee.id,
        sessionId: newSession.id
      },
      jwtSecret,
      '7d'
    );

    console.log('User creation completed successfully for:', result.user.email);

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      user: {
        id: result.user.id,
        email: result.user.email,
        name: `${result.user.first_name} ${result.user.last_name || ''}`.trim(),
        employee_id: result.employee.id,
        sessionToken,
        jwtToken,
        expiresAt: expiresAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Error creating user from employee:', error);
    return NextResponse.json(
      {
        error: 'Failed to create user',
        details: error instanceof Error ? error.message : 'Unknown error',
        ...(process.env.NODE_ENV === 'development' && {
          stack: error instanceof Error ? error.stack : undefined
        })
      },
      { status: 500 }
    );
  }
}