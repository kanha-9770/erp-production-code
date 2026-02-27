// lib/employeeDataParser.ts
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

// Field mapping patterns - flexible regex patterns for various field labels
// Updated: Added more common email label variations
const FIELD_PATTERNS: Record<string, RegExp[]> = {
  employeeId: [
    /employee\s*id/i,
    /emp\s*id/i,
    /employee\s*number/i,
    /emp\s*no/i,
    /staff\s*id/i,
  ],
  employeeName: [
    /employee\s*name/i,
    /emp\s*name/i,
    /full\s*name/i,
    /staff\s*name/i,
    /name/i,
  ],
  email: [
    /email\s*address\s*1/i,
    /primary\s*email/i,
    /email\s*1/i,
    /email/i,
    /mail/i,
    /e-mail/i, // New
    /work\s*email/i, // New
    /contact\s*email/i, // New
    /employee\s*email/i, // New
  ],
  emailAddress2: [
    /email\s*address\s*2/i,
    /secondary\s*email/i,
    /email\s*2/i,
    /alternate\s*email/i,
  ],
  department: [/department/i, /dept/i, /division/i, /section/i],
  designation: [/designation/i, /position/i, /job\s*title/i, /role/i, /post/i],
  phone: [
    /personal\s*contact/i,
    /phone/i,
    /mobile/i,
    /contact/i,
    /cell/i,
    /primary\s*phone/i,
    /phone\s*number/i, // Already matches, but explicit
  ],
  status: [
    /status/i,
    /employee\s*status/i,
    /work\s*status/i,
    /employment\s*status/i,
  ],
  gender: [/sex/i, /gender/i, /male.*female/i],
  dob: [/dob/i, /date\s*of\s*birth/i, /birth\s*date/i, /birthday/i],
  nativePlace: [/native/i, /native\s*place/i, /birth\s*place/i, /hometown/i],
  country: [/country/i, /belong\s*country/i, /nationality/i, /nation/i],
  permanentAddress: [
    /permanent\s*address/i,
    /home\s*address/i,
    /permanent\s*addr/i,
  ],
  currentAddress: [
    /current\s*address/i,
    /present\s*address/i,
    /current\s*addr/i,
    /mailing\s*address/i,
  ],
  alternateNo1: [
    /alt\s*no\.?\s*1/i,
    /alternate\s*number\s*1/i,
    /alternative\s*phone\s*1/i,
    /second\s*phone/i,
  ],
  alternateNo2: [
    /alt\s*no\.?\s*2/i,
    /alternate\s*number\s*2/i,
    /alternative\s*phone\s*2/i,
    /third\s*phone/i,
  ],
  bankName: [/bank\s*name/i, /bank/i, /financial\s*institution/i],
  bankAccountNo: [
    /bank\s*account\s*number/i,
    /account\s*number/i,
    /account\s*no/i,
    /bank\s*acc/i,
  ],
  ifscCode: [/ifsc\s*code/i, /ifsc/i, /bank\s*code/i, /routing\s*number/i],
  shiftType: [/shift\s*type/i, /shift/i, /work\s*shift/i, /duty\s*shift/i],
  inTime: [/in\s*time/i, /start\s*time/i, /check\s*in/i, /entry\s*time/i],
  outTime: [/out\s*time/i, /end\s*time/i, /check\s*out/i, /exit\s*time/i],
  dateOfJoining: [
    /date\s*of\s*joining/i,
    /joining\s*date/i,
    /start\s*date/i,
    /hire\s*date/i,
    /employment\s*date/i,
  ],
  dateOfLeaving: [
    /date\s*of\s*leaving/i,
    /leaving\s*date/i,
    /end\s*date/i,
    /termination\s*date/i,
    /resignation\s*date/i,
  ],
  incrementMonth: [
    /increment\s*month/i,
    /salary\s*increment\s*month/i,
    /raise\s*month/i,
  ],
  yearsOfAgreement: [
    /year.*agreement/i,
    /contract\s*years/i,
    /agreement\s*period/i,
    /bond\s*years/i,
  ],
  bonusAfterYears: [
    /bonus\s*after.*years/i,
    /bonus\s*eligibility/i,
    /bonus\s*years/i,
  ],
  companyName: [/company\s*name/i, /organization/i, /employer/i, /firm/i],
  totalSalary: [
    /total\s*salary/i,
    /gross\s*salary/i,
    /full\s*salary/i,
    /complete\s*salary/i,
  ],
  givenSalary: [
    /given\s*salary/i,
    /net\s*salary/i,
    /take\s*home/i,
    /actual\s*salary/i,
    /paid\s*salary/i,
  ],
  bonusAmount: [/bonus\s*amount/i, /bouns\s*amount/i, /bonus/i, /incentive/i], // 'bouns' typo handled
  nightAllowance: [
    /night\s*allowance/i,
    /night\s*shift\s*allowance/i,
    /night\s*pay/i,
  ],
  overTime: [/over\s*time/i, /overtime/i, /ot/i, /extra\s*hours/i],
  oneHourExtra: [
    /1\s*hour\s*extra/i,
    /one\s*hour\s*extra/i,
    /extra\s*hour/i,
    /additional\s*hour/i,
  ],
  companySimIssue: [
    /company\s*sim\s*issue/i,
    /sim\s*provided/i,
    /company\s*sim/i,
    /mobile\s*sim/i,
  ],
  aadharCardUpload: [
    /aadhar\s*card\s*upload/i,
    /adhar\s*card\s*upload/i,
    /aadhaar\s*upload/i,
    /aadhar\s*file/i,
  ],
  aadharCardNo: [
    /aadhar\s*card\s*number/i,
    /adhar\s*card\s*number/i,
    /aadhaar\s*number/i,
    /aadhar\s*no/i,
  ],
  panCardUpload: [/pan\s*card\s*upload/i, /pan\s*upload/i, /pan\s*file/i],
  passportUpload: [
    /passport\s*upload/i,
    /passport\s*file/i,
    /passport\s*copy/i,
  ],
};

