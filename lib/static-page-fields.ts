/**
 * Static-page field registry.
 *
 * Why this exists
 * ---------------
 * Some "modules" in the app aren't backed by a form-builder Form — they're
 * hand-coded React pages (Employee Master, Staffing Plan, Job Application,
 * Properties, Leads, etc.) that read from a domain-specific table. The
 * workflow-rules / system-notification UIs build their field picker from
 * `treeModule.forms[*].fields` — which is empty for those static modules.
 * The picker then shows "Module X has no forms yet" and the admin can't
 * reference any field in their rule.
 *
 * This registry plugs the gap: it lists the canonical fields rendered by
 * each static page so the picker can surface them alongside any dynamic
 * fields the admin has added in the form builder. Synthetic field/form IDs
 * are prefixed with `static:` so callers can recognise and route them
 * correctly (e.g. when fanning out a notification, the value lookup needs
 * to read from the domain table, not from FormRecord).
 *
 * Adding a new static page = one entry in `STATIC_FORMS`. Use `aliases` to
 * accept the same definition under multiple module names (orgs commonly
 * rename modules; matching is case-insensitive).
 */

export interface StaticField {
  /** Stable identifier — used for both `id` (prefixed) and `apiName` (raw). */
  coreKey: string;
  label: string;
  /** Maps to FormField.type values: text / email / phone / number / date / select / textarea / checkbox / time */
  type: string;
}

