"use client"

/**
 * HR System — Complete End-to-End Guide (in-app reference page).
 *
 * Renders the same content as docs/HR_SYSTEM_COMPLETE_GUIDE.md as a
 * scroll-spy reference page so anyone can read the full HR docs without
 * leaving the app. Static segment wins over [slug] in Next.js routing.
 *
 * Source data is colocated in this file so the page renders without any
 * API calls. Keep tables in sync with scripts/create-hr-module.sql and
 * scripts/create-hr-automations.sql when the seed data changes.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BookOpen,
  ChevronLeft,
  Layers,
  Workflow,
  Zap,
  Database,
  Users,
  Clock,
  GitBranch,
  Server,
  FileCode2,
  Box,
  Target,
  Sparkles,
  Shield,
  Hash,
  ListTree,
  Wrench,
  KeyRound,
  Rocket,
  Network,
  Calendar,
  Wallet,
  Briefcase,
  HeartHandshake,
  Laptop,
  Smartphone,
  ScrollText,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

/* ─────────────────────────────────────────────────────────────────────────
   DATA — kept in sync with the markdown guide and the SQL files
   ───────────────────────────────────────────────────────────────────────── */

const SECTIONS = [
  { id: "overview", label: "Overview", icon: Layers },
  { id: "datamodel", label: "Data Model", icon: Database },
  { id: "modulemap", label: "Module Map", icon: ListTree },
  { id: "forms", label: "20 HR Forms", icon: FileCode2 },
  { id: "automation", label: "Automation Fabric", icon: GitBranch },
  { id: "functions", label: "16 Functions", icon: Zap },
  { id: "rules", label: "36 Workflow Rules", icon: Workflow },
  { id: "bindings", label: "22 Bindings", icon: Wrench },
  { id: "autofill", label: "Employee Auto-Fill", icon: Network },
  { id: "attendance", label: "Attendance", icon: Clock },
  { id: "leave", label: "Leave Management", icon: Calendar },
  { id: "payroll", label: "Payroll Engine", icon: Wallet },
  { id: "recruitment", label: "Recruitment", icon: Briefcase },
  { id: "engagement", label: "Performance & Engagement", icon: HeartHandshake },
  { id: "asset", label: "Asset & SIM", icon: Laptop },
  { id: "permissions", label: "Permissions", icon: Shield },
  { id: "bootstrap", label: "Bootstrap & Seed", icon: Rocket },
  { id: "api", label: "API Reference", icon: Server },
  { id: "files", label: "File Inventory", icon: ScrollText },
  { id: "glossary", label: "Glossary", icon: KeyRound },
] as const

const MODULES = [
  { name: "HR Core", forms: 5, color: "from-blue-500/15 to-blue-600/5", border: "border-blue-500/30", iconColor: "text-blue-500", icon: Users },
  { name: "Recruitment", forms: 6, color: "from-violet-500/15 to-violet-600/5", border: "border-violet-500/30", iconColor: "text-violet-500", icon: Briefcase },
  { name: "Performance", forms: 2, color: "from-amber-500/15 to-amber-600/5", border: "border-amber-500/30", iconColor: "text-amber-500", icon: Target },
  { name: "Engagement", forms: 5, color: "from-emerald-500/15 to-emerald-600/5", border: "border-emerald-500/30", iconColor: "text-emerald-500", icon: Sparkles },
  { name: "Asset & Admin", forms: 2, color: "from-rose-500/15 to-rose-600/5", border: "border-rose-500/30", iconColor: "text-rose-500", icon: Shield },
] as const

const FORMS = [
  // [name, formId, module, fields, sections, key fields summary]
  { module: "HR Core", name: "Employee Master", id: "form_hr_employee_master", fields: 52, sections: 7, summary: "Central source of truth. 7 sections: Personal, Contact, Employment, Documents, Salary, Bank, Exit." },
  { module: "HR Core", name: "Check In", id: "form_hr_checkin", fields: 9, sections: 1, summary: "Employee ID, Date, Time, GPS Location, front-camera selfie." },
  { module: "HR Core", name: "Check Out", id: "form_hr_checkout", fields: 6, sections: 1, summary: "Same pattern as Check In, end-of-day version." },
  { module: "HR Core", name: "Leave Application", id: "form_hr_leave_application", fields: 10, sections: 2, summary: "Dates + reason + 2-step approval (Manager → HR). Total Days auto-calc formula field." },
  { module: "HR Core", name: "Holiday List", id: "form_hr_holiday_list", fields: 5, sections: 1, summary: "National/Religious/Regional/Company holidays per year." },
  { module: "Recruitment", name: "Staffing Plan", id: "form_hr_staffing_plan", fields: 9, sections: 1, summary: "Manpower request — Department/Designation, Vacancies × Cost (auto-calc)." },
  { module: "Recruitment", name: "Job Opening", id: "form_hr_job_opening", fields: 11, sections: 1, summary: "Public-facing opening (anonymous-allowed). Status: DRAFT/OPEN/HOLD/CLOSED/FILLED." },
  { module: "Recruitment", name: "Job Application", id: "form_hr_job_application", fields: 15, sections: 2, summary: "Anonymous candidate application. Resume upload + 9-step status pipeline." },
  { module: "Recruitment", name: "Job Offer", id: "form_hr_job_offer", fields: 10, sections: 1, summary: "Offer with Date (auto-today) + Status (DRAFT default) + T&C template." },
  { module: "Recruitment", name: "Appointment Letter", id: "form_hr_appointment_letter", fields: 8, sections: 1, summary: "Printable letter from a template (Standard / Intern / Contract / Consultant)." },
  { module: "Recruitment", name: "Employee Referral", id: "form_hr_employee_referral", fields: 10, sections: 1, summary: "Referrer info auto-filled from Employee ID." },
  { module: "Performance", name: "KRA Master", id: "form_hr_kra_master", fields: 4, sections: 1, summary: "Goal template per Department + Designation with Weightage 0–100." },
  { module: "Performance", name: "Performance Appraisal", id: "form_hr_performance_appraisal", fields: 7, sections: 1, summary: "Score (0–10) × Weightage / 10 = Score Earned (live formula)." },
  { module: "Engagement", name: "Self Target", id: "form_hr_self_target", fields: 8, sections: 1, summary: "Monthly self-defined target. Default 50 engagement points." },
  { module: "Engagement", name: "Self Initiative", id: "form_hr_self_initiative", fields: 9, sections: 1, summary: "Voluntary initiative + Category. Default 40 points." },
  { module: "Engagement", name: "Problem Registration", id: "form_hr_problem_registration", fields: 12, sections: 2, summary: "Problem + Impact + Solution + Media. Default 30 points." },
  { module: "Engagement", name: "Kaizen", id: "form_hr_kaizen", fields: 19, sections: 3, summary: "Improvement project. Before/After media. Area-based points (Safety=100, Quality=80, …)." },
  { module: "Engagement", name: "Employee Suggestion", id: "form_hr_employee_suggestion", fields: 11, sections: 1, summary: "Suggestion + Benefits + Media. Default 20 points." },
  { module: "Asset & Admin", name: "Asset Management", id: "form_hr_asset_management", fields: 11, sections: 1, summary: "Allocate company assets. Status auto-flips ASSIGNED ↔ IN_STOCK based on Employee ID." },
  { module: "Asset & Admin", name: "SIM Management", id: "form_hr_sim_management", fields: 15, sections: 2, summary: "SIM allocation + recharge log. Status flips ACTIVE ↔ INACTIVE; LOST → BLOCKED." },
] as const