/**
 * Recursively extract all field objects from the recordData structure
 * Handles both flat and nested (sections/subforms) structures
 * @param data - The current data object to traverse
 * @returns Array of field objects {label, value, type?, ...}
 */
function extractFieldsRecursively(data: any): any[] {
  const fields: any[] = [];

  if (!data || typeof data !== 'object') {
    return fields;
  }

  // Flat structure: keys are fieldIds, values are field objects
  if (Object.keys(data).every(key => data[key] && data[key].label && data[key].value !== undefined)) {
    return Object.values(data);
  }

  // Nested structure: look for 'sections' and 'subforms'
  if (data.sections) {
    Object.values(data.sections).forEach((section: any) => {
      if (section.fields) {
        fields.push(...Object.values(section.fields));
      }
    });
  }

  if (data.subforms) {
    Object.values(data.subforms).forEach((subform: any) => {
      if (subform.fields) {
        fields.push(...Object.values(subform.fields));
      }
      // If there are rows (repeatable), process each row recursively
      if (Array.isArray(subform.rows)) {
        subform.rows.forEach((row: any) => {
          fields.push(...extractFieldsRecursively(row));
        });
      }
      // Recurse into child subforms if present
      if (subform.childSubforms) {
        fields.push(...extractFieldsRecursively({ subforms: subform.childSubforms }));
      }
    });
  }

  // General object traversal for any other nested fields
  Object.values(data).forEach((value: any) => {
    if (typeof value === 'object' && value !== null) {
      fields.push(...extractFieldsRecursively(value));
    }
  });

  return fields;
}

/**
 * Dynamically parse employee data from variable JSON structure
 * @param recordData - The dynamic JSON structure from form submission
 * @returns Parsed employee data with standardized field names
 */
