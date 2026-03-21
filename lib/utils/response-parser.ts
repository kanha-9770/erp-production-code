// Unified parser for both Employee Profile and Attendance records
// Detects form type or takes it as param; combines logic from parseEmployeeData and parseAttendanceData
export interface ParsedEmployeeData {
    employeeId?: string;
    employeeName?: string;
    email?: string;
    emailAddress2?: string;
    department?: string;
    designation?: string;
    phone?: string;
    status?: string;
    gender?: string;
    dob?: string;
    nativePlace?: string;
    country?: string;
    permanentAddress?: string;
    currentAddress?: string;
    alternateNo1?: string;
    alternateNo2?: string;
    bankName?: string;
    bankAccountNo?: string;
    ifscCode?: string;
    shiftType?: string;
    inTime?: string;
    outTime?: string;
    dateOfJoining?: string;
    dateOfLeaving?: string;
    incrementMonth?: string;
    yearsOfAgreement?: string;
    bonusAfterYears?: string;
    companyName?: string;
    totalSalary?: string;
    givenSalary?: string;
    bonusAmount?: string;
    nightAllowance?: string;
    overTime?: string;
    oneHourExtra?: string;
    companySimIssue?: boolean;
    aadharCardUpload?: string;
    aadharCardNo?: string;
    panCardUpload?: string;
    passportUpload?: string;
    [key: string]: string | boolean | undefined;
}

export interface ParsedAttendanceData {
    employeeId?: string;
    userId?: string;
    date?: string;
    checkInTime?: string;
    checkOutTime?: string;
    location?: string;
    ipAddress?: string;
    deviceInfo?: string;
    duration?: number;
    notes?: string;
    status?: string;
    overtime?: number;
    [key: string]: string | number | undefined;
}

// Unified parsed type (union for flexibility)
export type ParsedRecordData = ParsedEmployeeData | ParsedAttendanceData;

