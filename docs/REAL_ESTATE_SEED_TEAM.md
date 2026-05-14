# Real Estate — Seeded Team Reference

> **Source of truth:** [`scripts/seed-real-estate-team.ts`](../scripts/seed-real-estate-team.ts)
> **Run it with:** `npm run seed:re-team`
> **Re-runs:** wipe + rebuild are idempotent. The root user is never touched.

This document describes the dummy team that the seed script creates so you
can sanity-check the data in the UI, demo features confidently, and know
*who reports to whom* without spelunking the database.

---

## 1. Headline numbers

| Metric | Count |
| --- | --- |
| Top-level **teams** (under root) | **3** (Team A, Team B, Team C) |
| Tier-1 **team leaders** | 3 |
| Tier-2 **sub-leaders** | 8 |
| Tier-3 **agents** | 18 |
| Tier-2/3 **direct-to-leader** exceptions | 1 (Tara Bhat, reports directly to Team C leader) |
| **New users + new agent profiles** created | **30** |
| Hierarchy **depth** | 4 (Root → Leader → Sub-leader → Agent) |
| Org id | `cmotuh90k00jcnx0j9j5og0ez` |
| Root user id | `cmotufdoz00j7nx0jlx3ocypc` |
| Seed login domain | `@seed.local` |
| Seed login password | `Demo@2025` |

---

## 2. Full hierarchy tree

```
ROOT  ┃ Existing main user (cmotufdoz00j7nx0jlx3ocypc)
 │     ┃ Sponsor code: RE-ROOT-0001
 │
 ├──── Team A — Aarav Sharma           leader    · Mumbai
 │      ├─ Vihaan Patel                sub-lead  · Mumbai
 │      │   ├─ Reyansh Mehta           agent     · Mumbai
 │      │   └─ Krishna Reddy           agent     · Thane
 │      ├─ Aditya Verma                sub-lead  · Mumbai
 │      │   ├─ Arjun Nair              agent     · Mumbai
 │      │   └─ Sai Iyer                agent     · Navi Mumbai
 │      └─ Ishaan Kapoor               sub-lead  · Pune
 │          ├─ Vivaan Joshi            agent     · Pune
 │          └─ Aryan Khanna            agent     · Pune
 │
 ├──── Team B — Diya Sharma            leader    · Bengaluru
 │      ├─ Anaya Bose                  sub-lead  · Bengaluru
 │      │   ├─ Saanvi Mishra           agent     · Bengaluru
 │      │   └─ Pari Kulkarni           agent     · Bengaluru
 │      ├─ Aanya Rao                   sub-lead  · Bengaluru
 │      │   ├─ Aadhya Pillai           agent     · Bengaluru
 │      │   └─ Kiara Banerjee          agent     · Mysuru
 │      └─ Myra Singh                  sub-lead  · Hyderabad
 │          ├─ Ananya Chopra           agent     · Hyderabad
 │          └─ Avni Sinha              agent     · Hyderabad
 │
 └──── Team C — Rohan Gupta            leader    · Delhi
        ├─ Karthik Menon               sub-lead  · Delhi
        │   ├─ Kabir Pandey            agent     · Delhi
        │   ├─ Aarush Yadav            agent     · Delhi
        │   └─ Devansh Tiwari          agent     · Faridabad
        ├─ Neel Desai                  sub-lead  · Gurugram
        │   ├─ Riya Chowdhury          agent     · Gurugram
        │   ├─ Meera Saxena            agent     · Gurugram
        │   └─ Naina Malhotra          agent     · Noida
        └─ Tara Bhat                   agent     · Noida          ← reports DIRECTLY to Rohan Gupta
```

### Reading the tree

- Indentation = hierarchy depth.
- Every arrow up the tree (`parent`) is also the **sponsor** relationship — every seed agent's `sponsorId == parentId`. That's the typical referral chain.
- The MLM downline check follows `parentId`. Every agent shown above belongs to the **root user's downline**, so the root sees everyone in `/real-estate/agents/tree`.

---

## 3. By team — who reports to whom

### Team A — *Mumbai / Pune region* (10 agents)

| # | Tier | Name | City | Reports to |
| - | --- | --- | --- | --- |
| 1 | Leader | **Aarav Sharma** | Mumbai | Root |
| 2 | Sub-leader | Vihaan Patel | Mumbai | Aarav Sharma |
| 3 | Sub-leader | Aditya Verma | Mumbai | Aarav Sharma |
| 4 | Sub-leader | Ishaan Kapoor | Pune | Aarav Sharma |
| 5 | Agent | Reyansh Mehta | Mumbai | Vihaan Patel |
| 6 | Agent | Krishna Reddy | Thane | Vihaan Patel |
| 7 | Agent | Arjun Nair | Mumbai | Aditya Verma |
| 8 | Agent | Sai Iyer | Navi Mumbai | Aditya Verma |
| 9 | Agent | Vivaan Joshi | Pune | Ishaan Kapoor |
| 10 | Agent | Aryan Khanna | Pune | Ishaan Kapoor |

