/**
 * Professional, daily-use email templates for workflow rules.
 *
 * Each template ships with:
 *   - id          stable identifier
 *   - category    used by the picker UI to group/filter
 *   - name        admin-visible name
 *   - description what the template is for
 *   - subject     pre-filled email subject (placeholders allowed)
 *   - body        HTML body. The runner appends report summaries automatically
 *                 for Report Export actions, so leave room at the bottom.
 *
 * Placeholder convention (matches the rest of the workflow runner):
 *   {{api_name}}   — record field, resolved by `attachApiNames`
 *   {{Field Label}} — record field, resolved by label
 *
 * Templates are intentionally framework-free — plain inline-styled HTML so the
 * body renders identically in Gmail, Outlook, Apple Mail, etc. without any
 * server-side rendering layer. Admins can edit freely after applying.
 */

export type EmailTemplateCategory =
  | "Reports"
  | "Notifications"
  | "HR"
  | "Sales"
  | "Operations"
  | "Approvals"
  | "Reminders"
  | "Finance"
  | "IT"
  | "Marketing"

export interface EmailTemplate {
  id: string
  category: EmailTemplateCategory
  name: string
  description: string
  subject: string
  body: string
  /** Visible only when the picker is opened from this action type. */
  worksWith?: Array<"Email Notification" | "Report Export">
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared layout helpers — kept tiny so admins can paste templates as-is and
// the result renders cleanly across mail clients (no <style> tags, no
// external CSS, no flexbox).
// ─────────────────────────────────────────────────────────────────────────────

const COLOR = {
  primary: "#4338ca", // indigo-700
  text: "#0f172a",
  muted: "#64748b",
  bg: "#f8fafc",
  border: "#e2e8f0",
  good: "#059669",
  warn: "#d97706",
  bad: "#dc2626",
}

const wrap = (inner: string) => `
<div style="background:${COLOR.bg};padding:24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${COLOR.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid ${COLOR.border};border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;">
              ${inner}
            </td>
          </tr>
        </table>
        <p style="font-size:11px;color:${COLOR.muted};margin:16px 0 0;">
          Sent automatically by the ERP workflow engine.
        </p>
      </td>
    </tr>
  </table>
</div>`.trim()

const heading = (text: string, accent = COLOR.primary) =>
  `<h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:${accent};">${text}</h2>`

const sub = (text: string) =>
  `<p style="margin:0 0 16px;font-size:13px;color:${COLOR.muted};">${text}</p>`

const para = (text: string) =>
  `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;">${text}</p>`

const callout = (label: string, value: string, color = COLOR.primary) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
  <tr>
    <td style="background:${COLOR.bg};border-left:3px solid ${color};border-radius:4px;padding:10px 14px;">
      <div style="font-size:11px;color:${COLOR.muted};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">${label}</div>
      <div style="font-size:15px;font-weight:600;color:${COLOR.text};">${value}</div>
    </td>
  </tr>
</table>`.trim()

const button = (label: string, href: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;">
  <tr>
    <td style="background:${COLOR.primary};border-radius:6px;">
      <a href="${href}" style="display:inline-block;padding:10px 20px;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;">${label}</a>
    </td>
  </tr>
</table>`.trim()

const divider = `<hr style="border:none;border-top:1px solid ${COLOR.border};margin:18px 0;" />`

const signoff = (closing = "Best regards") => `
<p style="margin:18px 0 0;font-size:13px;color:${COLOR.muted};">
  ${closing},<br/>
  <strong style="color:${COLOR.text};">{{Organization}}</strong>
</p>`.trim()

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  // 1. Daily attendance digest (Reports)
  {
    id: "attendance-daily-digest",
    category: "Reports",
    name: "Daily Attendance Digest",
    description:
      "Morning report summarising yesterday's attendance for HR/managers. Pairs naturally with a Report Export action.",
    subject: "Daily attendance report — {{date}}",
    worksWith: ["Report Export"],
    body: wrap(`
      ${heading("Daily Attendance Digest")}
      ${sub("Yesterday's attendance summary across the team.")}
      ${para(
        "Hi team,<br/><br/>Attached is the team attendance report for the previous day. The summary table below highlights the headline numbers; the full breakdown is in the spreadsheet.",
      )}
      ${callout("Period covered", "{{from}} → {{to}}")}
      ${para(
        "If you spot a discrepancy in your team's row, please flag it in the HR channel by end of day so corrections can be applied before payroll close.",
      )}
      ${signoff("Thanks")}
    `),
  },

  // 2. Weekly team performance (Reports)
  {
    id: "weekly-team-performance",
    category: "Reports",
    name: "Weekly Team Performance",
    description:
      "Monday-morning roll-up of last week's activity for managers. Use with a weekly Report Export.",
    subject: "Weekly team report — week ending {{to}}",
    worksWith: ["Report Export"],
    body: wrap(`
      ${heading("Weekly Team Report")}
      ${sub("A summary of last week's activity is attached.")}
      ${para("Hello,")}
      ${para(
        "Below is the headline summary for the week ending <strong>{{to}}</strong>. The attached spreadsheet has per-employee detail.",
      )}
      ${callout("Reporting period", "{{from}} → {{to}}")}
      ${para(
        "Suggested next steps:<br/>• Review any outliers (consistently late, low-coverage days).<br/>• Confirm planned leave for the week ahead.<br/>• Flag any data corrections to HR by Tuesday EOD.",
      )}
      ${signoff()}
    `),
  },

  // 3. Monthly department summary (Reports)
  {
    id: "monthly-department-summary",
    category: "Reports",
    name: "Monthly Department Summary",
    description:
      "Month-end roll-up for department heads and finance. Use with a monthly Report Export.",
    subject: "Monthly summary — {{module}} ({{from}} → {{to}})",
    worksWith: ["Report Export"],
    body: wrap(`
      ${heading("Monthly Summary")}
      ${sub("Records and totals for the closing month.")}
      ${para(
        "Hello,<br/><br/>The monthly export for <strong>{{module}}</strong> is attached. The summary block below captures the high-level numbers; the spreadsheet has the row-level detail you'll want for reconciliation.",
      )}
      ${callout("Period", "{{from}} → {{to}}")}
      ${para(
        "Reach out if you need a re-run with a different filter or column set — schedules can be adjusted from the workflow rule any time.",
      )}
      ${signoff()}
    `),
  },

