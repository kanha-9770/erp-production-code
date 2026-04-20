# How the Function-Binding System Works

A simple, picture-heavy walkthrough. Read it once and the whole flow makes sense.

---

## TL;DR

You have **forms** (where users type data) and you have **functions**
(JavaScript you wrote). A **binding** is a sticky note that says
*"run this function when something happens to this module."*

That's it. The system handles everything else — wiring fields, calling
the script, applying its return value back to fields — automatically.

---

## The three building blocks

```
   ┌──────────┐         ┌──────────┐         ┌──────────┐
   │ FUNCTION │   +    │  MODULE  │   =     │  BINDING │
   │ (script) │         │ (Leads,  │         │ (when X  │
   │          │         │ Contacts)│         │ happens) │
   └──────────┘         └──────────┘         └──────────┘
```

| Block        | What it is                                                    | Where you see it                  |
| ------------ | ------------------------------------------------------------- | --------------------------------- |
| **Function** | A JavaScript script saved in the system                       | Settings → Functions              |
| **Module**   | A bucket of forms (e.g. "Leads" contains "Lead Capture" form) | Top-level navigation              |
| **Binding**  | A row that says "run function F on module M when event E"     | Settings → APIs and SDKs          |

---

## The 3-click flow to wire something up

```
Step 1: Settings → Functions             Step 2: Settings → APIs and SDKs
┌─────────────────────────────┐          ┌─────────────────────────────────┐
│ + New Function              │          │ Function Bindings (tab)         │
│   Name: VALIDATE_EMAIL      │          │                                 │
│   Language: JavaScript      │          │ Leads        [+ Associate]      │
│                             │          │ Contacts     [+ Associate]      │
│   Script:                   │          │                                 │
│   if (ctx.input.Email_      │          └─────────────────────────────────┘
│       Address.endsWith("    │
│       .ru")) {              │          Step 3: Click [+ Associate] on Leads
│     return { ok: false,     │          ┌─────────────────────────────────┐
│       error: "Blocked" };   │          │ Function: [ VALIDATE_EMAIL  ▾ ] │
│   }                         │          │ When:     [ Before submit   ▾ ] │
│   return { ok: true };      │          │ ☑ Active                        │
│                             │          │              [ Associate ]      │
│ [ Save ]                    │          └─────────────────────────────────┘
└─────────────────────────────┘
```

**Done.** Next time someone submits a Lead, your script runs and can block
the submission if the email ends in `.ru`.

You did **not** need to:

- Pick which fields to pass to the script — they're all there
- Configure input/output mapping — none needed
- Touch any field IDs — the system uses readable API Names

---

## What happens behind the scenes (when a Lead is submitted)

```
   USER fills the Lead Capture form and clicks Submit
                          │
                          ▼
   ┌────────────────────────────────────────────────────────┐
   │ POST /api/forms/<formId>/submit                         │
   │   1. Validate the data                                  │
   │   2. Look up bindings on this form's MODULE             │
   │      with event = "beforeSubmit"                        │
   │   3. For each binding, run its function                 │
   └────────────────────────────────────────────────────────┘
                          │
                          ▼
   ┌────────────────────────────────────────────────────────┐
   │ The runner builds the script's input automatically:     │
   │                                                         │
   │   ctx.input = {                                         │
   │     First_Name:    "Alice",          ← from form        │
   │     Email_Address: "alice@x.ru",     ← from form        │
   │     Pin_Code:      "411014",         ← from form        │
   │     ...                                                 │
   │   }                                                     │
   │   ctx.userId, ctx.organizationId    ← from session      │
   └────────────────────────────────────────────────────────┘
                          │
                          ▼
   ┌────────────────────────────────────────────────────────┐
   │ The script runs in a sandbox.                           │
   │   if (ctx.input.Email_Address.endsWith(".ru")) {        │
   │     return { ok: false, error: "Blocked" };             │
   │   }                                                     │
   │   return { ok: true };                                  │
   └────────────────────────────────────────────────────────┘
                          │
                          ▼
                ┌─────────┴─────────┐
                │                   │
            ok: false             ok: true
                │                   │
                ▼                   ▼
        Submission BLOCKED    Record SAVED
        Error shown to user   afterCreate bindings fire
```

That's the whole loop. **You only ever wrote the script and clicked
Associate.** Everything else is plumbing the system handles.

---

## API Names: the readable identifier

Every form field has three names:

| Name         | Example          | Used for                                |
| ------------ | ---------------- | --------------------------------------- |
| **id**       | `clx9k7m4qr2…`   | Database internals (you never see it)   |
| **label**    | `Email Address`  | What the form-builder shows on screen   |
| **API Name** | `Email_Address`  | What you write in your script           |

So in the script you always type `ctx.input.Email_Address`, not the
ugly cuid. The API Name is computed from the label automatically — you
don't pick it.

**Browse them**: Settings → APIs and SDKs → **API names** tab.

---

## The 4 events you can hook into

When you click "Associate Function", the **When** dropdown has 4 choices.
Pick one based on what you want to do:

