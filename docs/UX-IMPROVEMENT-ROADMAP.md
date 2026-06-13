# ERP UX Improvement Roadmap

> A prioritized, evidence-based plan for making the ERP feel faster, more polished, and more
> "advanced." Every recommendation is grounded in what already exists in this codebase, so the work
> is mostly *standardizing and extending* patterns you already have — not rebuilding.

**Stack context:** Next.js 16 · React 19 · Radix/shadcn (52 UI primitives) · Tailwind · RTK Query +
React Context · Prisma/Supabase · `sonner` + custom toast · `next-themes` · streaming NDJSON imports.

**The single most important fact driving this whole document:** the Supabase pooler is **~1.3 s per
query** from the production host (see `memory/db-roundtrip-latency.md`). This means *perceived speed*
— not raw features — is the dominant UX problem. A user who clicks "Save" and stares at a frozen
button for 1.3 s feels the whole product is slow, no matter how good the table is. **Most of Tier 1
below is about hiding that latency.**

---

## TL;DR — The 6 highest-leverage changes

| # | Change | Why it matters | Effort |
|---|--------|----------------|--------|
| 1 | **Optimistic UI everywhere** (React 19 `useOptimistic`) | Kills the 1.3 s "frozen button" feeling on every save/edit/delete | M |
| 2 | **A shared skeleton + `loading.tsx` strategy** | 206 pages, only 3 `loading.tsx` (all return `null`) → blank screens on navigation | M |
| 3 | **Global Cmd/Ctrl-K command palette with *actions*** | You already have `GlobalSearchDialog` + cmdk; wire the hotkey app-wide and add "create/go to" actions | S |
| 4 | **Global data-fetch error surfacing** | Fetch failures are largely silent/console-only today; add one RTK Query error middleware + `not-found.tsx` | S |
| 5 | **Autosave / draft + unsaved-changes guard on forms** | Long ERP forms can silently lose data on navigation | M |
| 6 | **One toast system + a shared `<EmptyState>`** | Two toast stacks coexist (`sonner` + custom Radix, limited to 1 toast); empty states are ad-hoc per page | S |

If you do nothing else, do #1, #2, and #3 — they change how *fast and modern* the whole product feels.

---

## What's already strong (don't rebuild these)

Be aware of these so improvement work *extends* them instead of duplicating:

- **An excellent, Excel-like `DataTable`** — `components/real-estate/workspace/data-table.tsx`, reused
  by purchase/product/accounts record tables. It already has: column sort (persisted), per-column +
  global filtering, column show/hide + resize + pinning, row selection with shift-range, density
  toggle, keyboard cell navigation (arrows/Home/End/Tab/Enter), TSV clipboard copy, group headers,
  and a sum/avg status bar. **This is genuinely premium — extend it, don't replace it.**
- **Global error boundaries** — `app/error.tsx` (route segment) and `app/global-error.tsx` (root)
  both render friendly recovery UI with retry/home.
- **Global search exists** — `components/layout/GlobalSearchDialog.tsx` (cmdk) indexes shortcuts,
  static pages, and modules. The real-estate workspace even has a Cmd-K palette
  (`components/real-estate/workspace/command-palette.tsx`).
- **Theming + density** — `next-themes` dark mode wired in `app/layout.tsx`, with a cookie-driven
  `--density-scale` for compact/comfortable.
- **Streaming imports with live progress** — `app/api/static-import/stream/route.ts` emits NDJSON
  progress events. Great foundation; make sure every long op uses this pattern (see Tier 2).
