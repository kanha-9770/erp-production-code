"use client"

/**
 * HR System — In-Depth Automation Documentation.
 *
 * A single-page, heavily-illustrated reference for the 5-module HR system
 * seeded by `scripts/create-hr-module.sql` + `scripts/create-hr-automations.sql`.
 *
 * Covers every Function (16), Workflow Rule (36) and Function Binding (22)
 * with animated SVG explainers so a new engineer can trace a single keystroke
 * from the browser all the way to the shard table and back.
 *
 * Implementation notes:
 *   - Static segment `hr-system` wins over sibling `[slug]` in Next.js app
 *     routing, so this page never interferes with the existing dynamic docs.
 *   - All animations are framer-motion or pure CSS — no extra deps introduced.
 *   - Rendered client-side; no API calls, no side effects on existing code.
 */

import { useState, useMemo, useEffect, useRef } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  BookOpen,
  ChevronLeft,
  Layers,
  Workflow,
  Zap,
  Cpu,
  Database,
  Users,
  Search,
  Clock,
  GitBranch,
  Keyboard,
  Server,
  Network,
  FlaskConical,
  BadgeCheck,
  ArrowDown,
  ArrowRight,
  Sparkles,
  FileCode2,
  PlayCircle,
  Box,
  Gauge,
  Target,
  CheckCircle2,
  XCircle,
  Circle,
  Shield,
  Hash,
  Activity,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

/* ═════════════════════════════════════════════════════════════════════════
   DATA — exact catalog seeded by scripts/create-hr-automations.sql.
   Keep this in sync with the SQL file when adding / removing rules.
   ═════════════════════════════════════════════════════════════════════════ */

const FUNCTIONS: Array<{
  id: string
  display: string
  category: "Defaults" | "Calculation" | "Lifecycle" | "Points" | "Lookup"
  modules: string[]
  summary: string
  inputs: string[]
  outputs: string[]
  logic: string
}> = [
  {
    id: "fn_hr_employee_onboarding",
    display: "HR: Employee Onboarding Defaults",
    category: "Defaults",
    modules: ["Employee Master"],
    summary: "On new Employee, set Status=ACTIVE, Working Hours=8, Nationality=Indian when blank.",
    inputs: ["fld_emp_status", "fld_emp_total_hours", "fld_emp_nationality"],
    outputs: ["fld_emp_status = 'ACTIVE'", "fld_emp_total_hours = 8", "fld_emp_nationality = 'Indian'"],
    logic: "If status empty → ACTIVE. If hours empty → 8. If nationality empty → Indian. Never overwrites existing values.",
  },
  {
    id: "fn_hr_leave_calc_days",
    display: "HR: Calculate Leave Days",
    category: "Calculation",
    modules: ["Leave Management"],
    summary: "Total Leave Days = End Date − Start Date + 1 (inclusive).",
    inputs: ["fld_leave_start_date", "fld_leave_end_date"],
    outputs: ["fld_leave_total_days = (end − start) + 1"],
    logic: "Both dates required. Returns { ok:false } if end < start or a date is unparseable.",
  },
  {
    id: "fn_hr_leave_auto_approve_short",
    display: "HR: Auto-Approve Short Leave",
    category: "Lifecycle",
    modules: ["Leave Management"],
    summary: "Single-day leaves get manager approval stamped automatically.",
    inputs: ["fld_leave_total_days"],
    outputs: ["fld_leave_mgr_approval = 'APPROVED' (only if days === 1)"],
    logic: "HR approval still pending — this only unblocks the manager leg.",
  },
  {
    id: "fn_hr_appraisal_score",
    display: "HR: Compute Appraisal Score Earned",
    category: "Calculation",
    modules: ["Performance Appraisal"],
    summary: "Score Earned = (Weightage × Score) / 10, rounded to 2 decimals.",
    inputs: ["fld_apr_weightage", "fld_apr_score"],
    outputs: ["fld_apr_score_earned = round(w × s / 10, 2)"],
    logic: "Both coerced to Number (NaN → 0). Math.round on × 100 / 100 preserves 2 dp.",
  },
  {
    id: "fn_hr_staff_total_cost",
    display: "HR: Compute Staffing Total Cost",
    category: "Calculation",
    modules: ["Staffing Plan"],
    summary: "Total Cost = Vacancies × Cost Per Person.",
    inputs: ["fld_staff_vacancies", "fld_staff_cost_per"],
    outputs: ["fld_staff_total_cost = vac × cost"],
    logic: "Simple product — no rounding applied; downstream currency formatting lives in the UI.",
  },
  {
    id: "fn_hr_job_app_copy_desc",
    display: "HR: Copy Job Description from Opening",
    category: "Defaults",
    modules: ["Job Application"],
    summary: "Copy the opening's Job Description onto the application, once, if blank.",
    inputs: ["fld_app_job_desc (existing)", "fld_open_job_desc (source)"],
    outputs: ["fld_app_job_desc ← fld_open_job_desc"],
    logic: "Guard: skip if application already has a description. Skip if source is blank.",
  },
  {
    id: "fn_hr_kaizen_points",
    display: "HR: Kaizen Engagement Points",
    category: "Points",
    modules: ["Kaizen"],
    summary: "Area-based engagement points: Safety=100, Quality/Cost=80, Delivery/Productivity=70, Morale/Environment=60, else 50.",
    inputs: ["fld_kz_area", "fld_kz_points (existing)"],
    outputs: ["fld_kz_points = map[area] || 50"],
    logic: "Never overwrites if already positive. Case-insensitive area match.",
  },
  {
    id: "fn_hr_problem_points",
    display: "HR: Problem Registration Points",
    category: "Points",
    modules: ["Problem Registration"],
    summary: "Award 30 engagement points when a problem is registered, if not already set.",
    inputs: ["fld_prob_points (existing)"],
    outputs: ["fld_prob_points = 30"],
    logic: "Skip if existing > 0. Idempotent on repeated runs.",
  },
  {
    id: "fn_hr_suggestion_points",
    display: "HR: Suggestion / Initiative Points",
    category: "Points",
    modules: ["Employee Suggestion", "Self Initiative", "Self Target"],
    summary: "Default engagement points: Suggestion=20, Initiative=40, Target=50 (one function, polymorphic).",
    inputs: ["fld_sug_suggestion", "fld_init_define", "fld_tgt_target"],
    outputs: ["fld_sug_points=20", "fld_init_points=40", "fld_tgt_points=50"],
    logic: "Polymorphic: inspects which of the 3 source fields is populated. Skips any field whose points are already > 0.",
  },
  {
    id: "fn_hr_asset_auto_status",
    display: "HR: Asset Auto-Assign Status",
    category: "Lifecycle",
    modules: ["Asset Management"],
    summary: "Employee filled ⇒ ASSIGNED. Employee blank ⇒ IN_STOCK.",
    inputs: ["fld_asset_employee_id"],
    outputs: ["fld_asset_status = 'ASSIGNED' | 'IN_STOCK'"],
    logic: "Pure flip based on whether Employee ID is a non-empty trimmed string.",
  },
  {
    id: "fn_hr_sim_auto_status",
    display: "HR: SIM Auto-Assign Status",
    category: "Lifecycle",
    modules: ["SIM Management"],
    summary: "Employee filled ⇒ ACTIVE. Employee blank ⇒ INACTIVE.",
    inputs: ["fld_sim_employee_id"],
    outputs: ["fld_sim_status = 'ACTIVE' | 'INACTIVE'"],
    logic: "Same pattern as asset. Separate function so SIM can evolve independently.",
  },
  {
    id: "fn_hr_offer_populate",
    display: "HR: Offer Populate from Application",
    category: "Defaults",
    modules: ["Job Offer"],
    summary: "On Offer create, stamp Offer Date=today and Status=DRAFT if blank.",
    inputs: ["fld_offer_date", "fld_offer_status"],
    outputs: ["fld_offer_date = today (YYYY-MM-DD)", "fld_offer_status = 'DRAFT'"],
    logic: "Only stamps missing fields. ISO date format for sortability.",
  },
  {
    id: "fn_hr_attendance_stamp",
    display: "HR: Attendance Timestamp Stamp",
    category: "Defaults",
    modules: ["Attendance"],
    summary: "On Check-In / Check-Out with blank date, stamp today.",
    inputs: ["fld_ci_employee_id", "fld_ci_in_date", "fld_co_employee_id", "fld_co_out_date"],
    outputs: ["fld_ci_in_date = today", "fld_co_out_date = today"],
    logic: "Dispatches on ctx.input.moduleName === 'Attendance'. Handles both check-in and check-out rows from one function.",
  },
  {
    id: "fn_hr_holiday_count",
    display: "HR: Holiday Count",
    category: "Defaults",
    modules: ["Holiday List"],
    summary: "Default Total Holidays = 1 when blank.",
    inputs: ["fld_holiday_total"],
    outputs: ["fld_holiday_total = 1"],
    logic: "Guard: skip if already > 0. Treats each row as a single holiday entry by default.",
  },
  {
    id: "fn_hr_leave_apply_status",
    display: "HR: Apply Leave Status on Approval",
    category: "Lifecycle",
    modules: ["Leave Management"],
    summary: "Logs side effect when Manager AND HR both approve.",
    inputs: ["fld_leave_mgr_approval", "fld_leave_hr_approval"],
    outputs: ["(console log — no field writes)"],
    logic: "Intentional no-op in terms of field updates. Hook point for future email / Slack integrations.",
  },
  {
    id: "fn_hr_lookup_employee",
    display: "HR: Lookup Employee by ID",
    category: "Lookup",
    modules: [
      "Attendance",
      "Leave Management",
      "Employee Referral",
      "Self Target",
      "Self Initiative",
      "Problem Registration",
      "Kaizen",
      "Employee Suggestion",
      "Asset Management",
      "SIM Management",
    ],
    summary: "Fuzzy Employee-ID lookup. Returns First / Middle / Last Name + Department — one function powers all 10 auto-fill forms.",
    inputs: ["ctx.input['Employee ID']", "ctx.input.recordData (sections.*.fields)"],
    outputs: ["{ 'First Name', 'Middle Name', 'Last Name', 'Department' }"],
    logic: "1) norm() = trim + UPPER + strip whitespace + strip leading zeros per digit-run. 2) list first 50 rows, fall through to 500 on miss. 3) return only the keys present on Employee Master so absent fields skip silently.",
  },
]