| Event             | When it fires                            | Common use                                             |
| ----------------- | ---------------------------------------- | ------------------------------------------------------ |
| **Before submit** | Form is being submitted, before save     | **Validation** — return `{ ok: false, error }` to block |
| **After create**  | A new record was just saved              | **Side effects** — send email, create related record    |
| **After update**  | An existing record was just edited       | **Sync** — update external system, log change           |
| **Manual**        | Never fires automatically                | **Buttons / scheduled jobs** — call from another script |

---

## What the script can do (the `ctx` toolbox)

Inside your script, `ctx` is a frozen object with everything you need:

```js
ctx.organizationId   // your org id
ctx.userId           // current user id
ctx.input            // all form fields, e.g. ctx.input.Email_Address
ctx.recordId         // the saved record id (only for after* events)
ctx.recordData       // raw structured record (only for after* events)

// Look up other modules / records
ctx.modules.list()                              // list every module
ctx.modules.get("Leads")                        // get one module's info

ctx.records.list("Leads", { limit: 10 })        // query records
ctx.records.get("Leads", recordId)              // single record
ctx.records.create("Leads", { Email_Address })  // create new
ctx.records.update("Leads", id, patch)          // patch existing
ctx.records.delete("Leads", recordId)           // delete
ctx.records.count("Leads", where)               // count
ctx.records.fields("Leads")                     // schema

// Logging (shows in the function editor's console)
ctx.log("…")  ctx.info("…")  ctx.warn("…")  ctx.error("…")
console.log("…")  // proxied to ctx.log
```

---

## Three real recipes

### 1. Block bad email domains (Before submit)

```js
const email = ctx.input.Email_Address || "";
if (email.endsWith(".ru") || email.endsWith(".cn")) {
  return { ok: false, error: "Email domain not allowed" };
}
return { ok: true };
```

### 2. Auto-create a follow-up activity (After create)

```js
await ctx.records.create("Activities", {
  Subject:  `Follow up with ${ctx.input.First_Name}`,
  Lead_Id:  ctx.recordId,
  Owner:    ctx.userId,
  Due_At:   new Date(Date.now() + 86400000).toISOString(),  // tomorrow
});
```

### 3. Look up a pincode and fill city/state (After create)

```js
const pin = ctx.input.Pin_Code;
const r = await fetch(`https://pincodes.example.com/${pin}`);
const { city, state } = await r.json();

// Patch the same record we just created with the looked-up values:
await ctx.records.update("Leads", ctx.recordId, {
  City:  city,
  State: state,
});
```

---

## Where to find things in the UI

```
Sidebar
└── Settings
    ├── Functions             ← Write & manage your scripts
    │   └── (open one)        ← Code editor + Bindings tab
    │
    └── APIs and SDKs
        ├── Function Bindings ← Associate functions ↔ modules (DEFAULT)
        ├── API names         ← Read-only reference of every field's API Name
        ├── Dashboard         ← Counts (modules, bindings, etc.)
        └── Credits           ← Usage (placeholder)
```

Two paths to manage bindings — same data, different view:

- **Module-first** (Settings → APIs and SDKs → Function Bindings): "Show me
  everything attached to Leads." Best for governance and discovery.
- **Function-first** (Settings → Functions → open one → Bindings tab):
  "Show me everywhere this function runs." Best for editing one script and
  its hookups together.

---

## Common questions

**Q: Do I have to map each field to my script?**
No. Every field on the module's forms is automatically available as
`ctx.input.<API_Name>`. The dialog shows you the full list under "API names".

**Q: What if I want only some fields, or to rename them?**
Open the function editor → Bindings tab → that's the "advanced" UI with
explicit input/output rows. Use it when you need precision.

**Q: Will renaming a field's label break my script?**
Yes — the API Name is derived from the label, so renaming "Email Address"
to "Contact Email" turns `Email_Address` into `Contact_Email`. Pin to
`ctx.records.fields("Leads")` ids if you need rename-resistance.

**Q: How do I test a script without submitting a record?**
Open the function in Settings → Functions, click **Run** (top right). It
runs the script with whatever `ctx.input` you provide in the test panel.

**Q: My function isn't running. How do I debug?**
1. Settings → APIs and SDKs → Function Bindings — confirm the binding is
   **Active** and on the right module + event.
2. Add `ctx.log("step 1", ctx.input)` lines liberally.
3. After triggering, open the function editor — the Console panel shows
   the latest run's logs and errors.

**Q: Can a script access another organization's data?**
No. Every read/write is org-scoped automatically. You can't reach beyond
your own org.

**Q: Are there limits?**
- 5-second wall-clock per execution.
- 100 `ctx.records.*` / `ctx.modules.*` calls per execution.
- One return per script.

---

## The one-paragraph summary

You write a script. You associate it with a module by picking *when* it
should run (before submit, after create, after update, manual). The
runtime takes care of feeding all form fields into the script as
`ctx.input.<API_Name>`, and applying any `{ API_Name: value }` it returns
back to the matching fields. Three clicks; no field mapping; no IDs.

For the full API surface and edge cases, see
[docs/FUNCTION_API_GUIDE.md](FUNCTION_API_GUIDE.md).