export interface StaticFormDef {
  /** Primary module name (case-insensitive). */
  moduleName: string;
  /** Other module names that should resolve to the same static form. */
  aliases?: string[];
  /** Synthetic, stable form id surfaced as `formId` on injected fields. */
  formId: string;
  /** Display label for the form picker. */
  formName: string;
  /** Canonical fields the static page renders. */
  fields: StaticField[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Field sets — one constant per domain so they're easy to maintain. Keep the
// coreKey list in sync with each page's form/edit component so {{coreKey}}
// substitution resolves to the right column.
// ─────────────────────────────────────────────────────────────────────────────

const EMPLOYEE_MASTER_FIELDS: StaticField[] = [
  // Identity
  { coreKey: "salutation", label: "Salutation", type: "select" },
  { coreKey: "firstName", label: "First Name", type: "text" },
  { coreKey: "lastName", label: "Last Name", type: "text" },
  { coreKey: "employeeName", label: "Full Name", type: "text" },
  { coreKey: "gender", label: "Gender", type: "select" },
  { coreKey: "status", label: "Status", type: "select" },
  { coreKey: "dob", label: "Date of Birth", type: "date" },
  { coreKey: "nativePlace", label: "Native Place", type: "text" },
  { coreKey: "country", label: "Country", type: "text" },
  // Employment
  { coreKey: "department", label: "Department", type: "text" },
  { coreKey: "designation", label: "Designation", type: "text" },
  { coreKey: "companyName", label: "Company", type: "text" },
  { coreKey: "employeeEngagementTeamName", label: "Engagement Team", type: "text" },
  { coreKey: "dateOfJoining", label: "Date of Joining", type: "date" },
  { coreKey: "dateOfLeaving", label: "Date of Leaving", type: "date" },
  // Contact
  { coreKey: "emailAddress1", label: "Primary Email", type: "email" },
  { coreKey: "emailAddress2", label: "Secondary Email", type: "email" },
  { coreKey: "personalContact", label: "Personal Contact", type: "phone" },
  { coreKey: "alternateNo1", label: "Alternate No. 1", type: "phone" },
  { coreKey: "alternateNo2", label: "Alternate No. 2", type: "phone" },
  // Address
  { coreKey: "permanentAddress", label: "Permanent Address", type: "textarea" },
  { coreKey: "currentAddress", label: "Current Address", type: "textarea" },
  // Shift
  { coreKey: "shiftType", label: "Shift Type", type: "text" },
  { coreKey: "inTime", label: "In Time", type: "time" },
  { coreKey: "outTime", label: "Out Time", type: "time" },
  // Compensation
  { coreKey: "totalSalary", label: "Total Salary", type: "number" },
  { coreKey: "givenSalary", label: "Take-home Salary", type: "number" },
  { coreKey: "bonusAmount", label: "Bonus", type: "number" },
  { coreKey: "nightAllowance", label: "Night Allowance", type: "number" },
  { coreKey: "overTime", label: "Overtime", type: "number" },
  { coreKey: "oneHourExtra", label: "One-Hour Extra", type: "number" },
  { coreKey: "incrementMonth", label: "Increment Month", type: "number" },
  { coreKey: "yearsOfAgreement", label: "Years of Agreement", type: "number" },
  { coreKey: "bonusAfterYears", label: "Bonus After Years", type: "number" },
  // Bank & ID
  { coreKey: "bankName", label: "Bank Name", type: "text" },
  { coreKey: "bankAccountNo", label: "Account Number", type: "text" },
  { coreKey: "ifscCode", label: "IFSC Code", type: "text" },
  { coreKey: "aadharCardNo", label: "Aadhaar Number", type: "text" },
  { coreKey: "companySimIssue", label: "Company SIM Issued", type: "checkbox" },
];

const STAFFING_PLAN_FIELDS: StaticField[] = [
  { coreKey: "planCode", label: "Plan Code", type: "text" },
  { coreKey: "profileName", label: "Profile Name", type: "text" },
  { coreKey: "department", label: "Department", type: "text" },
  { coreKey: "designation", label: "Designation", type: "text" },
  { coreKey: "employmentType", label: "Employment Type", type: "select" },
  { coreKey: "vacancies", label: "Vacancies", type: "number" },
  { coreKey: "estimatedCostPerPerson", label: "Estimated Cost / Person", type: "number" },
  { coreKey: "totalEstimatedCost", label: "Total Estimated Cost", type: "number" },
  { coreKey: "status", label: "Status", type: "select" },
  { coreKey: "notes", label: "Notes", type: "textarea" },
  { coreKey: "createdAt", label: "Created At", type: "date" },
];

const JOB_OPENING_FIELDS: StaticField[] = [
  { coreKey: "jobCode", label: "Job Code", type: "text" },
  { coreKey: "profileName", label: "Profile Name", type: "text" },
  { coreKey: "department", label: "Department", type: "text" },
  { coreKey: "designation", label: "Designation", type: "text" },
  { coreKey: "employmentType", label: "Employment Type", type: "select" },
  { coreKey: "vacancies", label: "Vacancies", type: "number" },
  { coreKey: "status", label: "Status", type: "select" },
  { coreKey: "publishOnWebsite", label: "Publish on Website", type: "checkbox" },
  { coreKey: "salaryApprox", label: "Salary (approx)", type: "text" },
  { coreKey: "jobDescription", label: "Job Description", type: "textarea" },
  { coreKey: "createdAt", label: "Created At", type: "date" },
];

const JOB_APPLICATION_FIELDS: StaticField[] = [
  { coreKey: "applicationCode", label: "Application Code", type: "text" },
  { coreKey: "applicantName", label: "Applicant Name", type: "text" },
  { coreKey: "applicantEmail", label: "Applicant Email", type: "email" },
  { coreKey: "applicantMobile", label: "Applicant Mobile", type: "phone" },
  { coreKey: "applicantSource", label: "Source", type: "select" },
  { coreKey: "applicantResumeUrl", label: "Resume URL", type: "text" },
  { coreKey: "applicantResumeName", label: "Resume File Name", type: "text" },
  { coreKey: "department", label: "Department", type: "text" },
  { coreKey: "designation", label: "Designation", type: "text" },
  { coreKey: "employmentType", label: "Employment Type", type: "select" },
  { coreKey: "salaryExpectation", label: "Salary Expectation", type: "text" },
  { coreKey: "coverLetter", label: "Cover Letter", type: "textarea" },
  { coreKey: "jobDescription", label: "Job Description", type: "textarea" },
  { coreKey: "applicantRating", label: "Applicant Rating", type: "number" },
  { coreKey: "status", label: "Status", type: "select" },
  { coreKey: "createdAt", label: "Applied At", type: "date" },
];

const JOB_OFFER_FIELDS: StaticField[] = [
  { coreKey: "offerCode", label: "Offer Code", type: "text" },
  { coreKey: "applicantName", label: "Applicant Name", type: "text" },
  { coreKey: "applicantEmail", label: "Applicant Email", type: "email" },
  { coreKey: "offerDate", label: "Offer Date", type: "date" },
  { coreKey: "status", label: "Status", type: "select" },
  { coreKey: "jobOfferTerm", label: "Offer Term", type: "text" },
  { coreKey: "valueDescription", label: "Value Description", type: "textarea" },
  { coreKey: "termsAndConditions", label: "Terms & Conditions", type: "textarea" },
  { coreKey: "createdAt", label: "Created At", type: "date" },
];

const APPOINTMENT_LETTER_FIELDS: StaticField[] = [
  { coreKey: "letterCode", label: "Letter Code", type: "text" },
  { coreKey: "applicantName", label: "Applicant Name", type: "text" },
  { coreKey: "applicantEmail", label: "Applicant Email", type: "email" },
  { coreKey: "company", label: "Company", type: "text" },
  { coreKey: "appointmentDate", label: "Appointment Date", type: "date" },
  { coreKey: "templateName", label: "Template", type: "text" },
  { coreKey: "status", label: "Status", type: "select" },
  { coreKey: "title", label: "Title", type: "text" },
  { coreKey: "introduction", label: "Introduction", type: "textarea" },
  { coreKey: "description", label: "Description", type: "textarea" },
  { coreKey: "closingNotes", label: "Closing Notes", type: "textarea" },
  { coreKey: "signed", label: "Signed", type: "checkbox" },
  { coreKey: "signedDate", label: "Signed Date", type: "date" },
  { coreKey: "createdAt", label: "Created At", type: "date" },
];

const EMPLOYEE_REFERRAL_FIELDS: StaticField[] = [
  { coreKey: "referralCode", label: "Referral Code", type: "text" },
  { coreKey: "applicantName", label: "Applicant Name", type: "text" },
  { coreKey: "applicantEmail", label: "Applicant Email", type: "email" },
  { coreKey: "applicantMobile", label: "Applicant Mobile", type: "phone" },
  { coreKey: "applicantResumeUrl", label: "Resume URL", type: "text" },
  { coreKey: "applicantResumeName", label: "Resume File Name", type: "text" },
  { coreKey: "referralDate", label: "Referral Date", type: "date" },
  { coreKey: "designation", label: "Designation", type: "text" },
  { coreKey: "referrerFirstName", label: "Referrer Name", type: "text" },
  { coreKey: "referrerDepartment", label: "Referrer Department", type: "text" },
  { coreKey: "remark", label: "Remark", type: "textarea" },
  { coreKey: "status", label: "Status", type: "select" },
  { coreKey: "createdAt", label: "Created At", type: "date" },
];

const PROPERTY_FIELDS: StaticField[] = [
  { coreKey: "code", label: "Property Code", type: "text" },
  { coreKey: "title", label: "Title", type: "text" },
  { coreKey: "description", label: "Description", type: "textarea" },
  { coreKey: "type", label: "Type", type: "select" },
  { coreKey: "subType", label: "Sub-type", type: "select" },
  { coreKey: "status", label: "Status", type: "select" },
  { coreKey: "addressLine1", label: "Address Line 1", type: "text" },
  { coreKey: "addressLine2", label: "Address Line 2", type: "text" },
  { coreKey: "city", label: "City", type: "text" },
  { coreKey: "state", label: "State", type: "text" },
  { coreKey: "country", label: "Country", type: "text" },
  { coreKey: "postalCode", label: "Postal Code", type: "text" },
  { coreKey: "listingPrice", label: "Listing Price", type: "number" },
  { coreKey: "currency", label: "Currency", type: "text" },
  { coreKey: "area", label: "Area", type: "number" },
  { coreKey: "areaUnit", label: "Area Unit", type: "text" },
  { coreKey: "bedrooms", label: "Bedrooms", type: "number" },
  { coreKey: "bathrooms", label: "Bathrooms", type: "number" },
  { coreKey: "parkingSpots", label: "Parking Spots", type: "number" },
  { coreKey: "yearBuilt", label: "Year Built", type: "number" },
  { coreKey: "commissionTermType", label: "Commission Term Type", type: "select" },
  { coreKey: "commissionPercentage", label: "Commission %", type: "number" },
  { coreKey: "commissionFlatFee", label: "Commission Flat Fee", type: "number" },
  { coreKey: "listedAt", label: "Listed At", type: "date" },
  { coreKey: "expectedClosingAt", label: "Expected Closing", type: "date" },
  { coreKey: "finalClosingAt", label: "Final Closing", type: "date" },
];

const LEAD_FIELDS: StaticField[] = [
  { coreKey: "name", label: "Lead Name", type: "text" },
  { coreKey: "email", label: "Email", type: "email" },
  { coreKey: "phone", label: "Phone", type: "phone" },
  { coreKey: "altPhone", label: "Alternate Phone", type: "phone" },
  { coreKey: "origin", label: "Origin", type: "select" },
  { coreKey: "status", label: "Status", type: "select" },
  { coreKey: "score", label: "Score", type: "select" },
  { coreKey: "source", label: "Source", type: "select" },
  { coreKey: "sourceDetails", label: "Source Details", type: "text" },
  { coreKey: "budgetMin", label: "Budget Min", type: "number" },
  { coreKey: "budgetMax", label: "Budget Max", type: "number" },
  { coreKey: "bedroomsMin", label: "Min Bedrooms", type: "number" },
  { coreKey: "assignedAt", label: "Assigned At", type: "date" },
  { coreKey: "nextFollowUpAt", label: "Next Follow-up", type: "date" },
  { coreKey: "lastContactedAt", label: "Last Contacted", type: "date" },
  { coreKey: "convertedAt", label: "Converted At", type: "date" },
  { coreKey: "lostReason", label: "Lost Reason", type: "text" },
  { coreKey: "notes", label: "Notes", type: "textarea" },
  { coreKey: "createdAt", label: "Created At", type: "date" },
];

const LEAVE_REQUEST_FIELDS: StaticField[] = [
  // Applicant — denormalised onto the request so workflow templates can address
  // the employee directly without joining LeaveRequest.user themselves.
  { coreKey: "applicantName", label: "Applicant Name", type: "text" },
  { coreKey: "applicantEmail", label: "Applicant Email", type: "email" },
  { coreKey: "applicantDepartment", label: "Applicant Department", type: "text" },
  { coreKey: "applicantDesignation", label: "Applicant Designation", type: "text" },
  // Leave dates / duration
  { coreKey: "leaveTypeName", label: "Leave Type", type: "text" },
  { coreKey: "leaveTypeCode", label: "Leave Type Code", type: "text" },
  { coreKey: "startDate", label: "Start Date", type: "date" },
  { coreKey: "endDate", label: "End Date", type: "date" },
  { coreKey: "totalDays", label: "Total Days", type: "number" },
  { coreKey: "duration", label: "Duration (Full/Half)", type: "select" },
  // Request meta
  { coreKey: "reason", label: "Reason", type: "textarea" },
  { coreKey: "attachmentUrl", label: "Attachment URL", type: "text" },
  { coreKey: "isEmergency", label: "Is Emergency", type: "checkbox" },
  // Approval lifecycle
  { coreKey: "status", label: "Status", type: "select" },
  { coreKey: "appliedAt", label: "Applied At", type: "date" },
  { coreKey: "decidedAt", label: "Decided At", type: "date" },
  { coreKey: "decisionNote", label: "Decision Note", type: "textarea" },
  { coreKey: "cancelledAt", label: "Cancelled At", type: "date" },
  { coreKey: "cancelReason", label: "Cancel Reason", type: "textarea" },
  // Early-return ("shorten") flow
  { coreKey: "shortenStatus", label: "Early-Return Status", type: "select" },
  { coreKey: "shortenRequestedEndDate", label: "Early-Return New End Date", type: "date" },
  { coreKey: "shortenRequestedReason", label: "Early-Return Reason", type: "textarea" },
  { coreKey: "shortenDecisionNote", label: "Early-Return Decision Note", type: "textarea" },
  { coreKey: "originalEndDate", label: "Original End Date", type: "date" },
];

const PAYROLL_RECORD_FIELDS: StaticField[] = [
  { coreKey: "employeeId", label: "Employee ID", type: "text" },
  { coreKey: "employeeName", label: "Employee Name", type: "text" },
  { coreKey: "department", label: "Department", type: "text" },
  { coreKey: "designation", label: "Designation", type: "text" },
  { coreKey: "month", label: "Month", type: "text" },
  { coreKey: "year", label: "Year", type: "number" },
  { coreKey: "basicSalary", label: "Basic Salary", type: "number" },
  { coreKey: "totalAllowances", label: "Total Allowances", type: "number" },
  { coreKey: "totalDeductions", label: "Total Deductions", type: "number" },
  { coreKey: "netSalary", label: "Net Salary", type: "number" },
  { coreKey: "daysWorked", label: "Days Worked", type: "number" },
  { coreKey: "daysAbsent", label: "Days Absent", type: "number" },
  { coreKey: "overtimeHours", label: "Overtime Hours", type: "number" },
  { coreKey: "status", label: "Status", type: "select" },
  { coreKey: "paymentDate", label: "Payment Date", type: "date" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export const STATIC_FORMS: StaticFormDef[] = [
  {
    moduleName: "Employee Master",
    aliases: ["Employees", "Employee"],
    formId: "static:employee-master",
    formName: "Employee Master (static)",
    fields: EMPLOYEE_MASTER_FIELDS,
  },
  {
    moduleName: "Staffing Plan",
    aliases: ["Staffing Plans", "Staffing"],
    formId: "static:staffing-plan",
    formName: "Staffing Plan (static)",
    fields: STAFFING_PLAN_FIELDS,
  },
  {
    moduleName: "Job Opening",
    aliases: ["Job Openings", "Openings"],
    formId: "static:job-opening",
    formName: "Job Opening (static)",
    fields: JOB_OPENING_FIELDS,
  },
  {
    moduleName: "Job Application",
    aliases: ["Job Applications", "Applications"],
    formId: "static:job-application",
    formName: "Job Application (static)",
    fields: JOB_APPLICATION_FIELDS,
  },
  {
    moduleName: "Job Offer",
    aliases: ["Job Offers", "Offers"],
    formId: "static:job-offer",
    formName: "Job Offer (static)",
    fields: JOB_OFFER_FIELDS,
  },
  {
    moduleName: "Appointment Letter",
    aliases: ["Appointment Letters", "Letters"],
    formId: "static:appointment-letter",
    formName: "Appointment Letter (static)",
    fields: APPOINTMENT_LETTER_FIELDS,
  },
  {
    moduleName: "Employee Referral",
    aliases: ["Employee Referrals", "Referrals"],
    formId: "static:employee-referral",
    formName: "Employee Referral (static)",
    fields: EMPLOYEE_REFERRAL_FIELDS,
  },
  {
    moduleName: "Properties",
    aliases: ["Property", "Real Estate Properties"],
    formId: "static:property",
    formName: "Property (static)",
    fields: PROPERTY_FIELDS,
  },
  {
    moduleName: "Leads",
    aliases: ["Lead", "Real Estate Leads"],
    formId: "static:lead",
    formName: "Lead (static)",
    fields: LEAD_FIELDS,
  },
  {
    moduleName: "Payroll",
    aliases: ["Payroll Records", "Salary"],
    formId: "static:payroll",
    formName: "Payroll Record (static)",
    fields: PAYROLL_RECORD_FIELDS,
  },
  {
    moduleName: "Leave",
    // Aliases cover both the apply page ("My Leaves") and the approver page
    // ("Leave Approvals"), plus a common misspelling ("Managment") we saw in
    // a real tenant module name, so a workflow rule built from any entry
    // point surfaces the same field set.
    aliases: [
      "Leaves",
      "My Leaves",
      "Leave Management",
      "Leave Managment",
      "Leaves Management",
      "Leaves Managment",
      "Leave Approval",
      "Leave Approvals",
      "Leave Request",
      "Leave Requests",
    ],
    formId: "static:leave-request",
    formName: "Leave Request (static)",
    fields: LEAVE_REQUEST_FIELDS,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Match a module name against an entry's `moduleName` + aliases. Case- and
 * whitespace-insensitive so "employee master ", "Employee Master", and
 * "Employees" all resolve to the same definition.
 */
function matchesModule(def: StaticFormDef, moduleName: string): boolean {
  const target = moduleName.trim().toLowerCase();
  if (def.moduleName.trim().toLowerCase() === target) return true;
  return (def.aliases ?? []).some(
    (a) => a.trim().toLowerCase() === target,
  );
}

/**
 * Look up every static form anchored under a given module name. Returns an
 * empty array for modules without a static page so callers can blindly
 * concat without a nullish check.
 */
export function getStaticFormsForModule(moduleName: string | null | undefined): StaticFormDef[] {
  if (!moduleName) return [];
  return STATIC_FORMS.filter((f) => matchesModule(f, moduleName));
}

/**
 * Flatten the static forms for a module into the same shape `treeModule
 * .forms[*].fields[*]` produces, so workflow-rule pickers can concatenate
 * without bespoke transformation. Synthetic `id` values use the `static:`
 * prefix so consumers can route lookups appropriately.
 */
export interface InjectedField {
  id: string;
  label: string;
  formId: string;
  formName: string;
  apiName: string;
  type: string;
}

export function getStaticFieldsForModule(moduleName: string | null | undefined): InjectedField[] {
  const forms = getStaticFormsForModule(moduleName);
  const out: InjectedField[] = [];
  for (const form of forms) {
    for (const f of form.fields) {
      out.push({
        id: `static:${form.formId.replace(/^static:/, "")}:${f.coreKey}`,
        label: f.label,
        formId: form.formId,
        formName: form.formName,
        apiName: f.coreKey,
        type: f.type,
      });
    }
  }
  return out;
}

export interface InjectedForm {
  id: string;
  name: string;
  isPublished: boolean;
}

export function getStaticFormEntries(moduleName: string | null | undefined): InjectedForm[] {
  return getStaticFormsForModule(moduleName).map((f) => ({
    id: f.formId,
    name: f.formName,
    // Static pages are always "live" — there's no draft/publish state.
    isPublished: true,
  }));
}

/**
 * Module-list helper for module pickers (e.g. the "Create New Rule" dialog).
 * Returns one synthetic module entry per static page so admins can build
 * workflow rules / notifications against pages that aren't backed by a
 * dynamic form. Synthetic ids use the `static-mod:` prefix so callers that
 * care can distinguish them from real `module_id` values.
 */
export interface InjectedModule {
  id: string;
  name: string;
}

export function getStaticModules(): InjectedModule[] {
  return STATIC_FORMS.map((f) => ({
    id: `static-mod:${f.formId.replace(/^static:/, "")}`,
    name: f.moduleName,
  }));
}