  // 4. Late-arrival alert (HR)
  {
    id: "late-arrival-alert",
    category: "HR",
    name: "Late Arrival Alert",
    description:
      "Per-record alert sent to a manager when an employee punches in late.",
    subject: "Late arrival — {{Employee Name}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Late Arrival Recorded", COLOR.warn)}
      ${sub("An employee on your team has just punched in past their shift start.")}
      ${callout("Employee", "{{Employee Name}}", COLOR.warn)}
      ${callout("Check-in time", "{{Check In Time}}")}
      ${callout("Late by", "{{Late Minutes}} minutes", COLOR.warn)}
      ${para(
        "This is an automated heads-up so you can follow up if the pattern repeats. No action is required if this was already authorised.",
      )}
      ${signoff()}
    `),
  },

  // 5. Leave request notification (HR / Approvals)
  {
    id: "leave-request",
    category: "Approvals",
    name: "Leave Request Submitted",
    description:
      "Alerts a manager / HR when an employee submits a leave request awaiting approval.",
    subject: "Leave request from {{Employee Name}} — {{Leave From}} to {{Leave To}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("New Leave Request")}
      ${sub("A team member has requested time off and is awaiting your approval.")}
      ${callout("Employee", "{{Employee Name}}")}
      ${callout("Leave type", "{{Leave Type}}")}
      ${callout("Dates", "{{Leave From}} → {{Leave To}}")}
      ${para("<strong>Reason</strong><br/>{{Reason}}")}
      ${button("Review in ERP", "{{Record URL}}")}
      ${para(
        "Approve or decline directly from the record. The submitter is notified automatically once you respond.",
      )}
      ${signoff()}
    `),
  },

  // 6. New employee welcome (HR)
  {
    id: "employee-welcome",
    category: "HR",
    name: "Employee Onboarding Welcome",
    description: "Sent automatically when a new employee record is created.",
    subject: "Welcome aboard, {{Employee Name}}!",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Welcome to the team!")}
      ${sub("We're thrilled to have you with us.")}
      ${para(
        "Hi {{Employee Name}},<br/><br/>A warm welcome from all of us at <strong>{{Organization}}</strong>! Your details have been added to the ERP and your first-day plan will arrive separately from your manager.",
      )}
      ${callout("Start date", "{{Start Date}}")}
      ${callout("Reporting to", "{{Reports To}}")}
      ${callout("Department", "{{Department}}")}
      ${para(
        "<strong>Your first 24 hours</strong><br/>• Complete your profile in the ERP.<br/>• Set up your two-factor login.<br/>• Read the welcome handbook in the resources tab.",
      )}
      ${para("If anything is missing or looks wrong, reply to this email — we'll fix it immediately.")}
      ${signoff("Welcome again")}
    `),
  },

  // 7. Task status update (Operations)
  {
    id: "task-status-update",
    category: "Operations",
    name: "Task Status Updated",
    description:
      "Notifies stakeholders whenever a task changes state (e.g. moved to In Progress / Done).",
    subject: "Task update: {{Task Name}} → {{Status}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Task Status Update")}
      ${sub("A task you're following has been updated.")}
      ${callout("Task", "{{Task Name}}")}
      ${callout("New status", "{{Status}}", COLOR.good)}
      ${callout("Owner", "{{Assigned To}}")}
      ${callout("Due date", "{{Due Date}}")}
      ${para("<strong>Notes</strong><br/>{{Notes}}")}
      ${button("Open in ERP", "{{Record URL}}")}
      ${signoff()}
    `),
  },

  // 8. Project milestone (Operations)
  {
    id: "project-milestone",
    category: "Operations",
    name: "Project Milestone Reached",
    description: "Celebratory note when a project milestone is hit.",
    subject: "🎯 Milestone reached: {{Milestone Name}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Milestone Reached", COLOR.good)}
      ${sub("Great progress on {{Project Name}} — a key milestone is now complete.")}
      ${callout("Project", "{{Project Name}}")}
      ${callout("Milestone", "{{Milestone Name}}", COLOR.good)}
      ${callout("Completed on", "{{Completed Date}}")}
      ${para(
        "Nice work team. Keep the momentum going — the next milestone is <strong>{{Next Milestone}}</strong>, due {{Next Milestone Date}}.",
      )}
      ${signoff("Cheers")}
    `),
  },

  // 9. New lead / inquiry (Sales)
  {
    id: "new-lead-inquiry",
    category: "Sales",
    name: "New Lead / Inquiry",
    description:
      "Routes a fresh inquiry to the right salesperson with the contact details inline.",
    subject: "New inquiry from {{Lead Name}} ({{Company}})",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("New Inquiry")}
      ${sub("A potential customer has just reached out. Here's the snapshot.")}
      ${callout("Name", "{{Lead Name}}")}
      ${callout("Company", "{{Company}}")}
      ${callout("Email", "{{Email}}")}
      ${callout("Phone", "{{Phone}}")}
      ${callout("Source", "{{Source}}")}
      ${para("<strong>Message</strong><br/>{{Message}}")}
      ${button("Open in CRM", "{{Record URL}}")}
      ${para(
        "Aim for a first response within 4 hours. Leads contacted in under an hour are 7× more likely to convert.",
      )}
      ${signoff()}
    `),
  },

  // 10. Invoice / payment reminder (Reminders)
  {
    id: "invoice-payment-reminder",
    category: "Reminders",
    name: "Invoice Payment Reminder",
    description: "Gentle nudge for overdue invoices, sent on a schedule.",
    subject: "Reminder: Invoice {{Invoice Number}} is due",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Invoice Payment Reminder", COLOR.warn)}
      ${sub("This is a friendly reminder that the invoice below is approaching or past its due date.")}
      ${callout("Invoice number", "{{Invoice Number}}")}
      ${callout("Amount", "{{Amount}}", COLOR.warn)}
      ${callout("Due date", "{{Due Date}}")}
      ${callout("Days overdue", "{{Days Overdue}}", COLOR.bad)}
      ${para(
        "If payment has already been made, please ignore this message — it can take 1–2 business days to reflect.",
      )}
      ${button("View invoice", "{{Record URL}}")}
      ${para("For any questions, just reply to this email and we'll get back to you the same day.")}
      ${signoff("Best regards")}
    `),
  },

  // 11. Approval required (Approvals)
  {
    id: "approval-required",
    category: "Approvals",
    name: "Approval Required",
    description:
      "Generic 'please review' email when a record enters a pending-approval state.",
    subject: "Approval needed: {{Record Title}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Approval Required")}
      ${sub("A record needs your sign-off before it can move forward.")}
      ${callout("Submitted by", "{{Submitted By}}")}
      ${callout("Submitted on", "{{Submitted On}}")}
      ${callout("Type", "{{Module}}")}
      ${para("<strong>Summary</strong><br/>{{Summary}}")}
      ${button("Review and respond", "{{Record URL}}")}
      ${para(
        "Items pending approval for over 48 hours auto-escalate to the next level — please respond at your earliest convenience.",
      )}
      ${signoff()}
    `),
  },

  // 12. System alert / error (Notifications)
  {
    id: "system-alert",
    category: "Notifications",
    name: "System Alert",
    description:
      "Alert template for failures, threshold breaches, or critical events.",
    subject: "⚠ Alert: {{Alert Title}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("System Alert", COLOR.bad)}
      ${sub("An automated check has flagged the issue below.")}
      ${callout("Alert", "{{Alert Title}}", COLOR.bad)}
      ${callout("Severity", "{{Severity}}", COLOR.bad)}
      ${callout("Triggered at", "{{Triggered At}}")}
      ${callout("Source", "{{Source}}")}
      ${para("<strong>Details</strong><br/>{{Details}}")}
      ${para(
        "<strong>Suggested action</strong><br/>{{Suggested Action}}",
      )}
      ${button("Open dashboard", "{{Record URL}}")}
      ${signoff("On call")}
    `),
  },

  // 13. Document submission acknowledgement (Operations)
  {
    id: "document-submitted",
    category: "Operations",
    name: "Document Submitted — Acknowledgement",
    description:
      "Confirms to the submitter that a form / document was received and queues for review.",
    subject: "We've received your submission: {{Record Title}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Submission Received")}
      ${sub("Thank you for your submission — it's now in our queue.")}
      ${para("Hi {{Submitter Name}},")}
      ${para(
        "We've received your <strong>{{Module}}</strong> submission and will review it shortly. You'll get a follow-up the moment it's actioned.",
      )}
      ${callout("Reference", "{{Record ID}}")}
      ${callout("Submitted on", "{{Submitted On}}")}
      ${para(
        "If you need to add information or attach more documents, reply to this email with your reference number above and we'll attach it to the same record.",
      )}
      ${signoff("Thanks")}
    `),
  },

  // 14. Birthday / work anniversary (HR)
  {
    id: "anniversary-greeting",
    category: "HR",
    name: "Work Anniversary Greeting",
    description:
      "Friendly note marking a team member's work anniversary or birthday.",
    subject: "🎉 Happy work anniversary, {{Employee Name}}!",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Happy Work Anniversary!")}
      ${sub("Marking another year of great work with you on the team.")}
      ${para(
        "Hi {{Employee Name}},<br/><br/>Today marks <strong>{{Years With Company}}</strong> year(s) since you joined us — thank you for everything you've contributed and for being a part of <strong>{{Organization}}</strong>.",
      )}
      ${para(
        "Here's to many more milestones together. Enjoy the day!",
      )}
      ${signoff("With appreciation")}
    `),
  },

  // 16. Performance Review Scheduled (HR)
  {
    id: "performance-review-scheduled",
    category: "HR",
    name: "Performance Review Scheduled",
    description: "Notifies an employee that their performance review is coming up.",
    subject: "Your performance review is scheduled for {{Review Date}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Performance Review Scheduled")}
      ${sub("Your annual performance review has been scheduled.")}
      ${para("Hi {{Employee Name}},")}
      ${para(
        "Your performance review has been scheduled for <strong>{{Review Date}}</strong> at <strong>{{Review Time}}</strong>. The meeting will be held <strong>{{Location}}</strong> and will last approximately {{Duration}} minutes.",
      )}
      ${callout("Manager", "{{Manager Name}}")}
      ${callout("Date & Time", "{{Review Date}} at {{Review Time}}")}
      ${callout("Location", "{{Location}}")}
      ${para(
        "<strong>Preparation</strong><br/>• Review your achievements from the past year<br/>• Prepare 2-3 goals for the coming year<br/>• Come ready to discuss your career development",
      )}
      ${button("View review details", "{{Record URL}}")}
      ${signoff()}
    `),
  },

  // 17. Promotion Announcement (HR)
  {
    id: "promotion-announcement",
    category: "HR",
    name: "Promotion Announcement",
    description: "Congratulates an employee on their promotion and announces it to the team.",
    subject: "🎉 Promotion: {{Employee Name}} is now {{New Position}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Promotion Announcement", COLOR.good)}
      ${sub("Congratulations to {{Employee Name}} on their well-deserved promotion!")}
      ${para("Team,")}
      ${para(
        "I'm delighted to announce that <strong>{{Employee Name}}</strong> has been promoted to <strong>{{New Position}}</strong>, effective <strong>{{Effective Date}}</strong>.",
      )}
      ${callout("New Position", "{{New Position}}", COLOR.good)}
      ${callout("Department", "{{Department}}")}
      ${callout("Effective Date", "{{Effective Date}}")}
      ${para(
        "{{Employee Name}} has demonstrated exceptional performance and leadership in their role. Please join me in congratulating them on this achievement.",
      )}
      ${para("{{Employee Name}}, welcome to your new role! We're excited to see what you'll accomplish next.")}
      ${signoff("Congratulations")}
    `),
  },

  // 18. Deal Closed - Sales Win (Sales)
  {
    id: "deal-closed-sales-win",
    category: "Sales",
    name: "Deal Closed - Sales Win",
    description: "Celebrates a successful deal closure and notifies the team.",
    subject: "🎯 Deal Won: {{Deal Name}} - ${{Deal Value}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Deal Closed Successfully!", COLOR.good)}
      ${sub("Great work team — we've secured another win.")}
      ${callout("Deal", "{{Deal Name}}", COLOR.good)}
      ${callout("Client", "{{Client Name}}")}
      ${callout("Value", "${{Deal Value}}")}
      ${callout("Closed by", "{{Salesperson Name}}")}
      ${callout("Close Date", "{{Close Date}}")}
      ${para(
        "Congratulations to {{Salesperson Name}} and the entire team for closing this deal. This brings our quarterly total to ${{Quarterly Total}}.",
      )}
      ${para(
        "<strong>Key factors in the win:</strong><br/>• {{Key Factor 1}}<br/>• {{Key Factor 2}}<br/>• {{Key Factor 3}}",
      )}
      ${button("View deal details", "{{Record URL}}")}
      ${signoff("Great work")}
    `),
  },

  // 19. Sales Proposal Sent (Sales)
  {
    id: "sales-proposal-sent",
    category: "Sales",
    name: "Sales Proposal Sent",
    description: "Notifies the team when a sales proposal has been sent to a prospect.",
    subject: "Proposal sent: {{Proposal Name}} to {{Prospect Name}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Proposal Sent")}
      ${sub("A new proposal has been delivered to a prospect.")}
      ${callout("Prospect", "{{Prospect Name}}")}
      ${callout("Company", "{{Company Name}}")}
      ${callout("Proposal Value", "${{Proposal Value}}")}
      ${callout("Sent by", "{{Salesperson Name}}")}
      ${callout("Follow-up Date", "{{Follow Up Date}}")}
      ${para(
        "The proposal for {{Proposal Name}} has been sent to {{Prospect Name}}. The prospect has been added to the follow-up queue with a scheduled check-in on {{Follow Up Date}}.",
      )}
      ${para(
        "<strong>Next steps:</strong><br/>• Schedule a discovery call within 3 business days<br/>• Prepare objection handling for {{Key Objection}}<br/>• Send thank you note within 24 hours",
      )}
      ${button("Track in CRM", "{{Record URL}}")}
      ${signoff()}
    `),
  },

  // 20. Budget Approval Request (Finance)
  {
    id: "budget-approval-request",
    category: "Finance",
    name: "Budget Approval Request",
    description: "Requests approval for a budget expenditure or allocation.",
    subject: "Budget approval needed: {{Budget Item}} - ${{Amount}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Budget Approval Required")}
      ${sub("A budget request is pending your approval.")}
      ${callout("Request", "{{Budget Item}}")}
      ${callout("Amount", "${{Amount}}")}
      ${callout("Requested by", "{{Requester Name}}")}
      ${callout("Department", "{{Department}}")}
      ${callout("Needed by", "{{Needed By Date}}")}
      ${para("<strong>Business justification:</strong><br/>{{Justification}}")}
      ${para("<strong>Expected ROI:</strong><br/>{{ROI Details}}")}
      ${button("Review and approve", "{{Record URL}}")}
      ${para(
        "Budget requests over ${{Threshold}} require additional sign-off from finance leadership.",
      )}
      ${signoff()}
    `),
  },

  // 21. Monthly Financial Report (Finance)
  {
    id: "monthly-financial-report",
    category: "Finance",
    name: "Monthly Financial Report",
    description: "Monthly financial summary for executives and department heads.",
    subject: "Monthly Financial Report — {{Month}} {{Year}}",
    worksWith: ["Report Export"],
    body: wrap(`
      ${heading("Monthly Financial Report")}
      ${sub("Financial performance summary for {{Month}} {{Year}}.")}
      ${para("Dear Executives,")}
      ${para(
        "Attached is the financial report for {{Month}} {{Year}}. Key highlights are summarized below; detailed breakdowns are in the attached spreadsheet.",
      )}
      ${callout("Revenue", "${{Revenue}}", COLOR.good)}
      ${callout("Expenses", "${{Expenses}}")}
      ${callout("Net Profit", "${{Net Profit}}", COLOR.good)}
      ${callout("Cash Flow", "${{Cash Flow}}")}
      ${para(
        "<strong>Key variances from budget:</strong><br/>• Revenue: {{Revenue Variance}}% {{Revenue Trend}}<br/>• Expenses: {{Expense Variance}}% {{Expense Trend}}<br/>• Profit Margin: {{Margin Variance}}%",
      )}
      ${button("View full report", "{{Record URL}}")}
      ${signoff("Finance Team")}
    `),
  },

  // 22. IT Security Alert (IT)
  {
    id: "it-security-alert",
    category: "IT",
    name: "IT Security Alert",
    description: "Alerts IT team about security incidents or threats.",
    subject: "🚨 Security Alert: {{Alert Type}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Security Alert", COLOR.bad)}
      ${sub("A security incident has been detected and requires immediate attention.")}
      ${callout("Alert Type", "{{Alert Type}}", COLOR.bad)}
      ${callout("Severity", "{{Severity}}", COLOR.bad)}
      ${callout("Affected Systems", "{{Affected Systems}}")}
      ${callout("Detected At", "{{Detection Time}}")}
      ${para("<strong>Description:</strong><br/>{{Description}}")}
      ${para(
        "<strong>Immediate actions required:</strong><br/>• {{Action 1}}<br/>• {{Action 2}}<br/>• {{Action 3}}",
      )}
      ${para("<strong>Impact:</strong><br/>{{Impact Assessment}}")}
      ${button("Access incident dashboard", "{{Record URL}}")}
      ${signoff("IT Security Team")}
    `),
  },

  // 23. System Maintenance Notice (IT)
  {
    id: "system-maintenance-notice",
    category: "IT",
    name: "System Maintenance Notice",
    description: "Notifies users about scheduled system maintenance.",
    subject: "Scheduled Maintenance: {{System Name}} — {{Maintenance Date}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Scheduled Maintenance Notice")}
      ${sub("System maintenance is planned for {{Maintenance Date}}.")}
      ${callout("System", "{{System Name}}")}
      ${callout("Maintenance Window", "{{Start Time}} - {{End Time}}")}
      ${callout("Expected Duration", "{{Duration}}")}
      ${callout("Date", "{{Maintenance Date}}")}
      ${para(
        "The {{System Name}} will be unavailable during the maintenance window for critical updates and improvements.",
      )}
      ${para(
        "<strong>What to expect:</strong><br/>• Service interruption: {{Start Time}} - {{End Time}}<br/>• Expected completion: {{End Time}}<br/>• Communication: Updates via {{Communication Channel}}",
      )}
      ${para(
        "<strong>Alternative access:</strong><br/>{{Alternative Access Instructions}}",
      )}
      ${button("View maintenance details", "{{Record URL}}")}
      ${signoff("IT Operations")}
    `),
  },

  // 24. Marketing Campaign Launch (Marketing)
  {
    id: "marketing-campaign-launch",
    category: "Marketing",
    name: "Marketing Campaign Launch",
    description: "Announces the launch of a new marketing campaign to the team.",
    subject: "🚀 Campaign Launch: {{Campaign Name}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Campaign Launch", COLOR.primary)}
      ${sub("{{Campaign Name}} is now live!")}
      ${callout("Campaign", "{{Campaign Name}}")}
      ${callout("Launch Date", "{{Launch Date}}")}
      ${callout("Target Audience", "{{Target Audience}}")}
      ${callout("Budget", "${{Budget}}")}
      ${callout("Goal", "{{Campaign Goal}}")}
      ${para(
        "The {{Campaign Name}} campaign has officially launched! This campaign targets {{Target Audience}} with the goal of {{Campaign Goal}}.",
      )}
      ${para(
        "<strong>Key campaign elements:</strong><br/>• {{Channel 1}}: {{Channel 1 Details}}<br/>• {{Channel 2}}: {{Channel 2 Details}}<br/>• {{Channel 3}}: {{Channel 3 Details}}",
      )}
      ${para(
        "<strong>Success metrics to track:</strong><br/>• {{Metric 1}}<br/>• {{Metric 2}}<br/>• {{Metric 3}}",
      )}
      ${button("View campaign dashboard", "{{Record URL}}")}
      ${signoff("Marketing Team")}
    `),
  },

  // 25. Inventory Low Stock Alert (Operations)
  {
    id: "inventory-low-stock-alert",
    category: "Operations",
    name: "Inventory Low Stock Alert",
    description: "Alerts when inventory levels fall below reorder thresholds.",
    subject: "⚠ Low Stock Alert: {{Product Name}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Low Stock Alert", COLOR.warn)}
      ${sub("Inventory levels are below reorder threshold.")}
      ${callout("Product", "{{Product Name}}", COLOR.warn)}
      ${callout("Current Stock", "{{Current Stock}} units")}
      ${callout("Reorder Point", "{{Reorder Point}} units")}
      ${callout("Supplier", "{{Supplier Name}}")}
      ${callout("Estimated Days Left", "{{Days Left}} days")}
      ${para(
        "{{Product Name}} inventory has fallen below the reorder threshold. Current stock: {{Current Stock}} units (reorder point: {{Reorder Point}} units).",
      )}
      ${para(
        "<strong>Recommended actions:</strong><br/>• Place reorder with {{Supplier Name}}<br/>• Expected delivery: {{Expected Delivery Date}}<br/>• Backup supplier available: {{Backup Supplier}}",
      )}
      ${button("View inventory details", "{{Record URL}}")}
      ${signoff("Inventory Management")}
    `),
  },

  // 26. Purchase Order Approval (Approvals)
  {
    id: "purchase-order-approval",
    category: "Approvals",
    name: "Purchase Order Approval",
    description: "Requests approval for a purchase order before processing.",
    subject: "Purchase Order Approval: PO-{{PO Number}} - ${{Total Amount}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Purchase Order Approval Required")}
      ${sub("A purchase order is pending your approval.")}
      ${callout("PO Number", "PO-{{PO Number}}")}
      ${callout("Vendor", "{{Vendor Name}}")}
      ${callout("Total Amount", "${{Total Amount}}")}
      ${callout("Requested by", "{{Requester Name}}")}
      ${callout("Required by", "{{Required By Date}}")}
      ${para("<strong>Items:</strong>")}
      ${para("{{Item List}}")}
      ${para("<strong>Business justification:</strong><br/>{{Justification}}")}
      ${button("Review purchase order", "{{Record URL}}")}
      ${para(
        "Purchase orders over ${{Threshold}} require additional approval from procurement leadership.",
      )}
      ${signoff()}
    `),
  },

  // 27. Meeting Reminder (Reminders)
  {
    id: "meeting-reminder",
    category: "Reminders",
    name: "Meeting Reminder",
    description: "Reminds attendees about upcoming meetings with agenda and details.",
    subject: "Reminder: {{Meeting Title}} in {{Hours Until}} hours",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Meeting Reminder")}
      ${sub("{{Meeting Title}} is scheduled for today.")}
      ${callout("Meeting", "{{Meeting Title}}")}
      ${callout("Date & Time", "{{Meeting Date}} at {{Meeting Time}}")}
      ${callout("Location", "{{Meeting Location}}")}
      ${callout("Duration", "{{Duration}} minutes")}
      ${callout("Organizer", "{{Organizer Name}}")}
      ${para("<strong>Attendees:</strong><br/>{{Attendee List}}")}
      ${para("<strong>Agenda:</strong><br/>{{Agenda Items}}")}
      ${para("<strong>Preparation:</strong><br/>{{Preparation Notes}}")}
      ${button("Join meeting", "{{Meeting Link}}")}
      ${para("Please arrive 5 minutes early. If you cannot attend, notify {{Organizer Name}} as soon as possible.")}
      ${signoff()}
    `),
  },

  // 28. Project Deadline Reminder (Reminders)
  {
    id: "project-deadline-reminder",
    category: "Reminders",
    name: "Project Deadline Reminder",
    description: "Reminds team members about approaching project deadlines.",
    subject: "⏰ Deadline approaching: {{Project Name}} — {{Days Left}} days left",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Deadline Reminder", COLOR.warn)}
      ${sub("{{Project Name}} deadline is approaching.")}
      ${callout("Project", "{{Project Name}}", COLOR.warn)}
      ${callout("Deadline", "{{Deadline Date}}")}
      ${callout("Days Remaining", "{{Days Left}} days")}
      ${callout("Status", "{{Current Status}}")}
      ${callout("Owner", "{{Project Owner}}")}
      ${para("<strong>Key milestones remaining:</strong><br/>{{Milestone List}}")}
      ${para("<strong>Current blockers:</strong><br/>{{Blocker List}}")}
      ${para(
        "<strong>Next steps:</strong><br/>• {{Action 1}}<br/>• {{Action 2}}<br/>• {{Action 3}}",
      )}
      ${button("View project details", "{{Record URL}}")}
      ${signoff("Project Management")}
    `),
  },

  // 29. Employee Exit Interview (HR)
  {
    id: "employee-exit-interview",
    category: "HR",
    name: "Employee Exit Interview",
    description: "Schedules and confirms exit interview for departing employees.",
    subject: "Exit Interview Scheduled: {{Employee Name}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Exit Interview Scheduled")}
      ${sub("{{Employee Name}}'s exit interview has been arranged.")}
      ${callout("Employee", "{{Employee Name}}")}
      ${callout("Last Day", "{{Last Working Day}}")}
      ${callout("Interview Date", "{{Interview Date}}")}
      ${callout("Interviewer", "{{Interviewer Name}}")}
      ${callout("Format", "{{Interview Format}}")}
      ${para(
        "{{Employee Name}}'s exit interview has been scheduled for {{Interview Date}}. This is an important opportunity to gather feedback about their experience and identify areas for improvement.",
      )}
      ${para(
        "<strong>Interview objectives:</strong><br/>• Understand reasons for leaving<br/>• Gather feedback on management and processes<br/>• Identify potential improvements<br/>• Ensure smooth knowledge transfer",
      )}
      ${para(
        "<strong>Preparation:</strong><br/>• Review {{Employee Name}}'s tenure and achievements<br/>• Prepare open-ended questions<br/>• Ensure confidential environment",
      )}
      ${button("Access exit checklist", "{{Record URL}}")}
      ${signoff("HR Team")}
    `),
  },

  // 30. Customer Feedback Received (Sales)
  {
    id: "customer-feedback-received",
    category: "Sales",
    name: "Customer Feedback Received",
    description: "Notifies the team when customer feedback is received.",
    subject: "Customer Feedback: {{Customer Name}} - {{Rating}}/5",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Customer Feedback Received")}
      ${sub("{{Customer Name}} has shared feedback about their experience.")}
      ${callout("Customer", "{{Customer Name}}")}
      ${callout("Rating", "{{Rating}}/5 stars")}
      ${callout("Feedback Date", "{{Feedback Date}}")}
      ${callout("Product/Service", "{{Product Service}}")}
      ${callout("Contact Method", "{{Contact Method}}")}
      ${para("<strong>Feedback summary:</strong><br/>{{Feedback Summary}}")}
      ${para("<strong>Key points:</strong><br/>{{Key Points}}")}
      ${para("<strong>Action items:</strong><br/>{{Action Items}}")}
      ${button("View full feedback", "{{Record URL}}")}
      ${para(
        "{{Rating Category}} feedback. {{Follow Up Action}}",
      )}
      ${signoff("Customer Success Team")}
    `),
  },

  // 31. Expense Report Approval (Finance)
  {
    id: "expense-report-approval",
    category: "Finance",
    name: "Expense Report Approval",
    description: "Requests approval for submitted expense reports.",
    subject: "Expense Report Approval: {{Employee Name}} - ${{Total Amount}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Expense Report Approval Required")}
      ${sub("An expense report is pending your approval.")}
      ${callout("Employee", "{{Employee Name}}")}
      ${callout("Report Period", "{{From Date}} - {{To Date}}")}
      ${callout("Total Amount", "${{Total Amount}}")}
      ${callout("Submitted", "{{Submission Date}}")}
      ${callout("Category Breakdown", "{{Category Summary}}")}
      ${para("<strong>Expense details:</strong><br/>{{Expense List}}")}
      ${para("<strong>Business purpose:</strong><br/>{{Business Purpose}}")}
      ${button("Review expense report", "{{Record URL}}")}
      ${para(
        "Expense reports should be approved within 5 business days. Items over ${{Threshold}} may require additional approval.",
      )}
      ${signoff("Finance Team")}
    `),
  },

  // 32. Software Update Available (IT)
  {
    id: "software-update-available",
    category: "IT",
    name: "Software Update Available",
    description: "Notifies users about available software updates.",
    subject: "Software Update Available: {{Software Name}} v{{Version}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Software Update Available")}
      ${sub("A new version of {{Software Name}} is ready for installation.")}
      ${callout("Software", "{{Software Name}}")}
      ${callout("New Version", "v{{Version}}")}
      ${callout("Release Date", "{{Release Date}}")}
      ${callout("Priority", "{{Update Priority}}")}
      ${callout("Estimated Install Time", "{{Install Time}}")}
      ${para(
        "Version {{Version}} of {{Software Name}} is now available. This update includes {{Key Improvements}}.",
      )}
      ${para(
        "<strong>What's new:</strong><br/>• {{Feature 1}}<br/>• {{Feature 2}}<br/>• {{Bug fixes and improvements}}",
      )}
      ${para(
        "<strong>Installation:</strong><br/>• {{Installation Method}}<br/>• Expected downtime: {{Downtime}}<br/>• Rollback available: {{Rollback Option}}",
      )}
      ${button("Download update", "{{Download Link}}")}
      ${signoff("IT Support")}
    `),
  },

  // 33. Content Published (Marketing)
  {
    id: "content-published",
    category: "Marketing",
    name: "Content Published",
    description: "Announces when new marketing content has been published.",
    subject: "📢 Content Published: {{Content Title}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Content Published", COLOR.good)}
      ${sub("{{Content Title}} is now live!")}
      ${callout("Content Title", "{{Content Title}}")}
      ${callout("Content Type", "{{Content Type}}")}
      ${callout("Published Date", "{{Published Date}}")}
      ${callout("Target Channel", "{{Target Channel}}")}
      ${callout("Author", "{{Author Name}}")}
      ${para(
        "{{Content Title}} has been published on {{Target Channel}}. This {{Content Type}} is designed to {{Content Objective}}.",
      )}
      ${para(
        "<strong>Key messages:</strong><br/>• {{Message 1}}<br/>• {{Message 2}}<br/>• {{Call to action}}",
      )}
      ${para(
        "<strong>Performance goals:</strong><br/>• {{Goal 1}}<br/>• {{Goal 2}}<br/>• {{Goal 3}}",
      )}
      ${button("View published content", "{{Content Link}}")}
      ${signoff("Content Team")}
    `),
  },

  // 34. Quality Control Issue (Operations)
  {
    id: "quality-control-issue",
    category: "Operations",
    name: "Quality Control Issue",
    description: "Alerts about quality control issues that need attention.",
    subject: "⚠ Quality Issue: {{Product Name}} Batch {{Batch Number}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Quality Control Issue", COLOR.bad)}
      ${sub("A quality issue has been identified and requires immediate attention.")}
      ${callout("Product", "{{Product Name}}", COLOR.bad)}
      ${callout("Batch/Lot", "{{Batch Number}}")}
      ${callout("Issue Type", "{{Issue Type}}")}
      ${callout("Severity", "{{Severity}}")}
      ${callout("Reported By", "{{Reported By}}")}
      ${callout("Affected Quantity", "{{Affected Quantity}}")}
      ${para("<strong>Issue description:</strong><br/>{{Issue Description}}")}
      ${para(
        "<strong>Immediate actions:</strong><br/>• {{Action 1}}<br/>• {{Action 2}}<br/>• {{Action 3}}",
      )}
      ${para("<strong>Containment measures:</strong><br/>{{Containment Measures}}")}
      ${para("<strong>Root cause analysis:</strong><br/>{{RCA Status}}")}
      ${button("Access quality dashboard", "{{Record URL}}")}
      ${signoff("Quality Assurance")}
    `),
  },

  // 35. Contract Renewal Reminder (Operations)
  {
    id: "contract-renewal-reminder",
    category: "Operations",
    name: "Contract Renewal Reminder",
    description: "Reminds about upcoming contract renewals or expirations.",
    subject: "Contract Renewal: {{Contract Name}} expires {{Days Until Expiry}} days",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Contract Renewal Reminder", COLOR.warn)}
      ${sub("{{Contract Name}} is approaching expiration.")}
      ${callout("Contract", "{{Contract Name}}")}
      ${callout("Vendor/Client", "{{Vendor Client Name}}")}
      ${callout("Expiration Date", "{{Expiration Date}}")}
      ${callout("Days Until Expiry", "{{Days Until Expiry}} days")}
      ${callout("Contract Value", "${{Contract Value}}")}
      ${callout("Auto Renewal", "{{Auto Renewal Status}}")}
      ${para(
        "The contract for {{Contract Name}} with {{Vendor Client Name}} expires on {{Expiration Date}}. Current value: ${{Contract Value}}.",
      )}
      ${para(
        "<strong>Key terms to review:</strong><br/>• Pricing and escalation clauses<br/>• Service level agreements<br/>• Termination conditions<br/>• Renewal options",
      )}
      ${para(
        "<strong>Recommended actions:</strong><br/>• Schedule renewal negotiations<br/>• Review contract performance<br/>• Prepare renewal proposal<br/>• Identify alternative options if needed",
      )}
      ${button("View contract details", "{{Record URL}}")}
      ${signoff("Contract Management")}
    `),
  },

  // 36. Training Session Scheduled (HR)
  {
    id: "training-session-scheduled",
    category: "HR",
    name: "Training Session Scheduled",
    description: "Notifies employees about scheduled training sessions.",
    subject: "Training Scheduled: {{Training Title}} — {{Session Date}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Training Session Scheduled")}
      ${sub("{{Training Title}} is scheduled for {{Session Date}}.")}
      ${callout("Training", "{{Training Title}}")}
      ${callout("Date & Time", "{{Session Date}} at {{Session Time}}")}
      ${callout("Duration", "{{Duration}} hours")}
      ${callout("Location", "{{Location}}")}
      ${callout("Trainer", "{{Trainer Name}}")}
      ${callout("Format", "{{Training Format}}")}
      ${para("<strong>Training objectives:</strong><br/>{{Objectives}}")}
      ${para("<strong>Target audience:</strong><br/>{{Target Audience}}")}
      ${para(
        "<strong>Preparation required:</strong><br/>• {{Prep Item 1}}<br/>• {{Prep Item 2}}<br/>• {{Materials Needed}}",
      )}
      ${para("<strong>What you'll learn:</strong><br/>{{Learning Outcomes}}")}
      ${button("Register for training", "{{Registration Link}}")}
      ${para("This training is {{Mandatory Status}}. Please confirm your attendance by {{RSVP Date}}.")}
      ${signoff("Learning & Development")}
    `),
  },

  // 37. Quarterly Business Review (Reports)
  {
    id: "quarterly-business-review",
    category: "Reports",
    name: "Quarterly Business Review",
    description: "Comprehensive quarterly business performance report.",
    subject: "Quarterly Business Review — Q{{Quarter}} {{Year}}",
    worksWith: ["Report Export"],
    body: wrap(`
      ${heading("Quarterly Business Review")}
      ${sub("Q{{Quarter}} {{Year}} performance summary and outlook.")}
      ${para("Dear Leadership Team,")}
      ${para(
        "Attached is the comprehensive business review for Q{{Quarter}} {{Year}}. This report covers financial performance, operational metrics, and strategic initiatives.",
      )}
      ${callout("Revenue", "${{Revenue}}", COLOR.good)}
      ${callout("Growth Rate", "{{Growth Rate}}%", COLOR.good)}
      ${callout("Profit Margin", "{{Profit Margin}}%")}
      ${callout("Key Achievements", "{{Achievement Count}}")}
      ${para(
        "<strong>Highlights:</strong><br/>• {{Highlight 1}}<br/>• {{Highlight 2}}<br/>• {{Highlight 3}}",
      )}
      ${para(
        "<strong>Challenges & Actions:</strong><br/>• {{Challenge 1}}: {{Action 1}}<br/>• {{Challenge 2}}: {{Action 2}}",
      )}
      ${para("<strong>Q{{Next Quarter}} Priorities:</strong><br/>{{Priority List}}")}
      ${button("View detailed report", "{{Record URL}}")}
      ${signoff("Executive Team")}
    `),
  },

  // 38. IT Help Desk Ticket Update (IT)
  {
    id: "it-help-desk-update",
    category: "IT",
    name: "IT Help Desk Ticket Update",
    description: "Updates users on the status of their IT support tickets.",
    subject: "Ticket Update: {{Ticket Number}} - {{Status}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Help Desk Ticket Update")}
      ${sub("Your ticket {{Ticket Number}} has been updated.")}
      ${callout("Ticket", "#{{Ticket Number}}")}
      ${callout("Status", "{{Status}}")}
      ${callout("Priority", "{{Priority}}")}
      ${callout("Assigned To", "{{Assigned Technician}}")}
      ${callout("Last Updated", "{{Last Update Time}}")}
      ${para("<strong>Issue summary:</strong><br/>{{Issue Description}}")}
      ${para("<strong>Latest update:</strong><br/>{{Update Details}}")}
      ${para(
        "<strong>Next steps:</strong><br/>{{Next Steps}}",
      )}
      ${para("<strong>Estimated resolution:</strong><br/>{{ETA}}")}
      ${button("View ticket details", "{{Ticket URL}}")}
      ${para("If you have additional information or questions, please reply to this email or update the ticket directly.")}
      ${signoff("IT Help Desk")}
    `),
  },

  // 39. Marketing Campaign Results (Marketing)
  {
    id: "marketing-campaign-results",
    category: "Marketing",
    name: "Marketing Campaign Results",
    description: "Reports the results and performance of completed marketing campaigns.",
    subject: "Campaign Results: {{Campaign Name}} — {{ROI}}% ROI",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Campaign Results")}
      ${sub("{{Campaign Name}} performance summary and insights.")}
      ${callout("Campaign", "{{Campaign Name}}")}
      ${callout("Duration", "{{Start Date}} - {{End Date}}")}
      ${callout("Total Spend", "${{Total Spend}}")}
      ${callout("ROI", "{{ROI}}%", COLOR.good)}
      ${callout("Primary Goal", "{{Primary Goal}}")}
      ${para(
        "The {{Campaign Name}} campaign has concluded. Here's a summary of key performance metrics:",
      )}
      ${para(
        "<strong>Key Metrics:</strong><br/>• Reach: {{Reach}}<br/>• Engagement: {{Engagement Rate}}%<br/>• Conversions: {{Conversions}}<br/>• Cost per Acquisition: ${{CPA}}",
      )}
      ${para(
        "<strong>Top Performing Content:</strong><br/>• {{Top Content 1}}<br/>• {{Top Content 2}}<br/>• {{Top Content 3}}",
      )}
      ${para("<strong>Key Learnings:</strong><br/>{{Key Learnings}}")}
      ${button("View detailed analytics", "{{Analytics URL}}")}
      ${signoff("Marketing Analytics")}
    `),
  },

  // 40. Employee Recognition (HR)
  {
    id: "employee-recognition",
    category: "HR",
    name: "Employee Recognition",
    description: "Recognizes and celebrates employee achievements and milestones.",
    subject: "🏆 Recognition: {{Employee Name}} - {{Achievement}}",
    worksWith: ["Email Notification"],
    body: wrap(`
      ${heading("Employee Recognition", COLOR.good)}
      ${sub("Celebrating {{Employee Name}}'s outstanding achievement!")}
      ${callout("Recognized", "{{Employee Name}}", COLOR.good)}
      ${callout("Achievement", "{{Achievement}}")}
      ${callout("Department", "{{Department}}")}
      ${callout("Manager", "{{Manager Name}}")}
      ${callout("Recognition Date", "{{Recognition Date}}")}
      ${para(
        "We're thrilled to recognize {{Employee Name}} for {{Achievement}}. This recognition highlights their exceptional contribution to {{Organization}}.",
      )}
      ${para("<strong>What they accomplished:</strong><br/>{{Achievement Details}}")}
      ${para(
        "<strong>Impact:</strong><br/>{{Impact Description}}",
      )}
      ${para(
        "{{Employee Name}}, your dedication and hard work inspire us all. Keep up the excellent work!",
      )}
      ${button("View recognition details", "{{Record URL}}")}
      ${signoff("Recognition Committee")}
    `),
  },
]

export function getTemplatesForAction(
  actionType: "Email Notification" | "Report Export",
): EmailTemplate[] {
  return EMAIL_TEMPLATES.filter(
    (t) => !t.worksWith || t.worksWith.includes(actionType),
  )
}