// Combined patterns: Employee first (specific order), then attendance
const EMPLOYEE_PATTERNS = {
    // ... (full employee patterns from previous, reordered for specificity)
    employeeId: [/employee\s*id/i, /emp\s*id/i, /employee\s*number/i, /emp\s*no/i, /staff\s*id/i],
    bankName: [/bank\s*name/i, /bank/i, /financial\s*institution/i],
    bankAccountNo: [/bank\s*account\s*number/i, /account\s*number/i, /account\s*no/i, /bank\s*acc/i],
    ifscCode: [/ifsc\s*code/i, /ifsc/i, /bank\s*code/i, /routing\s*number/i],
    aadharCardUpload: [/aadhar\s*card\s*upload/i, /adhar\s*card\s*upload/i, /aadhaar\s*upload/i, /aadhar\s*file/i],
    aadharCardNo: [/aadhar\s*card\s*number/i, /adhar\s*card\s*number/i, /aadhaar\s*number/i, /aadhar\s*no/i],
    panCardUpload: [/pan\s*card\s*upload/i, /pan\s*upload/i, /pan\s*file/i],
    passportUpload: [/passport\s*upload/i, /passport\s*file/i, /passport\s*copy/i],
    department: [/department/i, /dept/i, /division/i, /section/i],
    designation: [/designation/i, /position/i, /job\s*title/i, /role/i, /post/i],
    shiftType: [/shift\s*type/i, /shift/i, /work\s*shift/i, /duty\s*shift/i],
    inTime: [/in\s*time/i, /start\s*time/i, /check\s*in/i, /entry\s*time/i],
    outTime: [/out\s*time/i, /end\s*time/i, /check\s*out/i, /exit\s*time/i],
    dateOfJoining: [/date\s*of\s*joining/i, /joining\s*date/i, /start\s*date/i, /hire\s*date/i, /employment\s*date/i],
    dateOfLeaving: [/date\s*of\s*leaving/i, /leaving\s*date/i, /end\s*date/i, /termination\s*date/i, /resignation\s*date/i],
    incrementMonth: [/increment\s*month/i, /salary\s*increment\s*month/i, /raise\s*month/i],
    yearsOfAgreement: [/year.*agreement/i, /contract\s*years/i, /agreement\s*period/i, /bond\s*years/i],
    bonusAfterYears: [/bonus\s*after.*years/i, /bonus\s*eligibility/i, /bonus\s*years/i],
    companyName: [/company\s*name/i, /organization/i, /employer/i, /firm/i],
    totalSalary: [/total\s*salary/i, /gross\s*salary/i, /full\s*salary/i, /complete\s*salary/i],
    givenSalary: [/given\s*salary/i, /net\s*salary/i, /take\s*home/i, /actual\s*salary/i, /paid\s*salary/i],
    bonusAmount: [/bonus\s*amount/i, /bouns\s*amount/i, /bonus/i, /incentive/i],
    nightAllowance: [/night\s*allowance/i, /night\s*shift\s*allowance/i, /night\s*pay/i],
    overTime: [/over\s*time/i, /overtime/i, /ot/i, /extra\s*hours/i],
    oneHourExtra: [/1\s*hour\s*extra/i, /one\s*hour\s*extra/i, /extra\s*hour/i, /additional\s*hour/i],
    phone: [/personal\s*contact/i, /phone/i, /mobile/i, /contact/i, /cell/i, /primary\s*phone/i],
    alternateNo1: [/alt\s*no\.?\s*1/i, /alternate\s*number\s*1/i, /alternative\s*phone\s*1/i, /second\s*phone/i],
    alternateNo2: [/alt\s*no\.?\s*2/i, /alternate\s*number\s*2/i, /alternative\s*phone\s*2/i, /third\s*phone/i],
    email: [/email\s*address\s*1/i, /primary\s*email/i, /email\s*1/i, /email/i, /mail/i],
    emailAddress2: [/email\s*address\s*2/i, /secondary\s*email/i, /email\s*2/i, /alternate\s*email/i],
    permanentAddress: [/permanent\s*address/i, /home\s*address/i, /permanent\s*addr/i],
    currentAddress: [/current\s*address/i, /present\s*address/i, /current\s*addr/i, /mailing\s*address/i],
    nativePlace: [/native/i, /native\s*place/i, /birth\s*place/i, /hometown/i],
    country: [/country/i, /belong\s*country/i, /nationality/i, /nation/i],
    employeeName: [/employee\s*name/i, /emp\s*name/i, /full\s*name/i, /staff\s*name/i],
    gender: [/sex/i, /gender/i, /male.*female/i],
    dob: [/dob/i, /date\s*of\s*birth/i, /birth\s*date/i, /birthday/i],
    status: [/status/i, /employee\s*status/i, /work\s*status/i, /employment\s*status/i],
    companySimIssue: [/company\s*sim\s*issue/i, /sim\s*provided/i, /company\s*sim/i, /mobile\s*sim/i]
};

const ATTENDANCE_PATTERNS = {
    employeeId: [/employee\s*id/i, /emp\s*id/i, /user\s*id/i, /staff\s*id/i],
    userId: [/user\s*id/i, /logged\s*in\s*user/i, /session\s*id/i],
    date: [/date/i, /attendance\s*date/i, /work\s*date/i, /today/i, /submission\s*date/i],
    time: [/time/i, /check\s*in\s*time/i, /in\s*time/i, /arrival\s*time/i, /start\s*time/i, /login\s*time/i, /entry\s*time/i, /check\s*out\s*time/i, /out\s*time/i, /departure\s*time/i, /end\s*time/i, /logout\s*time/i, /exit\s*time/i],
    location: [/location/i, /gps/i, /geo\s*location/i, /place/i, /address/i, /office\s*location/i],
    ipAddress: [/ip\s*address/i, /ip/i, /network/i],
    deviceInfo: [/device/i, /user\s*agent/i, /browser/i, /os/i, /platform/i],
    duration: [/duration/i, /hours\s*worked/i, /work\s*hours/i, /total\s*time/i],
    notes: [/notes/i, /comments/i, /remarks/i, /reason/i],
    status: [/status/i, /attendance\s*status/i, /present\s*status/i],
    overtime: [/overtime/i, /ot/i, /extra\s*hours/i, /additional\s*time/i]
};

// Combined patterns object for easy access
const ALL_PATTERNS = { ...EMPLOYEE_PATTERNS, ...ATTENDANCE_PATTERNS };