const FUNCTIONS = [
  { id: "fn_hr_employee_onboarding", display: "Employee Onboarding Defaults", category: "Defaults", modules: "Employee Master", logic: "If blank: Status→ACTIVE, Working Hours→8, Nationality→Indian." },
  { id: "fn_hr_leave_calc_days", display: "Calculate Leave Days", category: "Calculation", modules: "Leave Management", logic: "total_days = (end − start) + 1, inclusive." },
  { id: "fn_hr_leave_auto_approve_short", display: "Auto-Approve Short Leave", category: "Lifecycle", modules: "Leave Management", logic: "If total_days === 1, set mgr_approval = APPROVED. HR still pending." },
  { id: "fn_hr_appraisal_score", display: "Compute Appraisal Score Earned", category: "Calculation", modules: "Performance Appraisal", logic: "score_earned = round(weightage × score / 10, 2)." },
  { id: "fn_hr_staff_total_cost", display: "Compute Staffing Total Cost", category: "Calculation", modules: "Staffing Plan", logic: "total_cost = vacancies × cost_per_person." },
  { id: "fn_hr_job_app_copy_desc", display: "Copy JD from Opening", category: "Defaults", modules: "Job Application", logic: "Copy fld_open_job_desc → fld_app_job_desc, only if blank." },
  { id: "fn_hr_kaizen_points", display: "Kaizen Engagement Points", category: "Points", modules: "Kaizen", logic: "Area-based: SAFETY=100, QUALITY/COST=80, DELIVERY/PRODUCTIVITY=70, MORALE/ENVIRONMENT=60, else 50." },
  { id: "fn_hr_problem_points", display: "Problem Registration Points", category: "Points", modules: "Problem Registration", logic: "Awards 30 points if blank. Idempotent." },
  { id: "fn_hr_suggestion_points", display: "Suggestion / Initiative Points", category: "Points", modules: "Suggestion + Initiative + Self Target", logic: "Polymorphic: detects which source filled. Sug=20, Init=40, Tgt=50." },
  { id: "fn_hr_asset_auto_status", display: "Asset Auto-Assign Status", category: "Lifecycle", modules: "Asset Management", logic: "Employee filled → ASSIGNED; blank → IN_STOCK." },
  { id: "fn_hr_sim_auto_status", display: "SIM Auto-Assign Status", category: "Lifecycle", modules: "SIM Management", logic: "Employee filled → ACTIVE; blank → INACTIVE." },
  { id: "fn_hr_offer_populate", display: "Offer Populate from Application", category: "Defaults", modules: "Job Offer", logic: "Stamps Offer Date = today + Status = DRAFT if blank." },
  { id: "fn_hr_attendance_stamp", display: "Attendance Timestamp Stamp", category: "Defaults", modules: "Attendance", logic: "If In/Out date blank, stamps today." },
  { id: "fn_hr_holiday_count", display: "Holiday Count", category: "Defaults", modules: "Holiday List", logic: "Defaults Total Holidays = 1 when blank." },
  { id: "fn_hr_leave_apply_status", display: "Apply Leave Status on Approval", category: "Lifecycle", modules: "Leave Management", logic: "When Manager + HR both APPROVED: console-logs (hook for future emails)." },
  { id: "fn_hr_lookup_employee", display: "Lookup Employee by ID", category: "Lookup", modules: "10 modules", logic: "Fuzzy match. Returns First/Middle/Last Name + Department. Powers all 10 auto-fill forms." },
] as const

const RULES = [
  { id: "wfr_hr_emp_onboarding", module: "Employee Master", trigger: "Create", condition: "—", action: "fn_hr_employee_onboarding" },
  { id: "wfr_hr_emp_resigned", module: "Employee Master", trigger: "Edit", condition: "status = RESIGNED", action: "Clear company email" },
  { id: "wfr_hr_emp_terminated", module: "Employee Master", trigger: "Edit", condition: "status = TERMINATED", action: "notice_served = true" },
  { id: "wfr_hr_attendance_stamp", module: "Attendance", trigger: "Create", condition: "—", action: "fn_hr_attendance_stamp" },
  { id: "wfr_hr_leave_calc", module: "Leave Management", trigger: "Create or Edit", condition: "—", action: "fn_hr_leave_calc_days" },
  { id: "wfr_hr_leave_auto_approve_short", module: "Leave Management", trigger: "Create", condition: "—", action: "fn_hr_leave_auto_approve_short" },
  { id: "wfr_hr_leave_mgr_rejected", module: "Leave Management", trigger: "Edit", condition: "mgr_approval = REJECTED", action: "Cascade hr_approval = REJECTED" },
  { id: "wfr_hr_leave_fully_approved", module: "Leave Management", trigger: "Edit", condition: "hr_approval = APPROVED", action: "fn_hr_leave_apply_status (logger)" },
  { id: "wfr_hr_holiday_count", module: "Holiday List", trigger: "Create", condition: "—", action: "fn_hr_holiday_count" },
  { id: "wfr_hr_staff_total_cost", module: "Staffing Plan", trigger: "Create or Edit", condition: "—", action: "fn_hr_staff_total_cost" },
  { id: "wfr_hr_opening_filled_close", module: "Job Opening", trigger: "Edit", condition: "status = FILLED", action: "publish = false" },
  { id: "wfr_hr_app_copy_desc", module: "Job Application", trigger: "Create", condition: "—", action: "fn_hr_job_app_copy_desc" },
  { id: "wfr_hr_app_hired_status", module: "Job Application", trigger: "Edit", condition: "status = HIRED", action: "rating = 5" },
  { id: "wfr_hr_app_rejected_note", module: "Job Application", trigger: "Edit", condition: "status = REJECTED", action: "rating = 0" },
  { id: "wfr_hr_offer_create", module: "Job Offer", trigger: "Create", condition: "—", action: "fn_hr_offer_populate" },
  { id: "wfr_hr_offer_accepted", module: "Job Offer", trigger: "Edit", condition: "status = ACCEPTED", action: "term = 'Accepted by applicant'" },
  { id: "wfr_hr_appraisal_score", module: "Performance Appraisal", trigger: "Create or Edit", condition: "—", action: "fn_hr_appraisal_score" },
  { id: "wfr_hr_tgt_default_points", module: "Self Target", trigger: "Create", condition: "—", action: "fn_hr_suggestion_points (50 pts)" },
  { id: "wfr_hr_init_default_points", module: "Self Initiative", trigger: "Create", condition: "—", action: "fn_hr_suggestion_points (40 pts)" },
  { id: "wfr_hr_prob_default_points", module: "Problem Registration", trigger: "Create", condition: "—", action: "fn_hr_problem_points (30 pts)" },
  { id: "wfr_hr_kaizen_points", module: "Kaizen", trigger: "Create", condition: "—", action: "fn_hr_kaizen_points (area-based)" },
  { id: "wfr_hr_sug_default_points", module: "Employee Suggestion", trigger: "Create", condition: "—", action: "fn_hr_suggestion_points (20 pts)" },
  { id: "wfr_hr_asset_auto_status", module: "Asset Management", trigger: "Create or Edit", condition: "—", action: "fn_hr_asset_auto_status" },
  { id: "wfr_hr_asset_lost", module: "Asset Management", trigger: "Edit", condition: "status = LOST", action: "Clear employee_id" },
  { id: "wfr_hr_sim_auto_status", module: "SIM Management", trigger: "Create or Edit", condition: "—", action: "fn_hr_sim_auto_status" },
  { id: "wfr_hr_sim_lost_block", module: "SIM Management", trigger: "Edit", condition: "status = LOST", action: "status = BLOCKED" },
] as const