### Team B — *Bengaluru / Hyderabad region* (10 agents)

| # | Tier | Name | City | Reports to |
| - | --- | --- | --- | --- |
| 11 | Leader | **Diya Sharma** | Bengaluru | Root |
| 12 | Sub-leader | Anaya Bose | Bengaluru | Diya Sharma |
| 13 | Sub-leader | Aanya Rao | Bengaluru | Diya Sharma |
| 14 | Sub-leader | Myra Singh | Hyderabad | Diya Sharma |
| 15 | Agent | Saanvi Mishra | Bengaluru | Anaya Bose |
| 16 | Agent | Pari Kulkarni | Bengaluru | Anaya Bose |
| 17 | Agent | Aadhya Pillai | Bengaluru | Aanya Rao |
| 18 | Agent | Kiara Banerjee | Mysuru | Aanya Rao |
| 19 | Agent | Ananya Chopra | Hyderabad | Myra Singh |
| 20 | Agent | Avni Sinha | Hyderabad | Myra Singh |

### Team C — *NCR region* (10 agents, incl. 1 direct-to-leader)

| # | Tier | Name | City | Reports to |
| - | --- | --- | --- | --- |
| 21 | Leader | **Rohan Gupta** | Delhi | Root |
| 22 | Sub-leader | Karthik Menon | Delhi | Rohan Gupta |
| 23 | Sub-leader | Neel Desai | Gurugram | Rohan Gupta |
| 24 | Agent ⚡ | **Tara Bhat** | Noida | Rohan Gupta *(direct — no sub-leader)* |
| 25 | Agent | Kabir Pandey | Delhi | Karthik Menon |
| 26 | Agent | Aarush Yadav | Delhi | Karthik Menon |
| 27 | Agent | Devansh Tiwari | Faridabad | Karthik Menon |
| 28 | Agent | Riya Chowdhury | Gurugram | Neel Desai |
| 29 | Agent | Meera Saxena | Gurugram | Neel Desai |
| 30 | Agent | Naina Malhotra | Noida | Neel Desai |