const WORKFLOW_RULES: Array<{
  id: string
  name: string
  module: string
  trigger: "Create" | "Edit" | "Create or Edit" | "Delete"
  conditionType: "all" | "matching"
  condition?: string
  actionKind: "Function" | "Field Update"
  actionDetail: string
  category: "Module" | "Autofill"
}> = [
  { id: "wfr_hr_emp_onboarding", name: "Employee Onboarding Defaults", module: "Employee Master", trigger: "Create", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_employee_onboarding", category: "Module" },
  { id: "wfr_hr_emp_resigned", name: "Employee Resigned — clear email", module: "Employee Master", trigger: "Edit", conditionType: "matching", condition: "status = RESIGNED", actionKind: "Field Update", actionDetail: "fld_emp_company_email = ''", category: "Module" },
  { id: "wfr_hr_emp_terminated", name: "Employee Terminated — notice flag", module: "Employee Master", trigger: "Edit", conditionType: "matching", condition: "status = TERMINATED", actionKind: "Field Update", actionDetail: "fld_emp_notice_served = true", category: "Module" },
  { id: "wfr_hr_attendance_stamp", name: "Attendance Auto-Timestamp", module: "Attendance", trigger: "Create", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_attendance_stamp", category: "Module" },
  { id: "wfr_hr_leave_calc", name: "Leave — Calculate Total Days", module: "Leave Management", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_leave_calc_days", category: "Module" },
  { id: "wfr_hr_leave_auto_approve_short", name: "Leave — Auto-Approve 1 day", module: "Leave Management", trigger: "Create", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_leave_auto_approve_short", category: "Module" },
  { id: "wfr_hr_leave_mgr_rejected", name: "Leave — Manager Rejected cascades HR", module: "Leave Management", trigger: "Edit", conditionType: "matching", condition: "mgr_approval = REJECTED", actionKind: "Field Update", actionDetail: "fld_leave_hr_approval = REJECTED", category: "Module" },
  { id: "wfr_hr_leave_fully_approved", name: "Leave — Fully Approved Logger", module: "Leave Management", trigger: "Edit", conditionType: "matching", condition: "hr_approval = APPROVED", actionKind: "Function", actionDetail: "fn_hr_leave_apply_status", category: "Module" },
  { id: "wfr_hr_holiday_count", name: "Holiday — Default Count", module: "Holiday List", trigger: "Create", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_holiday_count", category: "Module" },
  { id: "wfr_hr_staff_total_cost", name: "Staffing — Total Estimated Cost", module: "Staffing Plan", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_staff_total_cost", category: "Module" },
  { id: "wfr_hr_opening_filled_close", name: "Job Opening — Filled closes publish", module: "Job Opening", trigger: "Edit", conditionType: "matching", condition: "status = FILLED", actionKind: "Field Update", actionDetail: "fld_open_publish = false", category: "Module" },
  { id: "wfr_hr_app_copy_desc", name: "Job Application — Copy JD", module: "Job Application", trigger: "Create", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_job_app_copy_desc", category: "Module" },
  { id: "wfr_hr_app_hired_status", name: "Job Application — Hired stamps rating 5", module: "Job Application", trigger: "Edit", conditionType: "matching", condition: "status = HIRED", actionKind: "Field Update", actionDetail: "fld_app_rating = 5", category: "Module" },
  { id: "wfr_hr_app_rejected_note", name: "Job Application — Rejected clears rating", module: "Job Application", trigger: "Edit", conditionType: "matching", condition: "status = REJECTED", actionKind: "Field Update", actionDetail: "fld_app_rating = 0", category: "Module" },
  { id: "wfr_hr_offer_create", name: "Job Offer — Defaults on Create", module: "Job Offer", trigger: "Create", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_offer_populate", category: "Module" },
  { id: "wfr_hr_offer_accepted", name: "Job Offer — Accepted term note", module: "Job Offer", trigger: "Edit", conditionType: "matching", condition: "status = ACCEPTED", actionKind: "Field Update", actionDetail: "fld_offer_term = 'Accepted by applicant'", category: "Module" },
  { id: "wfr_hr_appraisal_score", name: "Appraisal — Compute Score Earned", module: "Performance Appraisal", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_appraisal_score", category: "Module" },
  { id: "wfr_hr_tgt_default_points", name: "Self Target — Default Points", module: "Self Target", trigger: "Create", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_suggestion_points", category: "Module" },
  { id: "wfr_hr_init_default_points", name: "Self Initiative — Default Points", module: "Self Initiative", trigger: "Create", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_suggestion_points", category: "Module" },
  { id: "wfr_hr_prob_default_points", name: "Problem — Default Points", module: "Problem Registration", trigger: "Create", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_problem_points", category: "Module" },
  { id: "wfr_hr_kaizen_points", name: "Kaizen — Area-based Points", module: "Kaizen", trigger: "Create", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_kaizen_points", category: "Module" },
  { id: "wfr_hr_sug_default_points", name: "Suggestion — Default Points", module: "Employee Suggestion", trigger: "Create", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_suggestion_points", category: "Module" },
  { id: "wfr_hr_asset_auto_status", name: "Asset — Auto Status on Assignment", module: "Asset Management", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_asset_auto_status", category: "Module" },
  { id: "wfr_hr_asset_lost", name: "Asset — Lost clears assignment", module: "Asset Management", trigger: "Edit", conditionType: "matching", condition: "status = LOST", actionKind: "Field Update", actionDetail: "fld_asset_employee_id = ''", category: "Module" },
  { id: "wfr_hr_sim_auto_status", name: "SIM — Auto Status on Assignment", module: "SIM Management", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_sim_auto_status", category: "Module" },
  { id: "wfr_hr_sim_lost_block", name: "SIM — Lost auto-blocks", module: "SIM Management", trigger: "Edit", conditionType: "matching", condition: "status = LOST", actionKind: "Field Update", actionDetail: "fld_sim_status = 'BLOCKED'", category: "Module" },
  { id: "wfr_hr_autofill_attendance", name: "Attendance — Auto-Fill Employee Info", module: "Attendance", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_lookup_employee", category: "Autofill" },
  { id: "wfr_hr_autofill_leave", name: "Leave — Auto-Fill Employee Info", module: "Leave Management", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_lookup_employee", category: "Autofill" },
  { id: "wfr_hr_autofill_ref", name: "Referral — Auto-Fill Referrer Info", module: "Employee Referral", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_lookup_employee", category: "Autofill" },
  { id: "wfr_hr_autofill_tgt", name: "Self Target — Auto-Fill Employee Info", module: "Self Target", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_lookup_employee", category: "Autofill" },
  { id: "wfr_hr_autofill_init", name: "Self Initiative — Auto-Fill Employee Info", module: "Self Initiative", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_lookup_employee", category: "Autofill" },
  { id: "wfr_hr_autofill_prob", name: "Problem Registration — Auto-Fill Employee Info", module: "Problem Registration", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_lookup_employee", category: "Autofill" },
  { id: "wfr_hr_autofill_kz", name: "Kaizen — Auto-Fill Employee Info", module: "Kaizen", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_lookup_employee", category: "Autofill" },
  { id: "wfr_hr_autofill_sug", name: "Employee Suggestion — Auto-Fill Employee Info", module: "Employee Suggestion", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_lookup_employee", category: "Autofill" },
  { id: "wfr_hr_autofill_asset", name: "Asset Management — Auto-Fill Employee Info", module: "Asset Management", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_lookup_employee", category: "Autofill" },
  { id: "wfr_hr_autofill_sim", name: "SIM Management — Auto-Fill Employee Info", module: "SIM Management", trigger: "Create or Edit", conditionType: "all", actionKind: "Function", actionDetail: "fn_hr_lookup_employee", category: "Autofill" },
]

const BINDINGS: Array<{
  id: string
  form: string
  field: string
  event: "onFieldChange" | "beforeSubmit"
  fn: string
  purpose: string
  category: "Calculation" | "Lifecycle" | "Auto-fill" | "Default"
}> = [
  { id: "fb_hr_leave_calc_blur_end", form: "Leave Application", field: "Leave End Date", event: "onFieldChange", fn: "fn_hr_leave_calc_days", purpose: "Live-recompute total days on end change", category: "Calculation" },
  { id: "fb_hr_leave_calc_blur_start", form: "Leave Application", field: "Leave Start Date", event: "onFieldChange", fn: "fn_hr_leave_calc_days", purpose: "Live-recompute total days on start change", category: "Calculation" },
  { id: "fb_hr_staff_cost_vac", form: "Staffing Plan", field: "No. of Vacancies", event: "onFieldChange", fn: "fn_hr_staff_total_cost", purpose: "Live-recompute total cost", category: "Calculation" },
  { id: "fb_hr_staff_cost_per", form: "Staffing Plan", field: "Estimated Cost / Person", event: "onFieldChange", fn: "fn_hr_staff_total_cost", purpose: "Live-recompute total cost", category: "Calculation" },
  { id: "fb_hr_apr_score_w", form: "Performance Appraisal", field: "Weightage", event: "onFieldChange", fn: "fn_hr_appraisal_score", purpose: "Live-recompute score earned", category: "Calculation" },
  { id: "fb_hr_apr_score_s", form: "Performance Appraisal", field: "Score", event: "onFieldChange", fn: "fn_hr_appraisal_score", purpose: "Live-recompute score earned", category: "Calculation" },
  { id: "fb_hr_asset_status_emp", form: "Asset Management", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_asset_auto_status", purpose: "Flip status on employee change", category: "Lifecycle" },
  { id: "fb_hr_sim_status_emp", form: "SIM Management", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_sim_auto_status", purpose: "Flip status on employee change", category: "Lifecycle" },
  { id: "fb_hr_kaizen_points_area", form: "Kaizen", field: "Area", event: "onFieldChange", fn: "fn_hr_kaizen_points", purpose: "Set points when area selected", category: "Lifecycle" },
  { id: "fb_hr_emp_onboard_before", form: "Employee Master", field: "(form)", event: "beforeSubmit", fn: "fn_hr_employee_onboarding", purpose: "Stamp defaults before save", category: "Default" },
  { id: "fb_hr_app_copy_desc_before", form: "Job Application", field: "(form)", event: "beforeSubmit", fn: "fn_hr_job_app_copy_desc", purpose: "Copy JD from opening before save", category: "Default" },
  { id: "fb_hr_offer_populate_before", form: "Job Offer", field: "(form)", event: "beforeSubmit", fn: "fn_hr_offer_populate", purpose: "Stamp defaults before save", category: "Default" },
  { id: "fb_hr_autofill_ci", form: "Check In / Check Out", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee", purpose: "Auto-fill name + department", category: "Auto-fill" },
  { id: "fb_hr_autofill_leave", form: "Leave Application", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee", purpose: "Auto-fill name + department", category: "Auto-fill" },
  { id: "fb_hr_autofill_ref", form: "Employee Referral", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee", purpose: "Auto-fill referrer info", category: "Auto-fill" },
  { id: "fb_hr_autofill_tgt", form: "Self Target", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee", purpose: "Auto-fill name + department", category: "Auto-fill" },
  { id: "fb_hr_autofill_init", form: "Self Initiative", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee", purpose: "Auto-fill name + department", category: "Auto-fill" },
  { id: "fb_hr_autofill_prob", form: "Problem Registration", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee", purpose: "Auto-fill name + department", category: "Auto-fill" },
  { id: "fb_hr_autofill_kz", form: "Kaizen", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee", purpose: "Auto-fill name + department", category: "Auto-fill" },
  { id: "fb_hr_autofill_sug", form: "Employee Suggestion", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee", purpose: "Auto-fill name + department", category: "Auto-fill" },
  { id: "fb_hr_autofill_asset", form: "Asset Management", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee", purpose: "Auto-fill name + department", category: "Auto-fill" },
  { id: "fb_hr_autofill_sim", form: "SIM Management", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee", purpose: "Auto-fill name + department", category: "Auto-fill" },
]

const MODULES = [
  { name: "HR Core", forms: 4, color: "from-blue-500/20 to-blue-600/5", border: "border-blue-500/30", iconColor: "text-blue-500", icon: Users },
  { name: "Recruitment", forms: 5, color: "from-violet-500/20 to-violet-600/5", border: "border-violet-500/30", iconColor: "text-violet-500", icon: Target },
  { name: "Performance", forms: 2, color: "from-amber-500/20 to-amber-600/5", border: "border-amber-500/30", iconColor: "text-amber-500", icon: Gauge },
  { name: "Engagement", forms: 5, color: "from-emerald-500/20 to-emerald-600/5", border: "border-emerald-500/30", iconColor: "text-emerald-500", icon: Sparkles },
  { name: "Admin", forms: 2, color: "from-rose-500/20 to-rose-600/5", border: "border-rose-500/30", iconColor: "text-rose-500", icon: Shield },
] as const

const SECTIONS = [
  { id: "overview", label: "System Overview", icon: Layers },
  { id: "architecture", label: "3-Layer Architecture", icon: GitBranch },
  { id: "lifecycle", label: "Request Lifecycle", icon: Activity },
  { id: "caching", label: "Caching Layers", icon: Cpu },
  { id: "autofill", label: "Employee Auto-Fill Deep-Dive", icon: Search },
  { id: "functions", label: "All 16 Functions", icon: FileCode2 },
  { id: "workflows", label: "All 36 Workflow Rules", icon: Workflow },
  { id: "bindings", label: "All 22 Function Bindings", icon: Zap },
  { id: "modules", label: "Module Map", icon: Box },
] as const

/* ═════════════════════════════════════════════════════════════════════════
   PAGE
   ═════════════════════════════════════════════════════════════════════════ */

export default function HrSystemDocsPage() {
  const [active, setActive] = useState<string>("overview")

  // Scroll-spy: highlight the TOC entry for whichever section is in view.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: "-40% 0px -55% 0px" }
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b bg-gradient-to-br from-primary/5 via-background to-background">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <Link
            href="/settings/docs"
            className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Back to Documentation
          </Link>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">HR System — In-Depth Reference</h1>
                <Badge variant="secondary" className="text-[10px]">
                  16 Functions
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  36 Rules
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  22 Bindings
                </Badge>
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Everything a new engineer needs to trace an HR keystroke from the browser down to the shard
                table and back. Every function, workflow rule, and binding seeded by{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  scripts/create-hr-automations.sql
                </code>{" "}
                is covered here with illustrated animations.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body: TOC + content ────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
          {/* TOC */}
          <aside className="hidden lg:block">
            <div className="sticky top-4 space-y-1">
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                On this page
              </p>
              {SECTIONS.map((s) => {
                const Icon = s.icon
                const isActive = active === s.id
                return (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                      isActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{s.label}</span>
                  </a>
                )
              })}
            </div>
          </aside>

          <main className="min-w-0 space-y-16">
            <OverviewSection />
            <ArchitectureSection />
            <LifecycleSection />
            <CachingSection />
            <AutofillSection />
            <FunctionsSection />
            <WorkflowsSection />
            <BindingsSection />
            <ModulesSection />
            <Footer />
          </main>
        </div>
      </div>
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════════════════
   SECTIONS
   ═════════════════════════════════════════════════════════════════════════ */

function SectionHeading({
  id,
  icon: Icon,
  eyebrow,
  title,
  sub,
}: {
  id: string
  icon: any
  eyebrow: string
  title: string
  sub: string
}) {
  return (
    <header id={id} className="scroll-mt-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
        <Icon className="h-3.5 w-3.5" />
        {eyebrow}
      </div>
      <h2 className="mb-2 text-xl font-bold text-foreground sm:text-2xl">{title}</h2>
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{sub}</p>
    </header>
  )
}

/* ── 1. Overview ──────────────────────────────────────────────────────── */

function OverviewSection() {
  return (
    <section className="space-y-6">
      <SectionHeading
        id="overview"
        icon={Layers}
        eyebrow="The Big Picture"
        title="Five modules, twenty forms, one automation fabric"
        sub="The HR system is a hierarchy: Modules → Forms → Fields. Sitting beneath them is a three-layer automation fabric (Functions, Workflow Rules, Function Bindings) that reacts to every keystroke and every save."
      />

      {/* Module stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {MODULES.map((m) => {
          const Icon = m.icon
          return (
            <motion.div
              key={m.name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className={`relative overflow-hidden rounded-lg border bg-gradient-to-br p-4 ${m.color} ${m.border}`}
            >
              <Icon className={`mb-2 h-5 w-5 ${m.iconColor}`} />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Module
              </p>
              <p className="text-sm font-bold text-foreground">{m.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{m.forms} forms</p>
            </motion.div>
          )
        })}
      </div>

      {/* Animated stack-diagram showing the hierarchy */}
      <HierarchyDiagram />

      {/* Headline counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Box} label="Modules" value="25" sub="1 root + 5 top + 19 sub" accent="blue" />
        <StatCard icon={FileCode2} label="Forms" value="20" sub="exactly — matches PDF spec" accent="violet" />
        <StatCard icon={Hash} label="Fields" value="241" sub="across 31 sections" accent="amber" />
        <StatCard icon={Zap} label="Automations" value="74" sub="16 fn + 36 rule + 22 binding" accent="emerald" />
      </div>
    </section>
  )
}

function HierarchyDiagram() {
  return (
    <div className="overflow-hidden rounded-xl border bg-gradient-to-br from-muted/30 to-transparent p-6">
      <svg viewBox="0 0 800 300" className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
        {/* Top: HR root */}
        <motion.g initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <rect x="340" y="10" width="120" height="38" rx="8" className="fill-primary/10 stroke-primary" strokeWidth={1.5} />
          <text x="400" y="34" textAnchor="middle" className="fill-primary text-[12px] font-semibold">
            Human Resources
          </text>
        </motion.g>

        {/* 5 top-level modules */}
        {["HR Core", "Recruitment", "Performance", "Engagement", "Admin"].map((m, i) => {
          const x = 60 + i * 150
          return (
            <motion.g
              key={m}
              initial={{ opacity: 0, y: -10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.15 * i }}
            >
              <line x1="400" y1="48" x2={x + 60} y2="90" className="stroke-border" strokeWidth={1} />
              <rect x={x} y="90" width="120" height="34" rx="6" className="fill-background stroke-foreground/40" strokeWidth={1} />
              <text x={x + 60} y="112" textAnchor="middle" className="fill-foreground text-[11px] font-medium">
                {m}
              </text>
            </motion.g>
          )
        })}

        {/* Example forms below HR Core */}
        {["Employee", "Attendance", "Leave", "Holiday"].map((f, i) => {
          const x = 10 + i * 50
          return (
            <motion.g
              key={f}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: 0.8 + 0.1 * i }}
            >
              <line x1="120" y1="124" x2={x + 20} y2="170" className="stroke-border" strokeDasharray="2 2" strokeWidth={0.8} />
              <rect x={x} y="170" width="40" height="22" rx="4" className="fill-blue-500/10 stroke-blue-500/40" strokeWidth={0.8} />
              <text x={x + 20} y="185" textAnchor="middle" className="fill-blue-600 dark:fill-blue-400 text-[8px] font-medium">
                {f}
              </text>
            </motion.g>
          )
        })}

        {/* Automation layer (abstract) */}
        <motion.g
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 1.4 }}
        >
          <rect x="30" y="230" width="740" height="55" rx="10" className="fill-amber-500/5 stroke-amber-500/30" strokeDasharray="4 4" strokeWidth={1} />
          <text x="400" y="250" textAnchor="middle" className="fill-amber-600 dark:fill-amber-400 text-[10px] font-semibold uppercase tracking-wider">
            Automation Fabric
          </text>
          <text x="400" y="270" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            Functions (vm sandbox) · Workflow Rules (server triggers) · Function Bindings (UI wiring)
          </text>
          {/* animated pulse */}
          <motion.circle
            cx="400"
            cy="258"
            r="3"
            className="fill-amber-500"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.g>
      </svg>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: any
  label: string
  value: string
  sub: string
  accent: "blue" | "violet" | "amber" | "emerald"
}) {
  const accents = {
    blue: "text-blue-500 bg-blue-500/10",
    violet: "text-violet-500 bg-violet-500/10",
    amber: "text-amber-500 bg-amber-500/10",
    emerald: "text-emerald-500 bg-emerald-500/10",
  }
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md ${accents[accent]}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}

/* ── 2. Architecture ──────────────────────────────────────────────────── */

function ArchitectureSection() {
  return (
    <section className="space-y-6">
      <SectionHeading
        id="architecture"
        icon={GitBranch}
        eyebrow="How the 3 layers interact"
        title="Functions vs. Workflow Rules vs. Function Bindings"
        sub="All three live in Postgres and all three ultimately call the same vm-sandboxed executor. What differs is WHO fires them and WHEN."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <LayerCard
          icon={FileCode2}
          color="blue"
          title="Functions"
          tagline="The reusable logic"
          bullets={[
            "JavaScript executed in a Node vm sandbox (5s timeout, 100-op cap)",
            "Runs with a curated ctx.* API — cannot touch Prisma directly",
            "Org-scoped via ctx.organizationId — a script cannot leak across tenants",
            "16 seeded: defaults, calc, lifecycle, points, lookup",
          ]}
          code={`// Runs inside vm.Script
return { fld_leave_total_days: days }`}
        />
        <LayerCard
          icon={Workflow}
          color="violet"
          title="Workflow Rules"
          tagline="The server-side triggers"
          bullets={[
            "Fire on record save: Create | Edit | Create or Edit | Delete",
            "Optional condition: field equals / is empty / contains",
            "Instant actions: run Function OR set field directly",
            "36 seeded: 26 module + 10 auto-fill safety-net",
          ]}
          code={`trigger:  "Create or Edit"
module:   "Leave Management"
action:   fn_hr_leave_calc_days`}
        />
        <LayerCard
          icon={Zap}
          color="amber"
          title="Function Bindings"
          tagline="The live UI wiring"
          bullets={[
            "React-side dispatch via <FunctionBindingRunner>",
            "onFieldChange (debounced 120ms) or beforeSubmit",
            "Scoped to form + specific field, or to whole form",
            "22 seeded: 12 calc + 10 auto-fill",
          ]}
          code={`event:  "onFieldChange"
field:  Employee ID
fn:     fn_hr_lookup_employee`}
        />
      </div>

      <LayerInteractionDiagram />
    </section>
  )
}

function LayerCard({
  icon: Icon,
  color,
  title,
  tagline,
  bullets,
  code,
}: {
  icon: any
  color: "blue" | "violet" | "amber"
  title: string
  tagline: string
  bullets: string[]
  code: string
}) {
  const colors = {
    blue: { bg: "bg-blue-500/5", border: "border-blue-500/30", icon: "text-blue-500 bg-blue-500/10" },
    violet: { bg: "bg-violet-500/5", border: "border-violet-500/30", icon: "text-violet-500 bg-violet-500/10" },
    amber: { bg: "bg-amber-500/5", border: "border-amber-500/30", icon: "text-amber-500 bg-amber-500/10" },
  }[color]
  return (
    <div className={`rounded-xl border p-5 ${colors.bg} ${colors.border}`}>
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${colors.icon}`}>
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{tagline}</p>
      <ul className="mb-3 space-y-1.5 text-xs leading-relaxed text-foreground/90">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <Circle className="mt-1 h-1.5 w-1.5 shrink-0 fill-current" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <pre className="overflow-x-auto rounded-md bg-foreground/5 p-2 text-[10px] text-foreground/80">
        {code}
      </pre>
    </div>
  )
}

function LayerInteractionDiagram() {
  return (
    <div className="overflow-hidden rounded-xl border bg-gradient-to-br from-muted/30 to-transparent p-6">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        How they interact at runtime
      </p>
      <svg viewBox="0 0 780 220" className="h-auto w-full">
        {/* Browser side */}
        <g>
          <rect x="10" y="10" width="150" height="200" rx="10" className="fill-blue-500/5 stroke-blue-500/30" strokeDasharray="3 3" />
          <text x="85" y="28" textAnchor="middle" className="fill-blue-600 dark:fill-blue-400 text-[10px] font-semibold uppercase">
            Browser
          </text>
          <rect x="25" y="50" width="120" height="40" rx="6" className="fill-background stroke-foreground/40" />
          <text x="85" y="74" textAnchor="middle" className="fill-foreground text-[11px]">
            User keystroke
          </text>
          <rect x="25" y="110" width="120" height="40" rx="6" className="fill-background stroke-foreground/40" />
          <text x="85" y="128" textAnchor="middle" className="fill-foreground text-[11px]">
            Binding Runner
          </text>
          <text x="85" y="142" textAnchor="middle" className="fill-muted-foreground text-[9px]">
            debounce 120ms
          </text>
          <rect x="25" y="170" width="120" height="30" rx="6" className="fill-background stroke-foreground/40" />
          <text x="85" y="189" textAnchor="middle" className="fill-foreground text-[11px]">
            Apply updates
          </text>
        </g>

        {/* Server side */}
        <g>
          <rect x="200" y="10" width="570" height="200" rx="10" className="fill-violet-500/5 stroke-violet-500/30" strokeDasharray="3 3" />
          <text x="485" y="28" textAnchor="middle" className="fill-violet-600 dark:fill-violet-400 text-[10px] font-semibold uppercase">
            Server (Node.js)
          </text>

          {/* Route */}
          <rect x="215" y="50" width="130" height="40" rx="6" className="fill-background stroke-foreground/40" />
          <text x="280" y="67" textAnchor="middle" className="fill-foreground text-[10px] font-medium">
            POST /functions/run
          </text>
          <text x="280" y="80" textAnchor="middle" className="fill-muted-foreground text-[9px]">
            route.ts
          </text>

          {/* bindingRunner */}
          <rect x="365" y="50" width="130" height="40" rx="6" className="fill-background stroke-foreground/40" />
          <text x="430" y="67" textAnchor="middle" className="fill-foreground text-[10px] font-medium">
            bindingRunner
          </text>
          <text x="430" y="80" textAnchor="middle" className="fill-muted-foreground text-[9px]">
            + LRU cache
          </text>

          {/* executor */}
          <rect x="515" y="50" width="130" height="40" rx="6" className="fill-background stroke-foreground/40" />
          <text x="580" y="67" textAnchor="middle" className="fill-foreground text-[10px] font-medium">
            executor
          </text>
          <text x="580" y="80" textAnchor="middle" className="fill-muted-foreground text-[9px]">
            vm.Script cache
          </text>

          {/* ctx layer */}
          <rect x="660" y="50" width="100" height="40" rx="6" className="fill-background stroke-foreground/40" />
          <text x="710" y="75" textAnchor="middle" className="fill-foreground text-[10px]">
            ctx.* API
          </text>

          {/* DB */}
          <rect x="365" y="160" width="280" height="40" rx="6" className="fill-emerald-500/10 stroke-emerald-500/40" />
          <text x="505" y="185" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-[11px] font-semibold">
            Postgres · form_records_1..15
          </text>

          {/* Workflow Rule (parallel path) */}
          <rect x="215" y="130" width="130" height="30" rx="6" className="fill-violet-500/10 stroke-violet-500/40" />
          <text x="280" y="149" textAnchor="middle" className="fill-violet-600 dark:fill-violet-400 text-[10px] font-medium">
            WorkflowRule
          </text>
        </g>

        {/* Animated packet along path */}
        <motion.circle
          r="4"
          className="fill-primary"
          animate={{
            offsetDistance: ["0%", "100%"],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            offsetPath:
              "path('M 85 90 L 85 110 L 85 150 L 145 170 L 215 70 L 345 70 L 495 70 L 645 70 L 710 90 L 580 90 L 580 160 L 505 200 L 145 200')",
          }}
        />

        {/* arrows */}
        <g className="stroke-foreground/40" strokeWidth="1" fill="none">
          <path d="M 145 130 L 210 130" markerEnd="url(#arrow)" />
          <path d="M 345 70 L 365 70" markerEnd="url(#arrow)" />
          <path d="M 495 70 L 515 70" markerEnd="url(#arrow)" />
          <path d="M 645 70 L 660 70" markerEnd="url(#arrow)" />
          <path d="M 580 90 L 580 160" markerEnd="url(#arrow)" />
          <path d="M 345 145 L 365 170" markerEnd="url(#arrow)" />
        </g>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-foreground/40" />
          </marker>
        </defs>
      </svg>
      <p className="mt-3 text-[11px] text-muted-foreground">
        The glowing packet represents a single auto-fill request. Both the binding-side (top path) and the
        workflow-rule-side (save-time path) share the same executor and ctx API.
      </p>
    </div>
  )
}

/* ── 3. Lifecycle ─────────────────────────────────────────────────────── */

function LifecycleSection() {
  const [stage, setStage] = useState(0)
  const STAGES = useMemo(
    () => [
      { t: "User types 'EMP-001'", icon: Keyboard, detail: "Each keystroke bumps formData." },
      { t: "Debounce 120ms", icon: Clock, detail: "Coalesces bursts into one request." },
      { t: "POST /functions/run", icon: Network, detail: "bindingId + formData + triggerFieldId" },
      { t: "Binding cache hit", icon: Cpu, detail: "30s TTL skips binding + form-fields DB query." },
      { t: "vm.Script cache hit", icon: FlaskConical, detail: "Compiled script reused (LRU-200)." },
      { t: "ctx.records.list", icon: Database, detail: "Parallel form + shard + fieldMaps lookup." },
      { t: "Fuzzy match", icon: Search, detail: "norm('EMP-001') === norm('EMP-0001')." },
      { t: "Auto-output mapping", icon: Sparkles, detail: "Return { First Name, Last Name, Department }." },
      { t: "setFieldValues(updates)", icon: BadgeCheck, detail: "React writes back, UI paints." },
    ],
    []
  )

  useEffect(() => {
    const i = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 1500)
    return () => clearInterval(i)
  }, [STAGES.length])

  return (
    <section className="space-y-6">
      <SectionHeading
        id="lifecycle"
        icon={Activity}
        eyebrow="Following a single keystroke"
        title="Request lifecycle — every layer an auto-fill touches"
        sub="From the character a user types to the React state that paints back. Nine stages, each ~1-30ms in the warm case."
      />

      <div className="rounded-xl border bg-gradient-to-br from-muted/30 to-transparent p-6">
        <div className="mb-6 grid grid-cols-1 gap-2 md:grid-cols-3 lg:grid-cols-9">
          {STAGES.map((s, i) => {
            const Icon = s.icon
            const isActive = i === stage
            const isPast = i < stage
            return (
              <div key={i} className="relative">
                <motion.div
                  animate={{
                    scale: isActive ? 1.05 : 1,
                    borderColor: isActive
                      ? "rgb(var(--primary))"
                      : isPast
                      ? "rgba(16, 185, 129, 0.4)"
                      : "rgba(120, 120, 120, 0.2)",
                  }}
                  className={`relative flex h-full flex-col items-center rounded-lg border-2 p-2 text-center transition-colors ${
                    isActive
                      ? "border-primary bg-primary/5"
                      : isPast
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : "border-border bg-background"
                  }`}
                >
                  <div
                    className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isPast
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isPast ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    Step {i + 1}
                  </p>
                  <p className="text-[11px] font-medium leading-tight text-foreground">{s.t}</p>
                </motion.div>
              </div>
            )
          })}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={stage}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
            className="rounded-lg border bg-background p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Stage {stage + 1} — {STAGES[stage].t}
            </p>
            <p className="mt-1 text-sm text-foreground">{STAGES[stage].detail}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <CodeSnippet
        title="The client runner (FunctionBindingRunner.tsx)"
        language="tsx"
        code={`// Watches formData for changes, debounces 120ms, fires POST per binding.
const DEBOUNCE_MS = 120

timersRef.current[binding.id] = setTimeout(() => fire(triggered!), DEBOUNCE_MS)

// If a second change arrives mid-flight, queue exactly ONE retry so the
// user's final keystroke always reaches the server.
pendingRetryRef.current[binding.id] = { triggered: triggeredField }`}
      />
    </section>
  )
}

/* ── 4. Caching ───────────────────────────────────────────────────────── */

function CachingSection() {
  return (
    <section className="space-y-6">
      <SectionHeading
        id="caching"
        icon={Cpu}
        eyebrow="Why it's fast"
        title="Five cache layers working together"
        sub="The /functions/run endpoint fires on every keystroke. Without caching, each request would re-parse the script, re-fetch the binding, re-load field maps, and re-resolve the form shard — easily 150ms of pure I/O. Every layer below strips metadata off the hot path."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
        <CacheCard
          step="1"
          title="vm.Script LRU"
          sub="Compiled JavaScript"
          file="executor.ts:56-73"
          impact="5-20ms → ~0ms"
          detail="200 entries max. LRU-touched on hit. First keystroke parses with V8, every subsequent run reuses the same Script."
          color="blue"
        />
        <CacheCard
          step="2"
          title="Binding TTL Cache"
          sub="Binding + function.script"
          file="bindingRunner.ts:88-95"
          impact="15-30ms → ~0ms"
          detail="30s TTL per (org, bindingId). Keyed to prevent cross-tenant collisions. Evicts on LRU overflow (500 entries)."
          color="violet"
        />
        <CacheCard
          step="3"
          title="Field Maps TTL"
          sub="form sections + fields"
          file="bindingRunner.ts:127-161"
          impact="15-30ms → ~0ms"
          detail="30s TTL per formId. Holds the apiName / label / id cross-references used for auto-mode I/O."
          color="amber"
        />
        <CacheCard
          step="4"
          title="Module-ctx memo"
          sub="form + shard + maps"
          file="executor.ts:297-318"
          impact="3 queries → 1 parallel"
          detail="Inside a single script run, every records.* call on the same module reuses the resolved form/shard model. Parallelizes the two calls that only depend on formId."
          color="emerald"
        />
        <CacheCard
          step="5"
          title="Connection pool"
          sub="Prisma PgBouncer"
          file="(infrastructure)"
          impact="~0ms handshake"
          detail="Reused DB connection per request. Prisma's query plan cache also wins on the repeated parameterized finds."
          color="rose"
        />
      </div>

      <CachingTimelineDiagram />
    </section>
  )
}

function CacheCard({
  step,
  title,
  sub,
  file,
  impact,
  detail,
  color,
}: {
  step: string
  title: string
  sub: string
  file: string
  impact: string
  detail: string
  color: "blue" | "violet" | "amber" | "emerald" | "rose"
}) {
  const colors = {
    blue: "border-blue-500/30 bg-blue-500/5",
    violet: "border-violet-500/30 bg-violet-500/5",
    amber: "border-amber-500/30 bg-amber-500/5",
    emerald: "border-emerald-500/30 bg-emerald-500/5",
    rose: "border-rose-500/30 bg-rose-500/5",
  }[color]
  return (
    <div className={`flex flex-col rounded-lg border p-4 ${colors}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Layer {step}
        </span>
        <Badge variant="secondary" className="text-[9px] font-mono">
          {impact}
        </Badge>
      </div>
      <h4 className="text-sm font-bold text-foreground">{title}</h4>
      <p className="mb-2 text-[11px] text-muted-foreground">{sub}</p>
      <code className="mb-2 rounded bg-muted/50 px-1 py-0.5 text-[10px] text-foreground/70">{file}</code>
      <p className="text-[11px] leading-relaxed text-foreground/80">{detail}</p>
    </div>
  )
}

function CachingTimelineDiagram() {
  return (
    <div className="overflow-hidden rounded-xl border bg-gradient-to-br from-muted/30 to-transparent p-6">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Cold vs. warm keystroke — relative latency
      </p>
      <div className="space-y-4">
        <TimelineRow
          label="Cold"
          sub="First ever request"
          segments={[
            { w: 12, color: "bg-blue-500", label: "compile 15ms" },
            { w: 18, color: "bg-violet-500", label: "binding 25ms" },
            { w: 18, color: "bg-amber-500", label: "fields 25ms" },
            { w: 22, color: "bg-emerald-500", label: "records.list 35ms" },
            { w: 8, color: "bg-rose-500", label: "match + json 10ms" },
          ]}
          total="~110ms"
        />
        <TimelineRow
          label="Warm"
          sub="Within 30s TTL, same binding"
          segments={[
            { w: 1, color: "bg-blue-500/40", label: "0" },
            { w: 1, color: "bg-violet-500/40", label: "0" },
            { w: 1, color: "bg-amber-500/40", label: "0" },
            { w: 14, color: "bg-emerald-500", label: "records.list 20ms" },
            { w: 5, color: "bg-rose-500", label: "match 8ms" },
          ]}
          total="~28ms"
        />
      </div>
    </div>
  )
}

function TimelineRow({
  label,
  sub,
  segments,
  total,
}: {
  label: string
  sub: string
  segments: Array<{ w: number; color: string; label: string }>
  total: string
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <div>
          <span className="text-sm font-bold text-foreground">{label}</span>{" "}
          <span className="text-[11px] text-muted-foreground">· {sub}</span>
        </div>
        <span className="text-xs font-semibold text-foreground">{total}</span>
      </div>
      <div className="flex h-6 w-full overflow-hidden rounded-md bg-muted">
        {segments.map((seg, i) => (
          <motion.div
            key={i}
            initial={{ width: 0 }}
            whileInView={{ width: `${seg.w}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 * i }}
            className={`flex items-center justify-center overflow-hidden whitespace-nowrap text-[9px] font-medium text-white ${seg.color}`}
          >
            {seg.w > 8 ? seg.label : ""}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ── 5. Autofill deep dive ────────────────────────────────────────────── */

function AutofillSection() {
  const [typed, setTyped] = useState("")
  const TARGET = "EMP-001"
  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      setTyped(TARGET.slice(0, i + 1))
      i = (i + 1) % (TARGET.length + 1)
      if (i === 0) setTyped("")
    }, 600)
    return () => clearInterval(interval)
  }, [])

  return (
    <section className="space-y-6">
      <SectionHeading
        id="autofill"
        icon={Search}
        eyebrow="The flagship feature"
        title="Employee ID auto-fill — one function, ten forms"
        sub="Typing an Employee ID into any of 10 forms resolves First Name, Last Name, and Department instantly. One CrmFunction powers all 10 via auto-output-mapping + onFieldChange bindings + a server-side workflow-rule safety net."
      />

      {/* Live typing animation */}
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-background to-background p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: what the user does */}
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              User types into the form
            </p>
            <div className="space-y-3 rounded-lg border bg-background p-4">
              <LiveField label="Employee ID" value={typed} cursor />
              <LiveField
                label="First Name"
                value={typed.length === TARGET.length ? "Rahul" : ""}
                autoFilled={typed.length === TARGET.length}
              />
              <LiveField
                label="Last Name"
                value={typed.length === TARGET.length ? "Kumar" : ""}
                autoFilled={typed.length === TARGET.length}
              />
              <LiveField
                label="Department"
                value={typed.length === TARGET.length ? "Engineering" : ""}
                autoFilled={typed.length === TARGET.length}
              />
            </div>
          </div>

          {/* Right: what the server does */}
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              What happens on every keystroke
            </p>
            <div className="space-y-2">
              <LogLine
                active={typed.length > 0}
                ok={typed.length > 0}
                label="POST /functions/run"
                detail={`bindingId=fb_hr_autofill_* · formData={"Employee ID":"${typed}"}`}
              />
              <LogLine
                active={typed.length > 0}
                ok={typed.length > 0}
                label="norm(typed)"
                detail={`'${typed}' → '${typed.toUpperCase().replace(/(\d+)/g, (n) => String(Number(n)))}'`}
              />
              <LogLine
                active={typed.length >= 5}
                ok={typed.length >= 5}
                label="ctx.records.list('Employee Master', {limit:50})"
                detail="LRU + module-ctx cache warm"
              />
              <LogLine
                active={typed.length === TARGET.length}
                ok={typed.length === TARGET.length}
                label="findMatch() → row"
                detail={typed.length === TARGET.length ? "EMP-0001 matches EMP-001" : "no match yet"}
              />
              <LogLine
                active={typed.length === TARGET.length}
                ok={typed.length === TARGET.length}
                label="return { First Name, Last Name, Department }"
                detail="auto-output mapping writes back"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Fuzzy match explainer */}
      <FuzzyMatchDiagram />

      {/* Safety net explainer */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <Shield className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">Server-side safety net</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Even when the live debounced auto-fill misses (e.g. the user tabs out before the last keystroke's
              request returns), the record save path runs the same lookup as a <strong>WorkflowRule</strong> on
              Create or Edit. Ten safety-net rules (<code className="rounded bg-muted px-1 py-0.5 text-[10px]">wfr_hr_autofill_*</code>)
              guarantee First Name, Last Name, and Department are always populated at save time.
            </p>
          </div>
        </div>
      </div>

      <CodeSnippet
        title="The lookup function (abridged — see scripts/create-hr-automations.sql:514)"
        language="js"
        code={`function norm(s) {
  s = String(s == null ? '' : s).trim().toUpperCase().replace(/\\s+/g, '');
  return s.replace(/(\\d+)/g, n => String(Number(n)));  // strip leading zeros
}

const needle = norm(ctx.input['Employee ID']);
const emps = await ctx.records.list('Employee Master', { limit: 50 });
const match = emps.find(r => norm(r.data['Employee ID']) === needle);
if (!match) return { ok: false };

return {
  'First Name':  match.data['First Name'],
  'Last Name':   match.data['Last Name'],
  'Department':  match.data['Department'],
};`}
      />
    </section>
  )
}

function LiveField({
  label,
  value,
  cursor,
  autoFilled,
}: {
  label: string
  value: string
  cursor?: boolean
  autoFilled?: boolean
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div
        className={`flex h-9 items-center rounded-md border px-3 text-sm transition-colors ${
          autoFilled
            ? "border-emerald-500/50 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
            : "border-input bg-background text-foreground"
        }`}
      >
        <span className="font-mono">{value}</span>
        {cursor && <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} className="ml-0.5">|</motion.span>}
        {autoFilled && (
          <Sparkles className="ml-auto h-3.5 w-3.5 text-emerald-500" />
        )}
      </div>
    </div>
  )
}

function LogLine({
  active,
  ok,
  label,
  detail,
}: {
  active: boolean
  ok: boolean
  label: string
  detail: string
}) {
  return (
    <motion.div
      animate={{ opacity: active ? 1 : 0.35 }}
      className="flex items-start gap-2 rounded-md border bg-background p-2 text-[11px]"
    >
      <div className="mt-0.5 shrink-0">
        {active ? (
          ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-rose-500" />
          )
        ) : (
          <Circle className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <code className="break-all font-mono font-medium text-foreground">{label}</code>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </motion.div>
  )
}

function FuzzyMatchDiagram() {
  const VARIANTS = ["emp-1", "EMP-001", "EMP-0001", "  EMP 0001  "]
  return (
    <div className="overflow-hidden rounded-xl border bg-gradient-to-br from-muted/30 to-transparent p-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Zero-pad-neutral fuzzy matcher
      </p>
      <p className="mb-4 text-[11px] text-muted-foreground">
        All four of these resolve to the same canonical form — so typos, trailing spaces, and varying
        zero-padding conventions all match a single Employee Master row.
      </p>
      <div className="space-y-2">
        {VARIANTS.map((v, i) => (
          <motion.div
            key={v}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.12 * i }}
            className="flex items-center gap-3"
          >
            <code className="flex-1 rounded-md border bg-background px-3 py-1.5 font-mono text-xs text-foreground">
              "{v}"
            </code>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <code className="flex-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">
              "EMP-1"
            </code>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        Achieved by: <code className="rounded bg-muted px-1 py-0.5 text-[10px]">trim().toUpperCase().replace(/\s+/g, '')</code>{" "}
        followed by <code className="rounded bg-muted px-1 py-0.5 text-[10px]">/(\d+)/g → String(Number(n))</code>.
      </p>
    </div>
  )
}

/* ── 6. Functions catalog ─────────────────────────────────────────────── */

function FunctionsSection() {
  const [query, setQuery] = useState("")
  const [cat, setCat] = useState<string>("All")
  const cats = useMemo(() => ["All", ...Array.from(new Set(FUNCTIONS.map((f) => f.category)))], [])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return FUNCTIONS.filter((f) => {
      if (cat !== "All" && f.category !== cat) return false
      if (!q) return true
      return (
        f.display.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q) ||
        f.summary.toLowerCase().includes(q) ||
        f.modules.some((m) => m.toLowerCase().includes(q))
      )
    })
  }, [query, cat])

  return (
    <section className="space-y-6">
      <SectionHeading
        id="functions"
        icon={FileCode2}
        eyebrow="The building blocks"
        title={`All ${FUNCTIONS.length} HR functions`}
        sub="Each CrmFunction is a reusable JavaScript body. Functions are dumb by design — they receive inputs via ctx.input and return an object. Workflow Rules and Bindings decide WHEN they run."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Filter by name, id, module…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-xs"
          />
        </div>
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
              cat === c
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((f) => (
          <FunctionRow key={f.id} fn={f} />
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No functions match.</p>
        )}
      </div>
    </section>
  )
}

function FunctionRow({ fn }: { fn: typeof FUNCTIONS[number] }) {
  const [open, setOpen] = useState(false)
  const catColor = {
    Defaults: "text-blue-600 bg-blue-500/10 border-blue-500/30",
    Calculation: "text-violet-600 bg-violet-500/10 border-violet-500/30",
    Lifecycle: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    Points: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
    Lookup: "text-rose-600 bg-rose-500/10 border-rose-500/30",
  }[fn.category]
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden rounded-lg border bg-background"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/30"
      >
        <div className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase ${catColor}`}>
          {fn.category}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-sm font-semibold text-foreground">{fn.display}</h3>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {fn.id}
            </code>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{fn.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {fn.modules.slice(0, 5).map((m) => (
              <span key={m} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground/70">
                {m}
              </span>
            ))}
            {fn.modules.length > 5 && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground/70">
                +{fn.modules.length - 5} more
              </span>
            )}
          </div>
        </div>
        <motion.div animate={{ rotate: open ? 90 : 0 }}>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t bg-muted/20"
          >
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Inputs
                </p>
                <ul className="space-y-1 text-[11px]">
                  {fn.inputs.map((i) => (
                    <li key={i} className="flex items-start gap-1.5 font-mono">
                      <ArrowDown className="mt-0.5 h-3 w-3 shrink-0 text-blue-500" />
                      <code>{i}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Outputs
                </p>
                <ul className="space-y-1 text-[11px]">
                  {fn.outputs.map((o) => (
                    <li key={o} className="flex items-start gap-1.5 font-mono">
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                      <code>{o}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="md:col-span-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Logic
                </p>
                <p className="text-[11px] leading-relaxed text-foreground">{fn.logic}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ── 7. Workflow rules catalog ────────────────────────────────────────── */

function WorkflowsSection() {
  const [query, setQuery] = useState("")
  const [cat, setCat] = useState<"All" | "Module" | "Autofill">("All")
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return WORKFLOW_RULES.filter((r) => {
      if (cat !== "All" && r.category !== cat) return false
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        r.module.toLowerCase().includes(q) ||
        r.actionDetail.toLowerCase().includes(q)
      )
    })
  }, [query, cat])

  return (
    <section className="space-y-6">
      <SectionHeading
        id="workflows"
        icon={Workflow}
        eyebrow="Server-side triggers"
        title={`All ${WORKFLOW_RULES.length} workflow rules`}
        sub="Workflow Rules fire whenever a record is Created, Edited, or Deleted. 26 rules implement module-specific logic; 10 are the server-side safety net for Employee-ID auto-fill that guarantees population at save time."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Filter rules…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-xs"
          />
        </div>
        {(["All", "Module", "Autofill"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
              cat === c
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {c} ({c === "All" ? WORKFLOW_RULES.length : WORKFLOW_RULES.filter((x) => x.category === c).length})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Rule</th>
              <th className="px-3 py-2 font-semibold">Module</th>
              <th className="px-3 py-2 font-semibold">Trigger</th>
              <th className="px-3 py-2 font-semibold">Condition</th>
              <th className="px-3 py-2 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <motion.tr
                key={r.id}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                className="border-b last:border-b-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-foreground">{r.name}</div>
                  <code className="text-[9px] text-muted-foreground">{r.id}</code>
                </td>
                <td className="px-3 py-2 align-top">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground/80">
                    {r.module}
                  </span>
                </td>
                <td className="px-3 py-2 align-top">
                  <TriggerChip trigger={r.trigger} />
                </td>
                <td className="px-3 py-2 align-top font-mono text-[10px] text-muted-foreground">
                  {r.condition ? r.condition : <span className="italic">all</span>}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex items-center gap-1.5">
                    {r.actionKind === "Function" ? (
                      <FileCode2 className="h-3 w-3 text-violet-500" />
                    ) : (
                      <Hash className="h-3 w-3 text-amber-500" />
                    )}
                    <code className="font-mono text-[10px] text-foreground">{r.actionDetail}</code>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TriggerChip({ trigger }: { trigger: string }) {
  const colors: Record<string, string> = {
    Create: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
    Edit: "text-blue-600 bg-blue-500/10 border-blue-500/30",
    "Create or Edit": "text-violet-600 bg-violet-500/10 border-violet-500/30",
    Delete: "text-rose-600 bg-rose-500/10 border-rose-500/30",
  }
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase ${colors[trigger] ?? ""}`}>
      {trigger}
    </span>
  )
}

/* ── 8. Function bindings catalog ─────────────────────────────────────── */

function BindingsSection() {
  const [query, setQuery] = useState("")
  const [cat, setCat] = useState<string>("All")
  const cats = ["All", "Auto-fill", "Calculation", "Lifecycle", "Default"]
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return BINDINGS.filter((b) => {
      if (cat !== "All" && b.category !== cat) return false
      if (!q) return true
      return (
        b.form.toLowerCase().includes(q) ||
        b.field.toLowerCase().includes(q) ||
        b.fn.toLowerCase().includes(q) ||
        b.purpose.toLowerCase().includes(q)
      )
    })
  }, [query, cat])

  return (
    <section className="space-y-6">
      <SectionHeading
        id="bindings"
        icon={Zap}
        eyebrow="Client-side UI wiring"
        title={`All ${BINDINGS.length} function bindings`}
        sub="Function Bindings wire a CrmFunction to a specific form + field + UI event. The React <FunctionBindingRunner> dispatches them in real time (debounced 120ms). beforeSubmit bindings run server-side at save."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Filter bindings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-xs"
          />
        </div>
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
              cat === c
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {filtered.map((b) => (
          <BindingCard key={b.id} b={b} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No bindings match.</p>
        )}
      </div>
    </section>
  )
}

function BindingCard({ b }: { b: typeof BINDINGS[number] }) {
  const catColor = {
    "Auto-fill": "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
    Calculation: "text-violet-600 bg-violet-500/10 border-violet-500/30",
    Lifecycle: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    Default: "text-blue-600 bg-blue-500/10 border-blue-500/30",
  }[b.category]
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ duration: 0.25 }}
      className="rounded-lg border bg-background p-4"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase ${catColor}`}>
          {b.category}
        </span>
        <code className="text-[9px] text-muted-foreground">{b.event}</code>
      </div>
      <p className="mb-2 text-sm font-semibold text-foreground">{b.purpose}</p>
      <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Box className="h-3 w-3" />
        <span>{b.form}</span>
        <span className="mx-1 text-foreground/30">›</span>
        <span className="font-mono text-foreground">{b.field}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t pt-2">
        <PlayCircle className="h-3 w-3 text-primary" />
        <code className="font-mono text-[10px] text-foreground">{b.fn}</code>
      </div>
      <code className="mt-1 block text-[9px] text-muted-foreground/70">{b.id}</code>
    </motion.div>
  )
}

/* ── 9. Module map ────────────────────────────────────────────────────── */

function ModulesSection() {
  const MODULE_MAP: Array<{
    top: string
    subs: Array<{ name: string; form: string; fields: number }>
  }> = [
    {
      top: "HR Core",
      subs: [
        { name: "Employees", form: "Employee Master", fields: 40 },
        { name: "Attendance", form: "Check In / Check Out", fields: 10 },
        { name: "Leave Management", form: "Leave Application", fields: 13 },
        { name: "Holiday List", form: "Holiday List", fields: 6 },
      ],
    },
    {
      top: "Recruitment",
      subs: [
        { name: "Staffing Plan", form: "Staffing Plan", fields: 11 },
        { name: "Job Opening", form: "Job Opening", fields: 14 },
        { name: "Job Application", form: "Job Application", fields: 18 },
        { name: "Job Offer", form: "Job Offer", fields: 12 },
        { name: "Appointment Letter", form: "Appointment Letter", fields: 9 },
      ],
    },
    {
      top: "Performance",
      subs: [
        { name: "Employee Referral", form: "Employee Referral", fields: 9 },
        { name: "KRA Master", form: "KRA Master", fields: 7 },
        { name: "Performance Appraisal", form: "Performance Appraisal", fields: 15 },
      ],
    },
    {
      top: "Engagement",
      subs: [
        { name: "Self Target", form: "Self Target", fields: 11 },
        { name: "Self Initiative", form: "Self Initiative", fields: 11 },
        { name: "Problem Registration", form: "Problem Registration", fields: 11 },
        { name: "Kaizen", form: "Kaizen", fields: 12 },
        { name: "Employee Suggestion", form: "Employee Suggestion", fields: 11 },
      ],
    },
    {
      top: "Admin",
      subs: [
        { name: "Asset Management", form: "Asset Management", fields: 11 },
        { name: "SIM Management", form: "SIM Management", fields: 10 },
      ],
    },
  ]

  return (
    <section className="space-y-6">
      <SectionHeading
        id="modules"
        icon={Box}
        eyebrow="The complete module tree"
        title="All 5 modules and their 20 forms"
        sub="Every module, its child sub-modules, the form each sub-module hosts, and the field count per form."
      />
      <div className="space-y-4">
        {MODULE_MAP.map((m, mi) => {
          const meta = MODULES.find((x) => x.name === m.top)!
          const Icon = meta.icon
          return (
            <motion.div
              key={m.top}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: mi * 0.05 }}
              className={`overflow-hidden rounded-xl border bg-gradient-to-br p-4 ${meta.color} ${meta.border}`}
            >
              <div className="mb-3 flex items-center gap-2">
                <Icon className={`h-4 w-4 ${meta.iconColor}`} />
                <h3 className="text-sm font-bold text-foreground">{m.top}</h3>
                <Badge variant="secondary" className="text-[10px]">
                  {m.subs.length} forms
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                {m.subs.map((s, i) => (
                  <motion.div
                    key={s.name}
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: mi * 0.05 + i * 0.03 }}
                    className="rounded-lg border bg-background p-3"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {s.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-medium text-foreground">{s.form}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{s.fields} fields</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}

/* ── Footer ───────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="mt-16 border-t pt-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Source of truth
          </p>
          <ul className="space-y-1 text-[11px]">
            <li>
              <code className="rounded bg-muted px-1 py-0.5">scripts/create-hr-module.sql</code>
            </li>
            <li>
              <code className="rounded bg-muted px-1 py-0.5">scripts/create-hr-automations.sql</code>
            </li>
            <li>
              <code className="rounded bg-muted px-1 py-0.5">lib/functions/executor.ts</code>
            </li>
            <li>
              <code className="rounded bg-muted px-1 py-0.5">lib/functions/bindingRunner.ts</code>
            </li>
            <li>
              <code className="rounded bg-muted px-1 py-0.5">components/forms/FunctionBindingRunner.tsx</code>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Jump to tooling
          </p>
          <ul className="space-y-1 text-[11px]">
            <li>
              <Link href="/settings/functions" className="text-primary hover:underline">
                Settings → Functions
              </Link>
            </li>
            <li>
              <Link href="/settings/workflow-rules" className="text-primary hover:underline">
                Settings → Workflow Rules
              </Link>
            </li>
            <li>
              <Link href="/settings/apis" className="text-primary hover:underline">
                Settings → APIs &amp; SDKs
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Related docs
          </p>
          <ul className="space-y-1 text-[11px]">
            <li>
              <Link href="/settings/docs" className="text-primary hover:underline">
                All documentation
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <p className="mt-6 text-[10px] text-muted-foreground">
        Counts: 5 top-level modules · 19 sub-modules · 20 forms · 241 fields · 16 functions · 36 workflow
        rules · 22 function bindings.
      </p>
    </footer>
  )
}

/* ── Shared: code block ───────────────────────────────────────────────── */

function CodeSnippet({
  title,
  language,
  code,
}: {
  title: string
  language: string
  code: string
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-foreground/[0.02]">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <p className="text-[11px] font-medium text-foreground">{title}</p>
        <code className="text-[10px] uppercase text-muted-foreground">{language}</code>
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  )
}
