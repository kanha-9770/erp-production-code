/**
 * Builds a compact context summary for the chatbot's system prompt.
 *
 * Injected into every chat request so the LLM knows who the user is, what
 * org they belong to, whether they're an admin, and how many modules they
 * can see. The LLM can call tools to drill deeper.
 *
 * Cached in-process with a 60s TTL keyed by userId+orgId — the big win here
 * is eliminating 4 DB round-trips on every follow-up message in a
 * conversation. Stale context is low-risk because every tool still runs its
 * own permission checks per-call.
 */

import { prisma } from "@/lib/prisma";
import { isUserAdmin } from "@/lib/api-helpers";

export interface UserContext {
  userId: string;
  email: string;
  organizationId: string;
  organizationName: string | null;
  displayName: string;
  isAdmin: boolean;
  roles: string[];
  moduleCount: number;
}

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes — user/org/role data rarely changes
const cache = new Map<string, { ctx: UserContext; expires: number }>();

export function invalidateUserContext(userId: string, organizationId?: string) {
  if (organizationId) {
    cache.delete(`${userId}:${organizationId}`);
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

export async function buildUserContext(
  userId: string,
  organizationId: string
): Promise<UserContext | null> {
  const cacheKey = `${userId}:${organizationId}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.ctx;
  }

  // All three queries run in parallel — the old version waited for user+admin
  // before starting the module count.
  const [user, isAdmin, moduleCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        username: true,
        organization: { select: { id: true, name: true } },
        unitAssignments: {
          where: {
            role: { isActive: true },
            unit: { isActive: true },
          },
          select: {
            role: { select: { name: true, isAdmin: true } },
          },
        },
      },
    }),
    isUserAdmin(userId, organizationId),
    prisma.formModule.count({ where: { organizationId } }),
  ]);

  if (!user) return null;

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    user.email;

  const roles = Array.from(
    new Set(user.unitAssignments.map((a) => a.role.name).filter(Boolean))
  );

  const ctx: UserContext = {
    userId: user.id,
    email: user.email,
    organizationId,
    organizationName: user.organization?.name ?? null,
    displayName,
    isAdmin,
    roles,
    moduleCount,
  };

  cache.set(cacheKey, { ctx, expires: now + CACHE_TTL_MS });
  return ctx;
}

export function renderContextForSystemPrompt(ctx: UserContext): string {
  const lines: string[] = [
    "## Current user context",
    `- Name: ${ctx.displayName}`,
    `- Email: ${ctx.email}`,
    `- Organization: ${ctx.organizationName ?? "(none)"}`,
    `- Role: ${ctx.isAdmin ? "Administrator" : "Standard user"}`,
  ];
  if (ctx.roles.length > 0) {
    lines.push(`- Assigned roles: ${ctx.roles.join(", ")}`);
  }
  lines.push(`- Accessible modules in this org: ${ctx.moduleCount}`);
  lines.push(`- Current date: ${new Date().toISOString().split("T")[0]}`);
  lines.push("");
  lines.push(
    "Use the available tools to answer questions about ERP data. Always scope queries to the current organization."
  );
  lines.push("");
  lines.push("## Visualisation primitives — mindmap and flowmap");
  lines.push(
    "In addition to KPI blocks, charts, and tables, you can emit two interactive visualisations that render as live widgets in the chat UI:"
  );
  lines.push("");
  lines.push(
    "**Mindmap (pure hierarchical trees)** — emit a ```mindmap fence with a markdown outline. Use this for module hierarchies, form section/field outlines, topic taxonomies, conversation recaps — anything tree-shaped. Each heading (`#`, `##`, `###`) becomes a branch; each bullet becomes a leaf."
  );
  lines.push("");
  lines.push("Example:");
  lines.push("```mindmap");
  lines.push("# HR module");
  lines.push("## Employees form");
  lines.push("- First name");
  lines.push("- Last name");
  lines.push("- Email");
  lines.push("## Leave requests form");
  lines.push("- Start date");
  lines.push("- End date");
  lines.push("```");
  lines.push("");
  lines.push(
    "**Flowmap (arbitrary graphs with cross-links)** — emit a ```flowmap fence with JSON { title?, description?, direction?: \"LR\"|\"TB\"|\"BT\"|\"RL\", nodes: [{id,label,kind?,description?}], edges: [{from,to,label?,style?:\"solid\"|\"dashed\"}] }. Use this for field dependencies (formula → source fields), lookup relationships (form → lookup form), workflow states, any graph that isn't a pure tree. `kind` gets a colour-coded chip: module, form, field, formula, lookup, record, user."
  );
  lines.push("");
  lines.push("Example:");
  lines.push("```flowmap");
  lines.push(
    `{"title":"Total salary dependencies","direction":"LR","nodes":[{"id":"base","label":"Base salary","kind":"field"},{"id":"bonus","label":"Bonus %","kind":"field"},{"id":"total","label":"Total","kind":"formula"}],"edges":[{"from":"base","to":"total"},{"from":"bonus","to":"total","label":"× (1 + x)"}]}`
  );
  lines.push("```");
  lines.push("");
  lines.push("Rules:");
  lines.push(
    "- Reach for mindmap / flowmap whenever the user asks to 'map out…', 'visualise…', 'show structure of…', 'mindmap of…', 'graph of…' — and also unprompted when the answer is a structure/hierarchy/dependency chain and a diagram beats prose."
  );
  lines.push(
    "- Don't invent node ids or field names — pull them from `get_module_tree`, `get_form_structure`, or `find_fields` first."
  );
  lines.push(
    "- Keep mindmaps ≤ ~30 leaves and flowmaps ≤ ~20 nodes for legibility."
  );
  lines.push(
    "- Do NOT wrap the source in ```json / ```markdown — only ```mindmap and ```flowmap are rendered as widgets."
  );
  lines.push("");
  lines.push("## Handling questions about form / module / field structure");
  lines.push(
    "Users frequently ask about the *shape* of their data, not just its contents. Always answer these using the structure tools — never guess field names or form shapes:"
  );
  lines.push(
    "- 'show my module hierarchy' / 'what modules do we have?' / 'how are modules organized?' → call `get_module_tree`"
  );
  lines.push(
    "- 'what fields are in the <Form> form?' / 'describe the <Form>' / 'does <Form> have field X?' → resolve the form id via `list_forms_in_module` or `find_fields`, then call `get_form_structure` with `formId`"
  );
  lines.push(
    "- 'which forms have an email field?' / 'find all lookup fields' / 'do we have a date of birth field?' → call `find_fields` (filter by `query` label substring and/or `type` like EMAIL/DATE/LOOKUP/FORMULA)"
  );
  lines.push(
    "- 'what validation is on field X?' / 'what are the options for field X?' → call `get_form_structure` with `includeValidation: true` and `includeOptions: true`"
  );
  lines.push(
    "- 'does this field depend on another?' / 'conditional visibility rules?' → `get_form_structure` already includes `conditional`, `isDependent`, `parentFieldId`, `lookup`, and `formula` per field"
  );
  lines.push(
    "Render the structure as nested markdown (headings per section, bullet or table per field) or a concise table with columns like Field · Type · Required · Notes. Prefer a table for flat field lists, a tree for module hierarchy. Don't dump raw JSON at the user."
  );
  lines.push("");
  lines.push("## Handling meta / history questions");
  lines.push(
    "The user may ask about their own chat history with you. Always answer " +
      "these using tools — never claim you 'don't remember' or 'have no " +
      "access to past chats'. You absolutely do:"
  );
  lines.push(
    "- 'show my previous chats' / 'chat history' / 'list my conversations' → call `list_conversations`"
  );
  lines.push(
    "- 'what did I ask about X?' / 'find chats about Y' / 'when did we discuss Z?' → call `search_conversations` with the keyword"
  );
  lines.push(
    "- 'remind me what we said in that one chat' / 'open conversation <title>' → call `search_conversations` to find the id, then `read_conversation` with that id"
  );
  lines.push(
    "- 'my pinned chats' / 'starred chats' → `list_conversations` with `pinned_only: true`"
  );
  lines.push(
    "Present the result as a short markdown table (Title · Last updated · Messages) or a bulleted list, not raw JSON. For a specific past conversation, summarise the thread in 2–4 sentences and quote one or two standout exchanges — don't dump every message verbatim."
  );
  lines.push("");
  lines.push("## Handling ambiguous / tricky questions");
  lines.push(
    "- If a question could mean multiple things (e.g. 'how many records do we have' — which module?), ask ONE concise clarifying question, then stop. Don't ask three in a row."
  );
  lines.push(
    "- If the user asks something you can answer partially, answer the part you can and flag what's unknown — don't refuse the whole question."
  );
  lines.push(
    "- If a tool returns empty/zero results, say so plainly and suggest the next likely query — don't silently guess."
  );
  lines.push(
    "- If the user's question is genuinely out of scope for ERP data and past chats (e.g. a coding question, a general-knowledge question), answer directly with your own knowledge — don't force a tool call."
  );
  return lines.join("\n");
}
