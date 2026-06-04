/**
 * Module workflow registry.
 *
 * One `ModuleFlow` per module, keyed by URL prefix. The global injector
 * (components/insights/global-flow-info.tsx) looks up the current pathname here
 * and renders the "!" how-it-works diagram for that module. Adding a new
 * module's insight is just adding an entry below — no page edits needed.
 *
 * Every flow mirrors the REAL lifecycle: the stages come from the status enums
 * in prisma/schema.prisma (and, for form-record modules, the status options on
 * the page). Keep them in sync if a lifecycle changes.
 *
 * Resolution is longest-prefix-wins, so `/hr/recruitment/staffing-plan` beats
 * `/hr/recruitment`.
 */

import type { ModuleFlow } from "@/components/insights/module-flow-info";
import {
  UserPlus,
  Mail,
  Send,
  Sparkles,
  CheckCircle2,
  XCircle,
  PauseCircle,
  FileSignature,
  ClipboardList,
  Briefcase,
  CalendarDays,
  Clock,
  LogOut,
  Wallet,
  Target,
  Lightbulb,
  AlertTriangle,
  Rocket,
  Home,
  Users,
  Boxes,
  ShieldCheck,
  Handshake,
  FileText,
  Banknote,
  TrendingUp,
} from "lucide-react";

// Shared side-step shorthands -------------------------------------------------
const REJECTED = {
  label: "Rejected",
  note: "Recipient is notified",
  tint: "#ef4444",
  icon: XCircle,
};
const CANCELLED = {
  label: "Cancelled",
  note: "Stops the workflow",
  tint: "#6b7280",
  icon: XCircle,
};
const ON_HOLD = {
  label: "On hold",
  note: "Paused, can resume later",
  tint: "#f59e0b",
  icon: PauseCircle,
};

// ── Recruitment: the full hiring pipeline ───────────────────────────────────
const HIRING_PIPELINE: ModuleFlow = {
  title: "How recruitment automation works",
  description:
    "Change a status and the system emails the candidate and prepares the next step for you — automatically.",
  steps: [
    {
      label: "Application received",
      detail: "Candidate applies via the public link or you add them manually.",
      email: "“We received your application”",
      notify: true,
      tint: "#3b82f6",
      icon: UserPlus,
      kind: "start",
    },
    {
      label: "Screening",
      detail: "You start reviewing the application.",
      email: "“Your application is under review”",
      tint: "#a855f7",
      icon: Mail,
    },
    {
      label: "Interviewing",
      detail: "Candidate moves to the interview stage.",
      email: "“You're invited to interview”",
      tint: "#0ea5e9",
      icon: Mail,
    },
    {
      label: "Shortlisted",
      detail: "Candidate is shortlisted for the role.",
      email: "“You've been shortlisted”",
      tint: "#22c55e",
      icon: Mail,
    },
    {
      label: "Offered",
      detail: "You decide to make an offer.",
      email: "“Good news about your application”",
      auto: "A draft Job Offer is created",
      notify: true,
      tint: "#10b981",
      icon: Sparkles,
    },
    {
      label: "Offer sent",
      detail: "You send the offer to the candidate.",
      email: "“Your offer from <company>”",
      tint: "#0d9488",
      icon: Send,
    },
    {
      label: "Offer accepted",
      detail: "Candidate accepts the offer.",
      email: "“Thank you for accepting”",
      auto: "A draft Appointment Letter is created",
      notify: true,
      tint: "#16a34a",
      icon: CheckCircle2,
    },
    {
      label: "Letter signed",
      detail: "The appointment letter is signed.",
      auto: "Employee record + onboarding are created",
      tint: "#15803d",
      icon: FileSignature,
    },
    {
      label: "Hired",
      detail: "The candidate officially joins.",
      email: "“Welcome to <company>!”",
      tint: "#15803d",
      icon: UserPlus,
      kind: "end",
    },
  ],
  sideSteps: [
    { label: "Rejected", note: "Polite rejection email", tint: "#ef4444", icon: XCircle },
    { label: "On hold", note: "“Your application is on hold”", tint: "#f59e0b", icon: PauseCircle },
    { label: "Withdrawn", note: "Withdrawal confirmation email", tint: "#6b7280", icon: XCircle },
  ],
  tip:
    "You only ever change the status — the emails, notifications and the next document (offer → letter → employee) are handled for you.",
};

