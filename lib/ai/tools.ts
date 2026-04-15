/**
 * Tools available to the chatbot LLM.
 *
 * Each tool has:
 *   - definition: OpenAI-compatible function spec sent to the LLM
 *   - handler:    permission-checked execution against Prisma
 *
 * All tool calls are:
 *   - Scoped to the current user's organization (enforced in handlers)
 *   - Subject to per-tool role gates (e.g. audit log is admin-only)
 *   - Result-capped (max rows, max field sizes) so they don't blow the
 *     model context window
 *
 * Everything the tool returns is JSON-serialisable; the executor caps total
 * payload size before sending results back to the LLM.
 */

import { prisma } from "@/lib/prisma";
import { isUserAdmin } from "@/lib/api-helpers";
import type { UserContext } from "./context-builder";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

interface ToolHandler {
  (args: Record<string, unknown>, ctx: UserContext): Promise<Json>;
}

// Tightened limits — less data flowing back to the LLM means faster TTFT on
// the next round. Tables with 3–6 columns stay perfectly readable at these
// sizes; long values get ellipsized.
const MAX_ROWS = 20;
const MAX_TEXT_LEN = 240;
const MAX_RESULT_BYTES = 5_000;

function clip(v: unknown): Json {
  if (v == null) return null;
  if (typeof v === "string") {
    return v.length > MAX_TEXT_LEN ? v.slice(0, MAX_TEXT_LEN) + "…" : v;
  }
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.slice(0, MAX_ROWS).map(clip);
  if (typeof v === "object") {
    const out: Record<string, Json> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = clip(val);
    }
    return out;
  }
  return String(v);
}

