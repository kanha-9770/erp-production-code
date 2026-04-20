# Step-by-Step: Your First Binding

A complete walkthrough using **one example** all the way through. By the end
you'll understand how form data → script → field updates flows through the
system. No prior knowledge assumed.

> **The example we'll build:**
> When someone submits a Lead with an email ending in `.ru`, the form is
> blocked with the message "Email domain not allowed".

---

## Mental model first (30 seconds)

```
   ┌────────────┐                              ┌─────────────┐
   │            │                              │             │
   │   USER     │  fills form, clicks Submit   │  YOUR APP   │
   │            ├─────────────────────────────▶│             │
   │            │                              │             │
   └────────────┘                              └──────┬──────┘
                                                      │
                                                      │ "Run any 'beforeSubmit'
                                                      │  bindings on this module"
                                                      ▼
                                              ┌──────────────┐
                                              │   BINDING    │
                                              │ Leads · before│
                                              │ submit · X   │
                                              └──────┬───────┘
                                                      │
                                                      │ "Run function X with
                                                      │  all the form's fields"
                                                      ▼
                                              ┌──────────────┐
                                              │   YOUR JS    │
                                              │ (the script  │
                                              │  you wrote)  │
                                              └──────┬───────┘
                                                      │
                                                      │ Returns { ok: true }
                                                      │ or { ok: false, error }
                                                      ▼
                                              ┌──────────────┐
                                              │ ALLOW or     │
                                              │ BLOCK submit │
                                              └──────────────┘
```

That's the whole loop. Let's build it.

---

## STEP 1 — Look at the form first

Before writing any code, **know what fields exist on your form**. Pretend
this is your Lead Capture form:

```
┌──────────────────────────────────────┐
│  Lead Capture                        │
├──────────────────────────────────────┤
│  First Name:    [ Alice          ]  │
│  Last Name:     [ Smith          ]  │
│  Email Address: [ alice@x.ru     ]  │
│  Phone Number:  [ +91 9999988888 ]  │
│  Pin Code:      [ 411014         ]  │
│                                      │
│              [ Submit ]              │
└──────────────────────────────────────┘
```

Five fields: **First Name**, **Last Name**, **Email Address**, **Phone Number**, **Pin Code**.

---

## STEP 2 — Find the API Names of those fields

Your script will refer to fields by their **API Name** — a clean,
underscore-style version of the label. The system computes these for you.

**To see them:** *Settings → APIs and SDKs → API names tab → click your
module ("Leads")*.

You'll see a table like:

| Field Label    | API Name       | Data Type |
| -------------- | -------------- | --------- |
| First Name     | `First_Name`   | text      |
| Last Name      | `Last_Name`    | text      |
| Email Address  | `Email_Address`| email     |
| Phone Number   | `Phone_Number` | phone     |
| Pin Code       | `Pin_Code`     | text      |

**This is your cheat sheet.** When the script runs, every field will be
available as `ctx.input.<API_Name>`. So:

```js
ctx.input.First_Name      // → "Alice"
ctx.input.Email_Address   // → "alice@x.ru"
ctx.input.Pin_Code        // → "411014"
```

You don't pick the API Names. You don't configure anything. They just exist.

---

## STEP 3 — Create the function

*Settings → Functions → + Add*

```
┌─────────────────────────────────────────────┐
│  New Function                               │
├─────────────────────────────────────────────┤
│  Name:         [ VALIDATE_EMAIL_DOMAIN  ]   │
│  Display Name: [ Block .ru emails        ]  │
│  Category:     [ Automation              ]  │
│  Language:     [ JavaScript          ▾  ]   │
│                                             │
│              [ Create ]                     │
└─────────────────────────────────────────────┘
```

Click **Create**. The editor opens. Now write the script:

```js
// Step A: read the email out of the form data
const email = ctx.input.Email_Address || "";

// Step B: check the rule
if (email.endsWith(".ru")) {
  // Step C: tell the runtime to BLOCK the submission
  return { ok: false, error: "Email domain not allowed" };
}

// Step D: nothing wrong — let the submission go through
return { ok: true };
```

**Click Save.** That's it.

> **Why this works:** the function isn't doing anything fancy. It reads
> from `ctx.input` (which the runtime fills for it), checks a condition,
> and returns either `{ ok: true }` (allow) or `{ ok: false, error }`
> (block). The `{ ok, error }` shape is the **convention** the system
> recognizes for "before submit" events.

---

## STEP 4 — Associate the function with the module

