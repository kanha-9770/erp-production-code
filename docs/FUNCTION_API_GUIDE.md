# Function API Guide

This is a quick reference for writing JavaScript functions that read and write
records, with a focus on **API Names** — the stable, human-readable
identifiers shown in **Settings → APIs and SDKs**.

---

## What is an API Name?

Every form field has three identifiers:

| Identifier | Example                  | Where it comes from        | Stable across renames? |
| ---------- | ------------------------ | -------------------------- | ----------------------- |
| `id`       | `clx9k7m4qr2…`           | DB cuid, generated         | ✅ Yes                   |
| `label`    | `Email Address`          | What the form-builder shows | ❌ No                   |
| `apiName`  | `Email_Address`          | PascalCase slug of label    | ⚠️ Yes, until you rename the label |

API Names are the recommended identifier for scripts. They're stable enough
for most workflows and far easier to read than cuids. If you need rock-solid
stability (e.g. an external integration), use the field's `id`.

You can browse every module + form's API Names at **Settings → APIs and
SDKs → API names**.

---

## Zero-config default — no mapping needed

When you create a binding **without** filling in any input or output rows,
the runner auto-wires both directions for you:

- **`ctx.input` is the form snapshot** — every field is exposed under its
  apiName (and its label as an alias). For an `afterCreate` binding on a
  Leads form, your script sees:

  ```js
  ctx.input.Email_Address  // "alice@x.com"
  ctx.input.Pin_Code       // "411014"
  ctx.input["Email Address"] // same value, by label
  ```

- **The script's return value populates fields automatically** — any key in
  the returned object that matches a field's apiName is written to that
  field. So:

  ```js
  return { City: "Mumbai", State: "MH" };
  ```

  populates the `City` and `State` fields with no output-mapping rows.

You only add explicit mapping rows when you need to:

| You want to…                          | How                                                |
| ------------------------------------- | -------------------------------------------------- |
| Rename a field for shorter syntax     | input row: key=`email`, source=`Email Address`     |
| Pass a literal constant               | input row: key=`taxRate`, source=`0.18`            |
| Restrict what the script can read     | declare only the rows you want — the rest are gone |
| Use a context value (`$userId`, etc.) | input row with the special token on the right     |
| Match a return key with an unrelated field name | output row: key=`computed`, target=`Net_Amount` |

The dialog shows a green **"Auto-mapped."** hint when both rows are empty so
you always know which mode you're in.

---

## The `ctx` object

Every function receives a frozen `ctx` object with the following surface:

```js
ctx.organizationId   // string — current org
ctx.userId           // string — caller's user id
ctx.input            // object — auto-populated form snapshot (keyed by apiName + label),
                     //          OR what your inputMapping rows declared

ctx.recordId         // string | null  — only set for after* events
ctx.recordData       // object | null  — frozen structured record (after* events)
ctx.triggerField     // string | null  — apiName of the field that fired (field-level events)

ctx.modules.list()                          // → [{ id, name }]
ctx.modules.get(moduleName)                 // → { id, name, formId, formName }

ctx.records.list(moduleName, options)       // → row[]
ctx.records.get(moduleName, recordId)       // → row | null
ctx.records.create(moduleName, data)        // → { id, formId }
ctx.records.update(moduleName, id, patch)   // → { id, data, recordData }
ctx.records.delete(moduleName, recordId)    // → { ok, id }
ctx.records.count(moduleName, where?)       // → number
ctx.records.fields(moduleName)              // → [{ id, label, type, apiName }]

ctx.log(...)   ctx.info(...)   ctx.warn(...)   ctx.error(...)
console.log(...) // proxied to ctx.log
```

A **row** returned by `list` / `get` / `update` looks like:

```js
{
  id:         "clx9...",
  formId:     "clx9...",
  data: {
    "Email Address":  "alice@x.com",   // by label
    Email_Address:    "alice@x.com",   // by apiName  (use this!)
    "Pin Code":       "411014",
    Pin_Code:         "411014",
    // ...
  },
  recordData: { /* raw structured shape — usually ignore */ },
  createdAt, updatedAt, userId, status,
}
```

Every field appears under **both** its label and its apiName. Pick whichever
reads better in your script — apiName is recommended because it never
contains spaces.