/**
 * Unified parser for records - handles both employee and attendance based on formType
 * @param recordData - The dynamic JSON structure from form submission
 * @param formType - 'employee' | 'checkin' | 'checkout' to determine parsing focus
 * @param submittedAt - Optional timestamp for fallback in attendance
 * @returns ParsedRecordData (union type)
 */
export function parseRecordData(
    recordData: any,
    formType: 'employee' | 'checkin' | 'checkout',
    submittedAt?: string
): ParsedRecordData {
    const parsed: ParsedRecordData = {};

    if (!recordData || typeof recordData !== 'object') {
        console.warn('Invalid recordData provided:', recordData);
        return parsed;
    }

    try {
        // Fallback for attendance date/time
        if (submittedAt && (formType === 'checkin' || formType === 'checkout')) {
            const fallbackDate = new Date(submittedAt);
            if (!parsed.date) parsed.date = fallbackDate.toISOString().split('T')[0];
        }

        // Iterate through fields
        Object.values(recordData).forEach((field: any) => {
            if (!field || typeof field !== 'object' || !field.label || field.value === undefined) return;

            const label = String(field.label).trim();
            let value = field.value;

            if (!value || (typeof value === 'string' && value.trim() === '')) return;

            // Find matching key across all patterns
            let matchedKey: string | null = null;
            for (const [key, patterns] of Object.entries(ALL_PATTERNS)) {
                if (patterns.some((p: RegExp) => p.test(label))) {
                    matchedKey = key;
                    break;
                }
            }

            if (!matchedKey) return;

            // Process value based on key and formType
            let processedValue: string | boolean | number | undefined;

            // Employee-specific processing
            if (formType === 'employee') {
                switch (matchedKey) {
                    case 'companySimIssue':
                        processedValue = String(value).toLowerCase() === 'yes' || value === true || value === 'true';
                        break;
                    case 'dob':
                    case 'dateOfJoining':
                    case 'dateOfLeaving':
                        const dateVal = String(value).trim();
                        processedValue = dateVal && dateVal !== '0000-00-00' ? dateVal : undefined;
                        break;
                    case 'phone':
                    case 'alternateNo1':
                    case 'alternateNo2':
                    case 'bankAccountNo':
                    case 'aadharCardNo':
                        const cleanNum = String(value).replace(/\D/g, '');
                        processedValue = cleanNum.length > 0 ? cleanNum : undefined;
                        break;
                    case 'totalSalary':
                    case 'givenSalary':
                    case 'bonusAmount':
                    case 'nightAllowance':
                    case 'overTime':
                    case 'oneHourExtra':
                        const numVal = String(value).replace(/[^\d.]/g, '');
                        const num = parseFloat(numVal);
                        processedValue = !isNaN(num) ? numVal : undefined;
                        break;
                    case 'yearsOfAgreement':
                    case 'bonusAfterYears':
                        const intVal = String(value).replace(/\D/g, '');
                        const intNum = parseInt(intVal);
                        processedValue = !isNaN(intNum) ? intVal : undefined;
                        break;
                    default:
                        processedValue = String(value).trim();
                        break;
                }
            } else {
                // Attendance-specific processing
                switch (matchedKey) {
                    case 'date':
                        const attDate = String(value).trim();
                        processedValue = attDate && attDate !== '0000-00-00' ? attDate : undefined;
                        break;
                    case 'time':
                        let timeVal = String(value).trim();
                        const timeMatch = timeVal.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
                        processedValue = timeMatch ? timeMatch[1] : timeVal;
                        // Assign to checkInTime or checkOutTime
                        if (formType === 'checkin') {
                            (parsed as ParsedAttendanceData).checkInTime = processedValue as string;
                        } else {
                            (parsed as ParsedAttendanceData).checkOutTime = processedValue as string;
                        }
                        return; // Skip default assignment
                    case 'duration':
                    case 'overtime':
                        const attNum = String(value).replace(/[^\d.]/g, '');
                        const attNumVal = parseFloat(attNum);
                        processedValue = !isNaN(attNumVal) ? attNumVal : undefined;
                        break;
                    case 'employeeId':
                    case 'userId':
                    case 'location':
                    case 'ipAddress':
                    case 'deviceInfo':
                    case 'notes':
                        processedValue = String(value).trim();
                        break;
                    default:
                        processedValue = String(value).trim();
                        break;
                }
            }

            if (processedValue !== undefined) {
                parsed[matchedKey] = processedValue;
            }
        });

        // Post-processing based on formType
        if (formType === 'employee') {
            validateAndCleanParsedData(parsed as ParsedEmployeeData);
        } else {
            // Attendance post-processing
            const attParsed = parsed as ParsedAttendanceData;
            if (attParsed.checkInTime && attParsed.checkOutTime) {
                const inT = new Date(`1970-01-01T${attParsed.checkInTime}:00`);
                const outT = new Date(`1970-01-01T${attParsed.checkOutTime}:00`);
                const durMs = outT.getTime() - inT.getTime();
                if (durMs > 0) {
                    attParsed.duration = Math.round((durMs / (1000 * 60 * 60)) * 100) / 100;
                }
            }
            if (!attParsed.status) {
                if (attParsed.checkInTime && attParsed.checkOutTime && attParsed.duration) {
                    attParsed.status = 'present';
                } else if (attParsed.checkInTime) {
                    attParsed.status = 'ongoing';
                } else if (attParsed.checkOutTime) {
                    attParsed.status = 'incomplete';
                }
            }
            validateAndCleanParsedAttendanceData(attParsed);
        }

    } catch (error) {
        console.error(`Error parsing ${formType} data:`, error);
    }

    return parsed;
}