*Settings → APIs and SDKs → Function Bindings tab (it's the default)*

You'll see a row for every module:

```
┌──────────────────────────────────────────────────────────────────┐
│  ◆ Leads                          0 functions   [+ Associate]    │
│     No functions associated. Click Associate Function to wire one.│
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  ◆ Contacts                       0 functions   [+ Associate]    │
└──────────────────────────────────────────────────────────────────┘
```

Click **+ Associate** on the **Leads** row. A small dialog opens:

```
┌─────────────────────────────────────────────┐
│  Associate a function                       │
├─────────────────────────────────────────────┤
│  Module: Leads. The script will receive     │
│  every field as ctx.input.<API_Name>        │
│  automatically — no mapping needed.         │
│                                             │
│  Function:  [ Block .ru emails        ▾ ]   │
│  When:      [ Before submit            ▾ ]  │
│             Awaited before save. Return     │
│             { ok: false, error } to block.  │
│  ☑ Active                                   │
│                                             │
│              [ Cancel ]   [ Associate ]    │
└─────────────────────────────────────────────┘
```

Pick:

- **Function:** `Block .ru emails`
- **When:** `Before submit`
- **Active:** ✓

Click **Associate**. Done. The Leads row now shows:

```
┌──────────────────────────────────────────────────────────────────┐
│  ◆ Leads                          1 function    [+ Associate]    │
│  Function           When          Scope    Status                │
│  Block .ru emails   Before submit Module   Active   ✏️ ⏻ 🗑    │
└──────────────────────────────────────────────────────────────────┘
```

---

## STEP 5 — Test it

Open the **Lead Capture** form. Type:

- Email Address: `alice@bad.ru`

Click **Submit**.

You'll get an error popup: **"Email domain not allowed"**. The record
was NOT created. Now change the email to `alice@good.com` and submit
again — it works, the record is saved.

🎉 You wrote and bound a function with no field mapping, no IDs, no JSON.

---

## What just happened, second by second

When you clicked Submit:

```
1. Browser POSTs the form to:
     POST /api/forms/<Lead-Capture-form-id>/submit
     body: { recordData: { <fieldId-1>: "Alice", <fieldId-2>: "alice@bad.ru", ... } }

2. The server validates the data, then asks:
     "Are there any 'beforeSubmit' bindings on Lead Capture's module (Leads)?"
   YES — your binding.

3. The runner builds the script's input bag:
     ctx.input = {
       First_Name:    "Alice",         ← packed by API Name
       Last_Name:     "Smith",
       Email_Address: "alice@bad.ru",
       Phone_Number:  "+91 9999988888",
       Pin_Code:      "411014",
     }
   Plus ctx.userId, ctx.organizationId from the session.

4. The runner runs your script in a sandbox:
     const email = "alice@bad.ru";       // from ctx.input.Email_Address
     email.endsWith(".ru") === true      // true!
     return { ok: false, error: "Email domain not allowed" };

5. The runner sees ok: false. It returns 400 to the browser:
     { error: "Email domain not allowed" }

6. The form shows the error. Nothing was saved.
```

If the email had been `alice@good.com`:

```
4. The script returns { ok: true }
5. The server proceeds with the save.
6. AFTER the save, "afterCreate" bindings would fire (if any).
```

---

## How "writing a function" relates to "the binding"

This is where most people get confused. Here's the rule:

> The **binding** decides **WHEN** your script runs and **WHICH MODULE'S
> DATA** it sees. The **script** decides **WHAT TO DO** with that data.

The script doesn't know or care which form triggered it. It just knows:

- `ctx.input.<API_Name>` will have whatever the form had at submit time
- `ctx.recordId` will have the new id (if it's an after\* event)
- `ctx.records.*` lets it touch other modules

So when you write a script, **think about API Names, not bindings**. The
binding is just the configuration row that says "use this script here."

### A concrete checklist before writing any script

Before opening the editor, ask yourself:

1. **What module is this for?** → tells you which API Names to use
2. **When should it run?** → picks the event:
   - Validate something? → **Before submit**
   - React to a save? → **After create**
   - Update on edit? → **After update**
   - Triggered manually / by code? → **Manual**
3. **What fields will I read?** → check Settings → APIs and SDKs → API names
4. **Should I write back to fields?** → use `return { API_Name: value }`
   for `onFieldChange` / `manual`; or `ctx.records.update` for `after*`

---

## Three more examples to cement the pattern

### Example A — Auto-fill city/state from a pincode (After create)

**Module:** Leads. **When:** After create.

Fields used: `Pin_Code` (read), `City` and `State` (written).

```js
const pin = ctx.input.Pin_Code;
if (!pin) return;  // nothing to look up

const r = await fetch(`https://pincodes.example.com/${pin}`);
const { city, state } = await r.json();

// We're "after create" — the record exists. Patch it:
await ctx.records.update("Leads", ctx.recordId, {
  City:  city,
  State: state,
});
```

Why `ctx.records.update` instead of returning `{ City, State }`?
Because **after-create** runs *after* the save — there's no live form to
patch, only the saved record. The return-value-populates-fields trick is
for live-form events (onFieldChange, manual). For after\* events, write
to the record directly.

### Example B — Send a welcome email (After create)

**Module:** Leads. **When:** After create.

```js
// All form fields available, plus ctx.recordId.
const to   = ctx.input.Email_Address;
const name = ctx.input.First_Name;

await fetch("https://mailer.example.com/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    to,
    subject: `Welcome, ${name}!`,
    body: "Thanks for signing up.",
  }),
});

