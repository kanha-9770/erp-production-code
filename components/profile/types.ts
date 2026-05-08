/**
 * Shared types for the profile area. Mirrors what /api/auth/me returns.
 * Kept lean — only the fields the profile UI actually reads.
 */

export interface ProfileUser {
  id: string
  email: string
  username: string | null
  first_name: string | null
  last_name: string | null
  email_verified: boolean | null
  status: string
  createdAt: string
  mobile: string | null
  mobile_verified: boolean | null
  avatar: string | null
  department: string | null
  phone: string | null
  location: string | null
  joinDate: string | null
  isAdmin: boolean
  isOrgOwner: boolean
  organization: { id: string; name: string } | null
  unitAssignments: Array<{
    unit: { id: string; name: string }
    role: { id: string; name: string; isAdmin: boolean }
    notes: string | null
  }>
  employee: {
    employeeName?: string | null
    gender?: string | null
    department?: string | null
    designation?: string | null
    dob?: string | null
    nativePlace?: string | null
    country?: string | null
    permanentAddress?: string | null
    currentAddress?: string | null
    personalContact?: string | null
    alternateNo1?: string | null
    alternateNo2?: string | null
    emailAddress1?: string | null
    emailAddress2?: string | null
    aadharCardNo?: string | null
    bankName?: string | null
    bankAccountNo?: string | null
    ifscCode?: string | null
    status?: string | null
    shiftType?: string | null
    inTime?: string | null
    outTime?: string | null
    dateOfJoining?: string | null
    dateOfLeaving?: string | null
    incrementMonth?: string | number | null
    yearsOfAgreement?: number | null
    bonusAfterYears?: number | null
    companyName?: string | null
    employeeEngagementTeamName?: string | null
    totalSalary?: number | null
    givenSalary?: number | null
    bonusAmount?: number | null
    nightAllowance?: number | null
    overTime?: number | null
    oneHourExtra?: number | null
    companySimIssue?: boolean | null
  } | null
}

export type ProfileTabId =
  | "overview"
  | "personal"
  | "employment"
  | "notifications"
  | "preferences"
  | "security"
  | "organization"