function truncateResult(result: Json): Json {
  const str = JSON.stringify(result);
  if (str.length <= MAX_RESULT_BYTES) return result;
  return {
    truncated: true,
    note: `Result exceeded ${MAX_RESULT_BYTES} bytes. Showing partial preview.`,
    preview: str.slice(0, MAX_RESULT_BYTES - 200) + "…",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Tool: get_current_user
// ─────────────────────────────────────────────────────────────────────────
const getCurrentUser: {
  definition: ToolDefinition;
  handler: ToolHandler;
} = {
  definition: {
    type: "function",
    function: {
      name: "get_current_user",
      description:
        "Get the full profile of the currently logged-in user, including roles and unit assignments.",
      parameters: { type: "object", properties: {} },
    },
  },
  async handler(_args, ctx) {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        username: true,
        first_name: true,
        last_name: true,
        status: true,
        createdAt: true,
        unitAssignments: {
          where: { role: { isActive: true }, unit: { isActive: true } },
          select: {
            role: { select: { name: true, isAdmin: true } },
            unit: { select: { name: true } },
          },
        },
      },
    });
    if (!user) return { error: "User not found" };
    return clip({
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      status: user.status,
      createdAt: user.createdAt,
      isAdmin: ctx.isAdmin,
      roles: user.unitAssignments.map((a) => ({
        role: a.role.name,
        unit: a.unit.name,
        isAdmin: a.role.isAdmin,
      })),
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Tool: list_modules
// ─────────────────────────────────────────────────────────────────────────
const listModules: {
  definition: ToolDefinition;
  handler: ToolHandler;
} = {
  definition: {
    type: "function",
    function: {
      name: "list_modules",
      description:
        "List all form modules in the current organization. Returns module id, name, description, path, module type, and parent. Use this to discover what data categories exist before searching records.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Optional case-insensitive name filter",
          },
          limit: { type: "number", default: 25 },
        },
      },
    },
  },
  async handler(args, ctx) {
    const search = typeof args.search === "string" ? args.search : undefined;
    const limit = Math.min(Number(args.limit) || 25, MAX_ROWS);
    const rows = await prisma.formModule.findMany({
      where: {
        organizationId: ctx.organizationId,
        isActive: true,
        ...(search
          ? { name: { contains: search, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        path: true,
        moduleType: true,
        parentId: true,
        level: true,
      },
      take: limit,
    });
    return clip({ count: rows.length, modules: rows });
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Tool: list_forms_in_module
// ─────────────────────────────────────────────────────────────────────────
const listFormsInModule: {
  definition: ToolDefinition;
  handler: ToolHandler;
} = {
  definition: {
    type: "function",
    function: {
      name: "list_forms_in_module",
      description:
        "List all forms inside a specific module. A form is a record template (e.g. an 'Employees' form inside an HR module). Returns form id, name, and description.",
      parameters: {
        type: "object",
        properties: {
          moduleId: {
            type: "string",
            description: "The id returned by list_modules",
          },
        },
        required: ["moduleId"],
      },
    },
  },
  async handler(args, ctx) {
    const moduleId = String(args.moduleId ?? "");
    if (!moduleId) return { error: "moduleId is required" };

    // Verify module belongs to this org
    const mod = await prisma.formModule.findFirst({
      where: { id: moduleId, organizationId: ctx.organizationId },
      select: { id: true, name: true },
    });
    if (!mod) return { error: "Module not found in your organization" };

    const forms = await prisma.form.findMany({
      where: { moduleId },
      select: {
        id: true,
        name: true,
        description: true,
      },
      take: MAX_ROWS,
    });
    return clip({ module: mod.name, count: forms.length, forms });
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Tool: search_records
// ─────────────────────────────────────────────────────────────────────────
const searchRecords: {
  definition: ToolDefinition;
  handler: ToolHandler;
} = {
  definition: {
    type: "function",
    function: {
      name: "search_records",
      description:
        "Search form records. Provide either moduleId (searches all forms in the module) or formId (searches one form). Returns matching records with their submitted data.",
      parameters: {
        type: "object",
        properties: {
          moduleId: { type: "string" },
          formId: { type: "string" },
          query: {
            type: "string",
            description: "Optional free-text substring to match inside record_data JSON",
          },
          status: {
            type: "string",
            description: "Filter by status (e.g. 'submitted', 'draft', 'approved')",
          },
          limit: { type: "number", default: 10 },
        },
      },
    },
  },
  async handler(args, ctx) {
    const moduleId = typeof args.moduleId === "string" ? args.moduleId : undefined;
    const formId = typeof args.formId === "string" ? args.formId : undefined;
    const query = typeof args.query === "string" ? args.query : undefined;
    const status = typeof args.status === "string" ? args.status : undefined;
    const limit = Math.min(Number(args.limit) || 10, MAX_ROWS);

    if (!moduleId && !formId) {
      return { error: "Provide either moduleId or formId" };
    }

    // Resolve target form IDs, enforcing org scope
    let formIds: string[];
    if (formId) {
      const f = await prisma.form.findFirst({
        where: {
          id: formId,
          module: { organizationId: ctx.organizationId },
        },
        select: { id: true },
      });
      if (!f) return { error: "Form not found in your organization" };
      formIds = [f.id];
    } else {
      const mod = await prisma.formModule.findFirst({
        where: { id: moduleId!, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!mod) return { error: "Module not found in your organization" };
      const forms = await prisma.form.findMany({
        where: { moduleId: mod.id },
        select: { id: true },
      });
      formIds = forms.map((f) => f.id);
    }
    if (formIds.length === 0) return { count: 0, records: [] };

    const records = await prisma.formRecord.findMany({
      where: {
        formId: { in: formIds },
        organizationId: ctx.organizationId,
        ...(status ? { status } : {}),
      },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        formId: true,
        recordData: true,
        status: true,
        submittedAt: true,
        submittedBy: true,
      },
      take: limit * 3, // over-fetch then filter by query
    });

    const filtered = query
      ? records.filter((r) => {
          const hay = JSON.stringify(r.recordData ?? "").toLowerCase();
          return hay.includes(query.toLowerCase());
        })
      : records;

    return clip({
      count: filtered.length,
      records: filtered.slice(0, limit),
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Tool: count_records
// ─────────────────────────────────────────────────────────────────────────
const countRecords: {
  definition: ToolDefinition;
  handler: ToolHandler;
} = {
  definition: {
    type: "function",
    function: {
      name: "count_records",
      description:
        "Count form records in a module or form, optionally filtered by status. Much cheaper than search_records when the user only asks 'how many'.",
      parameters: {
        type: "object",
        properties: {
          moduleId: { type: "string" },
          formId: { type: "string" },
          status: { type: "string" },
        },
      },
    },
  },
  async handler(args, ctx) {
    const moduleId = typeof args.moduleId === "string" ? args.moduleId : undefined;
    const formId = typeof args.formId === "string" ? args.formId : undefined;
    const status = typeof args.status === "string" ? args.status : undefined;

    let formIds: string[];
    if (formId) {
      const f = await prisma.form.findFirst({
        where: { id: formId, module: { organizationId: ctx.organizationId } },
        select: { id: true },
      });
      if (!f) return { error: "Form not found in your organization" };
      formIds = [f.id];
    } else if (moduleId) {
      const forms = await prisma.form.findMany({
        where: { module: { id: moduleId, organizationId: ctx.organizationId } },
        select: { id: true },
      });
      formIds = forms.map((f) => f.id);
    } else {
      return { error: "Provide either moduleId or formId" };
    }
    if (formIds.length === 0) return { count: 0 };

    const count = await prisma.formRecord.count({
      where: {
        formId: { in: formIds },
        organizationId: ctx.organizationId,
        ...(status ? { status } : {}),
      },
    });
    return { count };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Tool: list_org_users (admin only)
// ─────────────────────────────────────────────────────────────────────────
const listOrgUsers: {
  definition: ToolDefinition;
  handler: ToolHandler;
} = {
  definition: {
    type: "function",
    function: {
      name: "list_org_users",
      description:
        "List users in the current organization. Admin access required. Returns email, name, status, and assigned roles.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Optional case-insensitive email or name filter",
          },
          limit: { type: "number", default: 25 },
        },
      },
    },
  },
  async handler(args, ctx) {
    if (!ctx.isAdmin) {
      return { error: "Admin access required for list_org_users" };
    }
    const search = typeof args.search === "string" ? args.search : undefined;
    const limit = Math.min(Number(args.limit) || 25, MAX_ROWS);

    const users = await prisma.user.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" as const } },
                { first_name: { contains: search, mode: "insensitive" as const } },
                { last_name: { contains: search, mode: "insensitive" as const } },
                { username: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        username: true,
        first_name: true,
        last_name: true,
        status: true,
        createdAt: true,
        unitAssignments: {
          where: { role: { isActive: true } },
          select: { role: { select: { name: true } } },
        },
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return clip({
      count: users.length,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name:
          [u.first_name, u.last_name].filter(Boolean).join(" ") ||
          u.username ||
          u.email,
        status: u.status,
        createdAt: u.createdAt,
        roles: u.unitAssignments.map((a) => a.role.name),
      })),
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Tool: get_recent_audit_log (admin only)
// ─────────────────────────────────────────────────────────────────────────
const getRecentAuditLog: {
  definition: ToolDefinition;
  handler: ToolHandler;
} = {
  definition: {
    type: "function",
    function: {
      name: "get_recent_audit_log",
      description:
        "Get recent audit log entries for the current organization. Admin only. Useful for 'who did what when' questions.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Optional filter by action (e.g. 'CREATE', 'DELETE', 'LOGIN')",
          },
          module: { type: "string", description: "Optional filter by module name" },
          limit: { type: "number", default: 15 },
        },
      },
    },
  },
  async handler(args, ctx) {
    if (!ctx.isAdmin) {
      return { error: "Admin access required for get_recent_audit_log" };
    }
    const action = typeof args.action === "string" ? args.action : undefined;
    const mod = typeof args.module === "string" ? args.module : undefined;
    const limit = Math.min(Number(args.limit) || 15, MAX_ROWS);

    const rows = await prisma.auditLog.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
        ...(mod ? { module: { contains: mod, mode: "insensitive" as const } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        module: true,
        performedBy: true,
        recordName: true,
        details: true,
        ipAddress: true,
        createdAt: true,
      },
    });
    return clip({ count: rows.length, entries: rows });
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────
const ALL_TOOLS = {
  get_current_user: getCurrentUser,
  list_modules: listModules,
  list_forms_in_module: listFormsInModule,
  search_records: searchRecords,
  count_records: countRecords,
  list_org_users: listOrgUsers,
  get_recent_audit_log: getRecentAuditLog,
} as const;

export const TOOL_DEFINITIONS: ToolDefinition[] = Object.values(ALL_TOOLS).map(
  (t) => t.definition
);

export async function executeTool(
  name: string,
  argsJson: string,
  ctx: UserContext
): Promise<Json> {
  const tool = (ALL_TOOLS as Record<string, { handler: ToolHandler }>)[name];
  if (!tool) {
    return { error: `Unknown tool: ${name}` };
  }
  let args: Record<string, unknown>;
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    return { error: `Invalid JSON arguments for ${name}` };
  }
  try {
    const result = await tool.handler(args, ctx);
    return truncateResult(result);
  } catch (err) {
    console.error(`[tools] ${name} failed:`, err);
    return { error: (err as Error).message ?? "Tool execution failed" };
  }
}
