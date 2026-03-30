import { type NextRequest } from 'next/server';
import {
  convertToModelMessages,
  streamText,
  tool,
  UIMessage,
  stepCountIs,
} from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createXai } from '@ai-sdk/xai';
import { createGroq } from '@ai-sdk/groq';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import {
  resolveERPContext,
  discoverOrgStructure,
  queryFormRecords,
  getOrgKPISummary,
  getUserActivitySummary,
  getModuleAnalytics,
  getSubmissionTimeline,
  aggregateOrgRecords,
  type ERPContext,
} from '@/lib/erp-engine';
import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

async function getAIConfig(organizationId: string) {
  let config = await prisma.aIConfiguration.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (!config) {
    config = await prisma.aIConfiguration.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });
  }
  return config;
}

function createModelFromConfig(config: { provider: string; model: string; apiKey: string }) {
  switch (config.provider) {
    case 'openai': return createOpenAI({ apiKey: config.apiKey })(config.model);
    case 'anthropic': return createAnthropic({ apiKey: config.apiKey })(config.model);
    case 'google': return createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model);
    case 'xai': return createXai({ apiKey: config.apiKey })(config.model);
    case 'groq': return createGroq({ apiKey: config.apiKey })(config.model);
    case 'deepinfra': return createOpenAI({ apiKey: config.apiKey, baseURL: 'https://api.deepinfra.com/v1/openai' })(config.model);
    default: return createOpenAI({ apiKey: config.apiKey })(config.model);
  }
}