const AUTOFILL_RULES = [
  { module: "Attendance", id: "wfr_hr_autofill_attendance" },
  { module: "Leave Management", id: "wfr_hr_autofill_leave" },
  { module: "Employee Referral", id: "wfr_hr_autofill_ref" },
  { module: "Self Target", id: "wfr_hr_autofill_tgt" },
  { module: "Self Initiative", id: "wfr_hr_autofill_init" },
  { module: "Problem Registration", id: "wfr_hr_autofill_prob" },
  { module: "Kaizen", id: "wfr_hr_autofill_kz" },
  { module: "Employee Suggestion", id: "wfr_hr_autofill_sug" },
  { module: "Asset Management", id: "wfr_hr_autofill_asset" },
  { module: "SIM Management", id: "wfr_hr_autofill_sim" },
] as const

const BINDINGS = [
  { form: "Leave Application", field: "Leave End Date", event: "onFieldChange", fn: "fn_hr_leave_calc_days" },
  { form: "Leave Application", field: "Leave Start Date", event: "onFieldChange", fn: "fn_hr_leave_calc_days" },
  { form: "Staffing Plan", field: "No. of Vacancies", event: "onFieldChange", fn: "fn_hr_staff_total_cost" },
  { form: "Staffing Plan", field: "Estimated Cost / Person", event: "onFieldChange", fn: "fn_hr_staff_total_cost" },
  { form: "Performance Appraisal", field: "Weightage", event: "onFieldChange", fn: "fn_hr_appraisal_score" },
  { form: "Performance Appraisal", field: "Score", event: "onFieldChange", fn: "fn_hr_appraisal_score" },
  { form: "Asset Management", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_asset_auto_status" },
  { form: "SIM Management", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_sim_auto_status" },
  { form: "Kaizen", field: "Area", event: "onFieldChange", fn: "fn_hr_kaizen_points" },
  { form: "Employee Master", field: "(form)", event: "beforeSubmit", fn: "fn_hr_employee_onboarding" },
  { form: "Job Application", field: "(form)", event: "beforeSubmit", fn: "fn_hr_job_app_copy_desc" },
  { form: "Job Offer", field: "(form)", event: "beforeSubmit", fn: "fn_hr_offer_populate" },
  { form: "Check In / Check Out", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee" },
  { form: "Leave Application", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee" },
  { form: "Employee Referral", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee" },
  { form: "Self Target", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee" },
  { form: "Self Initiative", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee" },
  { form: "Problem Registration", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee" },
  { form: "Kaizen", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee" },
  { form: "Employee Suggestion", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee" },
  { form: "Asset Management", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee" },
  { form: "SIM Management", field: "Employee ID", event: "onFieldChange", fn: "fn_hr_lookup_employee" },
] as const

const API_ROUTES = [
  { method: "GET", path: "/api/payroll", file: "app/api/payroll/route.ts", purpose: "List payroll records" },
  { method: "GET/POST", path: "/api/payroll/config", file: "app/api/payroll/config/route.ts", purpose: "Read/write PayrollConfiguration" },
  { method: "GET", path: "/api/payroll/forms", file: "app/api/payroll/forms/route.ts", purpose: "Forms eligible for payroll mapping" },
  { method: "GET", path: "/api/payroll/form-fields", file: "app/api/payroll/form-fields/route.ts", purpose: "Field metadata for mapping UI" },
  { method: "CRUD", path: "/api/payroll/leave-type", file: "app/api/payroll/leave-type/route.ts", purpose: "LeaveType master data" },
  { method: "CRUD", path: "/api/payroll/leave-rules", file: "app/api/payroll/leave-rules/route.ts", purpose: "LeaveRule rules" },
  { method: "GET", path: "/api/payroll/records", file: "app/api/payroll/records/route.ts", purpose: "List PayrollRecord rows" },
  { method: "GET/PUT", path: "/api/payroll/records/[id]", file: "app/api/payroll/records/[id]/route.ts", purpose: "Single record CRUD" },
  { method: "POST", path: "/api/payroll/auto-generate", file: "app/api/payroll/auto-generate/route.ts", purpose: "Auto-build payroll for a month" },
  { method: "POST", path: "/api/payroll/save", file: "app/api/payroll/save/route.ts", purpose: "Persist edited payroll" },
  { method: "GET", path: "/api/payroll/stats", file: "app/api/payroll/stats/route.ts", purpose: "KPIs for dashboard" },
  { method: "GET", path: "/api/attendance", file: "app/api/attendance/route.ts", purpose: "List attendance_records" },
  { method: "GET", path: "/api/attendance/status", file: "app/api/attendance/status/route.ts", purpose: "'Can I check in right now?'" },
  { method: "POST", path: "/api/forms/[formId]/attendance/checkin", file: "app/api/forms/[formId]/attendance/checkin/route.ts", purpose: "Form-scoped check-in" },
  { method: "POST", path: "/api/forms/[formId]/attendance/checkout", file: "app/api/forms/[formId]/attendance/checkout/route.ts", purpose: "Form-scoped check-out" },
  { method: "GET", path: "/api/employees", file: "app/api/employees/route.ts", purpose: "List employees" },
  { method: "GET", path: "/api/employee-records", file: "app/api/employee-records/route.ts", purpose: "Form records linked to Employee Master" },
  { method: "POST", path: "/api/create-user-from-employee", file: "app/api/create-user-from-employee/route.ts", purpose: "Promote employee to system user" },
] as const

const GLOSSARY = [
  ["Form", "A record template defined entirely in the database (modules → forms → sections → fields)."],
  ["Field", "A single input on a form. Stable IDs like fld_emp_first_name."],
  ["Section", "A visual grouping of fields inside a form. May be collapsible."],
  ["Formula field", "A read-only field that evaluates an expression (e.g. vacancies × cost_per)."],
  ["Lookup field", "A field that references another form's records (e.g. Job Application's Opening ID)."],
  ["CrmFunction", "Sandboxed JavaScript snippet stored in crm_functions. Runs in a Node VM."],
  ["WorkflowRule", "Server-side rule that fires after a record is Created / Edited / Deleted."],
  ["FunctionBinding", "Client-side binding that fires a function on a UI event (onFieldChange, beforeSubmit)."],
  ["Auto-output mode", "Function return-value behaviour: keys are matched against the current form's field IDs / API names / labels and written into the record."],
  ["KRA", "Key Result Area — a goal template used during appraisals."],
  ["Kaizen", "Japanese: 'continuous improvement'. A logged improvement project with before/after media."],
  ["Engagement Points", "Gamification score awarded by the Engagement forms (Self Target, Initiative, Problem, Kaizen, Suggestion)."],
  ["Surface A / B (Attendance)", "Form-driven records (A) used by payroll, vs the attendance_records table (B) used by the live 'can I check in?' widget."],
] as const

/* ─────────────────────────────────────────────────────────────────────────
   PAGE
   ───────────────────────────────────────────────────────────────────────── */

export default function HrCompleteGuidePage() {
  const [active, setActive] = useState<string>("overview")

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: "-30% 0px -60% 0px" }
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">HR System — Complete End-to-End Guide</h1>
                <Badge variant="secondary" className="text-[10px]">5 Modules</Badge>
                <Badge variant="secondary" className="text-[10px]">20 Forms</Badge>
                <Badge variant="secondary" className="text-[10px]">241 Fields</Badge>
                <Badge variant="secondary" className="text-[10px]">74 Automations</Badge>
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Every module, every form, every automation, every backend calculation engine that ships
                with the HR system. The companion markdown lives at{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">docs/HR_SYSTEM_COMPLETE_GUIDE.md</code>.
                For the animated, illustrated reference, see{" "}
                <Link href="/settings/docs/hr-system" className="text-primary underline-offset-2 hover:underline">
                  HR System — In-Depth Reference
                </Link>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body: TOC + content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
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

          <main className="min-w-0 space-y-12">
            <OverviewSection />
            <DataModelSection />
            <ModuleMapSection />
            <FormsSection />
            <AutomationSection />
            <FunctionsSection />
            <RulesSection />
            <BindingsSection />
            <AutofillSection />
            <AttendanceSection />
            <LeaveSection />
            <PayrollSection />
            <RecruitmentSection />
            <EngagementSection />
            <AssetSection />
            <PermissionsSection />
            <BootstrapSection />
            <ApiSection />
            <FilesSection />
            <GlossarySection />
            <Footer />
          </main>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   PRIMITIVES
   ───────────────────────────────────────────────────────────────────────── */

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

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: any
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">
      {children}
    </code>
  )
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-3 text-[11px] leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  )
}

function Note({ children, kind = "info" }: { children: React.ReactNode; kind?: "info" | "warn" }) {
  const styles =
    kind === "warn"
      ? "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200"
      : "border-blue-500/30 bg-blue-500/5 text-blue-900 dark:text-blue-200"
  return (
    <div className={`rounded-md border p-3 text-xs leading-relaxed ${styles}`}>{children}</div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   SECTIONS
   ───────────────────────────────────────────────────────────────────────── */

function OverviewSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="overview"
        icon={Layers}
        eyebrow="Big Picture"
        title="What the HR System Is"
        sub="A form-driven, low-code module on top of the generic form/record engine. There is no hand-written 'Employee' page or 'Leave' page; every screen is a generic form renderer reading metadata from the database."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {MODULES.map((m) => {
          const Icon = m.icon
          return (
            <div
              key={m.name}
              className={`rounded-lg border bg-gradient-to-br p-4 ${m.color} ${m.border}`}
            >
              <Icon className={`mb-2 h-5 w-5 ${m.iconColor}`} />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Module
              </p>
              <p className="text-sm font-bold text-foreground">{m.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{m.forms} forms</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Box} label="Modules" value="25" sub="1 root + 5 top + 19 sub" />
        <StatCard icon={FileCode2} label="Forms" value="20" sub="across 31 sections" />
        <StatCard icon={Hash} label="Fields" value="241" />
        <StatCard icon={Zap} label="Automations" value="74" sub="16 fn + 36 rule + 22 binding" />
      </div>

      <Note>
        Two SQL files build the entire system and both are <strong>idempotent</strong> (delete-then-upsert), so they can be re-run safely:
        <ul className="ml-5 mt-1 list-disc">
          <li><Code>scripts/create-hr-module.sql</Code> — modules, forms, sections, fields, permissions, routes</li>
          <li><Code>scripts/create-hr-automations.sql</Code> — functions, workflow rules, function bindings</li>
        </ul>
      </Note>
    </section>
  )
}

function DataModelSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="datamodel"
        icon={Database}
        eyebrow="Data Model"
        title="Modules → Forms → Sections → Fields"
        sub="Every visible UI is built from this metadata. Records are submitted instances of a form."
      />

      <Pre>{`form_modules (HR root)
 ├── form_modules (top-level: HR Core, Recruitment, …)
 │    └── form_modules (sub-module: Employee Master, …)
 │         └── forms (e.g. Employee Master)
 │              └── form_sections (Personal Info, Contact, …)
 │                   └── form_fields (Salutation, First Name, …)
 │                        └── formula_fields (computed)
 │
 └── records (form submissions: each row = one filled-in form)
      ▲
      │ written by /api/forms/:formId  +  workflow engine`}</Pre>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left font-semibold">Table</th>
              <th className="p-2 text-left font-semibold">Purpose</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[
              ["form_modules", "Hierarchy (parent_id lets sub-modules nest)."],
              ["forms", "One per business form. is_published, isEmployeeForm."],
              ["form_sections", "Section header inside a form. order, columns, collapsible."],
              ["form_fields", "Individual input. type, validation, options, width, order."],
              ["formula_fields", "Computed field tied to a form_field of type 'formula'."],
              ["crm_functions", "JavaScript snippets executed in a VM sandbox."],
              ["workflow_rules", "Rules fired on Create/Edit/Delete of records."],
              ["function_bindings", "Wires a function to a form/field event."],
              ["payroll_configurations", "Tells the payroll engine which forms to read."],
              ["payroll_records", "Output of payroll runs (one row per employee per month)."],
              ["attendance_records", "Lightweight check-in/out log keyed by (userId, date)."],
              ["leave_types / leave_rules", "Master + rule rows for leave categorisation."],
              ["employees", "Optional canonical employee row (linked to User)."],
            ].map(([t, p]) => (
              <tr key={t}>
                <td className="p-2"><Code>{t}</Code></td>
                <td className="p-2 text-muted-foreground">{p}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ModuleMapSection() {
  const grouped = MODULES.map((m) => ({
    module: m.name,
    icon: m.icon,
    color: m.iconColor,
    forms: FORMS.filter((f) => f.module === m.name),
  }))
  return (
    <section className="space-y-4">
      <SectionHeading
        id="modulemap"
        icon={ListTree}
        eyebrow="Hierarchy"
        title="Module Map"
        sub="5 modules, 19 sub-modules, 20 forms, 241 fields. Click any form below to jump to its details."
      />

      <div className="space-y-3">
        {grouped.map((g) => {
          const Icon = g.icon
          return (
            <div key={g.module} className="rounded-lg border bg-background p-3">
              <div className="mb-2 flex items-center gap-2">
                <Icon className={`h-4 w-4 ${g.color}`} />
                <h3 className="text-sm font-semibold text-foreground">{g.module}</h3>
                <Badge variant="outline" className="text-[10px]">{g.forms.length} forms</Badge>
              </div>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {g.forms.map((f) => (
                  <li key={f.id}>
                    <a
                      href="#forms"
                      className="block rounded px-2 py-1 text-xs hover:bg-muted"
                    >
                      <span className="font-medium text-foreground">{f.name}</span>
                      <span className="text-muted-foreground"> · {f.fields} fields</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <Note>
        Field-count check: <Code>52 + 9 + 6 + 10 + 5 + 9 + 11 + 15 + 10 + 8 + 10 + 4 + 7 + 8 + 9 + 12 + 19 + 11 + 11 + 15 = 241</Code> ✓
      </Note>
    </section>
  )
}

function FormsSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="forms"
        icon={FileCode2}
        eyebrow="Forms"
        title="The 20 HR Forms"
        sub="Every form below lists its module, field count, and a one-line summary of what it captures and how it behaves."
      />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left font-semibold">Module</th>
              <th className="p-2 text-left font-semibold">Form</th>
              <th className="p-2 text-left font-semibold">ID</th>
              <th className="p-2 text-center font-semibold">Fields</th>
              <th className="p-2 text-center font-semibold">Sections</th>
              <th className="p-2 text-left font-semibold">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {FORMS.map((f) => (
              <tr key={f.id}>
                <td className="p-2 text-muted-foreground">{f.module}</td>
                <td className="p-2 font-medium text-foreground">{f.name}</td>
                <td className="p-2"><Code>{f.id}</Code></td>
                <td className="p-2 text-center">{f.fields}</td>
                <td className="p-2 text-center">{f.sections}</td>
                <td className="p-2 text-muted-foreground">{f.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AutomationSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="automation"
        icon={GitBranch}
        eyebrow="Architecture"
        title="The 3-Layer Automation Fabric"
        sub="Every reactive behaviour is one of three things. Knowing which layer a behaviour lives in tells you when it fires."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-background p-3">
          <div className="mb-1 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Layer 1 — CrmFunction</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>The verb.</strong> A single sandboxed JavaScript snippet. Receives <Code>ctx.input</Code>, returns an object whose keys become field updates.
          </p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <div className="mb-1 flex items-center gap-2">
            <Workflow className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold">Layer 2 — WorkflowRule</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Server-side, fires AFTER</strong> Create / Edit / Delete. Evaluates conditions, then runs Field Updates or Functions.
          </p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <div className="mb-1 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold">Layer 3 — FunctionBinding</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Client-side, fires DURING</strong> user typing (<Code>onFieldChange</Code> debounced 300 ms) or just before submit. Powers live-recalc UX.
          </p>
        </div>
      </div>

      <Pre>{`triggerWorkflowsForRecord({
  moduleName: 'Leave Management',
  action: 'Create',
  organizationId,
  userId,
  recordId,
  recordData,
})`}</Pre>

      <Note>
        The engine lives in <Code>lib/workflow/trigger.ts</Code>. It is fire-and-forget — failures are
        swallowed and logged so a buggy automation can never break a record save. Three action types
        are supported: <Code>"Field Update"</Code>, <Code>"Function"</Code>, <Code>"Email Notification"</Code>.
      </Note>
    </section>
  )
}

function FunctionsSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="functions"
        icon={Zap}
        eyebrow="Layer 1"
        title="All 16 Automation Functions"
        sub="Reusable JS snippets. Categories: Defaults · Calculation · Lifecycle · Points · Lookup."
      />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left font-semibold">ID</th>
              <th className="p-2 text-left font-semibold">Display Name</th>
              <th className="p-2 text-left font-semibold">Category</th>
              <th className="p-2 text-left font-semibold">Used by</th>
              <th className="p-2 text-left font-semibold">Logic</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {FUNCTIONS.map((f) => (
              <tr key={f.id}>
                <td className="p-2"><Code>{f.id}</Code></td>
                <td className="p-2 font-medium text-foreground">{f.display}</td>
                <td className="p-2">
                  <Badge variant="outline" className="text-[10px]">{f.category}</Badge>
                </td>
                <td className="p-2 text-muted-foreground">{f.modules}</td>
                <td className="p-2 text-muted-foreground">{f.logic}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RulesSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="rules"
        icon={Workflow}
        eyebrow="Layer 2"
        title="All 36 Workflow Rules"
        sub="26 module rules + 10 employee auto-fill safety-net rules. Server-side, post-save."
      />

      <h3 className="text-sm font-semibold text-foreground">Module Rules (26)</h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left font-semibold">Rule ID</th>
              <th className="p-2 text-left font-semibold">Module</th>
              <th className="p-2 text-left font-semibold">Trigger</th>
              <th className="p-2 text-left font-semibold">Condition</th>
              <th className="p-2 text-left font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {RULES.map((r) => (
              <tr key={r.id}>
                <td className="p-2"><Code>{r.id}</Code></td>
                <td className="p-2 text-muted-foreground">{r.module}</td>
                <td className="p-2"><Badge variant="outline" className="text-[10px]">{r.trigger}</Badge></td>
                <td className="p-2 text-muted-foreground">{r.condition}</td>
                <td className="p-2 text-foreground">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-sm font-semibold text-foreground">Auto-Fill Safety-Net Rules (10)</h3>
      <p className="text-xs text-muted-foreground">
        Server-side backstops for the <Code>onFieldChange</Code> bindings. If the live debounced
        auto-fill misses, the rule fires on save and <em>always</em> populates the employee info.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left font-semibold">Rule ID</th>
              <th className="p-2 text-left font-semibold">Module</th>
              <th className="p-2 text-left font-semibold">Trigger</th>
              <th className="p-2 text-left font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {AUTOFILL_RULES.map((r) => (
              <tr key={r.id}>
                <td className="p-2"><Code>{r.id}</Code></td>
                <td className="p-2 text-muted-foreground">{r.module}</td>
                <td className="p-2"><Badge variant="outline" className="text-[10px]">Create or Edit</Badge></td>
                <td className="p-2 text-foreground">fn_hr_lookup_employee</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BindingsSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="bindings"
        icon={Wrench}
        eyebrow="Layer 3"
        title="All 22 Function Bindings"
        sub="Client-side. 12 calculation/lifecycle bindings + 10 employee auto-fill bindings."
      />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left font-semibold">Form</th>
              <th className="p-2 text-left font-semibold">Field</th>
              <th className="p-2 text-left font-semibold">Event</th>
              <th className="p-2 text-left font-semibold">Function</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {BINDINGS.map((b, i) => (
              <tr key={i}>
                <td className="p-2 text-muted-foreground">{b.form}</td>
                <td className="p-2 font-medium text-foreground">{b.field}</td>
                <td className="p-2"><Badge variant="outline" className="text-[10px]">{b.event}</Badge></td>
                <td className="p-2"><Code>{b.fn}</Code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AutofillSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="autofill"
        icon={Network}
        eyebrow="Deep Dive"
        title="Employee Auto-Fill — One Function, 10 Forms"
        sub="The most-leveraged piece of the HR system. Fuzzy-matches Employee ID against Employee Master and writes back First/Middle/Last Name + Department."
      />

      <div className="rounded-lg border bg-background p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">User-Visible Behaviour</h3>
        <ol className="ml-5 list-decimal space-y-1 text-xs text-muted-foreground">
          <li>User opens any auto-fill form (e.g. Kaizen).</li>
          <li>Types <Code>EMP-001</Code> (or <Code>emp 1</Code>, or <Code>EMP-0001</Code> — all match).</li>
          <li>After 300 ms of pause, First Name, Middle Name (if present), Last Name, and Department populate themselves.</li>
          <li>User saves. Even if step 3 raced and missed, the server-side rule re-runs the lookup and writes the values into the saved record.</li>
        </ol>
      </div>

      <Pre>{`function norm(s) {
  return String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/\\s+/g, '')
    // Strip leading zeros in every digit run: "EMP-0001" → "EMP-1"
    .replace(/(\\d+)/g, n => String(Number(n)));
}`}</Pre>

      <Note>
        <strong>Defence in depth:</strong> the <Code>onFieldChange</Code> binding gives instant UX,
        the <Code>Create or Edit</Code> workflow rule guarantees data integrity even when the client
        misfires. Same function, two surfaces.
      </Note>
    </section>
  )
}

function AttendanceSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="attendance"
        icon={Clock}
        eyebrow="Subsystem"
        title="Attendance — Two-Surface Design"
        sub="Two parallel attendance surfaces; you need to know when each applies."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-background p-3">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Surface A — Form-driven Check In/Out</h3>
          <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
            <li>Forms <Code>form_hr_checkin</Code>, <Code>form_hr_checkout</Code></li>
            <li>Records via <Code>/api/forms/[formId]/records</Code></li>
            <li>Triggers <Code>fn_hr_attendance_stamp</Code> + <Code>fn_hr_lookup_employee</Code></li>
            <li>Captures GPS + selfie</li>
            <li><strong>Operational source for Payroll Engine</strong></li>
          </ul>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Surface B — Legacy Attendance Widget</h3>
          <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
            <li>Backed by <Code>attendance_records</Code> Prisma table</li>
            <li>Routes: <Code>/api/attendance</Code>, <Code>/api/attendance/status</Code></li>
            <li>One row per <Code>(userId, date)</Code></li>
            <li><strong>Used by dashboard widget for live status only</strong></li>
          </ul>
        </div>
      </div>
    </section>
  )
}

function LeaveSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="leave"
        icon={Calendar}
        eyebrow="Subsystem"
        title="Leave Management"
        sub="LeaveType + LeaveRule master data + 2-step approval flow."
      />

      <h3 className="text-sm font-semibold text-foreground">Master Data (seeded)</h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left">Leave Type</th>
              <th className="p-2 text-left">Rule</th>
              <th className="p-2 text-center">Deduction %</th>
              <th className="p-2 text-center">isPaid</th>
              <th className="p-2 text-center">Affects Attendance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr><td className="p-2">Full Day Leave</td><td className="p-2">Sick Leave</td><td className="p-2 text-center">0</td><td className="p-2 text-center">true</td><td className="p-2 text-center">true</td></tr>
            <tr><td className="p-2">Full Day Leave</td><td className="p-2">Casual Leave</td><td className="p-2 text-center">100</td><td className="p-2 text-center">false</td><td className="p-2 text-center">true</td></tr>
            <tr><td className="p-2">Half Day Leave</td><td className="p-2">Half Day (4 hrs)</td><td className="p-2 text-center">100</td><td className="p-2 text-center">false</td><td className="p-2 text-center">true</td></tr>
            <tr><td className="p-2">Short Leave</td><td className="p-2">Short Leave (2 hrs)</td><td className="p-2 text-center">100</td><td className="p-2 text-center">false</td><td className="p-2 text-center">false</td></tr>
          </tbody>
        </table>
      </div>

      <h3 className="text-sm font-semibold text-foreground">End-to-End Flow</h3>
      <Pre>{`Employee opens Leave Application
   │  Auto-fill on Employee ID change (binding)
   │  Total Days formula on date change (binding)
   ▼
Submit → /api/forms/:formId/records
   │
   ├─► wfr_hr_leave_calc (re-runs days calc)
   ├─► wfr_hr_leave_auto_approve_short (1-day → mgr APPROVED)
   └─► wfr_hr_autofill_leave (server-side safety net)
                    │
                    ▼
            Manager opens record
                    │
   sets mgr_approval = REJECTED?
       └─► wfr_hr_leave_mgr_rejected → cascades hr_approval = REJECTED
                    │
   sets hr_approval = APPROVED?
       └─► wfr_hr_leave_fully_approved → fn_hr_leave_apply_status (logger)`}</Pre>
    </section>
  )
}

function PayrollSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="payroll"
        icon={Wallet}
        eyebrow="Subsystem"
        title="Payroll Engine — End-to-End"
        sub="Reads form-driven attendance/leave, runs the math, persists PayrollRecord rows."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-background p-3">
          <h3 className="mb-1 text-sm font-semibold">PayrollConfiguration</h3>
          <p className="text-xs text-muted-foreground">"Where do I read attendance/leave from?" — stores form IDs + field mappings.</p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <h3 className="mb-1 text-sm font-semibold">PayrollRecord</h3>
          <p className="text-xs text-muted-foreground">"What did this employee earn this month?" — one per (employee, month, year).</p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <h3 className="mb-1 text-sm font-semibold">Employee</h3>
          <p className="text-xs text-muted-foreground">Source for base salary (totalSalary), shift, overtime config.</p>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-foreground">Auto-Generation Flow</h3>
      <Pre>{`POST /api/payroll/auto-generate { month: '2026-04' }
 1. Fetch /api/forms/testing  → grouped by 'Employee Profile', 'Check-In', 'Check-Out'
 2. Build employeeProfiles map keyed by email
 3. Pair each Check-In with same-day Check-Out for that email
 4. Filter to records inside the requested month
 5. For each employee with attendance:
       baseSalary  = profile.totalSalary
       hourlyRate  = baseSalary / (22 × 8)        ← 22 days × 8 hrs assumed
       grossSalary = hourlyRate × totalWorkedHours
       pf          = floor(gross × 12%)            ← Provident Fund
       taxable     = gross − pf
       tax         = floor(taxable × 5%)           ← simplified income tax
       insurance   = 500                            ← flat monthly
       net         = max(0, gross − pf − tax − insurance)
 6. POST /api/payroll/save { payrolls, month, year }
 7. Return { success, payrolls, savedResult }`}</Pre>

      <h3 className="text-sm font-semibold text-foreground">UI Tabs at <Code>/payroll</Code></h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left">Tab</th>
              <th className="p-2 text-left">Component</th>
              <th className="p-2 text-left">Reads From</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr><td className="p-2">Dashboard</td><td className="p-2"><Code>payroll-analytics.tsx</Code></td><td className="p-2"><Code>/api/payroll/stats</Code></td></tr>
            <tr><td className="p-2">Attendance</td><td className="p-2"><Code>employee-manager.tsx</Code></td><td className="p-2">Attendance form + Employee table</td></tr>
            <tr><td className="p-2">Payroll</td><td className="p-2"><Code>payroll-engine.tsx</Code> + <Code>editable-payroll-table.tsx</Code></td><td className="p-2"><Code>/api/payroll/records</Code></td></tr>
            <tr><td className="p-2">Payslips</td><td className="p-2"><Code>payslip-preview.tsx</Code></td><td className="p-2"><Code>/api/payroll/records/[id]</Code></td></tr>
          </tbody>
        </table>
      </div>

      <Note kind="warn">
        Before <Code>auto-generate</Code> works, an admin must open the config dialog and pick which form
        is the Attendance form, which is the Leave form, and map the fields. Without it, the banner
        shows a warning and auto-generation refuses to run.
      </Note>
    </section>
  )
}

function RecruitmentSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="recruitment"
        icon={Briefcase}
        eyebrow="Subsystem"
        title="Recruitment Lifecycle"
        sub="Five-step pipeline from manpower request to formal letter, plus a side-channel for referrals."
      />

      <Pre>{`Staffing Plan ──► Job Opening ──► Job Application ──► Job Offer ──► Appointment Letter
   (manpower      (publish        (candidate          (offer          (formal
    + budget)      vacancy)        applies)            extended)       letter)
       │              │                │                  │                │
       │              │                │                  │                │
   compute       on FILLED         on Create:        on Create:        formatted
   total cost    auto-unpublish    copy JD from      stamp date+       from template
   (formula)     from website      Opening           DRAFT status      (4 templates)
                                       │                  │
                              on HIRED → rating=5    on ACCEPTED →
                              on REJECTED → rating=0  fld_offer_term =
                                                      "Accepted by applicant"`}</Pre>

      <Note>
        <strong>Public submission:</strong> Job Opening and Job Application have <Code>allow_anonymous = TRUE</Code>{" "}
        and <Code>require_login = FALSE</Code> — they can be embedded on a public careers page.
      </Note>
    </section>
  )
}

function EngagementSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="engagement"
        icon={HeartHandshake}
        eyebrow="Subsystem"
        title="Performance & Engagement"
        sub="KRA scoring + the gamification layer. Five Engagement forms award Employee Engagement Points on create."
      />

      <h3 className="text-sm font-semibold text-foreground">Engagement Points Map</h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left">Form</th>
              <th className="p-2 text-left">Default Points</th>
              <th className="p-2 text-left">Logic</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr><td className="p-2">Self Target</td><td className="p-2">50</td><td className="p-2 text-muted-foreground">fn_hr_suggestion_points (polymorphic)</td></tr>
            <tr><td className="p-2">Self Initiative</td><td className="p-2">40</td><td className="p-2 text-muted-foreground">fn_hr_suggestion_points</td></tr>
            <tr><td className="p-2">Problem Registration</td><td className="p-2">30</td><td className="p-2 text-muted-foreground">fn_hr_problem_points</td></tr>
            <tr>
              <td className="p-2">Kaizen</td>
              <td className="p-2"><strong>Area-based</strong></td>
              <td className="p-2 text-muted-foreground">SAFETY=100, QUALITY=80, COST=80, DELIVERY/PRODUCTIVITY=70, MORALE/ENVIRONMENT=60, else 50</td>
            </tr>
            <tr><td className="p-2">Employee Suggestion</td><td className="p-2">20</td><td className="p-2 text-muted-foreground">fn_hr_suggestion_points</td></tr>
          </tbody>
        </table>
      </div>

      <Note>
        Performance Appraisal is simpler: <Code>Score Earned = Weightage × Score / 10</Code>, computed
        live as you type via <Code>fn_hr_appraisal_score</Code> bound to Weightage and Score.
      </Note>
    </section>
  )
}

function AssetSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="asset"
        icon={Laptop}
        eyebrow="Subsystem"
        title="Asset & SIM Lifecycle"
        sub="Status auto-flips based on whether Employee ID is filled. Marking LOST clears or blocks."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-background p-3">
          <div className="mb-1 flex items-center gap-2">
            <Laptop className="h-4 w-4 text-rose-500" />
            <h3 className="text-sm font-semibold">Asset Management</h3>
          </div>
          <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
            <li>Employee filled → <Code>ASSIGNED</Code></li>
            <li>Employee blank → <Code>IN_STOCK</Code></li>
            <li>Status set to <Code>LOST</Code> → clears Employee ID</li>
            <li>14 asset types: LAPTOP, DESKTOP, MOBILE, TABLET, MONITOR, …</li>
            <li>Statuses: IN_STOCK, ASSIGNED, REPAIR, LOST, DAMAGED, RETIRED, RETURNED</li>
          </ul>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <div className="mb-1 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-rose-500" />
            <h3 className="text-sm font-semibold">SIM Management</h3>
          </div>
          <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
            <li>Employee filled → <Code>ACTIVE</Code></li>
            <li>Employee blank → <Code>INACTIVE</Code></li>
            <li>Status set to <Code>LOST</Code> → forces <Code>BLOCKED</Code> (carrier action)</li>
          </ul>
        </div>
      </div>
    </section>
  )
}

function PermissionsSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="permissions"
        icon={Shield}
        eyebrow="RBAC"
        title="Permissions & Routes"
        sub="5 HR permissions + 25 route patterns + 1 admin role + 45 user-permission grants for the bootstrap user."
      />

      <h3 className="text-sm font-semibold text-foreground">Permissions (5)</h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Category</th>
              <th className="p-2 text-left">Resource</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr><td className="p-2"><Code>perm_hr_admin</Code></td><td className="p-2">HR Admin</td><td className="p-2">ADMIN</td><td className="p-2">*</td></tr>
            <tr><td className="p-2"><Code>perm_hr_view</Code></td><td className="p-2">HR View</td><td className="p-2">READ</td><td className="p-2">hr</td></tr>
            <tr><td className="p-2"><Code>perm_hr_create</Code></td><td className="p-2">HR Create</td><td className="p-2">WRITE</td><td className="p-2">hr</td></tr>
            <tr><td className="p-2"><Code>perm_hr_edit</Code></td><td className="p-2">HR Edit</td><td className="p-2">WRITE</td><td className="p-2">hr</td></tr>
            <tr><td className="p-2"><Code>perm_hr_delete</Code></td><td className="p-2">HR Delete</td><td className="p-2">DELETE</td><td className="p-2">hr</td></tr>
          </tbody>
        </table>
      </div>

      <Note>
        For non-admin users, add <Code>user_permissions</Code> rows pointing at <Code>perm_hr_view</Code>
        (or create/edit/delete) scoped to specific <Code>module_id</Code> or <Code>form_id</Code> values.
        Middleware checks form-level grants before allowing record CRUD.
      </Note>
    </section>
  )
}

function BootstrapSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="bootstrap"
        icon={Rocket}
        eyebrow="Setup"
        title="Bootstrap & Seed"
        sub="How to stand the entire HR system up from a clean database. Both SQL files are idempotent."
      />

      <Pre>{`# Pre-requisite: an organizations row and a users row already exist.
# IDs are hard-coded in both SQL files; either match them or edit
# v_org_id / v_user_id at the top of each script.

# 1. Build the structure (modules / forms / sections / fields / permissions)
psql $DATABASE_URL -f scripts/create-hr-module.sql

# 2. Build the automation layer (functions / rules / bindings)
psql $DATABASE_URL -f scripts/create-hr-automations.sql

# 3. Seed leave master data
pnpm tsx scripts/seed-leave-types.ts

# 4. (Optional) Insert demo employees for testing
psql $DATABASE_URL -f scripts/insert-dummy-employees.sql

# 5. (Optional) Loosen field requirements during demo
psql $DATABASE_URL -f scripts/relax-hr-required-fields.sql`}</Pre>

      <h3 className="text-sm font-semibold text-foreground">Verification Queries</h3>
      <Pre>{`-- Field count per form (should sum to 241)
SELECT f.name, COUNT(ff.id) AS field_count
  FROM forms f
  JOIN form_sections s ON s.form_id = f.id
  JOIN form_fields ff  ON ff.section_id = s.id
  JOIN form_modules m  ON m.id = f.module_id
 WHERE m.organization_id = 'cmo9uk3440005u7ngdg652eoq'
 GROUP BY f.name ORDER BY f.name;

-- All HR functions
SELECT id, display_name, category FROM crm_functions
 WHERE id LIKE 'fn_hr_%' ORDER BY id;

-- Workflow rules per module
SELECT module_name, name, record_action, active
  FROM workflow_rules
 WHERE id LIKE 'wfr_hr_%' ORDER BY module_name, name;`}</Pre>
    </section>
  )
}

function ApiSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="api"
        icon={Server}
        eyebrow="Backend"
        title="API Reference"
        sub="All 18 HR-related endpoints with their file paths and one-line purpose."
      />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left">Method</th>
              <th className="p-2 text-left">Path</th>
              <th className="p-2 text-left">File</th>
              <th className="p-2 text-left">Purpose</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {API_ROUTES.map((r) => (
              <tr key={r.path}>
                <td className="p-2"><Badge variant="outline" className="text-[10px]">{r.method}</Badge></td>
                <td className="p-2"><Code>{r.path}</Code></td>
                <td className="p-2 text-muted-foreground">{r.file}</td>
                <td className="p-2 text-muted-foreground">{r.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function FilesSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="files"
        icon={ScrollText}
        eyebrow="Code Map"
        title="File Inventory"
        sub="Where every piece of the HR system lives in this repo."
      />

      <div className="space-y-3">
        <FileGroup
          title="SQL & Seed Scripts (scripts/)"
          rows={[
            ["create-hr-module.sql", "Modules, forms, sections, fields, permissions, routes"],
            ["create-hr-automations.sql", "Functions, workflow rules, function bindings"],
            ["seed-leave-types.ts", "LeaveType + LeaveRule seeds"],
            ["insert-dummy-employees.sql", "Demo data"],
            ["relax-hr-required-fields.sql", "Loosens required-field validation for demos"],
            ["fix-hr-form-mappings.sql", "Repair payroll-config field mappings"],
          ]}
        />

        <FileGroup
          title="Pages (app/)"
          rows={[
            ["app/payroll/page.tsx", "Payroll dashboard — 4 tabs"],
            ["app/forms/[formId]/page.tsx", "Generic form renderer (used by all 20 HR forms)"],
            ["app/forms/[formId]/records/page.tsx", "Record list view"],
            ["app/[module_name]/[module_Id]/[[...slug]]/page.tsx", "Dynamic module router"],
            ["app/settings/docs/hr-system/page.tsx", "In-app reference (animated)"],
            ["app/settings/docs/hr-complete-guide/page.tsx", "This page (text reference)"],
          ]}
        />

        <FileGroup
          title="Components (components/)"
          rows={[
            ["components/payroll/payroll-dashboard.tsx", "Payroll page layout"],
            ["components/payroll/payroll-engine.tsx", "Auto-generate UI"],
            ["components/payroll/editable-payroll-table.tsx", "In-place editing table"],
            ["components/payroll/payroll-config-dialog.tsx", "Form mapping config"],
            ["components/payroll/leave-rules-manager.tsx", "Leave-rule CRUD"],
            ["components/payroll/payslip-preview.tsx", "Payslip print view"],
            ["components/forms/attendance-form-dialog.tsx", "Modal check-in/out"],
            ["components/employee-manager.tsx", "Daily attendance tracker"],
          ]}
        />

        <FileGroup
          title="Library (lib/)"
          rows={[
            ["lib/workflow/trigger.ts", "Workflow rule engine"],
            ["lib/functions/executor.ts", "VM sandbox for crm_functions"],
            ["lib/api/payroll.ts", "RTK Query hooks"],
            ["lib/attendance.ts", "Helpers for check-in/out + queries"],
            ["lib/utils/payroll-utils.ts", "Payroll math (gross/net, deductions)"],
            ["lib/database/DatabaseRecords.ts", "Generic record CRUD"],
            ["lib/email", "Email sender for workflow Email Notification actions"],
          ]}
        />
      </div>
    </section>
  )
}

function FileGroup({
  title,
  rows,
}: {
  title: string
  rows: Array<[string, string]>
}) {
  return (
    <div className="rounded-lg border bg-background">
      <div className="border-b bg-muted/30 px-3 py-2">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      </div>
      <ul className="divide-y">
        {rows.map(([file, desc]) => (
          <li key={file} className="grid grid-cols-1 gap-1 p-2 text-xs sm:grid-cols-[2fr_3fr] sm:gap-3">
            <Code>{file}</Code>
            <span className="text-muted-foreground">{desc}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function GlossarySection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        id="glossary"
        icon={KeyRound}
        eyebrow="Reference"
        title="Glossary"
        sub="Terms used throughout this guide."
      />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left">Term</th>
              <th className="p-2 text-left">Meaning</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {GLOSSARY.map(([term, meaning]) => (
              <tr key={term}>
                <td className="p-2 font-medium text-foreground">{term}</td>
                <td className="p-2 text-muted-foreground">{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t pt-6 text-center">
      <p className="text-xs text-muted-foreground">
        Markdown source: <Code>docs/HR_SYSTEM_COMPLETE_GUIDE.md</Code> · Bootstrapped by{" "}
        <Code>scripts/create-hr-module.sql</Code> + <Code>scripts/create-hr-automations.sql</Code>
      </p>
    </footer>
  )
}
