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
// Tool: list_conversations — user's own past chat conversations
// ─────────────────────────────────────────────────────────────────────────
const listConversations: {
  definition: ToolDefinition;
  handler: ToolHandler;
} = {
  definition: {
    type: "function",
    function: {
      name: "list_conversations",
      description:
        "List the current user's past chat conversations with this assistant. " +
        "Use this when the user asks about their conversation history, wants to " +
        "see previous chats, or references a past session (e.g. 'what did I ask " +
        "yesterday?', 'show my previous chats', 'list my chat history'). " +
        "Returns conversations ordered by most recent first. Does NOT return " +
        "message bodies — use read_conversation(id) for a specific thread.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Max conversations to return (default 20, cap 50).",
            minimum: 1,
            maximum: 50,
          },
          pinned_only: {
            type: "boolean",
            description:
              "If true, only return conversations the user has pinned/starred.",
          },
        },
      },
    },
  },
  handler: async (args, ctx) => {
    const limit = Math.min(Number(args.limit) || 20, 50);
    const pinnedOnly = args.pinned_only === true;
    const convs = await prisma.chatConversation.findMany({
      where: {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        ...(pinnedOnly ? { isPinned: true } : {}),
      },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      take: limit,
      select: {
        id: true,
        title: true,
        isPinned: true,
        providerId: true,
        model: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
    return clip({
      count: convs.length,
      conversations: convs.map((c) => ({
        id: c.id,
        title: c.title,
        isPinned: c.isPinned,
        model: c.model,
        messageCount: c._count.messages,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Tool: search_conversations — keyword search across titles + message content
// ─────────────────────────────────────────────────────────────────────────
const searchConversations: {
  definition: ToolDefinition;
  handler: ToolHandler;
} = {
  definition: {
    type: "function",
    function: {
      name: "search_conversations",
      description:
        "Search the user's past chat conversations by keyword. Matches both " +
        "the conversation title and the content of any message in it. Use this " +
        "when the user asks 'when did we discuss X?', 'find my chats about Y', " +
        "or 'what did I ask about Z before?'. Returns matching conversations " +
        "with a short snippet of where the keyword appeared.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Keyword to search for. Case-insensitive substring match.",
          },
          limit: {
            type: "integer",
            description: "Max matches to return (default 10, cap 25).",
            minimum: 1,
            maximum: 25,
          },
        },
        required: ["query"],
      },
    },
  },
  handler: async (args, ctx) => {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return { error: "query is required" };
    const limit = Math.min(Number(args.limit) || 10, 25);

    // Two-stage search: title match OR message match. We look up conversations
    // with a title hit OR containing a message whose content matches, then
    // return them with a snippet.
    const [titleHits, messageHits] = await Promise.all([
      prisma.chatConversation.findMany({
        where: {
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          title: { contains: query, mode: "insensitive" as const },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          isPinned: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
      }),
      prisma.chatMessage.findMany({
        where: {
          conversation: {
            userId: ctx.userId,
            organizationId: ctx.organizationId,
          },
          role: { in: ["user", "assistant"] },
          content: { contains: query, mode: "insensitive" as const },
        },
        orderBy: { createdAt: "desc" },
        take: limit * 3, // oversample to dedupe by conversation
        select: {
          conversationId: true,
          content: true,
          role: true,
          createdAt: true,
          conversation: {
            select: {
              id: true,
              title: true,
              isPinned: true,
              updatedAt: true,
              _count: { select: { messages: true } },
            },
          },
        },
      }),
    ]);

    // Merge results: deduplicate by conversation id, prefer message snippets
    // over title-only matches because they tell the user where the keyword
    // actually appeared.
    const byConv = new Map<
      string,
      {
        id: string;
        title: string;
        isPinned: boolean;
        updatedAt: Date;
        messageCount: number;
        matchKind: "title" | "message";
        snippet?: string;
      }
    >();
    const lcQuery = query.toLowerCase();
    const buildSnippet = (content: string) => {
      const lc = content.toLowerCase();
      const idx = lc.indexOf(lcQuery);
      if (idx === -1) return content.slice(0, 140);
      const start = Math.max(0, idx - 40);
      const end = Math.min(content.length, idx + query.length + 100);
      return (start > 0 ? "…" : "") + content.slice(start, end) +
        (end < content.length ? "…" : "");
    };

    for (const t of titleHits) {
      byConv.set(t.id, {
        id: t.id,
        title: t.title,
        isPinned: t.isPinned,
        updatedAt: t.updatedAt,
        messageCount: t._count.messages,
        matchKind: "title",
      });
    }
    for (const m of messageHits) {
      const c = m.conversation;
      if (!c || byConv.has(c.id)) {
        // Keep first (most recent) message snippet for the conversation
        const existing = byConv.get(c?.id ?? "");
        if (existing && !existing.snippet) {
          existing.matchKind = "message";
          existing.snippet = `${m.role === "user" ? "You: " : "Assistant: "}${buildSnippet(m.content)}`;
        }
        continue;
      }
      byConv.set(c.id, {
        id: c.id,
        title: c.title,
        isPinned: c.isPinned,
        updatedAt: c.updatedAt,
        messageCount: c._count.messages,
        matchKind: "message",
        snippet: `${m.role === "user" ? "You: " : "Assistant: "}${buildSnippet(m.content)}`,
      });
    }

    const merged = Array.from(byConv.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);

    return clip({
      query,
      count: merged.length,
      matches: merged,
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Tool: read_conversation — fetch a specific conversation's messages
// ─────────────────────────────────────────────────────────────────────────
const readConversation: {
  definition: ToolDefinition;
  handler: ToolHandler;
} = {
  definition: {
    type: "function",
    function: {
      name: "read_conversation",
      description:
        "Fetch the messages from a specific past conversation by id. Use after " +
        "list_conversations or search_conversations surface a conversation the " +
        "user wants to revisit. Returns messages ordered oldest-first, capped " +
        "at the `limit` most recent exchanges. Do NOT invent ids — only use " +
        "ids returned by list_conversations or search_conversations.",
      parameters: {
        type: "object",
        properties: {
          conversation_id: {
            type: "string",
            description: "The conversation id to read.",
          },
          limit: {
            type: "integer",
            description:
              "Max messages to return (default 15, cap 40). Returns the most-recent N and orders oldest-first.",
            minimum: 1,
            maximum: 40,
          },
        },
        required: ["conversation_id"],
      },
    },
  },
  handler: async (args, ctx) => {
    const conversationId =
      typeof args.conversation_id === "string" ? args.conversation_id : "";
    if (!conversationId) return { error: "conversation_id is required" };
    const limit = Math.min(Number(args.limit) || 15, 40);

    // Permission check: must belong to this user + org. findFirst with scoped
    // where returns null if the id doesn't exist OR isn't theirs, so we don't
    // leak existence.
    const conv = await prisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      },
      select: {
        id: true,
        title: true,
        isPinned: true,
        model: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!conv) {
      return { error: "Conversation not found or not accessible." };
    }

    // Fetch most-recent `limit` messages, then reverse to oldest-first for
    // readable chronology.
    const recent = await prisma.chatMessage.findMany({
      where: {
        conversationId,
        role: { in: ["user", "assistant"] },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        role: true,
        content: true,
        createdAt: true,
      },
    });
    const messages = recent.reverse();

    return clip({
      conversation: conv,
      messageCount: messages.length,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        at: m.createdAt,
      })),
    });
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
  list_conversations: listConversations,
  search_conversations: searchConversations,
  read_conversation: readConversation,
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
