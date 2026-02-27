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
import { validateSession } from '@/lib/auth2';
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
  // First try active config
  let config = await prisma.aIConfiguration.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { updatedAt: 'desc' },
  });

  // If no active config, fall back to any config for this org (even inactive)
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
    case 'openai': {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai(config.model);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(config.model);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
      return google(config.model);
    }
    case 'xai': {
      const xai = createXai({ apiKey: config.apiKey });
      return xai(config.model);
    }
    case 'groq': {
      const groq = createGroq({ apiKey: config.apiKey });
      return groq(config.model);
    }
    case 'deepinfra': {
      const deepinfra = createOpenAI({
        apiKey: config.apiKey,
        baseURL: 'https://api.deepinfra.com/v1/openai',
      });
      return deepinfra(config.model);
    }
    default: {
      // For any other provider, try OpenAI-compatible format
      const fallback = createOpenAI({ apiKey: config.apiKey });
      return fallback(config.model);
    }
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
  // Read auth-token from request cookies (Route Handler pattern)
  const token = req.cookies.get('auth-token')?.value;

  if (!token) {
    return Response.json(
      { error: 'Not authenticated. Please log in first.' },
      { status: 401 }
    );
  }

  const session = await validateSession(token);

  if (!session) {
    return Response.json(
      { error: 'Invalid or expired session. Please log in again.' },
      { status: 401 }
    );
  }

  if (!session.user.organizationId) {
    return Response.json(
      { error: 'No organization assigned to your account. Please contact your admin.' },
      { status: 401 }
    );
  }

  const { messages, conversationId }: { messages: UIMessage[]; conversationId?: string } = await req.json();

  const userId = session.user.id;
  const organizationId = session.user.organizationId;
  const orgName = session.user.organization?.name || 'Organization';

  // Resolve permissions context
  const ctx = await resolveERPContext(userId, organizationId);

  // Get AI config for this org
  const aiConfig = await getAIConfig(organizationId);

  if (!aiConfig) {
    return Response.json(
      {
        error: 'No AI provider configured. Please go to Settings and configure an AI provider with your API key before using the chatbot.',
      },
      { status: 422 }
    );
  }

  // Create the model instance using the org's own API key
  const model = createModelFromConfig({
    provider: aiConfig.provider,
    model: aiConfig.model,
    apiKey: aiConfig.apiKey,
  });

  // Define ERP tools
  const erpTools = {
    getKPISummary: tool({
      description: 'Get organization KPI summary including total users, active users, total records, pending records, modules, forms, and audit activity. Use this when user asks about overview, dashboard, or general stats.',
      inputSchema: z.object({}),
      execute: async () => {
        const kpis = await getOrgKPISummary(ctx);
        return kpis;
      },
    }),

    discoverStructure: tool({
      description: 'Discover the organization structure: modules, forms, fields, roles, units, and employee count. Use when user asks about what modules exist, what forms are available, or organizational hierarchy.',
      inputSchema: z.object({}),
      execute: async () => {
        const structure = await discoverOrgStructure(ctx);
        return {
          modules: structure.modules.map(m => ({
            name: m.name,
            formCount: m.forms.length,
            forms: m.forms.map(f => ({
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

    queryFormRecords: tool({
      description: 'Query records from a specific form. Use when user asks about form submissions, records, data entries, or wants to see specific form data. You MUST provide the formId.',
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
      execute: async () => {
        const analytics = await getModuleAnalytics(ctx);
        return analytics;
      },
    }),

    getSubmissionTimeline: tool({
      description: 'Get a time series of record submissions across all forms. Use for trend analysis, charts, or when user asks about submission patterns over time.',
      inputSchema: z.object({
        dateFrom: z.string().describe('Start date in ISO format'),
        dateTo: z.string().describe('End date in ISO format'),
      }),
      execute: async ({ dateFrom, dateTo }) => {
        const timeline = await getSubmissionTimeline(ctx, new Date(dateFrom), new Date(dateTo));
        return timeline;
      },
    }),

    getUserActivity: tool({
      description: 'Get activity summary for a specific user including login history and audit logs. Respects role-based access.',
      inputSchema: z.object({
        userId: z.string().nullable().describe('User ID to look up. Leave null for current user.'),
      }),
      execute: async ({ userId: targetUserId }) => {
        const result = await getUserActivitySummary(ctx, targetUserId ?? undefined);
        return result;
      },
    }),

    getStatusBreakdown: tool({
      description: 'Get a breakdown of record statuses across all forms in the organization. Use when user asks about pending approvals, submission status distribution, or workflow bottlenecks.',
      inputSchema: z.object({}),
      execute: async () => {
        const allRecords = await aggregateOrgRecords(ctx);
        const statusMap = new Map<string, number>();

        for (const tableName of ['form_records_1', 'form_records_2', 'form_records_3', 'form_records_4', 'form_records_5', 'form_records_6', 'form_records_7', 'form_records_8', 'form_records_9', 'form_records_10', 'form_records_11', 'form_records_12', 'form_records_13', 'form_records_14', 'form_records_15'] as const) {
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
          } catch {
            // Skip
          }
        }

        return Object.fromEntries(statusMap);
      },
    }),

    listOrgUsers: tool({
      description: 'List users in the organization with their roles and status. Admin/super_admin only.',
      inputSchema: z.object({
        limit: z.number().nullable().describe('Max users to return (default 20)'),
      }),
      execute: async ({ limit }) => {
        if (ctx.accessRole === 'user') {
          return { error: 'Access denied. Only managers and admins can list organization users.' };
        }

        const users = await prisma.user.findMany({
          where: { organizationId: ctx.organizationId },
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            status: true,
            department: true,
            unitAssignments: {
              include: { role: { select: { name: true } } },
            },
          },
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
        if (ctx.accessRole === 'user') {
          return { error: 'Access denied. Only managers and admins can view audit logs.' };
        }

        const where: any = { organizationId: ctx.organizationId };
        if (action) where.action = action;
        if (module) where.module = module;

        const logs = await prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit ?? 20,
          select: {
            performedBy: true,
            action: true,
            module: true,
            recordName: true,
            details: true,
            createdAt: true,
          },
        });

        return logs;
      },
    }),
  };

  // Stream the response
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
      if (isAborted) return;

      // Persist conversation
      try {
        if (conversationId) {
          // Save latest messages
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
                metadata: {},
              },
            });
          }
        }
      } catch {
        // Non-critical -- don't fail the response
      }
    },
  });
  } catch (error: any) {
    console.error('[v0] ERP Chat route error:', error);
    const msg = error?.message || '';

    // Rate limit
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('Rate limit') || msg.includes('quota') || msg.includes('Too Many Requests')) {
      return Response.json(
        { error: 'API rate limit reached. Please wait a moment and try again. If this persists, consider upgrading your API plan or switching to a different model in Settings.' },
        { status: 429 }
      );
    }

    // Auth / invalid key
    if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_api_key') || msg.includes('Incorrect API key') || msg.includes('authentication')) {
      return Response.json(
        { error: 'AI provider API key is invalid or expired. Please update it in Settings.' },
        { status: 401 }
      );
    }

    // Model not found
    if (msg.includes('404') || msg.includes('not found') || msg.includes('does not exist') || msg.includes('Unsupported model')) {
      return Response.json(
        { error: 'The configured AI model is not available. Please check your model selection in Settings.' },
        { status: 400 }
      );
    }

    // Insufficient funds
    if (msg.includes('insufficient') || msg.includes('billing') || msg.includes('payment')) {
      return Response.json(
        { error: 'AI provider billing issue. Please check your account balance and billing status with your AI provider.' },
        { status: 402 }
      );
    }

    return Response.json(
      { error: msg.length > 300 ? msg.slice(0, 300) + '...' : (msg || 'Internal server error in chatbot.') },
      { status: 500 }
    );
  }
}
