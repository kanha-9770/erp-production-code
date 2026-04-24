/**
 * Documentation guides — worked examples that combine Functions and Workflow
 * Rules against real ERP modules (Leads, Contacts, Deals, Tasks, …).
 *
 * Each guide is self-contained: metadata + script + workflow config + todos
 * + a short demo narrative. The `[slug]` doc page renders any of them.
 *
 * Scripts are meant to be pasted into /settings/functions/editor and run or
 * wired up via /settings/workflow-rules/create exactly as described.
 */

export type GuideCategory =
  | "Getting Started"
  | "Data Quality"
  | "Automation"
  | "Assignment"
  | "Validation"
  | "Enrichment"
  | "Notifications"
  | "Reporting"
  | "Integration"
  | "Cleanup";

export interface GuideTodo {
  id: string;
  text: string;
}

export interface WorkflowConfig {
  module: string;
  executeBasedOn: "record-action" | "record-field";
  recordAction?: "Create" | "Edit" | "Create or Edit" | "Delete";
  conditions?: string;
  instantAction: string;
}

/**
 * Guide kinds:
 *  - "example" (default): a paste-ready function + workflow recipe with live
 *    flow diagram, code block, and demo.
 *  - "walkthrough": a UI tour for steps that don't involve a script
 *    (e.g. creating a module, designing a form). Renders todos + links
 *    prominently; hides script/workflow/flow sections.
 */
export type GuideKind = "example" | "walkthrough";

export interface Guide {
  slug: string;
  title: string;
  tagline: string;
  category: GuideCategory;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  estimatedMinutes: number;
  modules: string[];
  useCase: string;
  /** Defaults to "example" when omitted. */
  kind?: GuideKind;
  /** Required for "example" guides. Optional for "walkthrough". */
  script?: string;
  /** Required for "example" guides. Optional for "walkthrough". */
  workflow?: WorkflowConfig;
  todos: GuideTodo[];
  demoInput?: string;
  demoOutput?: string;
  /** Primary action link surfaced on walkthrough guides (e.g. /admin/modules). */
  primaryLink?: { label: string; href: string };
}

// ── The catalog ────────────────────────────────────────────────────────────