// Reuse validation functions from previous
function validateAndCleanParsedData(parsed: ParsedEmployeeData): void {
    if (parsed.email && !isValidEmail(parsed.email)) delete parsed.email;
    if (parsed.emailAddress2 && !isValidEmail(parsed.emailAddress2)) delete parsed.emailAddress2;
    ['phone', 'alternateNo1', 'alternateNo2'].forEach(field => {
        const val = parsed[field as keyof ParsedEmployeeData] as string;
        if (val && val.length < 10) delete parsed[field as keyof ParsedEmployeeData];
    });
    ['dob', 'dateOfJoining', 'dateOfLeaving'].forEach(field => {
        const val = parsed[field as keyof ParsedEmployeeData] as string;
        if (val && !isValidDate(val)) delete parsed[field as keyof ParsedEmployeeData];
    });
    if (!parsed.employeeName && !parsed.email) console.warn('Missing essential employee data');
}

function validateAndCleanParsedAttendanceData(parsed: ParsedAttendanceData): void {
    if (parsed.date && !isValidDate(parsed.date)) delete parsed.date;
    ['checkInTime', 'checkOutTime'].forEach(field => {
        const val = parsed[field as keyof ParsedAttendanceData] as string;
        if (val && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(val)) delete parsed[field as keyof ParsedAttendanceData];
    });
    if (parsed.ipAddress && !/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(parsed.ipAddress)) delete parsed.ipAddress;
    if (!parsed.date && !parsed.checkInTime && !parsed.checkOutTime) console.warn('Missing essential attendance data');
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime()) && dateString !== '0000-00-00';
}

// Legacy compatibility functions (optional)
export function parseEmployeeData(recordData: any): ParsedEmployeeData {
    return parseRecordData(recordData, 'employee') as ParsedEmployeeData;
}

export function parseAttendanceData(recordData: any, formType: 'checkin' | 'checkout', submittedAt?: string): ParsedAttendanceData {
    return parseRecordData(recordData, formType, submittedAt) as ParsedAttendanceData;
}

// Combined interface for employee-attendance association
export interface EmployeeWithAttendance {
  employee: ParsedEmployeeData;
  userId: string;
  attendanceRecords: ParsedAttendanceData[]; // Array of daily attendance entries
  summary?: {
    totalPresentDays?: number;
    totalOvertimeHours?: number;
    averageDuration?: number;
  };
}

/**
 * Group and associate employee profile data with attendance records per user/employee
 * @param profileRecords - Array of employee profile records from API data (filtered by form: "Employee Profile")
 * @param attendanceRecords - Array of check-in/out records from API data (filtered by form: "Check-In" or "Check-Out")
 * @returns Map of employee data with associated attendance, grouped by userId/email
 */
