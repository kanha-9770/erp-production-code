"use client"

/**
 * HR Forms — Working Visualizations.
 *
 * One page, 20 forms, one diagram per form. Each diagram shows how the
 * form actually behaves at runtime: what the user types, which client
 * binding fires (on what event), which server workflow rule fires after
 * save, and what the resulting record looks like.
 *
 * Uses framer-motion for entry animations and a 3-lane swim-lane layout
 * (User · Client · Server) so the flow of control is unambiguous.
 *
 * All form behaviour data is colocated in this file. Keep it in sync
 * with scripts/create-hr-module.sql + scripts/create-hr-automations.sql.
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { motion, useInView } from "framer-motion"
import {
  BookOpen,
  ChevronLeft,
  Users,
  Clock,
  Calendar,
  Briefcase,
  Target,
  Sparkles,
  Laptop,
  Smartphone,
  ScrollText,
  ArrowRight,
  ArrowDown,
  Hand,
  Cpu,
  Server,
  CheckCircle2,
  Search,
  Wand2,
  Mail,
  AlertTriangle,
  GitMerge,
  RefreshCcw,
  Trophy,
  Lightbulb,
  AlertCircle,
  Recycle,
  MessageSquare,
  FileText,
  Award,
  UserPlus,
  ClipboardList,
  Megaphone,
  Scroll,
  CalendarDays,
  Database,
  Box,
  PenTool,
  CalendarClock,
  Filter,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

/* ─────────────────────────────────────────────────────────────────────────
   FORM FLOW DATA
   Each entry describes the actual runtime behaviour of one HR form.
   ───────────────────────────────────────────────────────────────────────── */

type Lane = "user" | "client" | "server"

interface FlowStep {
  lane: Lane
  label: string
  detail?: string
  emphasis?: "default" | "highlight" | "danger"
}

interface FieldTrigger {
  field: string
  event: string
  fires: string
  result: string
}

interface FormFlow {
  id: string                 // anchor id (form_hr_*)
  name: string
  module: string
  icon: any
  color: string              // text color class for icon
  bg: string                 // background gradient classes
  fields: number
  sections: number
  intent: string             // one-line "what this form is for"
  steps: FlowStep[]          // left-to-right timeline
  triggers?: FieldTrigger[]  // per-field bindings
  postSave?: Array<{ rule: string; when: string; does: string }>
}