// ── Recruitment: staffing plan ──────────────────────────────────────────────
const STAFFING_PLAN: ModuleFlow = {
  title: "How staffing plans work",
  description: "Plan headcount, then turn approved roles into live job openings.",
  steps: [
    { label: "Draft", detail: "Create the planned role and headcount.", tint: "#9ca3af", icon: ClipboardList, kind: "start" },
    { label: "Open", detail: "The plan is approved and active for hiring.", tint: "#22c55e", icon: Briefcase },
    { label: "Filled", detail: "All planned positions have been filled.", tint: "#15803d", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [ON_HOLD, CANCELLED],
};

// ── Recruitment: employee referral ──────────────────────────────────────────
const REFERRAL: ModuleFlow = {
  title: "How employee referrals work",
  description: "Track a referred candidate from submission to hire.",
  steps: [
    { label: "New", detail: "An employee refers a candidate.", tint: "#3b82f6", icon: UserPlus, kind: "start" },
    { label: "Reviewed", detail: "HR reviews the referral.", tint: "#a855f7", icon: ClipboardList },
    { label: "Interviewing", detail: "The candidate is being interviewed.", tint: "#0ea5e9", icon: Mail },
    { label: "Hired", detail: "The referred candidate is hired.", tint: "#15803d", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [REJECTED],
};

// ── Leave ───────────────────────────────────────────────────────────────────
const LEAVE: ModuleFlow = {
  title: "How leave requests work",
  description: "An employee applies, a manager decides, and attendance updates itself.",
  steps: [
    { label: "Applied", detail: "Employee submits a leave request.", notify: true, tint: "#3b82f6", icon: CalendarDays, kind: "start" },
    { label: "Pending", detail: "Awaiting the approver's decision.", notify: true, tint: "#f59e0b", icon: Clock },
    { label: "Approved", detail: "Leave is granted; balance is deducted and attendance is marked.", auto: "Attendance + balance updated", tint: "#22c55e", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [
    { label: "Rejected", note: "Employee is notified, no balance used", tint: "#ef4444", icon: XCircle },
    { label: "Cancelled", note: "Withdrawn by the employee", tint: "#6b7280", icon: XCircle },
  ],
  tip: "Approvers see pending requests as a badge in the sidebar.",
};

// ── Attendance ──────────────────────────────────────────────────────────────
const ATTENDANCE: ModuleFlow = {
  title: "How attendance works",
  description: "Daily check-in/out, with a regularization request for any gaps.",
  steps: [
    { label: "Check-in / out", detail: "Employee marks attendance (with face verification).", tint: "#3b82f6", icon: Clock, kind: "start" },
    { label: "Regularization", detail: "Missed or wrong punch? The employee raises a correction request.", notify: true, tint: "#a855f7", icon: ClipboardList },
    { label: "Pending review", detail: "The approver reviews the correction.", notify: true, tint: "#f59e0b", icon: Clock },
    { label: "Approved", detail: "Attendance record is corrected.", auto: "Attendance updated", tint: "#22c55e", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [{ label: "Rejected", note: "Original record stands", tint: "#ef4444", icon: XCircle }],
};

// ── Onboarding ──────────────────────────────────────────────────────────────
const ONBOARDING: ModuleFlow = {
  title: "How onboarding works",
  description: "New hires get a checklist of tasks to complete before day one.",
  steps: [
    { label: "Pending", detail: "Onboarding is created (often automatically after hiring).", tint: "#3b82f6", icon: UserPlus, kind: "start" },
    { label: "In progress", detail: "Tasks are being completed by the new hire and HR.", tint: "#0ea5e9", icon: ClipboardList },
    { label: "Completed", detail: "All onboarding tasks are done.", tint: "#15803d", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [CANCELLED],
};

// ── Offboarding ─────────────────────────────────────────────────────────────
const OFFBOARDING: ModuleFlow = {
  title: "How offboarding works",
  description: "An exit checklist that clears an employee out cleanly.",
  steps: [
    { label: "Initiated", detail: "Exit process is started for a leaving employee.", tint: "#f59e0b", icon: LogOut, kind: "start" },
    { label: "In progress", detail: "Exit tasks (handover, asset return, clearances) are completed.", tint: "#0ea5e9", icon: ClipboardList },
    { label: "Completed", detail: "All clearances are done; the employee is offboarded.", tint: "#6b7280", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [CANCELLED],
};

// ── Payroll ─────────────────────────────────────────────────────────────────
const PAYROLL: ModuleFlow = {
  title: "How payroll works",
  description: "Set up pay components, then run payroll each period.",
  steps: [
    { label: "Configure", detail: "Define salary components and rules.", tint: "#9ca3af", icon: ClipboardList, kind: "start" },
    { label: "Profiles", detail: "Assign salary structures to employees.", tint: "#a855f7", icon: Users },
    { label: "Run", detail: "Generate payroll for the period using attendance & leave.", tint: "#0ea5e9", icon: Wallet },
    { label: "Paid", detail: "Salaries are finalised and disbursed.", tint: "#15803d", icon: Banknote, kind: "end" },
  ],
};

// ── Employee master ─────────────────────────────────────────────────────────
const EMPLOYEE: ModuleFlow = {
  title: "How the employee directory works",
  description: "The single source of truth for everyone in the organization.",
  steps: [
    { label: "Active", detail: "An employee is added (or auto-created when hired).", tint: "#22c55e", icon: UserPlus, kind: "start" },
    { label: "On leave", detail: "Temporarily away — set automatically during approved leave.", tint: "#f59e0b", icon: CalendarDays },
    { label: "Inactive / Terminated", detail: "Employee has left; record is retained for history.", tint: "#6b7280", icon: LogOut, kind: "end" },
  ],
};

// ── Performance: appraisal ──────────────────────────────────────────────────
const APPRAISAL: ModuleFlow = {
  title: "How appraisals work",
  description: "A review cycle from draft to employee acknowledgement.",
  steps: [
    { label: "Pending", detail: "Appraisal is created for the cycle.", tint: "#3b82f6", icon: ClipboardList, kind: "start" },
    { label: "In review", detail: "Manager evaluates against goals/KRAs.", tint: "#0ea5e9", icon: Target },
    { label: "Completed", detail: "Rating and feedback are finalised.", tint: "#22c55e", icon: CheckCircle2 },
    { label: "Acknowledged", detail: "Employee reviews and acknowledges the result.", tint: "#15803d", icon: Handshake, kind: "end" },
  ],
};

// ── Performance: KRA ────────────────────────────────────────────────────────
const KRA: ModuleFlow = {
  title: "How KRAs work",
  description: "Set key result areas and track them to outcome.",
  steps: [
    { label: "Draft", detail: "Define the key result area and target.", tint: "#9ca3af", icon: ClipboardList, kind: "start" },
    { label: "Active", detail: "The KRA is being worked on during the period.", tint: "#0ea5e9", icon: Target },
    { label: "Achieved", detail: "The target was met.", tint: "#15803d", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [
    { label: "At risk", note: "Tracking behind target", tint: "#f59e0b", icon: AlertTriangle },
    { label: "Missed", note: "Target not met", tint: "#ef4444", icon: XCircle },
  ],
};

// ── Engagement: kaizen ──────────────────────────────────────────────────────
const KAIZEN: ModuleFlow = {
  title: "How Kaizen works",
  description: "Employees submit improvement ideas for review and approval.",
  steps: [
    { label: "Submitted", detail: "An employee submits a Kaizen improvement.", notify: true, tint: "#3b82f6", icon: Lightbulb, kind: "start" },
    { label: "Approved", detail: "Reviewed and approved for implementation.", tint: "#15803d", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [{ label: "Not approved", note: "Returned with feedback", tint: "#ef4444", icon: XCircle }],
};

// ── Engagement: suggestion ──────────────────────────────────────────────────
const SUGGESTION: ModuleFlow = {
  title: "How suggestions work",
  description: "From idea to implementation.",
  steps: [
    { label: "Submitted", detail: "Employee submits a suggestion.", notify: true, tint: "#3b82f6", icon: Lightbulb, kind: "start" },
    { label: "Under review", detail: "The team evaluates the idea.", tint: "#a855f7", icon: ClipboardList },
    { label: "Accepted", detail: "The suggestion is approved.", tint: "#22c55e", icon: CheckCircle2 },
    { label: "Implemented", detail: "The idea is put into practice.", tint: "#15803d", icon: Rocket, kind: "end" },
  ],
  sideSteps: [REJECTED],
};

// ── Engagement: problem registration ────────────────────────────────────────
const PROBLEM: ModuleFlow = {
  title: "How problem registration works",
  description: "Log an issue and track it to closure.",
  steps: [
    { label: "Open", detail: "A problem is raised.", notify: true, tint: "#ef4444", icon: AlertTriangle, kind: "start" },
    { label: "In review", detail: "Being investigated and worked on.", tint: "#f59e0b", icon: ClipboardList },
    { label: "Resolved", detail: "A fix has been applied.", tint: "#22c55e", icon: CheckCircle2 },
    { label: "Closed", detail: "Verified and closed.", tint: "#6b7280", icon: CheckCircle2, kind: "end" },
  ],
};

// ── Engagement: self initiative ─────────────────────────────────────────────
const SELF_INITIATIVE: ModuleFlow = {
  title: "How self initiatives work",
  description: "Track personal initiatives from plan to done.",
  steps: [
    { label: "Planning", detail: "Define the initiative.", tint: "#9ca3af", icon: ClipboardList, kind: "start" },
    { label: "In progress", detail: "Actively working on it.", tint: "#0ea5e9", icon: Rocket },
    { label: "Completed", detail: "The initiative is finished.", tint: "#15803d", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [ON_HOLD],
};

// ── Engagement: self target ─────────────────────────────────────────────────
const SELF_TARGET: ModuleFlow = {
  title: "How self targets work",
  description: "Set monthly targets and track your progress.",
  steps: [
    { label: "Not started", detail: "Target is set for the period.", tint: "#9ca3af", icon: Target, kind: "start" },
    { label: "In progress", detail: "Working toward the target.", tint: "#0ea5e9", icon: TrendingUp },
    { label: "Completed", detail: "Target achieved.", tint: "#15803d", icon: CheckCircle2, kind: "end" },
  ],
};

// ── Asset & admin ───────────────────────────────────────────────────────────
const ASSET: ModuleFlow = {
  title: "How asset management works",
  description: "Register company assets and track who holds them.",
  steps: [
    { label: "Registered", detail: "An asset is added to the register.", tint: "#3b82f6", icon: Boxes, kind: "start" },
    { label: "Assigned", detail: "The asset is issued to an employee.", tint: "#0ea5e9", icon: Users },
    { label: "In use", detail: "The asset is actively held.", tint: "#22c55e", icon: CheckCircle2 },
    { label: "Returned / Retired", detail: "Handed back, sent for repair, or decommissioned.", tint: "#6b7280", icon: LogOut, kind: "end" },
  ],
};

// ── Real estate: leads ──────────────────────────────────────────────────────
const LEADS: ModuleFlow = {
  title: "How leads work",
  description: "Move a prospect from first contact to a closed deal.",
  steps: [
    { label: "New", detail: "A fresh lead enters the pipeline.", tint: "#3b82f6", icon: UserPlus, kind: "start" },
    { label: "Contacted", detail: "First outreach has been made.", tint: "#a855f7", icon: Mail },
    { label: "Qualified", detail: "The lead is a genuine prospect.", tint: "#8b5cf6", icon: CheckCircle2 },
    { label: "Viewing scheduled", detail: "A property viewing is booked.", tint: "#0ea5e9", icon: CalendarDays },
    { label: "Negotiating", detail: "Working out terms and price.", tint: "#f59e0b", icon: Handshake },
    { label: "Converted", detail: "The lead became a deal.", tint: "#15803d", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [{ label: "Lost", note: "Did not convert", tint: "#ef4444", icon: XCircle }],
};

// ── Real estate: properties ─────────────────────────────────────────────────
const PROPERTIES: ModuleFlow = {
  title: "How property listings work",
  description: "From draft listing to a sold property.",
  steps: [
    { label: "Draft", detail: "Listing is being prepared.", tint: "#9ca3af", icon: FileText, kind: "start" },
    { label: "Available", detail: "Live and open for buyers.", tint: "#22c55e", icon: Home },
    { label: "Under contract", detail: "An offer is accepted and in process.", tint: "#f59e0b", icon: Handshake },
    { label: "Sold", detail: "The sale is complete.", tint: "#15803d", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [
    { label: "Withdrawn", note: "Taken off the market", tint: "#6b7280", icon: XCircle },
    { label: "Expired", note: "Listing period ended", tint: "#ef4444", icon: XCircle },
  ],
};

// ── Real estate: agents ─────────────────────────────────────────────────────
const AGENTS: ModuleFlow = {
  title: "How agents work",
  description: "Onboard agents through KYC into an active network.",
  steps: [
    { label: "Pending KYC", detail: "Agent joins; identity documents are awaited.", notify: true, tint: "#f59e0b", icon: ShieldCheck, kind: "start" },
    { label: "Active", detail: "KYC verified — the agent can sell and earn.", tint: "#22c55e", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [
    { label: "Suspended", note: "Temporarily blocked", tint: "#f59e0b", icon: PauseCircle },
    { label: "Terminated", note: "Removed from the network", tint: "#ef4444", icon: XCircle },
  ],
};

// ── Real estate: members / KYC ──────────────────────────────────────────────
const MEMBERS_KYC: ModuleFlow = {
  title: "How member KYC works",
  description: "Verify member documents before they go active.",
  steps: [
    { label: "Pending", detail: "Documents submitted, awaiting review.", notify: true, tint: "#f59e0b", icon: FileText, kind: "start" },
    { label: "Verified", detail: "Documents approved — member is compliant.", tint: "#22c55e", icon: ShieldCheck, kind: "end" },
  ],
  sideSteps: [
    { label: "Rejected", note: "Resubmission required", tint: "#ef4444", icon: XCircle },
    { label: "Expired", note: "Documents need renewal", tint: "#6b7280", icon: XCircle },
  ],
};

// ── Real estate: payouts / withdrawals ──────────────────────────────────────
const PAYOUTS: ModuleFlow = {
  title: "How payouts work",
  description: "An agent requests funds; admin approves and pays.",
  steps: [
    { label: "Requested", detail: "Agent requests a withdrawal.", notify: true, tint: "#3b82f6", icon: Wallet, kind: "start" },
    { label: "Approved", detail: "Admin approves the request.", tint: "#22c55e", icon: CheckCircle2 },
    { label: "Processing", detail: "Payment is being sent.", tint: "#0ea5e9", icon: Banknote },
    { label: "Paid", detail: "Funds have been disbursed.", tint: "#15803d", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [
    { label: "Rejected", note: "Request declined", tint: "#ef4444", icon: XCircle },
    { label: "Failed", note: "Payment did not go through", tint: "#ef4444", icon: XCircle },
  ],
};

// ── Real estate: transactions ───────────────────────────────────────────────
const TRANSACTIONS: ModuleFlow = {
  title: "How transactions work",
  description: "A deal closes and commissions are released.",
  steps: [
    { label: "Pending", detail: "A deal is recorded and in progress.", tint: "#f59e0b", icon: Handshake, kind: "start" },
    { label: "Closed", detail: "The deal is finalised.", auto: "Commissions are calculated", tint: "#15803d", icon: CheckCircle2, kind: "end" },
  ],
  sideSteps: [
    { label: "Cancelled", note: "Deal called off", tint: "#6b7280", icon: XCircle },
    { label: "Disputed", note: "Under dispute review", tint: "#ef4444", icon: AlertTriangle },
  ],
};

// ── Real estate: compliance ─────────────────────────────────────────────────
const COMPLIANCE: ModuleFlow = {
  title: "How compliance works",
  description: "Review submitted documents for verification.",
  steps: [
    { label: "Pending", detail: "A document is submitted for review.", notify: true, tint: "#f59e0b", icon: FileText, kind: "start" },
    { label: "Verified", detail: "The document is approved.", tint: "#22c55e", icon: ShieldCheck, kind: "end" },
  ],
  sideSteps: [
    { label: "Rejected", note: "Needs resubmission", tint: "#ef4444", icon: XCircle },
    { label: "Expired", note: "Renewal required", tint: "#6b7280", icon: XCircle },
  ],
};

// ── Inventory ───────────────────────────────────────────────────────────────
const INVENTORY: ModuleFlow = {
  title: "How inventory works",
  description: "Manage products through their catalog lifecycle.",
  steps: [
    { label: "Draft", detail: "A product is being set up.", tint: "#9ca3af", icon: FileText, kind: "start" },
    { label: "Active", detail: "Live in the catalog and storefront.", tint: "#22c55e", icon: Boxes },
    { label: "Archived", detail: "Retired from the catalog, kept for records.", tint: "#6b7280", icon: LogOut, kind: "end" },
  ],
};

/**
 * Registry — longest matching prefix wins. Order doesn't matter; resolution
 * sorts by prefix length.
 */
const REGISTRY: Array<{ prefixes: string[]; flow: ModuleFlow }> = [
  // Recruitment (specific sub-routes first via longer prefixes)
  { prefixes: ["/hr/recruitment/staffing-plan"], flow: STAFFING_PLAN },
  { prefixes: ["/hr/recruitment/employee-referral"], flow: REFERRAL },
  {
    prefixes: [
      "/hr/recruitment/job-application",
      "/hr/recruitment/job-opening",
      "/hr/recruitment/job-offer",
      "/hr/recruitment/appointment-letter",
      "/hr/recruitment",
    ],
    flow: HIRING_PIPELINE,
  },
  // HR core
  { prefixes: ["/hr/onboarding"], flow: ONBOARDING },
  { prefixes: ["/hr/offboarding"], flow: OFFBOARDING },
  { prefixes: ["/leave"], flow: LEAVE },
  { prefixes: ["/attendance"], flow: ATTENDANCE },
  { prefixes: ["/payroll"], flow: PAYROLL },
  { prefixes: ["/employee-master"], flow: EMPLOYEE },
  // Performance
  { prefixes: ["/performance/appraisal"], flow: APPRAISAL },
  { prefixes: ["/performance/kra"], flow: KRA },
  // Engagement
  { prefixes: ["/employee-engagement/kaizen"], flow: KAIZEN },
  { prefixes: ["/employee-engagement/employee-suggestion"], flow: SUGGESTION },
  { prefixes: ["/employee-engagement/problem-registration"], flow: PROBLEM },
  { prefixes: ["/employee-engagement/self-initiative"], flow: SELF_INITIATIVE },
  { prefixes: ["/employee-engagement/self-target"], flow: SELF_TARGET },
  // Asset
  { prefixes: ["/asset-management"], flow: ASSET },
  // Real estate
  { prefixes: ["/real-estate/leads"], flow: LEADS },
  { prefixes: ["/real-estate/properties"], flow: PROPERTIES },
  { prefixes: ["/real-estate/agents", "/real-estate/my-team"], flow: AGENTS },
  { prefixes: ["/real-estate/members"], flow: MEMBERS_KYC },
  {
    prefixes: ["/real-estate/payouts", "/real-estate/admin/payouts", "/real-estate/admin/wallets"],
    flow: PAYOUTS,
  },
  { prefixes: ["/real-estate/transactions"], flow: TRANSACTIONS },
  {
    prefixes: ["/real-estate/compliance", "/real-estate/admin/compliance"],
    flow: COMPLIANCE,
  },
  // Inventory
  { prefixes: ["/inventory"], flow: INVENTORY },
];

/**
 * Resolve the flow for a pathname. Returns null when no module matches (e.g.
 * dashboard, settings) so the global injector hides the beacon there.
 */
export function getModuleFlow(pathname: string | null | undefined): ModuleFlow | null {
  if (!pathname) return null;
  let best: { len: number; flow: ModuleFlow } | null = null;
  for (const entry of REGISTRY) {
    for (const prefix of entry.prefixes) {
      if (
        (pathname === prefix || pathname.startsWith(prefix + "/")) &&
        (!best || prefix.length > best.len)
      ) {
        best = { len: prefix.length, flow: entry.flow };
      }
    }
  }
  return best?.flow ?? null;
}