> ⚡ **Direct-to-leader exception.** Tara Bhat (#24) is a regular Tier-3
> agent but reports *directly* to the Team C leader (Rohan Gupta) instead
> of going through a sub-leader. This is intentional — the schema allows
> any depth and the seed includes one such case so downline visibility
> code is exercised on the irregular branch too.

---

## 4. Login credentials

Every seeded user has the same login pattern:

```
email    : <firstname>.<lastname>.<index>@seed.local
password : Demo@2025
```

Where `<index>` is the position in [`TREE`](../scripts/seed-real-estate-team.ts)
(starting at 1). A few examples:

| Person | Email | Tier | Sees |
| --- | --- | --- | --- |
| Root user | *(your existing main user — unchanged)* | Root | Everyone in the org |
| Aarav Sharma | `aarav.sharma.1@seed.local` | Team A leader | Self + Team A's 9 reports |
| Diya Sharma | `diya.sharma.11@seed.local` | Team B leader | Self + Team B's 9 reports |
| Rohan Gupta | `rohan.gupta.21@seed.local` | Team C leader | Self + Team C's 9 reports (incl. Tara) |
| Ishaan Kapoor | `ishaan.kapoor.4@seed.local` | A sub-leader | Self + Vivaan + Aryan |
| Tara Bhat | `tara.bhat.24@seed.local` | Direct agent | Just Tara (no downline) |
| Reyansh Mehta | `reyansh.mehta.5@seed.local` | Team A agent | Just Reyansh |

> **Sponsor codes** are deterministic per index — re-running the seed
> regenerates the same `RE-XXXX-XXXX` code for each seat. The script logs
> every code at the end of the run; if you need a specific person's, tail
> the seed output.

---

## 5. What each agent has out of the box

Every seeded agent profile carries:

| Field | Value |
| --- | --- |
| `status` | `ACTIVE` |
| `complianceStatus` | `COMPLIANT` (no KYC blockers for demos) |
| `sponsorCode` | Unique, deterministic, format `RE-XXXX-XXXX` |
| `sponsorId` | Same as `parentId` (referral chain matches org chart) |
| `serviceAreas` | One city, per the tree above |
| `specializations` | Leaders → `RESIDENTIAL` + `COMMERCIAL`; everyone else → `RESIDENTIAL` |
| `bio` | One-line role-flavoured description |
| `joinedAt` | Backdated 1 day per agent so timelines feel real |

The user record carries `email_verified: true`, `status: ACTIVE`,
`mobile_verified: true`, and a deterministic test mobile in `+91 990xxxxxxx`
format.

---

## 6. Permissions wired up automatically

The script also (re-)provisions the supporting access layer so the seeded
agents *work* on first login — no manual role assignment:

- **Role** `Real Estate Agent` — find-or-create, scoped to the org.
- **Organization Unit** `Real Estate` — find-or-create.
- **FormModule** `Real Estate` + **StaticPageAnchor** for `group:Real Estate`
  so the sidebar's Real Estate group hosts every static page from
  [`lib/static-pages.ts`](../lib/static-pages.ts).
- **RoutePermission + RouteRoleAccess** grants for:
  - `/real-estate`, `/real-estate/**`, `/real-estate/join/**`,
    `/real-estate/onboard`, `/profile`, `/profile/**`.
- **UserUnitAssignment** linking every seeded user (including the root)
  to the Real Estate Agent role inside the Real Estate unit.

When a seeded agent logs in, the middleware ([`middleware.ts`](../middleware.ts))
sees their allowed routes resolve only to `/real-estate/**` + `/profile/**`,
and the sidebar ([`components/layout/sidebar.tsx`](../components/layout/sidebar.tsx))
auto-expands the Real Estate group since they're the auto-provisioned
agent role.

---

## 7. Data visibility — what each role sees

This is governed by [`lib/api-handlers/real-estate-agents.ts`](../lib/api-handlers/real-estate-agents.ts)
(see `resolveAgentViewerScope`). Concrete examples in the seeded data:

| Logged-in as… | `/real-estate/agents` shows | `/real-estate/agents/tree` shows | Other agents' details (`/agents/[id]`) |
| --- | --- | --- | --- |
| **Root user** (admin) | All 30 seeded + self | Whole org tree, free `rootId` | Any agent |
| **Aarav Sharma** (Team A leader) | Aarav + 9 reports | Aarav's subtree only, rooted at himself | Any agent in his subtree; **404** for anyone outside |
| **Ishaan Kapoor** (sub-leader) | Ishaan + Vivaan + Aryan | Ishaan + Vivaan + Aryan | Self + 2 reports; **404** for everyone else |
| **Reyansh Mehta** (agent) | Just Reyansh | Just Reyansh (no downline) | Self only |

Upline information (sponsor, parent) is **stripped from API responses**
for non-privileged callers — a new agent can never see who recruited
them or who recruited their team leader.

---

## 8. Lead system tie-in

Leads created by these agents follow the dual-origin system described in
[`REAL_ESTATE_MODULE_GUIDE.md`](./REAL_ESTATE_MODULE_GUIDE.md):

- An agent-captured lead is visible only to that agent (and admin).
- If two agents capture the same person (phone, email, **or** photo —
  Hamming-matched on dHash + pHash), the second lead is silently flagged
  as a duplicate of the first.
- Admin reviews duplicates at [`/real-estate/admin/duplicates`](../app/real-estate/admin/duplicates/page.tsx).

The seed script intentionally leaves **no leads** behind so the admin
duplicates page starts empty — you create the test cases yourself when
demoing the silent-dup detection.

---

## 9. Resetting / re-seeding

```powershell
# Stop next dev first (Windows DLL lock on the Prisma engine), then:
npx prisma db push      # apply schema changes
npx prisma generate     # regenerate typed client
npm run seed:re-team    # wipe + reseed the team
```

The script is **idempotent**. Each run:

1. Deletes every real-estate row in the target org (transactions,
   wallets, leads, properties, agent profiles, area ledger, invites,
   buyers).
2. Deletes every previous seed user (`@seed.local`) + their unit
   assignments.
3. Re-creates the role / unit / module / anchors / route grants if
   they're missing.
4. Re-creates the root user's `AgentProfile` cleanly.
5. Re-creates all 30 dummy users + agent profiles + assignments.

Non-seed users (your real accounts) and non-target organisations are
**never** touched.

---

## 10. Tweaking the tree

The whole structure is data-driven by the `TREE` constant in
[`scripts/seed-real-estate-team.ts`](../scripts/seed-real-estate-team.ts).
To change names / cities / branching, edit that array and re-run.
The only invariant the script enforces is `TREE.length === 30` — bump
the count or the assertion if you need a different size.

```ts
interface SeedAgent {
  firstName: string;
  lastName: string;
  parentIndex: number;     // -1 = root, otherwise index into the same array
  tier: "leader" | "sub-leader" | "agent";
  city?: string;
}
```

`parentIndex` *must* point to an entry **earlier in the array** — the
script inserts top-down and looks up the parent's freshly-minted
AgentProfile id in a `Map` as it goes.