- **Optimistic state in purchase** — `lib/purchase-system/store.tsx` already does
  optimistic-update-then-persist-with-rollback. **This is the model to generalize (Tier 1, #1).**

---

## Tier 1 — Perceived speed & trust (do first)

These directly attack the 1.3 s-latency problem and the "did my click work?" anxiety.

### 1.1 Optimistic UI on every mutating action
**Problem:** Outside the purchase module, every action waits for a full round-trip (~1.3 s) before the
UI updates. `useOptimistic` (React 19) is available but unused; no SWR optimistic mutate.
**Do:**
- Generalize the purchase pattern (`lib/purchase-system/store.tsx`) into a small reusable helper:
  apply change locally → fire mutation → roll back + toast on error.
- For RTK Query, use `onQueryStarted` + `updateQueryData` optimistic patches on the common mutations
  (create/update/delete/status-change).
- Inline table edits (`components/real-estate/workspace/inline-edit.tsx` exists but isn't wired into
  purchase/inventory tables) should commit optimistically.
**Impact:** Highest. Turns every save from "frozen 1.3 s" into "instant." **Effort:** M.

### 1.2 Standardize loading with skeletons + route `loading.tsx`
**Problem:** 206 `page.tsx` files, **3** `loading.tsx` (all return `null`). Loading is hand-rolled
per page via `isLoading` checks (363 occurrences across 99 files); `components/ui/skeleton.tsx` is a
single bare `animate-pulse` div. Result: blank screens / layout shift on navigation.
**Do:**
- Build a small skeleton kit on top of the existing primitive: `<TableSkeleton>`, `<FormSkeleton>`,
  `<CardGridSkeleton>`, `<DetailSkeleton>` (you already have a `shimmer` keyframe in Tailwind).
- Add a `loading.tsx` to each major route segment (purchase, inventory, real-estate, payroll, HR,
  settings) that renders the matching skeleton — so Next.js shows it instantly during navigation.
- Replace ad-hoc `isLoading ? <Skeleton/> :` blocks with the shared components for consistency.
**Impact:** High (perceived speed + polish). **Effort:** M.

### 1.3 Surface data-fetch errors (stop failing silently)
**Problem:** Mutation errors are toasted *inconsistently*; fetch/query failures are mostly
`console.error` only. No `app/not-found.tsx`. Users see stale or empty screens with no explanation.
**Do:**
- Add **one** RTK Query error-logging middleware (`isRejectedWithValue`) that fires a single toast for
  unhandled API failures — central, not per-call.
- Add `app/not-found.tsx` and key segment-level `not-found.tsx` with recovery links.
- Standardize the "couldn't load this section" inline state (retry button) for query failures inside a
  page (vs. the full-page `error.tsx`).
**Impact:** High (trust). **Effort:** S.

### 1.4 Consolidate to one toast system
**Problem:** Two stacks coexist — `sonner` (`components/ui/sonner.tsx`) and a custom Radix
`use-toast` hook (`hooks/use-toast.ts`, `TOAST_LIMIT = 1`, so only one toast shows at a time). 626
`toast` calls across 75 files use a mix. The 1-toast limit drops feedback during bulk actions.
**Do:** Pick **`sonner`** (you already mount it; it stacks, supports promise/loading toasts, and
`toast.promise` is perfect for the 1.3 s saves). Migrate `use-toast` call sites; delete the custom
hook. Use `toast.promise(save(), {loading, success, error})` as the default save pattern.
**Impact:** Medium-High (consistency). **Effort:** S–M (mechanical migration).

---

## Tier 2 — Data entry & workflow (the daily grind)

ERP users live in forms and tables all day. Small frictions compound.

### 2.1 Autosave / draft + unsaved-changes guard
**Problem:** No autosave, no draft persistence, no "you have unsaved changes" warning anywhere
(`record-form-sheet.tsx`, `app/forms/[formId]/page.tsx`). A user filling a long PR/PO form can lose
everything by mis-clicking the sidebar.
**Do:**
- `beforeunload` + a Next.js route-change guard when a form is dirty → "Discard changes?" dialog
  (you have `alert-dialog`).
- Debounced **draft to localStorage** keyed by form+record id; restore on reopen with a "Restore
  draft?" prompt. (Server-side draft table is a later upgrade.)
**Impact:** High (prevents data loss = trust). **Effort:** M.

### 2.2 Unify form validation on react-hook-form + zod with live feedback
**Problem:** `react-hook-form` is used in **one** place (the form builder). Most pages do manual
`useState` + custom regex arrays (`app/forms/[formId]/page.tsx`), surfacing errors only on submit.
Zod is used heavily server-side (248 refs) but not shared to the client.
**Do:** Adopt RHF + `@hookform/resolvers/zod` (both already installed) for the high-traffic forms;
reuse the server zod schemas on the client for **live, field-level** validation and inline error
messages instead of submit-time alerts.
**Impact:** Medium-High. **Effort:** M (incremental, per form).

### 2.3 Bulk-action toolbar on tables
**Problem:** `DataTable` already tracks a selection set, but there's no action UI — selection leads
nowhere.
**Do:** Add a contextual action bar that appears when rows are selected (bulk status change, delete,
export selection, assign). Wire to optimistic mutations from 1.1.
**Impact:** Medium-High (power-user efficiency). **Effort:** M.

### 2.4 Inline editing in business tables
**Problem:** `inline-edit.tsx` exists but isn't wired into purchase/inventory tables — users open a
full sheet to change one field.
**Do:** Enable double-click-to-edit cells (qty, status, price) in the record tables, committing
optimistically.
**Impact:** Medium. **Effort:** M.

### 2.5 Saved views / saved filters
**Problem:** Filters reset every visit; table prefs persist (localStorage) but named filter sets
don't. The advanced faceted filter (`advanced-filter.tsx`) is only in real-estate.
**Do:** Let users name & save filter+column+sort combinations ("My open POs", "Overdue GRNs"); make
them the landing view. Roll the advanced filter into the shared DataTable for all modules.
**Impact:** Medium-High for daily users. **Effort:** M.

### 2.6 Long-operation progress UI (lean on the streaming you have)
**Problem:** The import stream emits progress, but ensure the **client renders a real progress bar +
result summary** (created/updated/skipped/failed with downloadable error rows). Confirm
`app/data-migration/import/page.tsx` shows it; apply the same NDJSON pattern to any other long op
(bulk approvals, exports, recalcs).
**Impact:** Medium. **Effort:** S (UI on existing stream).

---

## Tier 3 — "Advanced / premium" feel

These are what make users say "this feels like a modern SaaS, not internal software."

### 3.1 Global Cmd/Ctrl-K command palette *with actions*
**Problem:** `GlobalSearchDialog` only opens via the mobile nav icon and only *navigates*. The Cmd-K
hotkey is wired only inside real-estate.
**Do:** Register Cmd/Ctrl-K **app-wide** (in `app/layout.tsx`/`ConditionalLayout`). Beyond navigation,
add **actions**: "Create Purchase Order", "New GRN", "Go to supplier…", "Open approvals inbox",
"Toggle theme", recent records. This single feature reframes the product as keyboard-first and fast.
**Impact:** High (perception + speed). **Effort:** S–M (foundation already exists).

### 3.2 In-app notification center
**Problem:** `web-push` + `PushInit` exist, and there's a cross-module approvals inbox
(`/settings/approvals`) and pending-count badges in the sidebar — but no unified in-app feed.
**Do:** A bell + dropdown notification center (approval needed, GRN posted, PO closed, mention) with
read/unread state, linking to the record. Reuse the badge-count plumbing already in the sidebar.
**Impact:** Medium-High (engagement, fewer missed approvals). **Effort:** M.

### 3.3 List virtualization for large datasets
**Problem:** `DataTable` renders all rows in one `<tbody>`; no windowing. Purchase loads **all**
records client-side then paginates locally (`PAGE_SIZE = 25`). Fine today; degrades past ~10k rows /
DOM bloat if page size grows or "show all" is used.
**Do:** Add `@tanstack/react-virtual` to the DataTable body for large result sets; pair with true
server-side pagination/cursor for the biggest tables so you don't fetch-all over the 1.3 s link.
**Impact:** Medium (scales the product). **Effort:** M.

### 3.4 Empty states that teach & convert
**Problem:** 154 "no data"/"empty" strings across 85 files, all bespoke; some lists render a blank
area. No shared component.
**Do:** A `<EmptyState icon title description action>` component (illustration + primary CTA, e.g.
"No purchase orders yet → Create your first PO"). Use it everywhere — empty states are a prime
onboarding/discovery surface.
**Impact:** Medium (polish + onboarding). **Effort:** S.

### 3.5 Onboarding, contextual help & discoverability
**Problem:** Good docs exist (`/settings/docs/*`) but they're a separate destination; features aren't
surfaced in-context.
**Do:** Tooltips on non-obvious controls (you have `tooltip`), a first-run checklist/empty-dashboard
guide, and "?" deep-links from screens into the relevant doc. Optional: a lightweight product tour for
the first session per module.
**Impact:** Medium (reduces support load). **Effort:** M.

### 3.6 Keyboard shortcuts beyond tables
**Do:** Document and expand global shortcuts (Cmd-K, `g` then `p` = go to purchase, `c` = create,
`/` = focus search). Add a "Keyboard shortcuts" help sheet (Shift-?). Signals "power tool."
**Impact:** Low-Medium (delights power users). **Effort:** S.

---

## Tier 4 — Foundations & quality (ongoing)

- **Accessibility pass** — Radix gives you a head start, but audit focus order, focus-visible rings,
  `aria-label`s on icon-only buttons (the sidebar icon rail, table action icons), color contrast in
  both themes, and keyboard reachability of the command palette and dialogs. ERP = long sessions =
  a11y is real ROI.
- **Responsive/mobile** — `MobileBottomNav` exists; verify the Excel-like table degrades gracefully
  (horizontal scroll, card view) on small screens; verify form sheets are usable on mobile.
- **Consistency tokens** — define an explicit spacing/typography scale in `tailwind.config.ts`
  (currently inherits defaults) so modules look uniform; audit the per-module nested layouts for
  drift.
- **Reduced motion** — respect `prefers-reduced-motion` for the `framer-motion` / shimmer animations.
- **Performance hygiene** — prefetch likely-next routes/queries; cache master data (suppliers, items)
  aggressively given the 1.3 s link; measure with the bundle analyzer (`npm run analyze`).

---

## Suggested sequencing

```
Sprint 1 (quick wins, big perceived impact)
  └─ 1.3 global error surfacing + not-found.tsx   (S)
  └─ 1.4 consolidate to sonner + toast.promise    (S–M)
  └─ 3.1 global Cmd-K palette w/ actions          (S–M)
  └─ 3.4 shared <EmptyState>                       (S)

Sprint 2 (the latency killers)
  └─ 1.1 optimistic UI helper + apply to top mutations  (M)
  └─ 1.2 skeleton kit + loading.tsx per segment         (M)

Sprint 3 (data-entry safety & power)
  └─ 2.1 autosave/draft + unsaved-changes guard   (M)
  └─ 2.3 bulk-action toolbar                        (M)
  └─ 2.6 import/long-op progress UI polish          (S)

Later / as scale demands
  └─ 2.2 RHF+zod live validation rollout
  └─ 2.4 inline table editing
  └─ 2.5 saved views
  └─ 3.2 notification center
  └─ 3.3 virtualization + server pagination
  └─ Tier 4 foundations (a11y, mobile, tokens) — continuous
```

## How to measure "more perfect"

- **Time-to-interactive on navigation** (skeleton appears < 100 ms; was: blank until query returns).
- **Perceived save latency** (optimistic = instant; was: ~1.3 s frozen).
- **Task completion without data loss** (autosave/guard eliminates lost-form complaints).
- **Support tickets** for "is it broken / did it save?" should drop after Tier 1.
- **Keyboard adoption** (Cmd-K usage) as a signal the product feels fast.

---

### Appendix — key files referenced
- Shared table: `components/real-estate/workspace/data-table.tsx`
- Purchase record table: `components/purchase-system/record-table-view.tsx`
- Purchase optimistic store (the pattern to generalize): `lib/purchase-system/store.tsx`
- Purchase form sheet: `components/purchase-system/record-form-sheet.tsx`
- Global search / cmdk: `components/layout/GlobalSearchDialog.tsx`
- RE command palette (Cmd-K reference impl): `components/real-estate/workspace/command-palette.tsx`
- Inline edit (unwired): `components/real-estate/workspace/inline-edit.tsx`
- Advanced filter (RE only): `components/real-estate/workspace/advanced-filter.tsx`
- Skeleton primitive: `components/ui/skeleton.tsx`
- Toast stacks: `components/ui/sonner.tsx`, `hooks/use-toast.ts`
- Error boundaries: `app/error.tsx`, `app/global-error.tsx`
- Streaming import: `app/api/static-import/stream/route.ts`
- Root layout / theming / shell: `app/layout.tsx`
- Latency context: `memory/db-roundtrip-latency.md`
</content>
</invoke>