export function associateEmployeeAttendanceData(
  profileRecords: Array<{
    id: string;
    data: any;
    submittedBy: { email: string; name?: string };
    submittedAt: string;
    employeeUserId?: string;
    parsed?: ParsedEmployeeData; // Optional pre-parsed
  }>,
  attendanceRecords: Array<{
    id: string;
    form: 'Check-In' | 'Check-Out';
    data: any;
    submittedBy: { email: string; name?: string };
    submittedAt: string;
    parsed?: ParsedAttendanceData; // Optional pre-parsed
  }>
): { [userId: string]: EmployeeWithAttendance } {
  const employeeMap: { [userId: string]: EmployeeWithAttendance } = {};

  // 1. Parse profiles (if not pre-parsed) and group by email/userId
  profileRecords.forEach(record => {
    const parsedProfile = record.parsed || parseRecordData(record.data, 'employee');
    // Use employeeUserId if available, fallback to submittedBy.email or parsed email
    const userId = record.employeeUserId || parsedProfile.email || record.submittedBy.email || 'unknown';
    
    if (!employeeMap[userId]) {
      employeeMap[userId] = {
        employee: parsedProfile as ParsedEmployeeData,
        userId,
        attendanceRecords: []
      };
    } else {
      // Merge profiles if multiple (take latest or merge fields - simple overwrite for now)
      Object.assign(employeeMap[userId].employee, parsedProfile as ParsedEmployeeData);
    }
  });

  // 2. Parse attendance (if not pre-parsed) and associate by submittedBy.email / parsed employeeId / userId
  attendanceRecords.forEach(record => {
    const formType = record.form === 'Check-In' ? 'checkin' : 'checkout';
    const parsedAttendance = record.parsed || parseRecordData(record.data, formType, record.submittedAt);
    
    // Extract linking keys from parsed data and record
    const userIdFromRecord = record.submittedBy.email;
    const userIdFromData = (parsedAttendance as ParsedAttendanceData).userId || (parsedAttendance as ParsedAttendanceData).employeeId || userIdFromRecord;
    
    // Find matching employee (prioritize exact email match, then employeeId)
    let targetEmployee = Object.values(employeeMap).find(emp => 
      emp.userId === userIdFromData || 
      emp.employee.email === userIdFromData ||
      emp.employee.employeeId === (parsedAttendance as ParsedAttendanceData).employeeId
    );

    if (!targetEmployee && userIdFromRecord) {
      // Fallback: create placeholder if no profile yet (link by submitter email)
      targetEmployee = {
        employee: { email: userIdFromRecord }, // Minimal profile
        userId: userIdFromRecord,
        attendanceRecords: []
      };
      employeeMap[userIdFromRecord] = targetEmployee;
    }

    if (targetEmployee) {
      targetEmployee.attendanceRecords.push({
        ...parsedAttendance,
        // Link back to employee if needed
        employeeId: targetEmployee.employee.employeeId || (parsedAttendance as ParsedAttendanceData).employeeId
      });
    }
  });

  // 3. Sort attendance by date and calculate summaries per employee
  Object.values(employeeMap).forEach(emp => {
    // Sort attendance by date
    emp.attendanceRecords.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    
    // Group by date to pair in/out and calculate summary
    const dailyMap: { [date: string]: ParsedAttendanceData[] } = {};
    emp.attendanceRecords.forEach(att => {
      const dateKey = att.date || 'unknown';
      if (!dailyMap[dateKey]) dailyMap[dateKey] = [];
      dailyMap[dateKey].push(att);
    });

    let totalPresentDays = 0;
    let totalOvertimeHours = 0;
    let totalDuration = 0;

    Object.values(dailyMap).forEach(dayRecords => {
      // Find if there's a complete day (has both in and out)
      const hasIn = dayRecords.some(r => r.checkInTime);
      const hasOut = dayRecords.some(r => r.checkOutTime);
      if (hasIn && hasOut) {
        totalPresentDays++;
        const dayDuration = (dayRecords.find(r => r.duration)?.duration || 0) as number;
        totalDuration += dayDuration;
        totalOvertimeHours += (dayRecords.find(r => r.overtime)?.overtime || 0) as number;
      }
    });

    emp.summary = {
      totalPresentDays,
      totalOvertimeHours,
      averageDuration: totalPresentDays > 0 ? Math.round((totalDuration / totalPresentDays) * 100) / 100 : 0
    };
  });

  return employeeMap;
}