export const guides: Guide[] = [
  // ── Getting Started walkthroughs (zero → first function) ─────────────────

  {
    slug: "create-your-first-module",
    title: "Create your first Module",
    tagline:
      "A Module is a container for related records (Leads, Contacts, Deals…). Build one in under a minute.",
    category: "Getting Started",
    difficulty: "Beginner",
    estimatedMinutes: 3,
    modules: ["(any)"],
    useCase:
      "Everything in this ERP lives inside a Module. Before you can write a function, wire a workflow, or submit a form, you need at least one Module to hold the records.",
    kind: "walkthrough",
    primaryLink: { label: "Open Modules", href: "/admin/modules" },
    todos: [
      { id: "t1", text: "Go to /admin/modules" },
      { id: "t2", text: "Click the `Create Module` button (top-right)" },
      {
        id: "t3",
        text: "Enter a Name — e.g. `Leads`. Keep it short and clear.",
      },
      {
        id: "t4",
        text: "Add an optional Description so teammates know its purpose",
      },
      { id: "t5", text: "Leave Parent Module blank for a top-level module" },
      {
        id: "t6",
        text: "Submit — the module appears in the sidebar immediately",
      },
      { id: "t7", text: "Click the new module in the sidebar to select it" },
    ],
  },

  {
    slug: "create-your-first-form",
    title: "Add a Form to your Module",
    tagline:
      "A Form defines what fields a record has. Every Module needs at least one Form before it can store data.",
    category: "Getting Started",
    difficulty: "Beginner",
    estimatedMinutes: 3,
    modules: ["(any)"],
    useCase:
      "Records are rows on a form. After creating a Module you need to attach a Form — this is where sections and fields are defined.",
    kind: "walkthrough",
    primaryLink: { label: "Open Modules", href: "/admin/modules" },
    todos: [
      {
        id: "t1",
        text: "Go to /admin/modules and select your module in the sidebar",
      },
      { id: "t2", text: "Click the `Create Form` button under the module" },
      {
        id: "t3",
        text: "Enter a Form Name — often the same as the module (e.g. `Leads`)",
      },
      { id: "t4", text: "Add a Description (optional but helpful for audits)" },
      {
        id: "t5",
        text: "Submit — the form is created empty and opens automatically",
      },
      {
        id: "t6",
        text: "Note the form ID in the URL — you'll see it in scripts later",
      },
    ],
  },

  {
    slug: "design-form-with-fields",
    title: "Design the Form — add sections & fields",
    tagline:
      "Drag fields onto the canvas to shape the record. Field type drives validation, display, and scriptable behaviour.",
    category: "Getting Started",
    difficulty: "Beginner",
    estimatedMinutes: 10,
    modules: ["(any)"],
    useCase:
      "Fields are what users fill in. Types like `email` and `phone` unlock auto-detection in scripts (see the Duplicate Leads and Phone Normalizer guides). Invest a few minutes picking the right type — it pays off in every downstream automation.",
    kind: "walkthrough",
    primaryLink: { label: "Open Form Builder", href: "/admin/modules" },
    todos: [
      {
        id: "t1",
        text: "From /admin/modules, click `Edit` on your form to open the builder",
      },
      {
        id: "t2",
        text: "In the left Field Palette, see types: text, email, phone, select, number, date, checkbox, radio, file, lookup",
      },
      {
        id: "t3",
        text: "Drag a `text` field onto the canvas — this creates a default Section",
      },
      { id: "t4", text: "Click the field to open Field Settings on the right" },
      {
        id: "t5",
        text: "Set a meaningful Label (e.g. `Email Address`) — apiName auto-generates from it",
      },
      {
        id: "t6",
        text: "For contact fields pick the exact type: `email` for email, `phone` for phone",
      },
      {
        id: "t7",
        text: "Mark required fields as Required in the settings panel",
      },
      {
        id: "t8",
        text: "Add more fields — aim for 4-6 to keep the form usable",
      },
      { id: "t9", text: "Organise with multiple Sections if the form is long" },
      { id: "t10", text: "Click Save — your form is now live for submissions" },
    ],
  },

  {
    slug: "discover-api-names",
    title: "Find your field API Names",
    tagline:
      "apiNames are the string keys scripts use. Read them from Settings → APIs so your scripts reference the right fields.",
    category: "Getting Started",
    difficulty: "Beginner",
    estimatedMinutes: 2,
    modules: ["(any)"],
    useCase:
      "Every field has a human Label (`Email Address`) and a PascalCase apiName (`Email_Address`). Scripts read and write by apiName — get them wrong and nothing happens.",
    kind: "walkthrough",
    primaryLink: { label: "Open APIs", href: "/settings/apis?tab=apiNames" },
    todos: [
      {
        id: "t1",
        text: "Go to /settings/apis and switch to the `API names` tab",
      },
      { id: "t2", text: "Pick your module from the dropdown" },
      {
        id: "t3",
        text: "Copy the apiName column values — these are what scripts use",
      },
      { id: "t4", text: "Remember: apiNames are case-sensitive" },
      {
        id: "t5",
        text: 'Alternative — run `return ctx.records.fields("Leads")` in the Functions editor to see the same list',
      },
    ],
  },

  {
    slug: "hello-world-function",
    title: "Write your first function (hello world)",
    tagline:
      "A 5-line function to prove your setup works. Explores the ctx API without touching real data.",
    category: "Getting Started",
    difficulty: "Beginner",
    estimatedMinutes: 5,
    modules: ["(any)"],
    kind: "walkthrough",
    primaryLink: { label: "Open Functions", href: "/settings/functions" },
    useCase:
      "Before wiring workflows, get comfortable with the Functions editor. Run a trivial script, read the output panel, try ctx.log and return values.",
    script: `// hello_world
ctx.info("Hello from a function!");
const mods = await ctx.modules.list();
return {
  ok: true,
  timestamp: new Date().toISOString(),
  moduleCount: mods.length,
  moduleNames: mods.map((m) => m.name),
};`,
    todos: [
      { id: "t1", text: "Go to /settings/functions" },
      { id: "t2", text: "Click `New Function`" },
      { id: "t3", text: "Name it `hello_world`, category Standalone" },
      { id: "t4", text: "Paste the script above into the editor and Save" },
      {
        id: "t5",
        text: "Click Run — the output panel shows logs + the return value",
      },
      {
        id: "t6",
        text: "Verify the module count matches what you have in /admin/modules",
      },
      {
        id: "t7",
        text: "Skim the ctx comment block in the editor — records, modules, log",
      },
    ],
    demoInput: `(no input — just Run)`,
    demoOutput: `{ ok: true, moduleCount: 3, moduleNames: ["Leads", "Contacts", "Deals"] }`,
  },

  {
    slug: "first-workflow-rule",
    title: "Create your first Workflow Rule",
    tagline:
      "Tie the hello_world function to a real module + trigger so it fires on record events.",
    category: "Getting Started",
    difficulty: "Beginner",
    estimatedMinutes: 8,
    modules: ["Leads"],
    useCase:
      "Functions on their own do nothing automatically — a Workflow Rule is the glue that fires a function when a record is created, edited, or deleted.",
    kind: "walkthrough",
    primaryLink: {
      label: "Open Workflow Rules",
      href: "/settings/workflow-rules/create",
    },
    todos: [
      {
        id: "t1",
        text: "Complete `hello_world` function first (see previous guide)",
      },
      { id: "t2", text: "Go to /settings/workflow-rules/create" },
      { id: "t3", text: "Name the rule — e.g. `Log new Lead (debug)`" },
      { id: "t4", text: "Module: select your Leads module" },
      { id: "t5", text: "Execute based on: `record-action`" },
      { id: "t6", text: "Record action: `Create`" },
      { id: "t7", text: "Conditions: leave empty (fires for every Create)" },
      { id: "t8", text: "Instant action: `Function` → pick `hello_world`" },
      {
        id: "t9",
        text: "Toggle Active ON (required — inactive rules are silently skipped)",
      },
      { id: "t10", text: "Save the rule" },
      {
        id: "t11",
        text: "Submit a Lead record via the form — function fires in the background",
      },
    ],
  },

  // ── 22 function + workflow recipes ───────────────────────────────────────

  // 1 — Duplicate detection (already covered; kept as the canonical first guide)
  {
    slug: "duplicate-leads",
    title: "Detect & quarantine duplicate Leads",
    tagline:
      "Catches duplicate Lead submissions, snapshots them into a Duplicate Lead module, and removes them from Leads.",
    category: "Data Quality",
    difficulty: "Beginner",
    estimatedMinutes: 15,
    modules: ["Leads", "Duplicate Lead"],
    useCase:
      "A Lead form is public and often receives the same person twice (same email or phone). You want the Leads module to stay clean but keep an audit trail of duplicates.",
    script: `// check_lead_duplicate
const LEAD_EMAIL = "New_Email";
const LEAD_PHONE = "New_Phone";
const LEAD_NAME  = "New_Name";
const DUP_ORIGINAL_ID = "Original_Lead_ID";
const DUP_LABEL = "Duplicate_Of";

const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };

const current = await ctx.records.get("Leads", currentId);
if (!current) return { ok: true };

const email = current.data[LEAD_EMAIL];
const phone = current.data[LEAD_PHONE];
if (!email && !phone) return { ok: true };

const normEmail = email ? String(email).trim().toLowerCase() : null;
const normPhone = phone ? String(phone).replace(/\\D/g, "") : null;

const others = await ctx.records.list("Leads", { limit: 500 });
let matchedOn = null;
const original = others.find((l) => {
  if (l.id === currentId) return false;
  const e = l.data[LEAD_EMAIL];
  const p = l.data[LEAD_PHONE];
  if (normEmail && e && String(e).trim().toLowerCase() === normEmail) { matchedOn = "Email"; return true; }
  if (normPhone && p && String(p).replace(/\\D/g, "") === normPhone) { matchedOn = "Phone"; return true; }
  return false;
});

if (!original) return { ok: true };

await ctx.records.create("Duplicate Lead", {
  [DUP_ORIGINAL_ID]: original.id,
  [DUP_LABEL]: \`\${original.data[LEAD_NAME] || original.id} (matched on \${matchedOn})\`,
  New_Name: current.data[LEAD_NAME],
  New_Email: email,
  New_Phone: phone,
});
await ctx.records.delete("Leads", currentId);
return { ok: true };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Create",
      instantAction: "Function → check_lead_duplicate",
    },
    todos: [
      { id: "t1", text: "Confirm Leads and Duplicate Lead modules both exist" },
      {
        id: "t2",
        text: "Run the field-discovery script to get exact apiNames",
      },
      {
        id: "t3",
        text: "Create function `check_lead_duplicate` (category: Automation)",
      },
      {
        id: "t4",
        text: "Paste the script and replace the constants with your apiNames",
      },
      { id: "t5", text: "Save the function" },
      { id: "t6", text: "Create workflow rule on Leads / Create" },
      {
        id: "t7",
        text: "Set the Instant Action to this function and mark rule Active",
      },
      { id: "t8", text: "Submit a Lead with a brand-new email (should stay)" },
      { id: "t9", text: "Submit same email again (should be quarantined)" },
      {
        id: "t10",
        text: "Verify Leads count unchanged and Duplicate Lead count +1",
      },
    ],
    demoInput: `Submit: { Name: "Akash", Email: "akash@gmail.com", Phone: "+91..." }\nAgain:  { Name: "Akash K.", Email: "akash@gmail.com" }`,
    demoOutput: `Leads: 1 (the first)\nDuplicate Lead: 1 (snapshot of the second with Original_Lead_ID pointing back)`,
  },

  // 2 — Lead scoring
  {
    slug: "lead-scoring",
    title: "Automatic Lead scoring",
    tagline:
      "Compute a score (0–100) from Lead fields and write it back to the record.",
    category: "Enrichment",
    difficulty: "Beginner",
    estimatedMinutes: 10,
    modules: ["Leads"],
    useCase:
      "Sales wants to prioritise Leads. Score rules: business email = +30, phone provided = +20, company filled = +25, budget > 10k = +25.",
    script: `// lead_scoring
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const lead = await ctx.records.get("Leads", currentId);
if (!lead) return { ok: true };

let score = 0;
const email = String(lead.data.New_Email || "").toLowerCase();
const phone = String(lead.data.New_Phone || "").trim();
const company = String(lead.data.Company || "").trim();
const budget = Number(lead.data.Budget || 0);

if (email && !/@(gmail|yahoo|outlook|hotmail)\\./.test(email)) score += 30;
if (phone) score += 20;
if (company) score += 25;
if (budget > 10000) score += 25;

ctx.info(\`Lead \${currentId} scored \${score}\`);
return { Lead_Score: score };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Create or Edit",
      instantAction: "Function → lead_scoring",
    },
    todos: [
      {
        id: "t1",
        text: "Add a numeric `Lead Score` field to the Leads module",
      },
      { id: "t2", text: "Optionally add `Company` and `Budget` fields" },
      { id: "t3", text: "Create function `lead_scoring` and paste the script" },
      { id: "t4", text: "Tune the scoring weights to match your sales team" },
      { id: "t5", text: "Create workflow rule on Leads / Create or Edit" },
      { id: "t6", text: "Submit a test Lead and confirm Lead Score populates" },
    ],
    demoInput: `{ Email: "alice@acmecorp.com", Phone: "+1…", Company: "Acme", Budget: 25000 }`,
    demoOutput: `Lead_Score = 100`,
  },

  // 2b — Backfill Lead Scoring for existing records
  {
    slug: "backfill-lead-scoring",
    title: "Backfill Lead Scoring for existing records",
    tagline:
      "Bulk-apply the scoring formula to every Lead already in your database, in safe batches.",
    category: "Cleanup",
    difficulty: "Intermediate",
    estimatedMinutes: 10,
    modules: ["Leads"],
    useCase:
      "You wired up the lead_scoring workflow but it only fires on new submissions. Your existing 50 / 500 / 5000 Leads still have an empty Lead_Score. This script backfills them — safely, in batches, and idempotently (running twice doesn't double-score).",
    script: `// backfill_lead_scoring
// One-time bulk update for the lead_scoring logic.
// Keep the WEIGHTS identical to the live lead_scoring function so the
// backfill produces the same result as re-submitting each record.

// ──────────────────────────────────────────────────────────────
//  CONFIG — tweak these and re-run as needed
// ──────────────────────────────────────────────────────────────
const DRY_RUN    = false;  // true = preview only, no writes
const BATCH_SIZE = 500;    // ctx.records.list max is 500
const SKIP       = 0;      // bump this to resume a large dataset

// Field apiNames — match your Leads form
const F_EMAIL   = "New_Email";
const F_PHONE   = "New_Phone";
const F_COMPANY = "Company";
const F_BUDGET  = "Budget";
const F_SCORE   = "Lead_Score";

// ──────────────────────────────────────────────────────────────

// Pre-warm the module/shard mapping so the first update is fast.
const totalBefore = await ctx.records.count("Leads");
console.log(\`Total Leads in DB: \${totalBefore}\`);

const leads = await ctx.records.list("Leads", { limit: BATCH_SIZE, skip: SKIP });
console.log(\`Loaded batch: \${leads.length} leads (skip=\${SKIP})\`);

if (leads.length === 0) {
  return { done: true, reason: "No leads in this batch — you're finished." };
}

let updated = 0, unchanged = 0, errored = 0;
const errors = [];

for (const lead of leads) {
  try {
    const email   = String(lead.data[F_EMAIL]   || "").toLowerCase();
    const phone   = String(lead.data[F_PHONE]   || "").trim();
    const company = String(lead.data[F_COMPANY] || "").trim();
    const budget  = Number(lead.data[F_BUDGET]  || 0);

    let score = 0;
    if (email && !/@(gmail|yahoo|outlook|hotmail)\\./.test(email)) score += 30;
    if (phone) score += 20;
    if (company) score += 25;
    if (budget > 10000) score += 25;

    const currentScore = Number(lead.data[F_SCORE]);
    // Idempotent: skip if already correct.
    if (!Number.isNaN(currentScore) && currentScore === score) {
      unchanged++;
      continue;
    }

    if (!DRY_RUN) {
      await ctx.records.update("Leads", lead.id, { [F_SCORE]: score });
    }
    updated++;
    // Only log first 20 + last few to keep the panel readable
    if (updated <= 20) {
      console.log(\`  \${lead.id}  \${currentScore || 0} → \${score}\`);
    }
  } catch (err) {
    errored++;
    errors.push({ id: lead.id, message: err.message });
    console.error(\`  \${lead.id} FAILED: \${err.message}\`);
  }
}

const processed = SKIP + leads.length;
const remaining = Math.max(0, totalBefore - processed);
const hitEnd = leads.length < BATCH_SIZE;

console.log("─".repeat(40));
console.log(\`Processed this run: \${leads.length}\`);
console.log(\`  Updated:   \${updated}\${DRY_RUN ? " (dry run — NOT saved)" : ""}\`);
console.log(\`  Unchanged: \${unchanged}\`);
console.log(\`  Errored:   \${errored}\`);
console.log(\`Remaining:  ~\${remaining}\`);

if (!hitEnd && remaining > 0) {
  console.log(\`\\nNext run: set SKIP = \${processed}\`);
}

return {
  dryRun: DRY_RUN,
  processed: leads.length,
  updated, unchanged, errored, errors,
  remaining,
  done: hitEnd,
  nextSkip: hitEnd ? null : processed,
};`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      instantAction: "(manual run from the editor — no workflow rule needed)",
    },
    todos: [
      {
        id: "t1",
        text: "Confirm the Leads form has a `Lead_Score` number field",
      },
      {
        id: "t2",
        text: "Open the `lead_scoring` function — note the exact scoring weights",
      },
      {
        id: "t3",
        text: "Create a new function `backfill_lead_scoring` (category Automation)",
      },
      {
        id: "t4",
        text: "Paste the script above — update F_* constants to match your apiNames",
      },
      {
        id: "t5",
        text: "Set DRY_RUN = true and click Run — preview without writing",
      },
      {
        id: "t6",
        text: "Review the log output: how many will update vs. stay the same",
      },
      {
        id: "t7",
        text: "Set DRY_RUN = false and Run again — actual write happens",
      },
      {
        id: "t8",
        text: "If log says `Next run: set SKIP = N`, bump SKIP and Run again",
      },
      { id: "t9", text: "Repeat until output says `done: true`" },
      {
        id: "t10",
        text: "Spot-check a few Leads — their Lead_Score should now match the formula",
      },
      {
        id: "t11",
        text: "Re-run once to confirm it's idempotent (all unchanged, 0 updated)",
      },
    ],
    demoInput: `500 existing Leads, some with empty Lead_Score, some old scores from a prior formula`,
    demoOutput: `Processed: 500\n  Updated: 480 (recomputed)\n  Unchanged: 18 (already correct)\n  Errored: 2 (missing email/phone field — safe, logged)`,
  },

  // 3 — Round-robin assignment
  {
    slug: "round-robin-assignment",
    title: "Round-robin Lead assignment",
    tagline:
      "Distribute new Leads evenly across a list of sales reps using a counter stored in a config module.",
    category: "Assignment",
    difficulty: "Intermediate",
    estimatedMinutes: 20,
    modules: ["Leads", "Config"],
    useCase:
      "Every new Lead should be assigned to the next sales rep in rotation so no one is overloaded.",
    script: `// round_robin_assign
const REPS = ["rep-1@acme.com", "rep-2@acme.com", "rep-3@acme.com"];
const cfg = await ctx.records.list("Config", { limit: 1, where: { key: "rr_lead_counter" } });
const current = Number(cfg[0]?.data?.value ?? 0);
const next = (current + 1) % REPS.length;
const assignee = REPS[next];

if (cfg[0]) {
  await ctx.records.update("Config", cfg[0].id, { value: String(next) });
} else {
  await ctx.records.create("Config", { key: "rr_lead_counter", value: String(next) });
}

ctx.info(\`Assigned to \${assignee} (rotation \${next})\`);
return { Owner: assignee };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Create",
      instantAction: "Function → round_robin_assign",
    },
    todos: [
      {
        id: "t1",
        text: "Create a Config module with `key` (text) and `value` (text) fields",
      },
      { id: "t2", text: "Add an `Owner` field on Leads (email or user type)" },
      { id: "t3", text: "Create function `round_robin_assign`" },
      {
        id: "t4",
        text: "Replace the REPS array with your actual rep emails/ids",
      },
      { id: "t5", text: "Wire workflow: Leads / Create → this function" },
      { id: "t6", text: "Submit 4 test Leads and confirm rotation 1→2→3→1" },
    ],
    demoInput: `Creating Leads #1, #2, #3, #4 in quick succession`,
    demoOutput: `Owner: rep-1, rep-2, rep-3, rep-1 …`,
  },

  // 4 — Email domain validation
  {
    slug: "email-domain-validation",
    title: "Block personal email domains",
    tagline:
      "Reject B2B Lead submissions that use gmail/yahoo/outlook and route them to a separate module.",
    category: "Validation",
    difficulty: "Beginner",
    estimatedMinutes: 10,
    modules: ["Leads", "Personal Email Lead"],
    useCase:
      "You only want Leads from business email addresses. Personal-mail submissions should be kept aside for manual review.",
    script: `// block_personal_emails
const PERSONAL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"];
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const lead = await ctx.records.get("Leads", currentId);
if (!lead) return { ok: true };

const email = String(lead.data.New_Email || "").toLowerCase();
const domain = email.split("@")[1];
if (!domain || !PERSONAL.includes(domain)) return { ok: true };

await ctx.records.create("Personal Email Lead", {
  Email: email,
  Name: lead.data.New_Name,
  Phone: lead.data.New_Phone,
  Reason: \`Personal domain: \${domain}\`,
});
await ctx.records.delete("Leads", currentId);
ctx.info(\`Rejected \${email} — personal domain\`);
return { ok: true };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Create",
      instantAction: "Function → block_personal_emails",
    },
    todos: [
      {
        id: "t1",
        text: "Create a `Personal Email Lead` module with Email/Name/Phone/Reason fields",
      },
      { id: "t2", text: "Create function `block_personal_emails`" },
      { id: "t3", text: "Tune the PERSONAL array if needed" },
      {
        id: "t4",
        text: "Create workflow rule: Leads / Create → this function",
      },
      { id: "t5", text: "Test with a gmail.com address" },
      { id: "t6", text: "Test with a business address — should pass through" },
    ],
    demoInput: `alice@acmecorp.com vs alice@gmail.com`,
    demoOutput: `First stays in Leads; second moves to Personal Email Lead.`,
  },

  // 5 — Phone formatter
  {
    slug: "phone-normalizer",
    title: "Normalize phone numbers to E.164",
    tagline:
      "Strip formatting and prepend a default country code so phone fields are storage-consistent.",
    category: "Data Quality",
    difficulty: "Beginner",
    estimatedMinutes: 8,
    modules: ["Leads"],
    useCase:
      "Users type phones as '+91 (830) 583-8352' or '08305838352'. Store them all as +918305838352 to make deduplication and outbound dialing reliable.",
    script: `// normalize_phone
const DEFAULT_CC = "91";
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const lead = await ctx.records.get("Leads", currentId);
if (!lead) return { ok: true };

const raw = String(lead.data.New_Phone || "");
if (!raw) return { ok: true };

let digits = raw.replace(/\\D/g, "");
if (digits.startsWith("0")) digits = digits.slice(1);
if (!raw.startsWith("+")) digits = DEFAULT_CC + digits;

const normalized = "+" + digits;
if (normalized === raw) return { ok: true };

ctx.info(\`Normalized \${raw} → \${normalized}\`);
return { New_Phone: normalized };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Create or Edit",
      instantAction: "Function → normalize_phone",
    },
    todos: [
      { id: "t1", text: "Create function `normalize_phone`" },
      { id: "t2", text: "Set DEFAULT_CC to your country's dialing code" },
      { id: "t3", text: "Create workflow on Leads / Create or Edit" },
      { id: "t4", text: "Test by submitting '08305838352' (local format)" },
      {
        id: "t5",
        text: "Confirm it becomes '+918305838352' after workflow runs",
      },
    ],
    demoInput: `"+91 (830) 583-8352"   |   "08305838352"`,
    demoOutput: `Both become +918305838352`,
  },

  // 6 — Full name composer
  {
    slug: "full-name-composer",
    title: "Compose Full Name from First + Last",
    tagline:
      "Keep a `Full Name` field in sync with first/last name edits automatically.",
    category: "Enrichment",
    difficulty: "Beginner",
    estimatedMinutes: 5,
    modules: ["Contacts"],
    useCase:
      "Your Contacts module stores First Name and Last Name separately but reports need a combined Full Name for display and search.",
    script: `// compose_full_name
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const rec = await ctx.records.get("Contacts", currentId);
if (!rec) return { ok: true };

const first = String(rec.data.First_Name || "").trim();
const last  = String(rec.data.Last_Name || "").trim();
const full  = [first, last].filter(Boolean).join(" ");
if (!full || full === String(rec.data.Full_Name || "").trim()) return { ok: true };

return { Full_Name: full };`,
    workflow: {
      module: "Contacts",
      executeBasedOn: "record-action",
      recordAction: "Create or Edit",
      instantAction: "Function → compose_full_name",
    },
    todos: [
      {
        id: "t1",
        text: "Ensure Contacts has First Name, Last Name, and Full Name fields",
      },
      { id: "t2", text: "Create function `compose_full_name`" },
      { id: "t3", text: "Wire workflow on Contacts / Create or Edit" },
      {
        id: "t4",
        text: "Edit a contact's Last Name — Full Name should update",
      },
    ],
    demoInput: `First_Name: "Akash", Last_Name: "Kumar"`,
    demoOutput: `Full_Name: "Akash Kumar"`,
  },

  // 7 — Auto-tag by company size
  {
    slug: "auto-tag-enterprise",
    title: "Auto-tag Enterprise vs SMB Leads",
    tagline:
      "Set a segment tag based on employee count so routing and scoring rules can branch on it.",
    category: "Enrichment",
    difficulty: "Beginner",
    estimatedMinutes: 7,
    modules: ["Leads"],
    useCase:
      "Sales has two playbooks — Enterprise (>500 employees) and SMB. Tag Leads so downstream workflows can route to the right team.",
    script: `// tag_segment
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const lead = await ctx.records.get("Leads", currentId);
if (!lead) return { ok: true };

const emp = Number(lead.data.Employees || 0);
let segment = "SMB";
if (emp >= 500) segment = "Enterprise";
else if (emp >= 50) segment = "Mid-Market";

return { Segment: segment };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Create or Edit",
      instantAction: "Function → tag_segment",
    },
    todos: [
      {
        id: "t1",
        text: "Add `Employees` (number) and `Segment` (select) fields on Leads",
      },
      { id: "t2", text: "Create function `tag_segment`" },
      { id: "t3", text: "Wire workflow on Leads / Create or Edit" },
      { id: "t4", text: "Test with 10, 100, 1000 employees" },
    ],
    demoInput: `Employees: 800`,
    demoOutput: `Segment: "Enterprise"`,
  },

  // 8 — Auto-create Task on new Lead
  {
    slug: "welcome-task-creator",
    title: "Auto-create a follow-up Task on new Lead",
    tagline:
      "Every new Lead gets a follow-up Task assigned to the Lead owner, due in 24 hours.",
    category: "Automation",
    difficulty: "Intermediate",
    estimatedMinutes: 15,
    modules: ["Leads", "Tasks"],
    useCase:
      "Never let a Lead go cold — automation creates a follow-up Task so the owner gets a clear next-action in their queue.",
    script: `// create_follow_up_task
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const lead = await ctx.records.get("Leads", currentId);
if (!lead) return { ok: true };

const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
await ctx.records.create("Tasks", {
  Title: \`Follow up with \${lead.data.New_Name || "new Lead"}\`,
  Related_Lead_ID: currentId,
  Due_Date: due,
  Owner: lead.data.Owner,
  Status: "Open",
});
ctx.info(\`Task created for Lead \${currentId}\`);
return { ok: true };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Create",
      instantAction: "Function → create_follow_up_task",
    },
    todos: [
      {
        id: "t1",
        text: "Ensure Tasks module exists (Title, Due_Date, Owner, Status, Related_Lead_ID)",
      },
      { id: "t2", text: "Create function `create_follow_up_task`" },
      { id: "t3", text: "Wire workflow on Leads / Create" },
      {
        id: "t4",
        text: "Submit a Lead — check Tasks for a new row due tomorrow",
      },
    ],
    demoInput: `Create Lead "Akash" owned by rep-1`,
    demoOutput: `Task "Follow up with Akash" created, due in 24h, owned by rep-1.`,
  },

  // 9 — Stale lead detector (scheduled-ish — here as on-demand)
  {
    slug: "stale-lead-detector",
    title: "Detect stale Leads (no activity)",
    tagline: "Scan Leads and flag any not updated in N days.",
    category: "Reporting",
    difficulty: "Intermediate",
    estimatedMinutes: 10,
    modules: ["Leads"],
    useCase:
      "Managers want a weekly list of Leads gathering dust. Run this on demand or wire it to a scheduled job.",
    script: `// find_stale_leads
const DAYS = 14;
const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;
const leads = await ctx.records.list("Leads", { limit: 500 });

const stale = leads.filter((l) => new Date(l.updatedAt).getTime() < cutoff);
for (const l of stale) {
  await ctx.records.update("Leads", l.id, { Is_Stale: true });
}
ctx.info(\`Flagged \${stale.length} stale Leads\`);
return { flagged: stale.length, ids: stale.map((l) => l.id) };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Create or Edit",
      instantAction: "(manual run from editor, or a scheduled workflow)",
    },
    todos: [
      { id: "t1", text: "Add `Is Stale` (checkbox) field to Leads" },
      { id: "t2", text: "Create function `find_stale_leads`" },
      { id: "t3", text: "Adjust DAYS constant if needed" },
      { id: "t4", text: "Run the function manually from the editor" },
      { id: "t5", text: "Verify stale records now have Is_Stale = true" },
    ],
    demoInput: `Run on Leads with various updatedAt timestamps`,
    demoOutput: `flagged: 7, ids: [...]`,
  },

  // 10 — Audit log
  {
    slug: "audit-log-writer",
    title: "Write an Audit Log entry on every Lead edit",
    tagline:
      "Keep a tamper-evident record of who edited what and when, separate from the Lead itself.",
    category: "Reporting",
    difficulty: "Intermediate",
    estimatedMinutes: 10,
    modules: ["Leads", "Audit Log"],
    useCase:
      "Compliance wants history. Write a row into Audit Log on every Lead create or edit.",
    script: `// audit_lead_changes
const currentId = ctx.input?.recordId;
const action = ctx.input?.action;
if (!currentId) return { ok: true };

await ctx.records.create("Audit Log", {
  Module: "Leads",
  Record_ID: currentId,
  Action: action || "Edit",
  User_ID: ctx.userId,
  Timestamp: new Date().toISOString(),
  Snapshot: JSON.stringify(ctx.input?.recordData || {}),
});
return { ok: true };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Create or Edit",
      instantAction: "Function → audit_lead_changes",
    },
    todos: [
      {
        id: "t1",
        text: "Create Audit Log module (Module, Record_ID, Action, User_ID, Timestamp, Snapshot)",
      },
      { id: "t2", text: "Create function `audit_lead_changes`" },
      { id: "t3", text: "Wire workflow on Leads / Create or Edit" },
      { id: "t4", text: "Edit a Lead and confirm a new Audit Log row appears" },
    ],
    demoInput: `User edits Lead "Akash" and changes Status`,
    demoOutput: `New Audit Log row: action=Edit, user, timestamp, full snapshot`,
  },

  // 11 — Cross-module sync Lead → Contact on conversion
  {
    slug: "convert-lead-to-contact",
    title: "Convert a qualified Lead into a Contact",
    tagline:
      "When a Lead's Status flips to 'Qualified', create a matching Contact and link them.",
    category: "Automation",
    difficulty: "Intermediate",
    estimatedMinutes: 15,
    modules: ["Leads", "Contacts"],
    useCase:
      "The Sales team marks a Lead as Qualified and expects a full Contact record to exist downstream for the account team.",
    script: `// convert_to_contact
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const lead = await ctx.records.get("Leads", currentId);
if (!lead) return { ok: true };
if (lead.data.Status !== "Qualified") return { ok: true };
if (lead.data.Converted_Contact_ID) return { ok: true };

const contact = await ctx.records.create("Contacts", {
  First_Name: lead.data.New_Name,
  Email: lead.data.New_Email,
  Phone: lead.data.New_Phone,
  Source_Lead_ID: currentId,
});

return { Converted_Contact_ID: contact.id, Converted_At: new Date().toISOString() };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Edit",
      conditions: "Status equals 'Qualified'",
      instantAction: "Function → convert_to_contact",
    },
    todos: [
      {
        id: "t1",
        text: "Add Status, Converted_Contact_ID, Converted_At fields on Leads",
      },
      {
        id: "t2",
        text: "Ensure Contacts has First_Name, Email, Phone, Source_Lead_ID",
      },
      { id: "t3", text: "Create function `convert_to_contact`" },
      {
        id: "t4",
        text: "Wire workflow: Leads / Edit with condition Status = Qualified",
      },
      { id: "t5", text: "Mark a Lead Qualified — verify Contact is created" },
      {
        id: "t6",
        text: "Edit the Lead again to confirm no second Contact is made",
      },
    ],
    demoInput: `Edit Lead → Status: "Qualified"`,
    demoOutput: `Contact created, Lead's Converted_Contact_ID set.`,
  },

  // 12 — SLA timer
  {
    slug: "sla-deadline-setter",
    title: "Set SLA deadline on new support cases",
    tagline:
      "Priority → deadline mapping: Urgent 4h, High 24h, Medium 3d, Low 7d.",
    category: "Automation",
    difficulty: "Beginner",
    estimatedMinutes: 8,
    modules: ["Cases"],
    useCase:
      "Support wants a clear SLA clock on every case so the team can prioritise and managers can report breaches.",
    script: `// set_sla
const HOURS = { Urgent: 4, High: 24, Medium: 72, Low: 168 };
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const c = await ctx.records.get("Cases", currentId);
if (!c) return { ok: true };

const hrs = HOURS[c.data.Priority] ?? 24;
const deadline = new Date(Date.now() + hrs * 3600 * 1000).toISOString();
return { SLA_Deadline: deadline };`,
    workflow: {
      module: "Cases",
      executeBasedOn: "record-action",
      recordAction: "Create",
      instantAction: "Function → set_sla",
    },
    todos: [
      {
        id: "t1",
        text: "Add Priority (select) and SLA_Deadline (datetime) fields on Cases",
      },
      { id: "t2", text: "Create function `set_sla`" },
      { id: "t3", text: "Wire workflow on Cases / Create" },
      { id: "t4", text: "Submit one Case per priority and verify deadlines" },
    ],
    demoInput: `Priority: "High"`,
    demoOutput: `SLA_Deadline = now + 24h`,
  },

  // 13 — High-value approval request
  {
    slug: "big-deal-approval",
    title: "Create an Approval Request for big Deals",
    tagline:
      "Deals over $50k trigger an approval record for the manager to review.",
    category: "Automation",
    difficulty: "Intermediate",
    estimatedMinutes: 12,
    modules: ["Deals", "Approvals"],
    useCase:
      "Finance requires approval on deals above a threshold. Automate so reps can't forget.",
    script: `// request_deal_approval
const THRESHOLD = 50000;
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const deal = await ctx.records.get("Deals", currentId);
if (!deal) return { ok: true };

const amount = Number(deal.data.Amount || 0);
if (amount < THRESHOLD) return { ok: true };

const existing = await ctx.records.list("Approvals", { where: { formId: undefined }, limit: 50 });
const already = existing.find((a) => a.data.Deal_ID === currentId && a.data.Status !== "Rejected");
if (already) return { ok: true };

await ctx.records.create("Approvals", {
  Deal_ID: currentId,
  Amount: amount,
  Requested_By: ctx.userId,
  Status: "Pending",
  Requested_At: new Date().toISOString(),
});
return { Approval_Pending: true };`,
    workflow: {
      module: "Deals",
      executeBasedOn: "record-action",
      recordAction: "Create or Edit",
      instantAction: "Function → request_deal_approval",
    },
    todos: [
      {
        id: "t1",
        text: "Create Approvals module (Deal_ID, Amount, Status, Requested_By, Requested_At)",
      },
      { id: "t2", text: "Add `Approval Pending` (checkbox) to Deals" },
      { id: "t3", text: "Create function `request_deal_approval`" },
      { id: "t4", text: "Tune THRESHOLD to match your policy" },
      { id: "t5", text: "Wire workflow on Deals / Create or Edit" },
      {
        id: "t6",
        text: "Save a Deal over $50k and verify Approval row appears",
      },
    ],
    demoInput: `Deal { Amount: 75000 }`,
    demoOutput: `Approval record with Status: Pending`,
  },

  // 14 — Data completeness score
  {
    slug: "data-completeness-score",
    title: "Calculate data-completeness % for Leads",
    tagline:
      "Compute what fraction of key fields is filled and store as a percentage.",
    category: "Reporting",
    difficulty: "Beginner",
    estimatedMinutes: 8,
    modules: ["Leads"],
    useCase:
      "Marketing wants to surface Leads whose profile is incomplete so they can be enriched.",
    script: `// completeness_score
const KEY_FIELDS = ["New_Name", "New_Email", "New_Phone", "Company", "Title", "Source"];
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const lead = await ctx.records.get("Leads", currentId);
if (!lead) return { ok: true };

const filled = KEY_FIELDS.filter((k) => {
  const v = lead.data[k];
  return v !== null && v !== undefined && String(v).trim() !== "";
}).length;
const pct = Math.round((filled / KEY_FIELDS.length) * 100);
return { Completeness_Pct: pct };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Create or Edit",
      instantAction: "Function → completeness_score",
    },
    todos: [
      { id: "t1", text: "Add `Completeness Pct` (number) field to Leads" },
      { id: "t2", text: "Create function `completeness_score`" },
      { id: "t3", text: "Edit KEY_FIELDS to match your most valuable fields" },
      { id: "t4", text: "Wire workflow on Leads / Create or Edit" },
    ],
    demoInput: `3 of 6 key fields filled`,
    demoOutput: `Completeness_Pct: 50`,
  },

  // 15 — Geo routing
  {
    slug: "geo-routing",
    title: "Route Leads by country to regional teams",
    tagline: "Set Region based on Country field (APAC, EMEA, Americas).",
    category: "Assignment",
    difficulty: "Beginner",
    estimatedMinutes: 7,
    modules: ["Leads"],
    useCase:
      "Each region has its own sales team. Leads need a Region tag so the right queue picks them up.",
    script: `// region_router
const MAP = {
  APAC: ["IN", "CN", "JP", "AU", "SG"],
  EMEA: ["GB", "DE", "FR", "ES", "IT", "NL", "AE"],
  Americas: ["US", "CA", "BR", "MX", "AR"],
};
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const lead = await ctx.records.get("Leads", currentId);
if (!lead) return { ok: true };

const country = String(lead.data.Country || "").toUpperCase();
const region = Object.entries(MAP).find(([, codes]) => codes.includes(country))?.[0] || "Other";
return { Region: region };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Create or Edit",
      instantAction: "Function → region_router",
    },
    todos: [
      {
        id: "t1",
        text: "Add Country (text) and Region (select) fields on Leads",
      },
      { id: "t2", text: "Create function `region_router`" },
      { id: "t3", text: "Customise the MAP to your business regions" },
      { id: "t4", text: "Wire workflow on Leads / Create or Edit" },
    ],
    demoInput: `Country: "IN"`,
    demoOutput: `Region: "APAC"`,
  },

  // 16 — Delete cascade
  {
    slug: "delete-cascade",
    title: "Cascade-delete related Tasks when a Lead is deleted",
    tagline: "Keep dependent records clean by removing orphaned Tasks.",
    category: "Cleanup",
    difficulty: "Intermediate",
    estimatedMinutes: 10,
    modules: ["Leads", "Tasks"],
    useCase:
      "When a Lead is removed, leaving behind follow-up Tasks confuses the sales queue.",
    script: `// cascade_delete_tasks
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };

const tasks = await ctx.records.list("Tasks", { limit: 500 });
const related = tasks.filter((t) => t.data.Related_Lead_ID === currentId);
for (const t of related) {
  await ctx.records.delete("Tasks", t.id);
}
ctx.info(\`Deleted \${related.length} related Task(s)\`);
return { ok: true };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Delete",
      instantAction: "Function → cascade_delete_tasks",
    },
    todos: [
      { id: "t1", text: "Confirm Tasks has Related_Lead_ID field" },
      { id: "t2", text: "Create function `cascade_delete_tasks`" },
      { id: "t3", text: "Wire workflow on Leads / Delete" },
      {
        id: "t4",
        text: "Create a Lead + Task, delete the Lead, confirm Task is gone",
      },
    ],
    demoInput: `Delete Lead #123 (which has 3 Tasks)`,
    demoOutput: `3 Tasks removed`,
  },

  // 17 — Rank by revenue
  {
    slug: "rank-by-revenue",
    title: "Rank top 10 customers by revenue",
    tagline: "Compute a Rank field (1, 2, 3, …) based on a Revenue column.",
    category: "Reporting",
    difficulty: "Advanced",
    estimatedMinutes: 15,
    modules: ["Accounts"],
    useCase:
      "Account management wants to focus on top-10 revenue accounts this quarter.",
    script: `// rank_accounts_by_revenue
const accounts = await ctx.records.list("Accounts", { limit: 500 });
const sorted = [...accounts].sort((a, b) => Number(b.data.Revenue || 0) - Number(a.data.Revenue || 0));

for (let i = 0; i < sorted.length; i++) {
  await ctx.records.update("Accounts", sorted[i].id, {
    Revenue_Rank: i + 1,
    Is_Top10: i < 10,
  });
}
return { ranked: sorted.length };`,
    workflow: {
      module: "Accounts",
      executeBasedOn: "record-action",
      recordAction: "Create or Edit",
      instantAction: "(manual or scheduled — ranks recompute on demand)",
    },
    todos: [
      {
        id: "t1",
        text: "Add Revenue (number), Revenue_Rank (number), Is_Top10 (checkbox) on Accounts",
      },
      { id: "t2", text: "Create function `rank_accounts_by_revenue`" },
      { id: "t3", text: "Run manually whenever revenue data changes" },
      { id: "t4", text: "Filter Accounts by Is_Top10 to see the leaderboard" },
    ],
    demoInput: `50 accounts with various Revenue`,
    demoOutput: `Top 10 get Is_Top10=true, all get Revenue_Rank`,
  },

  // 18 — Birthday reminder
  {
    slug: "birthday-reminder",
    title: "Create a birthday reminder Task",
    tagline: "From a Contact's Date of Birth, create a yearly reminder Task.",
    category: "Notifications",
    difficulty: "Intermediate",
    estimatedMinutes: 12,
    modules: ["Contacts", "Tasks"],
    useCase:
      "Relationship touch-points matter — send a personal note on birthdays.",
    script: `// birthday_reminder
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const c = await ctx.records.get("Contacts", currentId);
if (!c) return { ok: true };

const dob = c.data.Date_Of_Birth;
if (!dob) return { ok: true };

const d = new Date(dob);
const nextYear = new Date();
nextYear.setMonth(d.getMonth());
nextYear.setDate(d.getDate());
if (nextYear.getTime() < Date.now()) nextYear.setFullYear(nextYear.getFullYear() + 1);

await ctx.records.create("Tasks", {
  Title: \`🎂 Wish \${c.data.First_Name || "contact"} a happy birthday\`,
  Related_Contact_ID: currentId,
  Due_Date: nextYear.toISOString(),
  Owner: c.data.Owner,
  Status: "Open",
});
return { ok: true };`,
    workflow: {
      module: "Contacts",
      executeBasedOn: "record-action",
      recordAction: "Create or Edit",
      instantAction: "Function → birthday_reminder",
    },
    todos: [
      { id: "t1", text: "Ensure Contacts has Date_Of_Birth and Owner fields" },
      { id: "t2", text: "Ensure Tasks has Related_Contact_ID" },
      { id: "t3", text: "Create function `birthday_reminder`" },
      { id: "t4", text: "Wire workflow on Contacts / Create or Edit" },
    ],
    demoInput: `Contact with DOB 1994-06-15`,
    demoOutput: `Task created due next 2027-06-15 (or this year if still upcoming)`,
  },

  // 19 — Currency conversion
  {
    slug: "currency-converter",
    title: "Convert Deal amount to USD",
    tagline:
      "Keep a USD-normalised column so pipeline reports are comparable across currencies.",
    category: "Enrichment",
    difficulty: "Beginner",
    estimatedMinutes: 8,
    modules: ["Deals"],
    useCase:
      "Deals are booked in multiple currencies. Reports need a common denominator.",
    script: `// convert_to_usd
const RATES = { USD: 1, EUR: 1.08, GBP: 1.27, INR: 0.012, JPY: 0.0067 };
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const d = await ctx.records.get("Deals", currentId);
if (!d) return { ok: true };

const amount = Number(d.data.Amount || 0);
const cur = d.data.Currency || "USD";
const rate = RATES[cur] ?? 1;
return { Amount_USD: Math.round(amount * rate * 100) / 100 };`,
    workflow: {
      module: "Deals",
      executeBasedOn: "record-action",
      recordAction: "Create or Edit",
      instantAction: "Function → convert_to_usd",
    },
    todos: [
      { id: "t1", text: "Add Amount, Currency, Amount_USD fields on Deals" },
      { id: "t2", text: "Create function `convert_to_usd`" },
      {
        id: "t3",
        text: "Update the RATES object regularly or fetch from an API",
      },
      { id: "t4", text: "Wire workflow on Deals / Create or Edit" },
    ],
    demoInput: `Amount: 100000, Currency: "INR"`,
    demoOutput: `Amount_USD: 1200`,
  },

  // 20 — Welcome email stub
  {
    slug: "welcome-email-stub",
    title: "Log a welcome-email job on Lead creation",
    tagline:
      "Write a job to the Email Queue module for a scheduled worker to pick up.",
    category: "Integration",
    difficulty: "Beginner",
    estimatedMinutes: 8,
    modules: ["Leads", "Email Queue"],
    useCase:
      "You can't send email directly from scripts, so queue a job in an Email Queue module that your SMTP worker polls.",
    script: `// queue_welcome_email
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const lead = await ctx.records.get("Leads", currentId);
if (!lead) return { ok: true };

const to = lead.data.New_Email;
if (!to) return { ok: true };

await ctx.records.create("Email Queue", {
  To: to,
  Template: "lead_welcome_v1",
  Payload: JSON.stringify({ name: lead.data.New_Name, leadId: currentId }),
  Status: "Queued",
  Created_At: new Date().toISOString(),
});
return { ok: true };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      recordAction: "Create",
      instantAction: "Function → queue_welcome_email",
    },
    todos: [
      {
        id: "t1",
        text: "Create Email Queue module (To, Template, Payload, Status, Created_At)",
      },
      { id: "t2", text: "Create function `queue_welcome_email`" },
      { id: "t3", text: "Wire workflow on Leads / Create" },
      {
        id: "t4",
        text: "Submit a Lead and confirm an Email Queue row appears",
      },
      {
        id: "t5",
        text: "Have a worker / cron read Status=Queued rows and send them",
      },
    ],
    demoInput: `New Lead with Email "alice@example.com"`,
    demoOutput: `Email Queue row: To, Template, Status: Queued`,
  },

  // 21 — Status change on field change (field-based trigger)
  {
    slug: "status-on-budget-change",
    title: "Auto-bump Status when Budget rises",
    tagline: "When Budget crosses $10k, automatically set Status to 'Hot'.",
    category: "Automation",
    difficulty: "Intermediate",
    estimatedMinutes: 10,
    modules: ["Leads"],
    useCase:
      "Sales reps forget to update Status after a budget change — let the system do it for them.",
    script: `// status_on_budget
const currentId = ctx.input?.recordId;
if (!currentId) return { ok: true };
const lead = await ctx.records.get("Leads", currentId);
if (!lead) return { ok: true };

const budget = Number(lead.data.Budget || 0);
const status = lead.data.Status;
if (budget >= 10000 && status !== "Hot") {
  return { Status: "Hot" };
}
if (budget < 10000 && status === "Hot") {
  return { Status: "Warm" };
}
return { ok: true };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-field",
      conditions: "Watch the `Budget` field",
      instantAction: "Function → status_on_budget",
    },
    todos: [
      {
        id: "t1",
        text: "Add Budget (number) and Status (select: Cold, Warm, Hot) on Leads",
      },
      { id: "t2", text: "Create function `status_on_budget`" },
      {
        id: "t3",
        text: "Wire workflow with executeBasedOn: record-field, watching Budget",
      },
      {
        id: "t4",
        text: "Edit Budget up to 12000 and verify Status flips to Hot",
      },
    ],
    demoInput: `Update Lead Budget from 5000 → 12000`,
    demoOutput: `Status: "Hot"`,
  },

  // 22 — Bulk cleanup
  {
    slug: "bulk-deactivate-stale",
    title: "Bulk-deactivate Leads older than 180 days",
    tagline:
      "One-shot cleanup — archive Leads the team hasn't touched in 6 months.",
    category: "Cleanup",
    difficulty: "Advanced",
    estimatedMinutes: 15,
    modules: ["Leads"],
    useCase:
      "Quarterly hygiene — clear the view so reps focus on active Leads.",
    script: `// bulk_deactivate_stale
const DAYS = 180;
const cutoff = Date.now() - DAYS * 24 * 3600 * 1000;

const leads = await ctx.records.list("Leads", { limit: 500 });
let updated = 0;
for (const l of leads) {
  if (new Date(l.updatedAt).getTime() < cutoff && l.data.Is_Active !== false) {
    await ctx.records.update("Leads", l.id, { Is_Active: false, Deactivated_At: new Date().toISOString() });
    updated++;
  }
}
ctx.info(\`Deactivated \${updated} stale Leads\`);
return { deactivated: updated };`,
    workflow: {
      module: "Leads",
      executeBasedOn: "record-action",
      instantAction: "(manual run from editor, or scheduled)",
    },
    todos: [
      {
        id: "t1",
        text: "Add Is_Active (checkbox, default true) and Deactivated_At (datetime) on Leads",
      },
      { id: "t2", text: "Create function `bulk_deactivate_stale`" },
      { id: "t3", text: "Run from editor — review output" },
      {
        id: "t4",
        text: "Filter Leads by Is_Active = true in your default view",
      },
    ],
    demoInput: `100 Leads, 35 untouched in 180d`,
    demoOutput: `35 deactivated; active view shrinks accordingly`,
  },
];

export function getGuide(slug: string): Guide | undefined {
  return guides.find((g) => g.slug === slug);
}

export function getAllSlugs(): string[] {
  return guides.map((g) => g.slug);
}

export const categories: GuideCategory[] = [
  "Getting Started",
  "Data Quality",
  "Automation",
  "Assignment",
  "Validation",
  "Enrichment",
  "Notifications",
  "Reporting",
  "Integration",
  "Cleanup",
];

/** Ordered slugs for the foundation sequence shown on the docs index. */
export const foundationSequence = [
  "create-your-first-module",
  "create-your-first-form",
  "design-form-with-fields",
  "discover-api-names",
  "hello-world-function",
  "first-workflow-rule",
];