export function parseEmployeeData(recordData: any): ParsedEmployeeData {
  const parsed: ParsedEmployeeData = {};

  // Handle null, undefined, or non-object data
  if (!recordData || typeof recordData !== "object") {
    console.warn("Invalid recordData provided:", recordData);
    return parsed;
  }

  try {
    const fields = extractFieldsRecursively(recordData);

    fields.forEach((field: any) => {
      // Skip invalid field structures
      if (
        !field ||
        typeof field !== "object" ||
        !field.label ||
        field.value === undefined
      ) {
        return;
      }

      const label = String(field.label).trim();
      const rawValue = field.value;

      // Skip empty or error values
      if (
        rawValue === null ||
        rawValue === undefined ||
        (typeof rawValue === "string" && (rawValue.trim() === "" || rawValue === "#ERROR!"))
      ) {
        return;
      }

      let value = typeof rawValue === "string" ? rawValue.trim() : rawValue;

      // Match field label against patterns
      for (const [fieldKey, patterns] of Object.entries(FIELD_PATTERNS)) {
        const isMatch = patterns.some((pattern) => pattern.test(label));

        if (isMatch) {
          switch (fieldKey) {
            case "companySimIssue":
              parsed[fieldKey] =
                String(value).toLowerCase() === "yes" ||
                String(value).toLowerCase() === "true";
              break;

            case "dob":
            case "dateOfJoining":
            case "dateOfLeaving":
              if (value && value !== "0000-00-00") {
                parsed[fieldKey] = String(value);
              }
              break;

            case "phone":
            case "alternateNo1":
            case "alternateNo2":
            case "bankAccountNo":
            case "aadharCardNo":
              const cleaned = String(value).replace(/\D/g, "");
              if (cleaned) parsed[fieldKey] = cleaned;
              break;

            case "totalSalary":
            case "givenSalary":
            case "bonusAmount":
            case "nightAllowance":
            case "overTime":
            case "oneHourExtra":
              const numStr = String(value).replace(/[^\d.]/g, "");
              if (numStr && !isNaN(parseFloat(numStr))) {
                parsed[fieldKey] = numStr;
              }
              break;

            case "yearsOfAgreement":
            case "bonusAfterYears":
              const intStr = String(value).replace(/\D/g, "");
              if (intStr && !isNaN(parseInt(intStr, 10))) {
                parsed[fieldKey] = intStr;
              }
              break;

            default:
              parsed[fieldKey] = String(value);
              break;
          }

          // First match wins – prevent overwriting
          break;
        }
      }
    });

    // Final validation & cleanup
    validateAndCleanParsedData(parsed);
  } catch (error) {
    console.error("Error parsing employee data:", error);
  }

  return parsed;
}

/**
 * Validate and clean parsed data
 */
function validateAndCleanParsedData(parsed: ParsedEmployeeData): void {
  // Email validation
  if (parsed.email && !isValidEmail(parsed.email)) {
    console.warn("Invalid email:", parsed.email);
    delete parsed.email;
  }
  if (parsed.emailAddress2 && !isValidEmail(parsed.emailAddress2)) {
    console.warn("Invalid secondary emailAddress2:", parsed.emailAddress2);
    delete parsed.emailAddress2;
  }

  // Phone number length check (min 10 digits for Indian numbers)
  (["phone", "alternateNo1", "alternateNo2"] as const).forEach((key) => {
    const val = parsed[key];
    if (typeof val === "string" && val.length < 10) {
      console.warn(`Too short ${key}:`, val);
      delete parsed[key];
    }
  });

  // Date validation
  (["dob", "dateOfJoining", "dateOfLeaving"] as const).forEach((key) => {
    const val = parsed[key];
    if (typeof val === "string" && !isValidDate(val)) {
      console.warn(`Invalid date in ${key}:`, val);
      delete parsed[key];
    }
  });

  // Warn if name is missing
  if (!parsed.employeeName) {
    console.warn(
      "Missing essential field: employeeName is absent"
    );
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDate(dateString: string): boolean {
  const d = new Date(dateString);
  return (
    d instanceof Date && !isNaN(d.getTime()) && dateString !== "0000-00-00"
  );
}

/**
 * Debug helper – returns which standard fields each label matched
 */
export function getFieldMappingSuggestions(
  recordData: any
): Record<string, string[]> {
  const suggestions: Record<string, string[]> = {};

  if (!recordData || typeof recordData !== "object") return suggestions;

  const fields = extractFieldsRecursively(recordData);

  fields.forEach((field: any) => {
    if (!field?.label) return;

    const label = String(field.label).toString().trim();
    const matches: string[] = [];

    for (const [key, patterns] of Object.entries(FIELD_PATTERNS)) {
      if (patterns.some((p) => p.test(label))) {
        matches.push(key);
      }
    }

    if (matches.length > 0) {
      suggestions[label] = matches;
    }
  });

  return suggestions;
}

/**
 * Debug helper – analyzes how many fields were mapped
 */
export function analyzeRecordDataStructure(recordData: any) {
  const analysis = {
    totalFields: 0,
    mappedFields: 0,
    unmappedFields: [] as string[],
    fieldTypes: {} as Record<string, number>,
  };

  if (!recordData || typeof recordData !== "object") return analysis;

  const fields = extractFieldsRecursively(recordData);

  fields.forEach((field: any) => {
    if (!field?.label) return;

    analysis.totalFields++;
    const label = String(field.label).trim();
    const type = field.type ?? "unknown";

    analysis.fieldTypes[type] = (analysis.fieldTypes[type] ?? 0) + 1;

    const isMapped = Object.values(FIELD_PATTERNS).some((patterns) =>
      patterns.some((p) => p.test(label))
    );

    if (isMapped) {
      analysis.mappedFields++;
    } else {
      analysis.unmappedFields.push(label);
    }
  });

  return analysis;
}