ctx.log("Welcome email sent to", to);
```

Nothing returned — this is a "fire and forget" side effect. No fields
written.

### Example C — Validate two fields against each other (Before submit)

**Module:** Bookings. **When:** Before submit.

```js
const start = new Date(ctx.input.Start_Date);
const end   = new Date(ctx.input.End_Date);

if (isNaN(start) || isNaN(end)) {
  return { ok: false, error: "Both dates are required." };
}
if (end <= start) {
  return { ok: false, error: "End Date must be after Start Date." };
}

return { ok: true };
```

---

## The one rule for return values

| Event             | What `return` does                                                  |
| ----------------- | ------------------------------------------------------------------- |
| **Before submit** | Must return `{ ok: true }` or `{ ok: false, error: "..." }`.        |
| **After create**  | Return value is ignored. Use `ctx.records.update` to write back.    |
| **After update**  | Return value is ignored. Use `ctx.records.update` to write back.    |
| **Manual**        | Whatever you return goes back to the API caller.                    |

For live-form events (`onFieldChange`, `onFieldBlur`) — use the function
editor's Bindings tab (advanced UI). At those events, returning
`{ <API_Name>: value }` populates the matching field live in the form.

---

## Where this stuff lives in the code (for reference)

You don't need to touch any of this — it's already wired up. Listed here
so you can confirm what's running.

| Concern                              | File                                                   |
| ------------------------------------ | ------------------------------------------------------ |
| Function CRUD API                    | [app/api/functions/route.ts](../app/api/functions/route.ts) |
| Function executor (sandboxed runner) | [lib/functions/executor.ts](../lib/functions/executor.ts) |
| Binding runner (auto-mapping etc.)   | [lib/functions/bindingRunner.ts](../lib/functions/bindingRunner.ts) |
| API Name slugifier                   | [lib/functions/apiName.ts](../lib/functions/apiName.ts) |
| Submit-time hook (before/after\*)    | [app/api/forms/[formId]/submit/route.ts](../app/api/forms/[formId]/submit/route.ts) |
| The "Function Bindings" page         | [app/settings/apis/page.tsx](../app/settings/apis/page.tsx) |
| The "Associate" dialog               | [components/functions/AssociateFunctionDialog.tsx](../components/functions/AssociateFunctionDialog.tsx) |

---

## Summary in 5 sentences

1. Every field has an **API Name** (a clean version of its label) — see
   them at *Settings → APIs and SDKs → API names*.
2. Write a JavaScript **function** in *Settings → Functions* that reads
   `ctx.input.<API_Name>` and either returns a value or calls
   `ctx.records.*`.
3. **Associate** that function with a **module** + an **event** in
   *Settings → APIs and SDKs → Function Bindings*.
4. The runtime auto-fills `ctx.input` with every form field by API Name —
   you never configure mapping.
5. Your script's return value blocks submissions (`beforeSubmit`),
   populates fields (`onFieldChange` / `manual`), or is ignored
   (`afterCreate` / `afterUpdate` — use `ctx.records.update` to write
   back instead).

That's the whole system. Open the editor and try the .ru blocker — it
takes about 90 seconds end-to-end.

---

For the deeper reference (every `ctx` method, special tokens, edge cases),
see [FUNCTION_API_GUIDE.md](FUNCTION_API_GUIDE.md). For the conceptual
overview, see [HOW_IT_WORKS.md](HOW_IT_WORKS.md).
