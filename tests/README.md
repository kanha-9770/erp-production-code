# E2E tests (Playwright)

Smoke + regression coverage for the highest-value flows:

| # | Spec | What it covers |
|---|---|---|
| 01 | login | Login form renders, validates, rejects bad creds |
| 02 | attendance | `/attendance` loads, no console errors, team page if accessible |
| 03 | leave-apply | `/leave` renders, Apply sheet opens (submit gated by env flag) |
| 04 | payroll-view | `/payroll` page + `/api/payroll` + `/api/payroll/stats` respond |
| 05 | modules | `/admin/modules`, `/api/modules`, `/api/forms/permitted`, `/profile` |

## Setup

```bash
npm install
npx playwright install chromium
cp tests/.env.test.example .env.test
# edit .env.test
```

## Run

Local dev (start the app first in another terminal with `npm run dev`):

```bash
# Windows PowerShell
$env:TEST_USER_EMAIL="you@example.com"; $env:TEST_USER_PASSWORD="..."; npm run test:e2e

# bash
TEST_USER_EMAIL=you@example.com TEST_USER_PASSWORD=... npm run test:e2e
```

Against staging / prod:

```bash
$env:PLAYWRIGHT_BASE_URL="https://erp.nesscoglobal.com"
$env:TEST_USER_EMAIL="app3.nessco@gmail.com"
$env:TEST_USER_PASSWORD="..."
npm run test:e2e
```

UI mode (great for debugging selectors):

```bash
npm run test:e2e:ui
```

## Important caveats

1. **OTP login.** If the test account triggers an OTP on every login, the
   `auth.setup.ts` step will fail with a clear message. Either use a test
   user with OTP disabled, or implement OTP retrieval (IMAP, DB poll) in
   `tests/auth.setup.ts`.
2. **Production safety.** The default suite is read-only. The only spec
   that can mutate data is `03-leave-apply` and only when
   `TEST_LEAVE_SUBMIT=1` is set. Submitted leaves are tagged `QA_E2E_AUTOMATION`
   in the reason field — search for that tag to clean up.
3. **Storage state.** `tests/.auth/user.json` is created by `auth.setup.ts`
   and reused across all tests. It is gitignored. Delete it to force re-login.
4. **Selectors.** Specs use role + text + placeholder selectors so they
   survive most refactors. If a selector breaks, prefer adding a stable
   `data-testid` to the component over weakening the assertion.

## Adding tests

Drop new specs in `tests/specs/`. They automatically inherit the logged-in
storage state. Use `test.use({ storageState: { cookies: [], origins: [] } })`
at the top of a file to opt out (e.g. login spec).