---

## Reading a record (apiName style)

```js
const lead = await ctx.records.get("Leads", ctx.input.recordId);
if (!lead) {
  return { ok: false, error: "Lead not found" };
}

const email = lead.data.Email_Address;
const score = Number(lead.data.Lead_Score) || 0;
```

---

## Creating a record

```js
const created = await ctx.records.create("Leads", {
  // Use apiNames as keys — they're case-sensitive.
  First_Name:    ctx.input.firstName,
  Last_Name:     ctx.input.lastName,
  Email_Address: ctx.input.email,
  Lead_Source:   "Website",
});

return { newLeadId: created.id };
```

`ctx.records.create` accepts keys in any of these forms — it picks the
first match in this order: **fieldId** → **apiName** → **label**.

```js
// All three equivalent:
ctx.records.create("Leads", { Email_Address: "x@y.com" });
ctx.records.create("Leads", { "Email Address": "x@y.com" });
ctx.records.create("Leads", { "clx9k7…": "x@y.com" }); // discouraged
```

Unknown keys are kept (under a `__custom` section) instead of being silently
dropped, so a typo won't lose data — but it also won't write to a real field.
**Mistakes are easier to spot when you use apiNames.**

---

## Updating a record

```js
await ctx.records.update("Leads", lead.id, {
  Lead_Status: "Qualified",
  Last_Contacted_At: new Date().toISOString(),
});
```

`update` is a **patch** — only the keys you pass are written. Other fields
on the record are left alone.

---

## Querying

```js
// First 10 leads created today
const today = new Date(); today.setHours(0,0,0,0);
const recent = await ctx.records.list("Leads", {
  limit: 10,
  where: { createdAt: { gte: today } },
});

for (const lead of recent) {
  ctx.log(lead.data.Email_Address, lead.data.Lead_Status);
}

const total = await ctx.records.count("Leads", { status: "submitted" });
```

`where` is a Prisma-style filter passed straight through to the underlying
`findMany`. The full Prisma query API is available — `equals`, `in`, `gt`,
`gte`, `lt`, `lte`, `contains`, `startsWith`, `OR`, `AND`, `NOT`.

---

## Discovering field schemas at runtime

```js
const fields = await ctx.records.fields("Leads");
// → [{ id, label, type, apiName }, ...]

const requiredApiNames = fields
  .filter(f => f.type === "email" || f.type === "phone")
  .map(f => f.apiName);

ctx.log("Required contact fields:", requiredApiNames);
```

Useful when writing one generic function that handles multiple modules.

---

## Bindings: how `ctx.input` gets populated

A **binding** wires your function to a form/field/event.

**Default (no rows configured)** — `ctx.input` is the form snapshot, every
field exposed by its apiName. Plus `ctx.userId`, `ctx.organizationId`,
`ctx.recordId`, `ctx.recordData`, and `ctx.triggerField` are always on
`ctx` directly. So:

```js
const email = ctx.input.Email_Address;
const userId = ctx.userId;
const recordId = ctx.recordId;            // only for after* events
```

**Explicit rows** — when you do add input rows, only those keys appear on
`ctx.input`. Picking a field auto-fills the script-key with its apiName so
the configuration mirrors the code:

```
input mapping:
  Pin_Code      →  [Pin Code]    Pin_Code
  Email_Address →  [Email]       Email_Address
```

…and:

```js
const pin   = ctx.input.Pin_Code;
const email = ctx.input.Email_Address;
```

Special tokens you can pick on the right side of an input row:

| Token              | Value at runtime                                     |
| ------------------ | ---------------------------------------------------- |
| `$userId`          | The caller's user id (also at `ctx.userId`)          |
| `$organizationId`  | Current org id (also at `ctx.organizationId`)        |
| `$recordId`        | Persisted record id (also at `ctx.recordId`)         |
| `$formData`        | Whole form snapshot keyed by fieldId                 |
| `$recordData`      | Whole structured record (also at `ctx.recordData`)   |
| `$triggerFieldId`  | The fieldId that fired (its apiName is at `ctx.triggerField`) |

---

## Output mapping: how return values populate fields