const FORMS: FormFlow[] = [
  /* ───────── HR CORE ───────── */
  {
    id: "form_hr_employee_master",
    name: "Employee Master",
    module: "HR Core",
    icon: Users,
    color: "text-blue-500",
    bg: "from-blue-500/10 to-blue-600/5 border-blue-500/30",
    fields: 52,
    sections: 7,
    intent: "Central source of truth for every employee. All other HR forms look up Employee ID against this form.",
    steps: [
      { lane: "user", label: "Open form", detail: "7 sections: Personal · Contact · Employment · Documents · Salary · Bank · Exit" },
      { lane: "user", label: "Fill required fields", detail: "Salutation, name, DOB, gender, addresses, Emp ID (unique), Dept, Joining date" },
      { lane: "client", label: "beforeSubmit binding", detail: "fn_hr_employee_onboarding — stamps defaults if blank: Status=ACTIVE, Hours=8, Nationality=Indian", emphasis: "highlight" },
      { lane: "user", label: "Submit", detail: "POST /api/forms/form_hr_employee_master/records" },
      { lane: "server", label: "wfr_hr_emp_onboarding", detail: "On Create: re-runs onboarding defaults as a server-side guarantee", emphasis: "highlight" },
      { lane: "server", label: "Record saved", detail: "Available to fn_hr_lookup_employee for all 10 auto-fill forms" },
    ],
    triggers: [
      { field: "(form)", event: "beforeSubmit", fires: "fn_hr_employee_onboarding", result: "Defaults: Status=ACTIVE, Hours=8, Nationality=Indian" },
    ],
    postSave: [
      { rule: "wfr_hr_emp_onboarding", when: "Create", does: "Stamp onboarding defaults" },
      { rule: "wfr_hr_emp_resigned", when: "Edit · status=RESIGNED", does: "Clear company email" },
      { rule: "wfr_hr_emp_terminated", when: "Edit · status=TERMINATED", does: "Set notice_served=true" },
    ],
  },

  {
    id: "form_hr_checkin",
    name: "Check In",
    module: "HR Core",
    icon: Clock,
    color: "text-blue-500",
    bg: "from-blue-500/10 to-blue-600/5 border-blue-500/30",
    fields: 9,
    sections: 1,
    intent: "Records the start of the workday. GPS location + front-camera selfie capture.",
    steps: [
      { lane: "user", label: "Type Employee ID", detail: 'e.g. "EMP-001" — fuzzy match supports "EMP-0001" and "emp 1"' },
      { lane: "client", label: "onFieldChange (300ms debounce)", detail: "fn_hr_lookup_employee — fetches Employee Master, auto-fills First Name, Last Name, Department", emphasis: "highlight" },
      { lane: "user", label: "Pick Shift Type, In Time, take selfie", detail: "Camera field uses capture: 'user' (front camera)" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_attendance_stamp", detail: "fn_hr_attendance_stamp — if In Date blank, defaults to today" },
      { lane: "server", label: "wfr_hr_autofill_attendance", detail: "Server-side safety net: re-runs lookup so name/dept ALWAYS populate even if client missed", emphasis: "highlight" },
    ],
    triggers: [
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_lookup_employee", result: "Auto-fills First Name, Last Name, Department" },
    ],
    postSave: [
      { rule: "wfr_hr_attendance_stamp", when: "Create", does: "Stamp In Date = today if blank" },
      { rule: "wfr_hr_autofill_attendance", when: "Create or Edit", does: "Server-side employee auto-fill safety net" },
    ],
  },

  {
    id: "form_hr_checkout",
    name: "Check Out",
    module: "HR Core",
    icon: Clock,
    color: "text-blue-500",
    bg: "from-blue-500/10 to-blue-600/5 border-blue-500/30",
    fields: 6,
    sections: 1,
    intent: "Records end of workday. Same auto-fill + timestamp pattern as Check In.",
    steps: [
      { lane: "user", label: "Type Employee ID" },
      { lane: "client", label: "onFieldChange", detail: "fn_hr_lookup_employee fills name+dept" , emphasis: "highlight" },
      { lane: "user", label: "Out Time, Out Date, selfie" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_attendance_stamp", detail: "Defaults Out Date = today if blank" },
      { lane: "server", label: "wfr_hr_autofill_attendance", detail: "Server-side employee lookup safety net", emphasis: "highlight" },
    ],
    triggers: [
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_lookup_employee", result: "Auto-fills First Name, Last Name, Department" },
    ],
  },

  {
    id: "form_hr_leave_application",
    name: "Leave Application",
    module: "HR Core",
    icon: Calendar,
    color: "text-blue-500",
    bg: "from-blue-500/10 to-blue-600/5 border-blue-500/30",
    fields: 10,
    sections: 2,
    intent: "Two-step approval. Manager rejects → cascades to HR REJECTED. Both approve → logged.",
    steps: [
      { lane: "user", label: "Type Employee ID" },
      { lane: "client", label: "Auto-fill (binding)", detail: "fn_hr_lookup_employee fills name + department", emphasis: "highlight" },
      { lane: "user", label: "Pick Start Date" },
      { lane: "client", label: "fn_hr_leave_calc_days", detail: "Won't compute yet — needs end date too" },
      { lane: "user", label: "Pick End Date" },
      { lane: "client", label: "fn_hr_leave_calc_days", detail: "Total Days = (end − start) + 1, written into formula field", emphasis: "highlight" },
      { lane: "user", label: "Type reason, submit" },
      { lane: "server", label: "wfr_hr_leave_calc", detail: "Re-runs total-days calc as guarantee" },
      { lane: "server", label: "wfr_hr_leave_auto_approve_short", detail: "If days===1: mgr_approval = APPROVED automatically", emphasis: "highlight" },
      { lane: "server", label: "wfr_hr_autofill_leave", detail: "Employee lookup safety net" },
      { lane: "user", label: "Manager opens record → APPROVED or REJECTED" },
      { lane: "server", label: "If REJECTED: wfr_hr_leave_mgr_rejected", detail: "Cascades: hr_approval = REJECTED", emphasis: "danger" },
      { lane: "user", label: "HR opens record → sets hr_approval = APPROVED" },
      { lane: "server", label: "wfr_hr_leave_fully_approved", detail: "fn_hr_leave_apply_status — currently logs (hook for future email/Slack)", emphasis: "highlight" },
    ],
    triggers: [
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_lookup_employee", result: "Name + department auto-fill" },
      { field: "Leave Start Date", event: "onFieldChange", fires: "fn_hr_leave_calc_days", result: "Total Days recalc (if end exists)" },
      { field: "Leave End Date", event: "onFieldChange", fires: "fn_hr_leave_calc_days", result: "Total Days = (end − start) + 1" },
    ],
    postSave: [
      { rule: "wfr_hr_leave_calc", when: "Create or Edit", does: "Re-run total days calc" },
      { rule: "wfr_hr_leave_auto_approve_short", when: "Create", does: "If days===1, mgr_approval = APPROVED" },
      { rule: "wfr_hr_leave_mgr_rejected", when: "Edit · mgr_approval=REJECTED", does: "Cascade hr_approval = REJECTED" },
      { rule: "wfr_hr_leave_fully_approved", when: "Edit · hr_approval=APPROVED", does: "Log fully-approved (hook point for emails)" },
      { rule: "wfr_hr_autofill_leave", when: "Create or Edit", does: "Server-side employee auto-fill" },
    ],
  },

  {
    id: "form_hr_holiday_list",
    name: "Holiday List",
    module: "HR Core",
    icon: CalendarDays,
    color: "text-blue-500",
    bg: "from-blue-500/10 to-blue-600/5 border-blue-500/30",
    fields: 5,
    sections: 1,
    intent: "Calendar of organisational holidays. Each row = one holiday entry.",
    steps: [
      { lane: "user", label: "Fill list name, date, type", detail: "Type: NATIONAL/RELIGIOUS/REGIONAL/COMPANY/OPTIONAL/RESTRICTED" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_holiday_count", detail: "fn_hr_holiday_count — defaults Total No. of Holidays = 1 if blank", emphasis: "highlight" },
    ],
    postSave: [
      { rule: "wfr_hr_holiday_count", when: "Create", does: "Default Total Holidays to 1" },
    ],
  },

  /* ───────── RECRUITMENT ───────── */
  {
    id: "form_hr_staffing_plan",
    name: "Staffing Plan",
    module: "Recruitment",
    icon: ClipboardList,
    color: "text-violet-500",
    bg: "from-violet-500/10 to-violet-600/5 border-violet-500/30",
    fields: 9,
    sections: 1,
    intent: "Manpower request. Total Cost = Vacancies × Cost Per Person, computed live.",
    steps: [
      { lane: "user", label: "Fill profile, dept, designation" },
      { lane: "user", label: "Type No. of Vacancies" },
      { lane: "client", label: "fn_hr_staff_total_cost", detail: "Total Cost = vacancies × cost_per_person" , emphasis: "highlight" },
      { lane: "user", label: "Type Estimated Cost / Person" },
      { lane: "client", label: "fn_hr_staff_total_cost", detail: "Live recalc — Total Cost updates instantly", emphasis: "highlight" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_staff_total_cost", detail: "Re-runs server-side as guarantee" },
    ],
    triggers: [
      { field: "No. of Vacancies", event: "onFieldChange", fires: "fn_hr_staff_total_cost", result: "Total Cost recalculated" },
      { field: "Estimated Cost / Person", event: "onFieldChange", fires: "fn_hr_staff_total_cost", result: "Total Cost recalculated" },
    ],
    postSave: [
      { rule: "wfr_hr_staff_total_cost", when: "Create or Edit", does: "Server-side guarantee of total cost" },
    ],
  },

  {
    id: "form_hr_job_opening",
    name: "Job Opening",
    module: "Recruitment",
    icon: Megaphone,
    color: "text-violet-500",
    bg: "from-violet-500/10 to-violet-600/5 border-violet-500/30",
    fields: 11,
    sections: 1,
    intent: "Public-facing job posting. Anonymous-allowed. Status=FILLED auto-unpublishes.",
    steps: [
      { lane: "user", label: "Lookup Staffing Plan ID", detail: "Pre-fills profile + dept + designation" },
      { lane: "user", label: "Set Status (DRAFT/OPEN/FILLED), Publish toggle, JD" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "Record saved → public careers page can render it" },
      { lane: "user", label: "Later: HR sets Status = FILLED" },
      { lane: "server", label: "wfr_hr_opening_filled_close", detail: "Auto sets Publish on Website = false", emphasis: "highlight" },
    ],
    postSave: [
      { rule: "wfr_hr_opening_filled_close", when: "Edit · status=FILLED", does: "publish = false (removes from public site)" },
    ],
  },

  {
    id: "form_hr_job_application",
    name: "Job Application",
    module: "Recruitment",
    icon: FileText,
    color: "text-violet-500",
    bg: "from-violet-500/10 to-violet-600/5 border-violet-500/30",
    fields: 15,
    sections: 2,
    intent: "Anonymous candidate application. JD auto-copies from opening on create. Status drives rating.",
    steps: [
      { lane: "user", label: "Public visitor / employee opens form" },
      { lane: "user", label: "Lookup Job Opening ID", detail: "Required" },
      { lane: "user", label: "Fill name, email, phone, upload resume" },
      { lane: "client", label: "beforeSubmit binding", detail: "fn_hr_job_app_copy_desc — copies opening's JD into application (if blank)", emphasis: "highlight" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_app_copy_desc", detail: "Re-runs JD copy server-side" },
      { lane: "user", label: "HR reviews → sets Status = HIRED or REJECTED" },
      { lane: "server", label: "If HIRED: wfr_hr_app_hired_status", detail: "Stamps rating = 5", emphasis: "highlight" },
      { lane: "server", label: "If REJECTED: wfr_hr_app_rejected_note", detail: "Clears rating = 0", emphasis: "danger" },
    ],
    triggers: [
      { field: "(form)", event: "beforeSubmit", fires: "fn_hr_job_app_copy_desc", result: "Copy JD from linked opening" },
    ],
    postSave: [
      { rule: "wfr_hr_app_copy_desc", when: "Create", does: "Server-side JD copy" },
      { rule: "wfr_hr_app_hired_status", when: "Edit · status=HIRED", does: "rating = 5" },
      { rule: "wfr_hr_app_rejected_note", when: "Edit · status=REJECTED", does: "rating = 0" },
    ],
  },

  {
    id: "form_hr_job_offer",
    name: "Job Offer",
    module: "Recruitment",
    icon: Award,
    color: "text-violet-500",
    bg: "from-violet-500/10 to-violet-600/5 border-violet-500/30",
    fields: 10,
    sections: 1,
    intent: "Offer with date + status + T&C template. ACCEPTED triggers term update.",
    steps: [
      { lane: "user", label: "Lookup Opening + Application" },
      { lane: "user", label: "Fill applicant name, term, value" },
      { lane: "client", label: "beforeSubmit binding", detail: "fn_hr_offer_populate — Offer Date=today, Status=DRAFT if blank", emphasis: "highlight" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_offer_create", detail: "Re-runs offer defaults" },
      { lane: "user", label: "Later: applicant accepts → set Status = ACCEPTED" },
      { lane: "server", label: "wfr_hr_offer_accepted", detail: "Stamps fld_offer_term = 'Accepted by applicant'", emphasis: "highlight" },
    ],
    triggers: [
      { field: "(form)", event: "beforeSubmit", fires: "fn_hr_offer_populate", result: "Offer Date = today, Status = DRAFT" },
    ],
    postSave: [
      { rule: "wfr_hr_offer_create", when: "Create", does: "Stamp date + DRAFT status" },
      { rule: "wfr_hr_offer_accepted", when: "Edit · status=ACCEPTED", does: "term = 'Accepted by applicant'" },
    ],
  },

  {
    id: "form_hr_appointment_letter",
    name: "Appointment Letter",
    module: "Recruitment",
    icon: Scroll,
    color: "text-violet-500",
    bg: "from-violet-500/10 to-violet-600/5 border-violet-500/30",
    fields: 8,
    sections: 1,
    intent: "Printable letter from a 4-template library (Standard / Intern / Contract / Consultant).",
    steps: [
      { lane: "user", label: "Pick template", detail: "STANDARD · INTERN · CONTRACT · CONSULTANT" },
      { lane: "user", label: "Fill applicant name, company, date" },
      { lane: "user", label: "Edit Intro / Title / Description / Closing" },
      { lane: "user", label: "Submit → record saved as printable letter" },
    ],
  },

  {
    id: "form_hr_employee_referral",
    name: "Employee Referral",
    module: "Recruitment",
    icon: UserPlus,
    color: "text-violet-500",
    bg: "from-violet-500/10 to-violet-600/5 border-violet-500/30",
    fields: 10,
    sections: 1,
    intent: "Existing employee refers a candidate. Referrer info auto-fills from Employee ID.",
    steps: [
      { lane: "user", label: "Fill applicant info, upload resume" },
      { lane: "user", label: "Type referrer's Employee ID" },
      { lane: "client", label: "fn_hr_lookup_employee", detail: "Auto-fills referrer's First Name + Department", emphasis: "highlight" },
      { lane: "user", label: "Add remark, submit" },
      { lane: "server", label: "wfr_hr_autofill_ref", detail: "Server-side employee lookup safety net" },
    ],
    triggers: [
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_lookup_employee", result: "Referrer name + department auto-fill" },
    ],
  },

  /* ───────── PERFORMANCE ───────── */
  {
    id: "form_hr_kra_master",
    name: "KRA Master",
    module: "Performance",
    icon: Target,
    color: "text-amber-500",
    bg: "from-amber-500/10 to-amber-600/5 border-amber-500/30",
    fields: 4,
    sections: 1,
    intent: "Goal template. Department + Designation + Goal Name + Weightage.",
    steps: [
      { lane: "user", label: "Pick department, designation" },
      { lane: "user", label: "Define goal name + weightage (0-100)" },
      { lane: "user", label: "Submit → goal becomes available to Performance Appraisal" },
    ],
  },

  {
    id: "form_hr_performance_appraisal",
    name: "Performance Appraisal",
    module: "Performance",
    icon: Trophy,
    color: "text-amber-500",
    bg: "from-amber-500/10 to-amber-600/5 border-amber-500/30",
    fields: 7,
    sections: 1,
    intent: "Score Earned = Weightage × Score / 10, computed live as you type.",
    steps: [
      { lane: "user", label: "Fill employee name, dept, goal name" },
      { lane: "user", label: "Type Weightage (0-100)" },
      { lane: "client", label: "fn_hr_appraisal_score", detail: "round(weightage × score / 10, 2)", emphasis: "highlight" },
      { lane: "user", label: "Type Score (0-10)" },
      { lane: "client", label: "fn_hr_appraisal_score", detail: "Score Earned updates instantly", emphasis: "highlight" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_appraisal_score", detail: "Re-runs server-side as guarantee" },
    ],
    triggers: [
      { field: "Weightage", event: "onFieldChange", fires: "fn_hr_appraisal_score", result: "Score Earned recalc" },
      { field: "Score", event: "onFieldChange", fires: "fn_hr_appraisal_score", result: "Score Earned recalc" },
    ],
    postSave: [
      { rule: "wfr_hr_appraisal_score", when: "Create or Edit", does: "Server-side recalc of Score Earned" },
    ],
  },

  /* ───────── ENGAGEMENT ───────── */
  {
    id: "form_hr_self_target",
    name: "Self Target",
    module: "Engagement",
    icon: Target,
    color: "text-emerald-500",
    bg: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/30",
    fields: 8,
    sections: 1,
    intent: "Monthly self-defined target. Awards 50 engagement points on create.",
    steps: [
      { lane: "user", label: "Type Employee ID" },
      { lane: "client", label: "fn_hr_lookup_employee", detail: "Auto-fill name + department", emphasis: "highlight" },
      { lane: "user", label: "Pick Target Month, type Target text" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_tgt_default_points", detail: "fn_hr_suggestion_points awards 50 pts (polymorphic — detects fld_tgt_target)", emphasis: "highlight" },
      { lane: "server", label: "wfr_hr_autofill_tgt", detail: "Server-side employee lookup safety net" },
    ],
    triggers: [
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_lookup_employee", result: "Name + dept auto-fill" },
    ],
    postSave: [
      { rule: "wfr_hr_tgt_default_points", when: "Create", does: "Award 50 engagement points" },
      { rule: "wfr_hr_autofill_tgt", when: "Create or Edit", does: "Server-side employee auto-fill" },
    ],
  },

  {
    id: "form_hr_self_initiative",
    name: "Self Initiative",
    module: "Engagement",
    icon: Lightbulb,
    color: "text-emerald-500",
    bg: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/30",
    fields: 9,
    sections: 1,
    intent: "Voluntary initiative. Awards 40 engagement points on create.",
    steps: [
      { lane: "user", label: "Type Employee ID" },
      { lane: "client", label: "fn_hr_lookup_employee", detail: "Auto-fill name + department", emphasis: "highlight" },
      { lane: "user", label: "Pick Category, define initiative + benefits" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_init_default_points", detail: "fn_hr_suggestion_points awards 40 pts (detects fld_init_define)", emphasis: "highlight" },
      { lane: "server", label: "wfr_hr_autofill_init", detail: "Server-side employee lookup safety net" },
    ],
    triggers: [
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_lookup_employee", result: "Name + dept auto-fill" },
    ],
    postSave: [
      { rule: "wfr_hr_init_default_points", when: "Create", does: "Award 40 engagement points" },
      { rule: "wfr_hr_autofill_init", when: "Create or Edit", does: "Server-side employee auto-fill" },
    ],
  },

  {
    id: "form_hr_problem_registration",
    name: "Problem Registration",
    module: "Engagement",
    icon: AlertCircle,
    color: "text-emerald-500",
    bg: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/30",
    fields: 12,
    sections: 2,
    intent: "Two-section: Problem + Solution. Awards 30 engagement points on create.",
    steps: [
      { lane: "user", label: "Type Employee ID" },
      { lane: "client", label: "fn_hr_lookup_employee", detail: "Auto-fill name + department", emphasis: "highlight" },
      { lane: "user", label: "Section 1: Describe problem + impact + media" },
      { lane: "user", label: "Section 2: Solution + media + selfie" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_prob_default_points", detail: "fn_hr_problem_points awards 30 pts", emphasis: "highlight" },
      { lane: "server", label: "wfr_hr_autofill_prob", detail: "Server-side employee lookup safety net" },
    ],
    triggers: [
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_lookup_employee", result: "Name + dept auto-fill" },
    ],
    postSave: [
      { rule: "wfr_hr_prob_default_points", when: "Create", does: "Award 30 engagement points" },
      { rule: "wfr_hr_autofill_prob", when: "Create or Edit", does: "Server-side employee auto-fill" },
    ],
  },

  {
    id: "form_hr_kaizen",
    name: "Kaizen",
    module: "Engagement",
    icon: Recycle,
    color: "text-emerald-500",
    bg: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/30",
    fields: 19,
    sections: 3,
    intent: "Improvement project. Points awarded based on Kaizen Area (Safety=100, Quality=80, …).",
    steps: [
      { lane: "user", label: "Type Employee ID" },
      { lane: "client", label: "fn_hr_lookup_employee", detail: "Auto-fill First / Middle / Last Name + Department", emphasis: "highlight" },
      { lane: "user", label: "Section 1: Pick Area, Start Date, Theme" },
      { lane: "client", label: "fn_hr_kaizen_points", detail: "Sets points: SAFETY=100, QUALITY=80, COST=80, DELIVERY/PRODUCTIVITY=70, MORALE/ENVIRONMENT=60, else 50", emphasis: "highlight" },
      { lane: "user", label: "Section 2: Problem + Before/After media + Why analysis" },
      { lane: "user", label: "Section 3: Result + Benefits + Signature + Selfie" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_kaizen_points", detail: "Re-runs area-based points server-side" },
      { lane: "server", label: "wfr_hr_autofill_kz", detail: "Server-side employee lookup safety net" },
    ],
    triggers: [
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_lookup_employee", result: "Name + dept auto-fill" },
      { field: "Area", event: "onFieldChange", fires: "fn_hr_kaizen_points", result: "Engagement Points set per area-map" },
    ],
    postSave: [
      { rule: "wfr_hr_kaizen_points", when: "Create", does: "Server-side area-based points" },
      { rule: "wfr_hr_autofill_kz", when: "Create or Edit", does: "Server-side employee auto-fill" },
    ],
  },

  {
    id: "form_hr_employee_suggestion",
    name: "Employee Suggestion",
    module: "Engagement",
    icon: MessageSquare,
    color: "text-emerald-500",
    bg: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/30",
    fields: 11,
    sections: 1,
    intent: "Suggestion + benefits + media. Awards 20 engagement points on create.",
    steps: [
      { lane: "user", label: "Type Employee ID" },
      { lane: "client", label: "fn_hr_lookup_employee", detail: "Auto-fill First / Middle / Last Name + Department", emphasis: "highlight" },
      { lane: "user", label: "Type suggestion, benefits, upload media" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_sug_default_points", detail: "fn_hr_suggestion_points awards 20 pts (detects fld_sug_suggestion)", emphasis: "highlight" },
      { lane: "server", label: "wfr_hr_autofill_sug", detail: "Server-side employee lookup safety net" },
    ],
    triggers: [
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_lookup_employee", result: "Name + dept auto-fill" },
    ],
    postSave: [
      { rule: "wfr_hr_sug_default_points", when: "Create", does: "Award 20 engagement points" },
      { rule: "wfr_hr_autofill_sug", when: "Create or Edit", does: "Server-side employee auto-fill" },
    ],
  },

  /* ───────── ASSET & ADMIN ───────── */
  {
    id: "form_hr_asset_management",
    name: "Asset Management",
    module: "Asset & Admin",
    icon: Laptop,
    color: "text-rose-500",
    bg: "from-rose-500/10 to-rose-600/5 border-rose-500/30",
    fields: 11,
    sections: 1,
    intent: "Status auto-flips with Employee ID assignment. Marking LOST clears the assignment.",
    steps: [
      { lane: "user", label: "Type Asset ID (unique)" },
      { lane: "user", label: "Type Employee ID (or leave blank)" },
      { lane: "client", label: "fn_hr_asset_auto_status", detail: "Filled → ASSIGNED · Blank → IN_STOCK", emphasis: "highlight" },
      { lane: "client", label: "fn_hr_lookup_employee", detail: "Auto-fill First Name + Last Name + Department", emphasis: "highlight" },
      { lane: "user", label: "Pick Asset Type, fill serial / model / config" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_asset_auto_status", detail: "Server-side status flip guarantee" },
      { lane: "server", label: "wfr_hr_autofill_asset", detail: "Server-side employee lookup safety net" },
      { lane: "user", label: "Later: set Status = LOST" },
      { lane: "server", label: "wfr_hr_asset_lost", detail: "Clears fld_asset_employee_id (asset no longer attributed to anyone)", emphasis: "danger" },
    ],
    triggers: [
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_asset_auto_status", result: "Status flips ASSIGNED ↔ IN_STOCK" },
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_lookup_employee", result: "Name + dept auto-fill" },
    ],
    postSave: [
      { rule: "wfr_hr_asset_auto_status", when: "Create or Edit", does: "Status flip guarantee" },
      { rule: "wfr_hr_asset_lost", when: "Edit · status=LOST", does: "Clear Employee ID" },
      { rule: "wfr_hr_autofill_asset", when: "Create or Edit", does: "Server-side employee auto-fill" },
    ],
  },

  {
    id: "form_hr_sim_management",
    name: "SIM Management",
    module: "Asset & Admin",
    icon: Smartphone,
    color: "text-rose-500",
    bg: "from-rose-500/10 to-rose-600/5 border-rose-500/30",
    fields: 15,
    sections: 2,
    intent: "Status flips ACTIVE ↔ INACTIVE based on assignment. Marking LOST forces BLOCKED.",
    steps: [
      { lane: "user", label: "Section 1: Mobile No, IMSI, provider, plan" },
      { lane: "user", label: "Section 2: Type Employee ID (or leave blank)" },
      { lane: "client", label: "fn_hr_sim_auto_status", detail: "Filled → ACTIVE · Blank → INACTIVE", emphasis: "highlight" },
      { lane: "client", label: "fn_hr_lookup_employee", detail: "Auto-fill name + department", emphasis: "highlight" },
      { lane: "user", label: "Submit" },
      { lane: "server", label: "wfr_hr_sim_auto_status", detail: "Server-side status flip guarantee" },
      { lane: "server", label: "wfr_hr_autofill_sim", detail: "Server-side employee lookup safety net" },
      { lane: "user", label: "Later: SIM lost → set Status = LOST" },
      { lane: "server", label: "wfr_hr_sim_lost_block", detail: "Forces Status = BLOCKED (carrier-action signal)", emphasis: "danger" },
    ],
    triggers: [
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_sim_auto_status", result: "Status flips ACTIVE ↔ INACTIVE" },
      { field: "Employee ID", event: "onFieldChange", fires: "fn_hr_lookup_employee", result: "Name + dept auto-fill" },
    ],
    postSave: [
      { rule: "wfr_hr_sim_auto_status", when: "Create or Edit", does: "Status flip guarantee" },
      { rule: "wfr_hr_sim_lost_block", when: "Edit · status=LOST", does: "Force status = BLOCKED" },
      { rule: "wfr_hr_autofill_sim", when: "Create or Edit", does: "Server-side employee auto-fill" },
    ],
  },
]

/* ─────────────────────────────────────────────────────────────────────────
   PAGE
   ───────────────────────────────────────────────────────────────────────── */

export default function HrFormsFlowPage() {
  const [active, setActive] = useState<string>(FORMS[0].id)
  const [filter, setFilter] = useState<string>("All")
  const [query, setQuery] = useState<string>("")

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: "-30% 0px -65% 0px" }
    )
    for (const f of FORMS) {
      const el = document.getElementById(f.id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [])

  const modules = ["All", ...Array.from(new Set(FORMS.map((f) => f.module)))]
  const visible = FORMS.filter((f) => {
    if (filter !== "All" && f.module !== filter) return false
    if (query.trim()) {
      const q = query.toLowerCase()
      return f.name.toLowerCase().includes(q) || f.intent.toLowerCase().includes(q)
    }
    return true
  })

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
                <h1 className="text-2xl font-bold text-foreground">HR Forms — Working Visualizations</h1>
                <Badge variant="secondary" className="text-[10px]">20 forms</Badge>
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                One swim-lane diagram per form showing exactly what happens at runtime: which field
                triggers which client binding, what the server does after save, and how the data
                flows. Read top-to-bottom to follow time. Lanes are{" "}
                <span className="font-medium text-blue-600 dark:text-blue-400">User</span> ·{" "}
                <span className="font-medium text-amber-600 dark:text-amber-400">Client (browser)</span> ·{" "}
                <span className="font-medium text-violet-600 dark:text-violet-400">Server (post-save)</span>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
          {/* Sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-4 space-y-3">
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                On this page
              </p>

              {/* Search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search forms…"
                  className="w-full rounded-md border bg-background py-1.5 pl-8 pr-2 text-xs outline-none focus:border-primary"
                />
              </div>

              {/* Module filter */}
              <div className="flex flex-wrap gap-1">
                {modules.map((m) => (
                  <button
                    key={m}
                    onClick={() => setFilter(m)}
                    className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                      filter === m
                        ? "bg-primary/10 font-medium text-primary"
                        : "bg-muted text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Form list */}
              <div className="space-y-0.5">
                {visible.map((f) => {
                  const Icon = f.icon
                  const isActive = active === f.id
                  return (
                    <a
                      key={f.id}
                      href={`#${f.id}`}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                        isActive
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? f.color : ""}`} />
                      <span className="truncate">{f.name}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          </aside>

          {/* Content */}
          <main className="min-w-0 space-y-12">
            <Legend />
            {visible.map((f) => (
              <FormFlowCard key={f.id} form={f} />
            ))}
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

function Legend() {
  return (
    <div className="rounded-lg border bg-gradient-to-br from-muted/30 to-transparent p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        How to read these diagrams
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LaneLegend
          icon={Hand}
          label="User"
          desc="Clicks, types, submits — anything happening in the browser."
          color="border-blue-500/40 bg-blue-500/5 text-blue-600 dark:text-blue-400"
        />
        <LaneLegend
          icon={Cpu}
          label="Client"
          desc="Function bindings firing in the browser (onFieldChange, beforeSubmit). Debounced 300ms."
          color="border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400"
        />
        <LaneLegend
          icon={Server}
          label="Server"
          desc="Workflow rules firing AFTER the record is saved. Always runs — safety net for client misses."
          color="border-violet-500/40 bg-violet-500/5 text-violet-600 dark:text-violet-400"
        />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        <strong>Highlighted blue</strong> = the moment data changes / a calculation fires.{" "}
        <strong className="text-rose-600 dark:text-rose-400">Highlighted red</strong> = a destructive
        cascade (clear field, force status). Lanes flow top-to-bottom; arrows imply time.
      </p>
    </div>
  )
}

function LaneLegend({
  icon: Icon,
  label,
  desc,
  color,
}: {
  icon: any
  label: string
  desc: string
  color: string
}) {
  return (
    <div className={`rounded-md border p-2 ${color}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-[10px] leading-relaxed opacity-90">{desc}</p>
    </div>
  )
}

function FormFlowCard({ form }: { form: FormFlow }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-100px" })
  const Icon = form.icon

  return (
    <section id={form.id} ref={ref} className="scroll-mt-4 space-y-4">
      {/* Form header */}
      <div className={`overflow-hidden rounded-xl border bg-gradient-to-br p-4 ${form.bg}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background/80">
            <Icon className={`h-5 w-5 ${form.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{form.module}</Badge>
              <h2 className="text-lg font-bold text-foreground sm:text-xl">{form.name}</h2>
              <code className="rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-foreground">
                {form.id}
              </code>
            </div>
            <p className="text-sm text-muted-foreground">{form.intent}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Database className="h-3 w-3" /> {form.fields} fields
              </span>
              <span className="inline-flex items-center gap-1">
                <Box className="h-3 w-3" /> {form.sections} section{form.sections === 1 ? "" : "s"}
              </span>
              {form.triggers && (
                <span className="inline-flex items-center gap-1">
                  <Wand2 className="h-3 w-3" /> {form.triggers.length} field trigger{form.triggers.length === 1 ? "" : "s"}
                </span>
              )}
              {form.postSave && (
                <span className="inline-flex items-center gap-1">
                  <Server className="h-3 w-3" /> {form.postSave.length} post-save rule{form.postSave.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Swim-lane diagram */}
      <SwimLanes form={form} animate={inView} />

      {/* Field triggers + post-save tables */}
      {(form.triggers || form.postSave) && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {form.triggers && (
            <TriggersTable title="Client field bindings" rows={form.triggers} />
          )}
          {form.postSave && (
            <PostSaveTable title="Server-side workflow rules" rows={form.postSave} />
          )}
        </div>
      )}
    </section>
  )
}

function SwimLanes({ form, animate }: { form: FormFlow; animate: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="grid grid-cols-[80px_1fr] divide-x">
        {/* Lane labels (left column) */}
        <div className="grid grid-rows-3 divide-y">
          <LaneLabel icon={Hand} label="User" color="text-blue-600 dark:text-blue-400" />
          <LaneLabel icon={Cpu} label="Client" color="text-amber-600 dark:text-amber-400" />
          <LaneLabel icon={Server} label="Server" color="text-violet-600 dark:text-violet-400" />
        </div>

        {/* Lane content (right column, scrollable horizontally) */}
        <div className="overflow-x-auto">
          <div className="grid grid-rows-3 divide-y">
            <Lane lane="user" steps={form.steps} animate={animate} />
            <Lane lane="client" steps={form.steps} animate={animate} />
            <Lane lane="server" steps={form.steps} animate={animate} />
          </div>
        </div>
      </div>
    </div>
  )
}

function LaneLabel({
  icon: Icon,
  label,
  color,
}: {
  icon: any
  label: string
  color: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 bg-muted/30 px-2 py-3">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

function Lane({
  lane,
  steps,
  animate,
}: {
  lane: Lane
  steps: FlowStep[]
  animate: boolean
}) {
  // Render one cell per step in the master timeline. Cells outside this lane
  // render an empty connector so the columns line up across all 3 lanes.
  return (
    <div className="relative flex min-w-max items-stretch gap-2 p-3">
      {/* horizontal time axis */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />

      {steps.map((step, i) => {
        const isMine = step.lane === lane
        return (
          <div key={i} className="relative flex w-44 shrink-0 items-center">
            {isMine ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={animate ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="relative z-10 w-full"
              >
                <StepCard step={step} index={i} />
              </motion.div>
            ) : (
              // Spacer column to keep the timeline aligned across lanes
              <div className="h-10 w-full" />
            )}
            {/* arrow to next step (rendered on every cell, not just last) */}
            {i < steps.length - 1 && (
              <ArrowRight className="absolute -right-[14px] top-1/2 z-0 h-3 w-3 -translate-y-1/2 text-muted-foreground/40" />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepCard({ step, index }: { step: FlowStep; index: number }) {
  const tones = {
    default: {
      user: "border-blue-500/30 bg-blue-500/5",
      client: "border-amber-500/30 bg-amber-500/5",
      server: "border-violet-500/30 bg-violet-500/5",
    },
    highlight: {
      user: "border-blue-500/60 bg-blue-500/15 ring-1 ring-blue-500/30",
      client: "border-amber-500/60 bg-amber-500/15 ring-1 ring-amber-500/30",
      server: "border-violet-500/60 bg-violet-500/15 ring-1 ring-violet-500/30",
    },
    danger: {
      user: "border-rose-500/60 bg-rose-500/15 ring-1 ring-rose-500/30",
      client: "border-rose-500/60 bg-rose-500/15 ring-1 ring-rose-500/30",
      server: "border-rose-500/60 bg-rose-500/15 ring-1 ring-rose-500/30",
    },
  } as const
  const cls = tones[step.emphasis ?? "default"][step.lane]

  return (
    <div className={`rounded-md border px-2 py-1.5 ${cls}`}>
      <div className="mb-0.5 flex items-center gap-1">
        <span className="rounded bg-background/70 px-1 py-px text-[9px] font-mono text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
        <p className="text-[11px] font-semibold leading-tight text-foreground">{step.label}</p>
      </div>
      {step.detail && (
        <p className="text-[10px] leading-snug text-muted-foreground">{step.detail}</p>
      )}
    </div>
  )
}

function TriggersTable({
  title,
  rows,
}: {
  title: string
  rows: FieldTrigger[]
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <Wand2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-muted/20">
          <tr>
            <th className="p-2 text-left font-medium">Field</th>
            <th className="p-2 text-left font-medium">Event</th>
            <th className="p-2 text-left font-medium">Fires</th>
            <th className="p-2 text-left font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="p-2 font-medium text-foreground">{r.field}</td>
              <td className="p-2">
                <Badge variant="outline" className="text-[10px]">{r.event}</Badge>
              </td>
              <td className="p-2">
                <code className="rounded bg-muted px-1 py-0.5 text-[10px] text-foreground">
                  {r.fires}
                </code>
              </td>
              <td className="p-2 text-muted-foreground">{r.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PostSaveTable({
  title,
  rows,
}: {
  title: string
  rows: Array<{ rule: string; when: string; does: string }>
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <Server className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-muted/20">
          <tr>
            <th className="p-2 text-left font-medium">Rule</th>
            <th className="p-2 text-left font-medium">When</th>
            <th className="p-2 text-left font-medium">Does</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="p-2">
                <code className="rounded bg-muted px-1 py-0.5 text-[10px] text-foreground">
                  {r.rule}
                </code>
              </td>
              <td className="p-2 text-muted-foreground">{r.when}</td>
              <td className="p-2 text-foreground">{r.does}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t pt-6 text-center">
      <p className="text-xs text-muted-foreground">
        Source data:{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">scripts/create-hr-module.sql</code>{" "}
        +{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
          scripts/create-hr-automations.sql
        </code>
        . Companion docs:{" "}
        <Link href="/settings/docs/hr-system" className="text-primary underline-offset-2 hover:underline">
          HR System Reference
        </Link>{" "}
        ·{" "}
        <Link
          href="/settings/docs/hr-complete-guide"
          className="text-primary underline-offset-2 hover:underline"
        >
          Complete Guide
        </Link>
      </p>
    </footer>
  )
}
