# Leave Management — Build Plan

**Owner:** _<assign teammate>_
**Reviewer:** _<assign>_
**Target:** wire Leave Management into Attendance + Payroll so the three modules work as one system.
**Estimated effort:** 4–6 days for one engineer (schema + APIs + UI + integration patches + manual QA).

---

## 1. Why we're doing this

### Today's state (verified in the repo)

| Module | Status | Where it lives |
|---|---|---|
| **Attendance** | Production-grade. Punches, regularization, geofence, face capture all work. Status field supports `ON_LEAVE` but **nothing ever sets it**. | [app/attendance/](../app/attendance/), [lib/hr/attendance-service.ts](../lib/hr/attendance-service.ts) |
| **Payroll** | Calculator already does the right thing — holiday → weekly-off → approved leave → present/half/absent. **But it reads leaves from a generic form**, not a real table. | [lib/utils/payroll-utils.ts](../lib/utils/payroll-utils.ts), [lib/utils/payroll-store.ts](../lib/utils/payroll-store.ts) |
| **Leave** | Only two reference tables exist — `LeaveType` and `LeaveRule`. **No `LeaveRequest`, no `LeaveBalance`, no `Holiday` model. No UI. No approval workflow.** Leave applications are stored as untyped FormRecords trusted blindly. | [prisma/schema.prisma:1323-1366](../prisma/schema.prisma#L1323-L1366) |

### Problems this causes
1. Anyone can fabricate a "leave" by editing a form record — payroll trusts it.
2. There's no "I have 5 casual leaves left" — balance tracking doesn't exist.
3. Attendance and Leave don't talk: an employee with an approved leave still shows as `ABSENT` on the attendance dashboard, can still punch in.
4. Holiday calendar is stored as a generic form too — fragile.
5. Onboarding a tenant requires manually mapping form fields to leave concepts (`startDate`, `endDate`, `leaveType`, `status`, `halfDay`).

### Definition of done
- Employee can apply for leave, see balance, see status of past requests.
- Manager/admin can approve/reject from an inbox.
- Approval auto-deducts balance; rejection/cancel refunds.
- On an approved-leave date the attendance widget shows `ON_LEAVE` (no punch needed).
- Payroll for the next month picks up the new approved leaves with zero form-mapping config.
- Existing tenants who use the old form-based flow keep working (fallback path stays).

---

## 2. Scope (what's IN, what's OUT)

### In scope
- [ ] New Prisma models: `LeaveRequest`, `LeaveBalance`, `LeaveAllocation`, `Holiday`
- [ ] New enums: `LeaveRequestStatus`, `LeaveDuration`
- [ ] APIs: apply / list / approve / reject / cancel leave; balance read; admin allocate; holidays CRUD
- [ ] UI: `app/leave/page.tsx` (employee), `app/leave/approvals/page.tsx` (manager), `app/leave/admin/page.tsx` (admin allocation), holidays page on settings
- [ ] Sidebar entries (system-route nodes alongside Attendance/Payroll)
- [ ] Attendance integration: punch service rejects with `ON_LEAVE` when an approved full-day leave covers the date
- [ ] Payroll integration: `getLeavesFromDB` and `getHolidaysFromDB` read from new tables first, fall back to forms
- [ ] Manual test plan run-through

### Out of scope (don't expand)
- Refactor of the hardcoded PF/Tax/Insurance formula in [lib/utils/payroll-utils.ts](../lib/utils/payroll-utils.ts) — separate ticket
- Workflow scheduler (the `scheduledExecute` field with no worker) — separate ticket
- Multi-shift / dynamic shift support
- Leave encashment, comp-off accumulation, sandwich-leave rules — note these in follow-ups
- Migration of historical form-based leaves into the new tables (we keep both readers)
- Email/SMS notifications on approval (only in-app for v1)
- Mobile app changes — web only

---

## 3. Tickets (suggested order)

> Each ticket is sized so it can be merged independently. Do them in order — later tickets depend on earlier ones.

### **T1 — Schema: add Leave/Holiday tables** _(~0.5 day)_
**Files:** [prisma/schema.prisma](../prisma/schema.prisma)

Add the four blocks below at the end of the file (or grouped near the existing `LeaveType`/`LeaveRule` at lines 1323-1366). After editing, run:
```bash
npx prisma migrate dev --name add_leave_management
npx prisma generate
```

```prisma
enum LeaveRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}

enum LeaveDuration {
  FULL_DAY
  HALF_DAY_FIRST   // first half (morning)
  HALF_DAY_SECOND  // second half (afternoon)
}

model LeaveRequest {
  id              String             @id @default(cuid())
  organizationId  String             @map("organization_id")
  userId          String             @map("user_id")          // applicant
  user            User               @relation("LeaveRequestUser", fields: [userId], references: [id], onDelete: Cascade)
  leaveTypeId     String             @map("leave_type_id")
  leaveType       LeaveType          @relation(fields: [leaveTypeId], references: [id])
  startDate       String             @map("start_date")        // YYYY-MM-DD, inclusive
  endDate         String             @map("end_date")          // YYYY-MM-DD, inclusive
  duration        LeaveDuration      @default(FULL_DAY)
  totalDays       Decimal            @map("total_days")        // 1.0, 0.5, etc. computed at apply time
  reason          String?
  status          LeaveRequestStatus @default(PENDING)
  appliedAt       DateTime           @default(now()) @map("applied_at")
  decidedAt       DateTime?          @map("decided_at")
  decidedById     String?            @map("decided_by_id")
  decidedBy       User?              @relation("LeaveRequestDecider", fields: [decidedById], references: [id])
  decisionNote    String?            @map("decision_note")
  cancelledAt     DateTime?          @map("cancelled_at")
  cancelReason    String?            @map("cancel_reason")
  attachmentUrl   String?            @map("attachment_url")    // optional medical cert etc.
  createdAt       DateTime           @default(now()) @map("created_at")
  updatedAt       DateTime           @updatedAt @map("updated_at")

  @@index([organizationId, status])
  @@index([userId, status])
  @@index([startDate, endDate])
  @@map("leave_requests")
}

// One row per (user, leaveType, year) — running balance.
model LeaveBalance {
  id              String   @id @default(cuid())
  organizationId  String   @map("organization_id")
  userId          String   @map("user_id")
  user            User     @relation("LeaveBalanceUser", fields: [userId], references: [id], onDelete: Cascade)
  leaveTypeId     String   @map("leave_type_id")
  leaveType       LeaveType @relation(fields: [leaveTypeId], references: [id])
  year            Int
  allocated       Decimal  @default(0)   // base allocation for the year
  carriedForward  Decimal  @default(0) @map("carried_forward")
  used            Decimal  @default(0)   // sum of approved totalDays
  pending         Decimal  @default(0)   // sum of pending totalDays (soft-hold)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@unique([userId, leaveTypeId, year])
  @@index([organizationId, year])
  @@map("leave_balances")
}

// Audit trail for any change to a balance — admin grant, accrual, approval, refund, carry-forward.
model LeaveAllocation {
  id              String   @id @default(cuid())
  organizationId  String   @map("organization_id")
  userId          String   @map("user_id")
  leaveTypeId     String   @map("leave_type_id")
  year            Int
  delta           Decimal              // signed: +5, -1, etc.
  reason          String              // 'INITIAL' | 'CARRY_FORWARD' | 'APPROVED' | 'CANCELLED' | 'ADMIN_ADJUST'
  referenceId     String?  @map("reference_id")  // LeaveRequest.id when reason=APPROVED/CANCELLED
  createdById     String   @map("created_by_id")
  createdAt       DateTime @default(now()) @map("created_at")

  @@index([organizationId, userId, year])
  @@index([referenceId])
  @@map("leave_allocations")
}

model Holiday {
  id              String   @id @default(cuid())
  organizationId  String   @map("organization_id")
  date            String                              // YYYY-MM-DD
  name            String
  isOptional      Boolean  @default(false) @map("is_optional")
  createdById     String   @map("created_by_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@unique([organizationId, date])
  @@index([organizationId])
  @@map("holidays")
}
```

**Also add reverse relations on `User` model** (around [prisma/schema.prisma:115](../prisma/schema.prisma#L115)):
```prisma
leaveRequests          LeaveRequest[]    @relation("LeaveRequestUser")
leaveDecisions         LeaveRequest[]    @relation("LeaveRequestDecider")
leaveBalances          LeaveBalance[]    @relation("LeaveBalanceUser")
```

**And on `LeaveType`** (around [prisma/schema.prisma:1323](../prisma/schema.prisma#L1323)):
```prisma
leaveRequests   LeaveRequest[]
leaveBalances   LeaveBalance[]
```

**Acceptance:** `npx prisma migrate dev` succeeds, `npx prisma studio` shows the four new tables.

---

### **T2 — Service layer: balance math & validation** _(~1 day)_
**New file:** `lib/hr/leave-service.ts`

Encapsulate every balance change and every validation rule here. APIs and UI must go through this — never write to `LeaveBalance` directly from a route handler.

**Functions to export:**
```ts
// Apply
export async function applyLeave(input: {
  organizationId: string;
  userId: string;
  leaveTypeId: string;
  startDate: string;        // YYYY-MM-DD
  endDate: string;
  duration: LeaveDuration;
  reason?: string;
  attachmentUrl?: string;
}): Promise<LeaveRequest>;
// - Validates: dates ordered, no overlap with another non-rejected request,
//   minNoticeDays from LeaveRule, maxConsecutiveDays from LeaveRule,
//   sufficient balance (allocated + carriedForward - used - pending).
// - Computes totalDays excluding holidays + weekly-off (use AttendanceConfiguration.weeklyOffDays).
// - Increments LeaveBalance.pending atomically.
// - Returns the saved request.

export async function decideLeave(input: {
  requestId: string;
  decision: 'APPROVED' | 'REJECTED';
  decidedById: string;
  note?: string;
}): Promise<LeaveRequest>;
// - On APPROVED: pending -= totalDays, used += totalDays, write LeaveAllocation row.
// - On REJECTED: pending -= totalDays.
// - Idempotent: rejects if already decided.

export async function cancelLeave(input: {
  requestId: string;
  cancelledById: string;
  reason?: string;
}): Promise<LeaveRequest>;
// - PENDING → just clear pending.
// - APPROVED → only allowed if startDate is in the future; refund 'used'.
// - Already CANCELLED/REJECTED → 400.

export async function getBalance(
  organizationId: string,
  userId: string,
  year: number,
): Promise<Array<{
  leaveType: LeaveType;
  allocated: number;
  carriedForward: number;
  used: number;
  pending: number;
  available: number;   // allocated + carriedForward - used - pending
}>>;

export async function adminAllocate(input: {
  organizationId: string;
  userId: string;
  leaveTypeId: string;
  year: number;
  amount: number;       // signed
  reason: string;       // free text, written to LeaveAllocation
  createdById: string;
}): Promise<LeaveBalance>;

// Helper used by attendance and payroll integration
export async function getApprovedLeavesForRange(
  organizationId: string,
  startDate: string,
  endDate: string,
  userId?: string,    // optional, omit for org-wide (payroll)
): Promise<LeaveRequest[]>;
```

**Important:** wrap balance mutations in `prisma.$transaction([...])` — pending and request creation must be atomic, or you'll double-spend on concurrent applies.

**Acceptance:** unit-call each function from a quick scratch script or `npx ts-node` REPL — happy path + balance underflow + duplicate apply + concurrent apply (Promise.all of two applies on the same balance).

---

### **T3 — APIs** _(~1 day)_

Use [lib/api-helpers.ts](../lib/api-helpers.ts) `getAuthenticatedUser()` for auth, mirror the patterns in [app/api/attendance/punch/route.ts](../app/api/attendance/punch/route.ts).

| Route | Method | Who | Body / Query | Returns |
|---|---|---|---|---|
| `app/api/leaves/route.ts` | `GET` | self / admin | `?status=PENDING&userId=&from=&to=` | `{ requests: LeaveRequest[] }` |
| `app/api/leaves/route.ts` | `POST` | self | `{ leaveTypeId, startDate, endDate, duration, reason, attachmentUrl? }` | `{ request: LeaveRequest }` |
| `app/api/leaves/[id]/route.ts` | `GET` | self / approver | — | `{ request: LeaveRequest }` |
| `app/api/leaves/[id]/decide/route.ts` | `POST` | approver | `{ decision: 'APPROVED'\|'REJECTED', note? }` | `{ request: LeaveRequest }` |
| `app/api/leaves/[id]/cancel/route.ts` | `POST` | self (own) / admin | `{ reason? }` | `{ request: LeaveRequest }` |
| `app/api/leaves/balance/route.ts` | `GET` | self / admin | `?userId=&year=` (defaults: self + current year) | `{ balances: BalanceRow[] }` |
| `app/api/leaves/allocate/route.ts` | `POST` | admin | `{ userId, leaveTypeId, year, amount, reason }` | `{ balance: LeaveBalance }` |
| `app/api/holidays/route.ts` | `GET` / `POST` | all read / admin write | `{ date, name, isOptional? }` | `{ holidays: Holiday[] }` / `{ holiday }` |
| `app/api/holidays/[id]/route.ts` | `DELETE` | admin | — | `{ ok: true }` |

**Approver detection (v1, simple):**
```ts
// In the decide handler:
async function canApprove(approverId: string, applicantOrgId: string): Promise<boolean> {
  if (await isUserAdmin(approverId, applicantOrgId)) return true;
  // Optional: check AttendanceConfiguration.attendanceApproverRoleIds — reuse same approver pool as regularizations.
  return false;
}
```

**Error shape:** match existing routes — `{ success: false, error: '...', code: '...' }` with proper HTTP status. Always set `Cache-Control: no-store`.

**Acceptance:** Postman collection (or `curl` script) covering each endpoint with auth cookie. 401 path tested. Org-scope leak test (user A can't read user B's request unless admin).

---

### **T4 — UI: employee page** _(~1 day)_
**New file:** `app/leave/page.tsx` (use the same shadcn/ui pattern as [app/payroll/page.tsx](../app/payroll/page.tsx))

**Layout:**
- Top row: 4 stat cards — one per leave type — showing `available / allocated` and a progress bar of `used`.
- "Apply Leave" primary button → opens a Sheet/Dialog with the apply form.
- Tabs: **Upcoming** | **Past** | **All**
- Table columns: Type · Dates · Days · Duration · Status badge · Applied · Actions (`Cancel` if status=PENDING or status=APPROVED & startDate>today).

**Apply form fields:**
- LeaveType (Select, populated from `/api/payroll/leave-rules`)
- Date range picker (single date toggles to half-day)
- Duration (FULL / HALF_FIRST / HALF_SECOND, only enabled when single-date)
- Reason (Textarea)
- Attachment (optional, reuse Hostinger uploader from [lib/hostinger-upload.ts](../lib/hostinger-upload.ts))
- **Live preview**: "Total: 3 days · After approval: 2 of 12 remaining" (compute from getBalance + dates excluding holidays/weekly-off — fetch /api/leaves/balance and /api/holidays on mount).

**Acceptance:** apply a leave, see it appear in **Upcoming**, see balance `pending` go up; cancel it, see balance restored.

---

### **T5 — UI: approver inbox** _(~0.5 day)_
**New file:** `app/leave/approvals/page.tsx`

- Pre-filtered to `?status=PENDING` for the approver's org.
- Each row expandable showing applicant name, dates, reason, current balance of that leave type.
- Inline **Approve** / **Reject** buttons → POST to `/api/leaves/[id]/decide`. Reject opens a modal asking for note.
- Empty state: "Inbox zero — no pending leave requests."
- Page guard: redirect non-approvers to `/unauthorized`.

**Acceptance:** approver sees pending requests from their org only, can approve and the row disappears, the applicant's balance updates.

---

### **T6 — UI: admin allocation + holidays** _(~0.5 day)_
**New files:**
- `app/leave/admin/page.tsx` — table: rows=employees, cols=leave types, cells=balance; edit cell → calls `/api/leaves/allocate`. "Bulk allocate yearly" button → modal accepting per-leave-type amount, applies to all active employees of the org.
- `app/settings/holidays/page.tsx` — list, add (date+name+isOptional), delete.

**Acceptance:** admin can set casual=12, sick=10 for a fresh user, and the user sees those numbers on `/leave`.

---

### **T7 — Sidebar wiring** _(~0.25 day)_
**File:** [components/layout/sidebar.tsx](../components/layout/sidebar.tsx)

The sidebar uses synthetic system-route nodes for Attendance and Payroll. Add a similar block for Leave:
- Anchor: same HR root as Attendance / Payroll (`canAccess("/leave")` gate).
- Children: **My Leaves** (`/leave`), **Approvals** (`/leave/approvals`, admin/approver only), **Allocations** (`/leave/admin`, admin only), **Holidays** (`/settings/holidays`, admin only).
- Place under HR module, slot **between Attendance and Payroll** so reading order is HR > Attendance > Leave > Payroll.

Look at how `__sys_attendance__` is constructed around [sidebar.tsx:579](../components/layout/sidebar.tsx#L579) and copy the pattern.

**Acceptance:** nav entry shows up for the right roles; clicking lands on the right page.

---

### **T8 — Attendance integration** _(~0.5 day)_
**File:** [lib/hr/attendance-service.ts](../lib/hr/attendance-service.ts)

Two changes:

1. **Source of truth for `isOnLeave`**: find the function that populates `AttendanceStatus.isOnLeave` / `leaveType` / `isHalfDayLeave` (search for `isOnLeave` in the file). Today it reads from form-based leaves via [payroll-store.ts](../lib/utils/payroll-store.ts). Replace with:
```ts
import { getApprovedLeavesForRange } from '@/lib/hr/leave-service';

const dbLeaves = await getApprovedLeavesForRange(orgId, date, date, userId);
if (dbLeaves.length === 0) {
  // fallback to old form-based reader so existing tenants still work
  // (keep the existing call here)
}
```

2. **Block punching on full-day leave** in `recordPunch` ([attendance-service.ts:637](../lib/hr/attendance-service.ts#L637)). After the geofence/face checks, before writing the row:
```ts
const todays = await getApprovedLeavesForRange(input.organizationId!, date, date, input.userId);
const fullDay = todays.find(l => l.duration === 'FULL_DAY');
if (fullDay) {
  throw new AttendanceError(
    'ON_APPROVED_LEAVE',
    `You are on approved ${fullDay.leaveType.name} leave today.`,
    409,
  );
}
// half-day leaves are allowed to coexist with a punch — do NOT block.
```

**Acceptance:** approve a leave for tomorrow → tomorrow user can't punch in, attendance widget shows `ON_LEAVE`. Approve a half-day for tomorrow → user can still punch in.

---

### **T9 — Payroll integration** _(~0.5 day)_
**File:** [lib/utils/payroll-store.ts](../lib/utils/payroll-store.ts)

Modify [`getLeavesFromDB`](../lib/utils/payroll-store.ts#L994) and [`getHolidaysFromDB`](../lib/utils/payroll-store.ts#L1085) to **prefer the new tables, fall back to forms**:

```ts
export async function getLeavesFromDB(organizationId, month) {
  // Table-first
  const [yStr, mStr] = month.split('-');
  const lastDay = new Date(+yStr, +mStr, 0).getDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
  const tableRows = await prisma.leaveRequest.findMany({
    where: {
      organizationId,
      status: 'APPROVED',
      startDate: { lte: monthEnd },
      endDate:   { gte: `${month}-01` },
    },
    include: { user: { select: { email: true } }, leaveType: true },
  });

  if (tableRows.length > 0) {
    return tableRows.map(r => ({
      matchKey: `email:${r.user.email!.toLowerCase()}`,
      email: r.user.email!.toLowerCase(),
      leaveType: r.leaveType.name,
      startDate: r.startDate,
      endDate: r.endDate,
      isHalfDay: r.duration !== 'FULL_DAY',
      days: Number(r.totalDays),
      status: 'approved',
    }));
  }

  // Fallback to form-based path (existing code below — leave it intact).
  // ...
}
```

Same pattern for `getHolidaysFromDB`: query `prisma.holiday.findMany` first.

**No change needed** in [payroll-utils.ts](../lib/utils/payroll-utils.ts) — `classifyDay` already consumes the abstract shape these functions return.

**Acceptance:** create an approved leave + a holiday in the new tables, run a payroll calculation for that month, see the leave reflected as paid/unpaid per LeaveRule.isPaid + the holiday as 'HOLIDAY' in the breakdown. Then delete those table rows but populate the old leave/holiday forms — verify the fallback still works.

---

### **T10 — Manual QA pass** _(~0.5 day)_

Run through this checklist on a fresh tenant before declaring done:

- [ ] Admin allocates 12 casual + 10 sick to user A. User A sees those numbers on `/leave`.
- [ ] User A applies for 3 casual days (next week). Balance shows `pending = 3`.
- [ ] Manager sees the request in `/leave/approvals`. Approves. Balance: `used=3, pending=0, available=9`.
- [ ] User A's attendance for those 3 dates shows `ON_LEAVE`. Punching in returns 409.
- [ ] User A applies for a half-day. Approved. They CAN punch in for the other half.
- [ ] User A applies for 99 days — rejected client-side (insufficient balance) and server-side (defense-in-depth check).
- [ ] User A applies overlapping with an existing PENDING request — rejected.
- [ ] Payroll for the month picks up the 3 approved casual days and applies LeaveRule.isPaid correctly.
- [ ] Admin adds a holiday on a date inside an approved leave — payroll counts it as HOLIDAY (paid), not as a leave day.
- [ ] User A cancels an approved future leave — balance refunds, attendance no longer shows ON_LEAVE.
- [ ] Existing tenant whose leaves still live in the form-builder form: payroll still computes correctly (fallback path).
- [ ] Non-admin can't hit `/api/leaves/allocate`. User B can't read user A's request via `/api/leaves/[id]`.

---

## 4. Key files / starting points

| Need to look at | File | Why |
|---|---|---|
| Existing schema patterns | [prisma/schema.prisma](../prisma/schema.prisma) | Match naming + `@@map` snake_case + index conventions |
| Auth pattern | [lib/api-helpers.ts:48](../lib/api-helpers.ts#L48) (`getAuthenticatedUser`), [lib/api-helpers.ts:77](../lib/api-helpers.ts#L77) (`isUserAdmin`) | Every route uses these |
| Route style | [app/api/attendance/punch/route.ts](../app/api/attendance/punch/route.ts) | Compact, copy the error/idempotency pattern |
| Form-based leave reader (the thing you're partially replacing) | [lib/utils/payroll-store.ts:994](../lib/utils/payroll-store.ts#L994) | Don't delete, wrap |
| Payroll calculator (don't touch) | [lib/utils/payroll-utils.ts](../lib/utils/payroll-utils.ts) | Black box for this work |
| Attendance status interface | [lib/hr/attendance-service.ts:61-104](../lib/hr/attendance-service.ts#L61-L104) | Already exposes `isOnLeave`, `leaveType`, `isHalfDayLeave` — just feed real data into it |
| Punch service entry | [lib/hr/attendance-service.ts:637](../lib/hr/attendance-service.ts#L637) (`recordPunch`) | Where the leave-block check goes |
| Sidebar pattern | [components/layout/sidebar.tsx:579](../components/layout/sidebar.tsx#L579) (`__sys_attendance__`) | Copy for `__sys_leave__` |
| LeaveType / LeaveRule (already exist) | [prisma/schema.prisma:1323-1366](../prisma/schema.prisma#L1323-L1366) | These drive validation in `applyLeave` |

---

## 5. Risks / things to watch for

- **Race condition on balance**: two concurrent `applyLeave` calls can over-spend the balance. Use `prisma.$transaction` and re-read the balance row inside the txn before incrementing `pending`.
- **Time zones**: dates are stored as `YYYY-MM-DD` strings, not `DateTime`. Match the existing pattern — don't switch to DateTime for dates or you'll diverge from how attendance and payroll already index by date string.
- **Org scoping**: every query MUST filter by `organizationId`. Forgetting this is the #1 source of cross-tenant leaks.
- **Sidebar feature flag**: don't show the Leave nav until at least T1+T2+T3 are merged behind a flag, or users will click broken pages.
- **Don't delete the form-based leave reader.** Existing tenants use it. Keep it as fallback in `getLeavesFromDB`.
- **Holiday model collision**: search the codebase for an existing `Holiday` model before adding — there's currently none, but double-check.

---

## 6. Out of scope / follow-up tickets

Drop these in the ticket tracker as separate items so they don't bloat this work:

- [ ] **F1** — Make the PF/Tax/Insurance deduction formula configurable (currently hardcoded in [lib/utils/payroll-utils.ts](../lib/utils/payroll-utils.ts))
- [ ] **F2** — Email/Slack notifications on leave apply / approve / reject
- [ ] **F3** — Auto-accrual cron (e.g., +1 casual per month) using the `accrualRate` field on `LeaveRule`
- [ ] **F4** — Year-end carry-forward batch job (uses `LeaveRule.carryForward` + `maxCarryForwardDays`)
- [ ] **F5** — Migration script: existing form-based leave records → new `LeaveRequest` table
- [ ] **F6** — Sandwich-leave / leap-day rules
- [ ] **F7** — Comp-off / leave encashment
- [ ] **F8** — Mobile widget for apply-leave
- [ ] **F9** — Approver chain (1st-level + 2nd-level approval)

---

## 7. Estimate summary

| Ticket | Effort |
|---|---|
| T1 schema | 0.5d |
| T2 service | 1d |
| T3 APIs | 1d |
| T4 employee UI | 1d |
| T5 approver UI | 0.5d |
| T6 admin/holidays UI | 0.5d |
| T7 sidebar | 0.25d |
| T8 attendance integration | 0.5d |
| T9 payroll integration | 0.5d |
| T10 manual QA + bug-fix buffer | 0.5d |
| **Total** | **~6.25 days** |