For `onFieldChange` / `onFieldBlur` / `manual` bindings, your script's
return value populates fields. **By default, no output mapping is needed** —
any key in the returned object that matches a field's apiName is written to
that field automatically.

```js
// Function: LOOKUP_PINCODE — no output rows configured
const pin = ctx.input.Pin_Code;
const r = await fetch(`https://pincodes.example.com/${pin}`);
const { city, state } = await r.json();
return { City: city, State: state };  // ← populates the City and State fields automatically
```

If you want to **restrict** which return keys are honored or **rename** a
return key to point at a differently-named field, add output rows. Picking
a field auto-fills the script-key with its apiName, so the explicit
configuration looks just like the auto behavior:

```
output mapping (optional):
  City  →  [City]   City
  State →  [State]  State
```

Keys named `ok` and `error` are **never** written to fields — they're
reserved for the beforeSubmit convention.

For **`beforeSubmit`** bindings, the convention is different — return
`{ ok, error? }`:

```js
// Function: VALIDATE_EMAIL_DOMAIN
const email = ctx.input.Email_Address || "";
if (email.endsWith(".ru")) {
  return { ok: false, error: "Email domain not allowed" };
}
return { ok: true };
```

If `ok` is `false`, the form submission is blocked with a 400 and the
`error` text is shown to the user.

---

## Recipes

### Auto-fill from a lookup

Bind a function to **`onFieldChange`** of `Pin_Code`. The function calls an
external API and returns `{ City, State }`. Output map City/State to the
matching fields.

### Cross-module side effect

Bind to **`afterCreate`** — no input or output mapping needed. When a new
`Lead` is submitted:

```js
// All form fields available as ctx.input.<API_Name>
// ctx.recordId is the new Lead's id
await ctx.records.create("Activities", {
  Subject:    `New lead: ${ctx.input.First_Name} ${ctx.input.Last_Name}`,
  Lead_Id:    ctx.recordId,
  Owner:      ctx.userId,
  Due_At:     new Date(Date.now() + 86400000).toISOString(),
});
```

### Validation that compares two fields

```js
// beforeSubmit binding on the form
const start = new Date(ctx.input.Start_Date);
const end   = new Date(ctx.input.End_Date);
if (end <= start) {
  return { ok: false, error: "End Date must be after Start Date" };
}
return { ok: true };
```

### Read the field schema and act dynamically

```js
const fields = await ctx.records.fields("Leads");
const dropdownFields = fields.filter(f => f.type === "select");
ctx.info("Dropdown fields:", dropdownFields.map(f => f.apiName));
```

---

## Limits & guardrails

- **Wall-clock timeout:** 5 seconds per execution.
- **Async op limit:** 100 `ctx.records.*` / `ctx.modules.*` calls per
  execution. Loops doing one DB call per iteration will hit this fast —
  prefer `list({ limit })` over many `get` calls.
- **Org-scoped:** every read/write is automatically restricted to the
  caller's organization. You cannot reach other tenants.
- **No raw Prisma:** `ctx.records.*` is the only DB door. There is no
  `prisma` global.
- **Fire-and-forget for `afterCreate` / `afterUpdate`:** errors won't block
  the form submission, but they are logged. Always log inputs and errors so
  you can trace failures.

---

## Common mistakes

| Mistake                                                       | Symptom                                              |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| Using `record.data["Email Address"]` (with space) inconsistently with apiName | Works but inconsistent — pick one. Prefer apiName. |
| Forgetting `await` on a `ctx.records.*` call                  | Script returns `[Promise]` instead of the data       |
| Returning a plain value when output mapping expects an object | Only the first mapped field is populated             |
| Returning `{}` from `beforeSubmit` instead of `{ ok: true }`  | Submission is blocked silently                       |
| Using a label that has trailing spaces ("Email " vs "Email")  | Lookup misses — labels are normalized in the runtime, but apiNames never have spaces |

---

## Where to go next

- **Settings → APIs and SDKs** — browse every module's fields and their
  apiNames. Click a field to see/manage its bindings.
- **Settings → Functions → (your function) → Bindings** — alternative entry
  point for managing bindings per-function.
- This file: `docs/FUNCTION_API_GUIDE.md`.