function buildSystemPrompt(ctx: ERPContext, orgName: string) {
  return `You are an enterprise-grade analytical assistant integrated with the organizational data of "${orgName}".
Your responses must be precise, deterministic, and execution-focused — never conversational, vague, or chatty.

CURRENT SESSION CONTEXT:
- User ID: ${ctx.userId}
- Organization: ${orgName} (${ctx.organizationId})
- Access Role: ${ctx.accessRole}
- Admin Privileges: ${ctx.isAdmin}
- Accessible Modules: ${ctx.allowedModuleIds.length}
- Accessible Forms: ${ctx.allowedFormIds.length}

ACCESS CONTROL RULES (CRITICAL - NEVER BYPASS):
- "user" role: Own records and activity only.
- "manager" role: Team data within same organizational unit.
- "admin" role: All data within the organization.
- "super_admin" role: System-wide analytics and cross-org visibility.
- NEVER reveal data from other organizations.
- NEVER show records outside the user's access scope.
- If access is restricted, state the restriction factually in one line.

AVAILABLE CAPABILITIES:
You have tools to query the full ERP system including:
- Organization overview & KPIs (users, records, modules, forms)
- Organizational structure (modules, forms, fields, sections, subforms)
- Form records from any form (with filters by status, date, etc.)
- Module & form analytics (record counts, usage patterns)
- Submission timelines & trends
- User activity & profile details (logins, audit trail)
- Record status breakdown across all forms
- User directory with roles and departments
- Audit logs for compliance & security
- Attendance records (check-in/check-out, presence tracking)
- Payroll data (salaries, deductions, payment status)
- Employee directory (HR details, department, designation, contact)
- Login history (security audit, failed attempts, IP tracking)
- Detailed form structure (fields, sections, subforms, configuration)
- Organization units & role hierarchy (departments, teams, org chart)
- Role-permission matrix (who can access what)
- Cross-form record search (find data by keyword across all forms)
- Recent submissions (latest activity across all forms)

Always use the most specific tool for the user's question. If the question requires data from multiple tools, call them in sequence.

CRITICAL TOOL USAGE RULES:
- When the user mentions a form by NAME (e.g., "show expenses data"), you MUST call findFormByName FIRST to get the formId, then use that formId in queryFormRecords or getFormDetails.
- When calling discoverStructure, the response includes formId and moduleId for every form — use these IDs for subsequent queries.
- NEVER guess or fabricate a formId. Always look it up first.

RESPONSE PROTOCOL:
Always transform answers into structured outputs. Choose the most appropriate format:

1. **Executive Summary** — For overview/dashboard requests:
   ## Executive Summary
   | Metric | Value | Trend |
   |--------|-------|-------|
   Use a summary table followed by 2-3 bullet key insights and a "Recommendations" section.

2. **KPI Dashboard** — For metrics/stats requests:
   ## KPI Dashboard — [Title]
   Present metrics in a table with columns: Metric, Current Value, Previous Period, Change (%), Status.
   Add a "Risk Indicators" section if any metric shows negative trends.

3. **Data Table** — For record/list queries:
   ## [Title] — [N] Records
   Present in a markdown table with properly labeled columns.
   Always include a row count summary line. If >20 records, show top 20 and note the total.

4. **Comparison Matrix** — For comparing entities/periods:
   ## Comparison Matrix — [Title]
   Use a table with entities as columns and metrics as rows.
   Include a "Winner" or "Best Performing" conclusion.

5. **Trend Analysis** — For time-series questions:
   ## Trend Analysis — [Title]
   | Period | Value | Change | Direction |
   Include a "Forecast" section with projected values if enough data exists.

6. **Audit Report** — For compliance/security queries:
   ## Audit Report — [Date Range]
   Present in a table: Timestamp, User, Action, Module, Details.
   Add a "Findings" section highlighting anomalies.

7. **Organizational Structure** — For hierarchy/module queries:
   ## Organization Structure
   Use nested bullet lists with counts for each level (modules > forms > fields).

FORMATTING RULES:
- Always start with a level-2 heading (##) that labels the output type.
- Use markdown tables for any data with 2+ columns. Always include the separator row (|---|---|).
- Use **bold** for metric names and key figures.
- Use \`code\` for IDs, technical values, and status codes.
- Separate sections with --- horizontal rules.
- End every response with a "---" divider followed by a short "Next Steps" section listing 2-3 follow-up actions the user can take (as a bullet list).
- Numbers must include context: absolute value, percentage change, and direction indicator (up/down/flat).
- Never use greetings, pleasantries, filler phrases, or conversational language.
- Never say "Sure!", "Great question!", "Let me...", "I'd be happy to..." etc.
- Go straight to the structured output.
- If data is insufficient, state exactly what is missing and what additional query would resolve it.
- When presenting monetary values, format with commas and currency symbols.
- Dates should use ISO format (YYYY-MM-DD) in tables and human-readable format in prose.`;
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);

    if (!authUser) {
      return Response.json({ error: 'Not authenticated. Please log in first.' }, { status: 401 });
    }

    if (!authUser.organizationId) {
      return Response.json({ error: 'No organization assigned to your account. Please contact your admin.' }, { status: 401 });
    }

    const { messages, conversationId }: { messages: UIMessage[]; conversationId?: string } = await req.json();

    const userId = authUser.id;
    const organizationId = authUser.organizationId;
    const orgRecord = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const orgName = orgRecord?.name || 'Organization';

    const ctx = await resolveERPContext(userId, organizationId);
    const aiConfig = await getAIConfig(organizationId);

    if (!aiConfig) {
      return Response.json({ error: 'No AI provider configured. Please go to Settings and configure an AI provider with your API key before using the chatbot.' }, { status: 422 });
    }

    const model = createModelFromConfig({
      provider: aiConfig.provider,
      model: aiConfig.model,
      apiKey: aiConfig.apiKey,
    });

    const erpTools = {
      getKPISummary: tool({
        description: 'Get organization KPI summary including total users, active users, total records, pending records, modules, forms, and audit activity. Use this when user asks about overview, dashboard, or general stats.',
        inputSchema: z.object({}),
        execute: async () => await getOrgKPISummary(ctx),
      }),

      discoverStructure: tool({
        description: 'Discover the organization structure: modules, forms (with IDs), fields, roles, units, and employee count. Use when user asks about what modules exist, what forms are available, or organizational hierarchy. IMPORTANT: This returns formId values you need for other tools like queryFormRecords and getFormDetails.',
        inputSchema: z.object({}),
        execute: async () => {
          const structure = await discoverOrgStructure(ctx);
          return {
            modules: structure.modules.map(m => ({
              moduleId: m.id,
              name: m.name,
              formCount: m.forms.length,
              forms: m.forms.map(f => ({
                formId: f.id,
                name: f.name,
                published: f.isPublished,
                fieldCount: f.sections.reduce((s, sec) => s + sec.fields.length, 0),
                sections: f.sections.map(sec => ({
                  title: sec.title,
                  fields: sec.fields.map(ff => ({ label: ff.label, type: ff.type })),
                })),
              })),
            })),
            totalUsers: structure.totalUsers,
            totalEmployees: structure.totalEmployees,
            roles: structure.roles,
            units: structure.units,
          };
        },
      }),

      findFormByName: tool({
        description: 'Find a form by its name (partial match) and get its ID. ALWAYS use this tool FIRST before calling queryFormRecords or getFormDetails when you only know the form name but not the formId. Returns matching forms with their IDs.',
        inputSchema: z.object({
          name: z.string().describe('Form name or partial name to search for'),
        }),
        execute: async ({ name }) => {
          const forms = await prisma.form.findMany({
            where: {
              module: { organizationId: ctx.organizationId },
              name: { contains: name, mode: 'insensitive' },
            },
            select: { id: true, name: true, isPublished: true, module: { select: { name: true } } },
            take: 10,
          });
          if (forms.length === 0) return { error: `No forms found matching "${name}".`, forms: [] };
          return {
            forms: forms.map(f => ({
              formId: f.id,
              formName: f.name,
              moduleName: f.module.name,
              isPublished: f.isPublished,
            })),
          };
        },
      }),

      queryFormRecords: tool({
        description: 'Query records from a specific form. Use when user asks about form submissions, records, data entries, or wants to see specific form data. You MUST provide the formId — if you only know the form name, call findFormByName first to get the formId.',
        inputSchema: z.object({
          formId: z.string().describe('The form ID to query records from'),
          status: z.string().nullable().describe('Filter by status (e.g., submitted, pending, approved)'),
          dateFrom: z.string().nullable().describe('Start date filter in ISO format'),
          dateTo: z.string().nullable().describe('End date filter in ISO format'),
          limit: z.number().nullable().describe('Max records to return (default 50)'),
        }),
        execute: async ({ formId, status, dateFrom, dateTo, limit }) => {
          const records = await queryFormRecords(ctx, formId, {
            status: status ?? undefined,
            dateFrom: dateFrom ? new Date(dateFrom) : undefined,
            dateTo: dateTo ? new Date(dateTo) : undefined,
            limit: limit ?? 50,
          });
          return {
            total: records.length,
            records: records.map(r => ({
              id: r.id,
              data: r.recordData,
              status: r.status,
              submittedAt: r.submittedAt.toISOString(),
              submittedBy: r.submittedBy,
              amount: r.amount,
              date: r.date?.toISOString(),
            })),
          };
        },
      }),

      getModuleAnalytics: tool({
        description: 'Get analytics broken down by module and form, showing record counts per module and per form. Use when user asks about module performance, form usage, or record distribution.',
        inputSchema: z.object({}),
        execute: async () => await getModuleAnalytics(ctx),
      }),

      getSubmissionTimeline: tool({
        description: 'Get a time series of record submissions across all forms. Use for trend analysis, charts, or when user asks about submission patterns over time.',
        inputSchema: z.object({
          dateFrom: z.string().describe('Start date in ISO format'),
          dateTo: z.string().describe('End date in ISO format'),
        }),
        execute: async ({ dateFrom, dateTo }) => await getSubmissionTimeline(ctx, new Date(dateFrom), new Date(dateTo)),
      }),

      getUserActivity: tool({
        description: 'Get activity summary for a specific user including login history and audit logs. Respects role-based access.',
        inputSchema: z.object({
          userId: z.string().nullable().describe('User ID to look up. Leave null for current user.'),
        }),
        execute: async ({ userId: targetUserId }) => await getUserActivitySummary(ctx, targetUserId ?? undefined),
      }),

      getStatusBreakdown: tool({
        description: 'Get a breakdown of record statuses across all forms in the organization. Use when user asks about pending approvals, submission status distribution, or workflow bottlenecks.',
        inputSchema: z.object({}),
        execute: async () => {
          const allRecords = await aggregateOrgRecords(ctx);
          const statusMap = new Map<string, number>();
          for (const tableName of ['form_records_1','form_records_2','form_records_3','form_records_4','form_records_5','form_records_6','form_records_7','form_records_8','form_records_9','form_records_10','form_records_11','form_records_12','form_records_13','form_records_14','form_records_15'] as const) {
            try {
              const rows: any[] = await prisma.$queryRawUnsafe(`
                SELECT fr.status, COUNT(*)::int as count
                FROM "${tableName}" fr
                JOIN forms f ON f.id = fr.form_id
                JOIN form_modules fm ON fm.id = f.module_id
                WHERE fm.organization_id = '${ctx.organizationId}'
                GROUP BY fr.status
              `);
              for (const row of rows) {
                statusMap.set(row.status, (statusMap.get(row.status) || 0) + row.count);
              }
            } catch {}
          }
          return Object.fromEntries(statusMap);
        },
      }),

      listOrgUsers: tool({
        description: 'List users in the organization with their roles and status. Admin/super_admin only.',
        inputSchema: z.object({ limit: z.number().nullable().describe('Max users to return (default 20)') }),
        execute: async ({ limit }) => {
          if (ctx.accessRole === 'user') return { error: 'Access denied. Only managers and admins can list organization users.' };
          const users = await prisma.user.findMany({
            where: { organizationId: ctx.organizationId },
            select: { id: true, email: true, first_name: true, last_name: true, status: true, department: true, unitAssignments: { include: { role: { select: { name: true } } } } },
            take: limit ?? 20,
          });
          return users.map(u => ({
            id: u.id,
            name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
            email: u.email,
            status: u.status,
            department: u.department,
            roles: u.unitAssignments.map(a => a.role.name),
          }));
        },
      }),

      getAuditLogs: tool({
        description: 'Get recent audit logs for the organization. Shows who did what and when. Use for compliance, tracking changes, and security review.',
        inputSchema: z.object({
          limit: z.number().nullable().describe('Max logs to return (default 20)'),
          action: z.string().nullable().describe('Filter by action type'),
          module: z.string().nullable().describe('Filter by module name'),
        }),
        execute: async ({ limit, action, module }) => {
          if (ctx.accessRole === 'user') return { error: 'Access denied. Only managers and admins can view audit logs.' };
          const where: any = { organizationId: ctx.organizationId };
          if (action) where.action = action;
          if (module) where.module = module;
          const logs = await prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit ?? 20,
            select: { performedBy: true, action: true, module: true, recordName: true, details: true, createdAt: true },
          });
          return logs;
        },
      }),

      // ─── Attendance ──────────────────────────────────────────────

      getAttendanceInfo: tool({
        description: 'Get attendance records. For regular users returns own attendance. For managers/admins returns team or org-wide attendance. Use when user asks about attendance, check-in, check-out, presence, or who is present today.',
        inputSchema: z.object({
          date: z.string().nullable().describe('Specific date (YYYY-MM-DD). Defaults to today.'),
          userId: z.string().nullable().describe('Specific user ID. Null for current user or all (admin).'),
          limit: z.number().nullable().describe('Max records (default 50)'),
        }),
        execute: async ({ date, userId: targetUserId, limit }) => {
          const targetDate = date || new Date().toISOString().split('T')[0];
          const where: any = {};

          if (ctx.accessRole === 'user') {
            where.userId = ctx.userId;
          } else if (targetUserId) {
            where.userId = targetUserId;
          } else {
            // Admin/manager: get all org users' attendance
            const orgUserIds = (await prisma.user.findMany({
              where: { organizationId: ctx.organizationId },
              select: { id: true },
            })).map(u => u.id);
            where.userId = { in: orgUserIds };
          }
          where.date = targetDate;

          const records = await prisma.attendance.findMany({
            where,
            include: { user: { select: { first_name: true, last_name: true, email: true } } },
            take: limit ?? 50,
            orderBy: { createdAt: 'desc' },
          });

          return {
            date: targetDate,
            total: records.length,
            checkedIn: records.filter(r => r.checkedIn).length,
            checkedOut: records.filter(r => r.checkedOut).length,
            records: records.map(r => ({
              userId: r.userId,
              name: [r.user.first_name, r.user.last_name].filter(Boolean).join(' ') || r.user.email,
              checkedIn: r.checkedIn,
              checkInTime: r.checkInTime,
              checkedOut: r.checkedOut,
              checkOutTime: r.checkOutTime,
              notes: r.notes,
            })),
          };
        },
      }),

      // ─── Payroll ─────────────────────────────────────────────────

      getPayrollSummary: tool({
        description: 'Get payroll records and summary. Shows salary details, deductions, and payment status. Admin/manager only. Use when user asks about payroll, salaries, compensation, or payment status.',
        inputSchema: z.object({
          month: z.number().nullable().describe('Month number (1-12). Defaults to current month.'),
          year: z.number().nullable().describe('Year (e.g. 2026). Defaults to current year.'),
          status: z.string().nullable().describe('Filter by status: pending, processed, paid'),
          limit: z.number().nullable().describe('Max records (default 50)'),
        }),
        execute: async ({ month, year, status, limit }) => {
          if (ctx.accessRole === 'user') return { error: 'Access denied. Only managers and admins can view payroll data.' };
          const now = new Date();
          const targetMonth = month ?? (now.getMonth() + 1);
          const targetYear = year ?? now.getFullYear();

          // Get employee IDs belonging to this organization
          const orgEmployeeIds = (await prisma.employee.findMany({
            where: { user: { organizationId: ctx.organizationId } },
            select: { id: true },
          })).map(e => e.id);

          if (orgEmployeeIds.length === 0) return { period: `${targetYear}-${String(targetMonth).padStart(2, '0')}`, totalRecords: 0, records: [] };

          const where: any = { month: targetMonth, year: targetYear, employeeId: { in: orgEmployeeIds } };
          if (status) where.status = status;

          const records = await prisma.payrollRecord.findMany({
            where,
            take: limit ?? 50,
            orderBy: { createdAt: 'desc' },
          });

          const totalGross = records.reduce((s, r) => s + Number(r.grossSalary), 0);
          const totalNet = records.reduce((s, r) => s + Number(r.netSalary), 0);
          const totalDeductions = records.reduce((s, r) => s + Number(r.deductions), 0);

          return {
            period: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
            totalRecords: records.length,
            totalGrossSalary: totalGross,
            totalNetSalary: totalNet,
            totalDeductions,
            statusBreakdown: {
              pending: records.filter(r => r.status === 'pending').length,
              processed: records.filter(r => r.status === 'processed').length,
              paid: records.filter(r => r.status === 'paid').length,
            },
            records: records.map(r => ({
              employeeId: r.employeeId,
              presentDays: r.presentDays,
              leaveDays: Number(r.leaveDays),
              baseSalary: Number(r.baseSalary),
              grossSalary: Number(r.grossSalary),
              deductions: Number(r.deductions),
              netSalary: Number(r.netSalary),
              overtimeHours: Number(r.overtimeHours),
              status: r.status,
              processedAt: r.processedAt?.toISOString(),
              paidAt: r.paidAt?.toISOString(),
            })),
          };
        },
      }),

      // ─── Employee Directory ──────────────────────────────────────

      getEmployeeDirectory: tool({
        description: 'Get employee directory with details like department, designation, contact, salary info, joining date. Admin/manager only. Use when user asks about employees, staff, team members, HR data, or employee details.',
        inputSchema: z.object({
          department: z.string().nullable().describe('Filter by department name'),
          status: z.string().nullable().describe('Filter by status: ACTIVE, INACTIVE, ON_LEAVE'),
          limit: z.number().nullable().describe('Max records (default 50)'),
        }),
        execute: async ({ department, status, limit }) => {
          if (ctx.accessRole === 'user') return { error: 'Access denied. Only managers and admins can view the employee directory.' };
          const where: any = { user: { organizationId: ctx.organizationId } };
          if (department) where.department = department;
          if (status) where.status = status;

          const employees = await prisma.employee.findMany({
            where,
            include: { user: { select: { email: true, first_name: true, last_name: true, status: true } } },
            take: limit ?? 50,
            orderBy: { employeeName: 'asc' },
          });

          return {
            total: employees.length,
            employees: employees.map(e => ({
              id: e.id,
              name: e.employeeName,
              email: e.user?.email,
              department: e.department,
              designation: e.designation,
              gender: e.gender,
              status: e.status,
              dateOfJoining: e.dateOfJoining?.toISOString().split('T')[0],
              dateOfLeaving: e.dateOfLeaving?.toISOString().split('T')[0],
              companyName: e.companyName,
              shiftType: e.shiftType,
              inTime: e.inTime,
              outTime: e.outTime,
              totalSalary: e.totalSalary ? Number(e.totalSalary) : null,
              givenSalary: e.givenSalary ? Number(e.givenSalary) : null,
              personalContact: e.personalContact,
              country: e.country,
            })),
          };
        },
      }),

      // ─── Login History ───────────────────────────────────────────

      getLoginHistory: tool({
        description: 'Get login history showing who logged in, when, from where, and success/failure. Use for security audits, tracking suspicious activity, or checking user login patterns.',
        inputSchema: z.object({
          userId: z.string().nullable().describe('Specific user ID. Null for org-wide (admin only).'),
          status: z.string().nullable().describe('Filter: "Success" or "Failed"'),
          limit: z.number().nullable().describe('Max records (default 30)'),
        }),
        execute: async ({ userId: targetUserId, status, limit }) => {
          if (ctx.accessRole === 'user' && targetUserId && targetUserId !== ctx.userId) {
            return { error: 'Access denied. You can only view your own login history.' };
          }

          const orgUserIds = (await prisma.user.findMany({
            where: { organizationId: ctx.organizationId },
            select: { id: true },
          })).map(u => u.id);

          const where: any = {};
          if (ctx.accessRole === 'user') {
            where.userId = ctx.userId;
          } else if (targetUserId) {
            where.userId = targetUserId;
          } else {
            where.userId = { in: orgUserIds };
          }
          if (status) where.status = status;

          const history = await prisma.loginHistory.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit ?? 30,
            include: { user: { select: { first_name: true, last_name: true, email: true } } },
          });

          const failedCount = history.filter(h => h.status === 'Failed').length;

          return {
            total: history.length,
            failedAttempts: failedCount,
            successfulLogins: history.length - failedCount,
            records: history.map(h => ({
              email: h.email,
              name: h.user ? [h.user.first_name, h.user.last_name].filter(Boolean).join(' ') : h.email,
              status: h.status,
              reason: h.reason,
              ipAddress: h.ipAddress,
              timestamp: h.createdAt.toISOString(),
            })),
          };
        },
      }),

      // ─── Form Details ───────────────────────────────────────────

      getFormDetails: tool({
        description: 'Get detailed information about a specific form including all sections, fields, field types, subforms, and publishing status. Use when user asks about a specific form structure, what fields it has, or form configuration.',
        inputSchema: z.object({
          formId: z.string().describe('The form ID to get details for'),
        }),
        execute: async ({ formId }) => {
          if (!ctx.allowedFormIds.includes(formId)) return { error: 'Access denied or form not found.' };

          const form = await prisma.form.findUnique({
            where: { id: formId },
            include: {
              module: { select: { name: true } },
              sections: {
                include: { fields: { orderBy: { order: 'asc' } } },
                orderBy: { order: 'asc' },
              },
              subforms: {
                include: {
                  fields: { orderBy: { order: 'asc' } },
                  childSubforms: { include: { fields: { orderBy: { order: 'asc' } } } },
                },
                orderBy: { order: 'asc' },
              },
            },
          });

          if (!form) return { error: 'Form not found.' };

          return {
            id: form.id,
            name: form.name,
            description: form.description,
            moduleName: form.module.name,
            isPublished: form.isPublished,
            publishedAt: form.publishedAt?.toISOString(),
            isEmployeeForm: form.isEmployeeForm,
            isUserForm: form.isUserForm,
            allowAnonymous: form.allowAnonymous,
            requireLogin: form.requireLogin,
            sections: form.sections.map(s => ({
              id: s.id,
              title: s.title,
              description: s.description,
              columns: s.columns,
              fields: s.fields.map(f => ({
                id: f.id,
                label: f.label,
                type: f.type,
                description: f.description,
              })),
            })),
            subforms: form.subforms?.map(sf => ({
              id: sf.id,
              name: sf.name,
              fieldCount: sf.fields.length,
              childSubformCount: sf.childSubforms?.length || 0,
              fields: sf.fields.map(f => ({ id: f.id, label: f.label, type: f.type })),
            })),
          };
        },
      }),

      // ─── User Details ───────────────────────────────────────────

      getUserDetails: tool({
        description: 'Get detailed information about a specific user including profile, roles, unit assignments, permissions, and employee record. Use when user asks about a specific person, their role, their permissions, or user profile details.',
        inputSchema: z.object({
          userId: z.string().nullable().describe('User ID to look up. Null for current user.'),
        }),
        execute: async ({ userId: targetUserId }) => {
          const uid = targetUserId ?? ctx.userId;
          if (ctx.accessRole === 'user' && uid !== ctx.userId) {
            return { error: 'Access denied. You can only view your own details.' };
          }

          const user = await prisma.user.findUnique({
            where: { id: uid },
            select: {
              id: true, email: true, first_name: true, last_name: true, phone: true,
              status: true, department: true, location: true, avatar: true,
              createdAt: true,
              unitAssignments: {
                include: {
                  role: { select: { name: true, level: true, isAdmin: true } },
                  unit: { select: { name: true } },
                },
              },
              employee: {
                select: {
                  employeeName: true, designation: true, department: true,
                  dateOfJoining: true, shiftType: true, status: true,
                  totalSalary: true, givenSalary: true, companyName: true,
                },
              },
            },
          });

          if (!user) return { error: 'User not found.' };

          return {
            id: user.id,
            name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
            email: user.email,
            phone: user.phone,
            status: user.status,
            department: user.department,
            location: user.location,
            memberSince: user.createdAt.toISOString().split('T')[0],
            roles: user.unitAssignments.map(a => ({
              role: a.role.name,
              unit: a.unit.name,
              level: a.role.level,
              isAdmin: a.role.isAdmin,
            })),
            employeeRecord: user.employee ? {
              name: user.employee.employeeName,
              designation: user.employee.designation,
              department: user.employee.department,
              dateOfJoining: user.employee.dateOfJoining?.toISOString().split('T')[0],
              shiftType: user.employee.shiftType,
              status: user.employee.status,
              totalSalary: user.employee.totalSalary ? Number(user.employee.totalSalary) : null,
              company: user.employee.companyName,
            } : null,
          };
        },
      }),

      // ─── Org Units & Roles Hierarchy ─────────────────────────────

      getOrgUnitsAndRoles: tool({
        description: 'Get the full organizational unit hierarchy and role definitions with user counts per unit. Use when user asks about departments, teams, org chart, organizational structure, or role hierarchy.',
        inputSchema: z.object({}),
        execute: async () => {
          const [units, roles] = await Promise.all([
            prisma.organizationUnit.findMany({
              where: { organizationId: ctx.organizationId, isActive: true },
              include: {
                parent: { select: { name: true } },
                userAssignments: { select: { userId: true }, distinct: ['userId'] },
              },
              orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
            }),
            prisma.role.findMany({
              where: { organizationId: ctx.organizationId, isActive: true },
              include: {
                userAssignments: { select: { userId: true }, distinct: ['userId'] },
              },
              orderBy: { level: 'asc' },
            }),
          ]);

          return {
            units: units.map(u => ({
              id: u.id,
              name: u.name,
              description: u.description,
              parentUnit: u.parent?.name || null,
              level: u.level,
              memberCount: u.userAssignments.length,
            })),
            roles: roles.map(r => ({
              id: r.id,
              name: r.name,
              description: r.description,
              level: r.level,
              isAdmin: r.isAdmin,
              userCount: r.userAssignments.length,
            })),
          };
        },
      }),

      // ─── Roles & Permissions ─────────────────────────────────────

      getRolesAndPermissions: tool({
        description: 'Get role-based permission matrix showing what each role can access (modules, forms, CRUD operations). Admin only. Use when user asks about permissions, access control, who can do what, or permission matrix.',
        inputSchema: z.object({
          roleId: z.string().nullable().describe('Specific role ID. Null for all roles.'),
        }),
        execute: async ({ roleId }) => {
          if (ctx.accessRole === 'user') return { error: 'Access denied. Only admins can view permission details.' };

          const where: any = { organizationId: ctx.organizationId };
          if (roleId) where.id = roleId;

          const roles = await prisma.role.findMany({
            where: { ...where, isActive: true },
            include: {
              rolePermissions: {
                include: {
                  permission: { select: { name: true, category: true, resource: true } },
                  module: { select: { name: true } },
                  form: { select: { name: true } },
                },
              },
            },
            orderBy: { level: 'asc' },
          });

          return roles.map(r => ({
            roleId: r.id,
            roleName: r.name,
            level: r.level,
            isAdmin: r.isAdmin,
            permissions: r.rolePermissions.map((p: any) => ({
              permissionName: p.permission?.name,
              category: p.permission?.category,
              moduleName: p.module?.name,
              formName: p.form?.name,
              granted: p.granted,
              canDelegate: p.canDelegate,
            })),
          }));
        },
      }),

      // ─── Search Records ──────────────────────────────────────────

      searchRecordsAcrossForms: tool({
        description: 'Search records across all forms by keyword in record data. Use when user wants to find specific data entries, search for a name, value, or keyword across all form submissions.',
        inputSchema: z.object({
          keyword: z.string().describe('Search keyword to find in record data'),
          limit: z.number().nullable().describe('Max records (default 20)'),
        }),
        execute: async ({ keyword, limit }) => {
          const maxResults = limit ?? 20;
          const results: any[] = [];
          const tables = ['form_records', 'form_records_1', 'form_records_2', 'form_records_3', 'form_records_4', 'form_records_5', 'form_records_6', 'form_records_7', 'form_records_8', 'form_records_9', 'form_records_10', 'form_records_11', 'form_records_12', 'form_records_13', 'form_records_14', 'form_records_15'];

          const accessFilter = ctx.accessRole === 'user' ? `AND fr.user_id = '${ctx.userId}'` : '';

          for (const tableName of tables) {
            if (results.length >= maxResults) break;
            try {
              const rows: any[] = await prisma.$queryRawUnsafe(`
                SELECT fr.id, fr.form_id as "formId", fr.record_data as "recordData",
                       fr.status, fr.submitted_at as "submittedAt",
                       f.name as "formName", fm.name as "moduleName"
                FROM "${tableName}" fr
                JOIN forms f ON f.id = fr.form_id
                JOIN form_modules fm ON fm.id = f.module_id
                WHERE fm.organization_id = '${ctx.organizationId}'
                  AND fr.record_data::text ILIKE '%${keyword.replace(/'/g, "''")}%'
                  ${accessFilter}
                ORDER BY fr.submitted_at DESC
                LIMIT ${maxResults - results.length}
              `);
              results.push(...rows.map(r => ({
                id: r.id,
                formId: r.formId,
                formName: r.formName,
                moduleName: r.moduleName,
                data: typeof r.recordData === 'string' ? JSON.parse(r.recordData) : r.recordData,
                status: r.status,
                submittedAt: new Date(r.submittedAt).toISOString(),
              })));
            } catch {}
          }

          return { keyword, total: results.length, results: results.slice(0, maxResults) };
        },
      }),

      // ─── Recent Submissions ──────────────────────────────────────

      getRecentSubmissions: tool({
        description: 'Get the most recent form submissions across all forms. Use when user asks about latest activity, recent submissions, what was submitted recently, or newest records.',
        inputSchema: z.object({
          limit: z.number().nullable().describe('Max records (default 20)'),
        }),
        execute: async ({ limit }) => {
          const maxResults = limit ?? 20;
          const results: any[] = [];
          const tables = ['form_records', 'form_records_1', 'form_records_2', 'form_records_3', 'form_records_4', 'form_records_5', 'form_records_6', 'form_records_7', 'form_records_8', 'form_records_9', 'form_records_10', 'form_records_11', 'form_records_12', 'form_records_13', 'form_records_14', 'form_records_15'];

          const accessFilter = ctx.accessRole === 'user' ? `AND fr.user_id = '${ctx.userId}'` : '';

          for (const tableName of tables) {
            try {
              const rows: any[] = await prisma.$queryRawUnsafe(`
                SELECT fr.id, fr.form_id as "formId", fr.record_data as "recordData",
                       fr.status, fr.submitted_at as "submittedAt", fr.submitted_by as "submittedBy",
                       f.name as "formName", fm.name as "moduleName"
                FROM "${tableName}" fr
                JOIN forms f ON f.id = fr.form_id
                JOIN form_modules fm ON fm.id = f.module_id
                WHERE fm.organization_id = '${ctx.organizationId}'
                  ${accessFilter}
                ORDER BY fr.submitted_at DESC
                LIMIT ${maxResults}
              `);
              results.push(...rows.map(r => ({
                id: r.id,
                formId: r.formId,
                formName: r.formName,
                moduleName: r.moduleName,
                data: typeof r.recordData === 'string' ? JSON.parse(r.recordData) : r.recordData,
                status: r.status,
                submittedAt: new Date(r.submittedAt).toISOString(),
                submittedBy: r.submittedBy,
              })));
            } catch {}
          }

          // Sort all results by submittedAt descending and take top N
          results.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
          return { total: results.length, records: results.slice(0, maxResults) };
        },
      }),
    };

    const result = streamText({
      model,
      system: buildSystemPrompt(ctx, orgName),
      messages: await convertToModelMessages(messages),
      tools: erpTools,
      stopWhen: stepCountIs(10),
      temperature: aiConfig?.temperature ?? 0.3,
      maxOutputTokens: aiConfig?.maxTokens ?? 4096,
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      onFinish: async ({ messages: allMessages, isAborted }) => {
        if (isAborted || !conversationId) return;

        try {
          const lastMsg = allMessages[allMessages.length - 1];
          if (lastMsg) {
            const textContent = lastMsg.parts
              ?.filter((p: any) => p.type === 'text')
              .map((p: any) => p.text)
              .join('') || '';

            await prisma.chatMessage.create({
              data: {
                conversationId,
                sender: lastMsg.role === 'user' ? 'user' : 'ai',
                content: textContent,
                // 🔥 SAVES FULL AI RESPONSE (text + tool cards)
                metadata: {
                  parts: lastMsg.parts || [{ type: 'text', text: textContent }],
                },
              },
            });

            await prisma.chatConversation.update({
              where: { id: conversationId },
              data: {},
            });
          }
        } catch (e) {
          console.error("onFinish save error:", e);
        }
      },
    });
  } catch (error: any) {
    console.error('[v0] ERP Chat route error:', error);
    const msg = error?.message || '';

    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('Rate limit') || msg.includes('quota') || msg.includes('Too Many Requests')) {
      return Response.json({ error: 'API rate limit reached. Please wait a moment and try again.' }, { status: 429 });
    }
    if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_api_key') || msg.includes('Incorrect API key')) {
      return Response.json({ error: 'AI provider API key is invalid or expired. Please update it in Settings.' }, { status: 401 });
    }
    if (msg.includes('404') || msg.includes('not found') || msg.includes('Unsupported model')) {
      return Response.json({ error: 'The configured AI model is not available. Please check your model selection in Settings.' }, { status: 400 });
    }
    if (msg.includes('insufficient') || msg.includes('billing') || msg.includes('payment')) {
      return Response.json({ error: 'AI provider billing issue. Please check your account balance.' }, { status: 402 });
    }

    return Response.json({ error: msg.length > 300 ? msg.slice(0, 300) + '...' : (msg || 'Internal server error in chatbot.') }, { status: 500 });
  }
}