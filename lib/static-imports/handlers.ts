/**
 * Static-page bulk import — handler registry.
 *
 * The data-migration import flow can target two kinds of "modules":
 *
 *   1. Form-builder forms — handled by the existing FormRecord-based pipeline
 *      in /api/forms/.../import-* routes. Mappings target FormField IDs and
 *      the writer creates a FormRecord row per CSV row.
 *
 *   2. Static pages (Employee Master, Leave, Attendance, …) — handled here.
 *      Each static "form" maps to a domain table with its own shape, so we
 *      need a per-formId handler that knows how to take a coreKey-keyed row
 *      and persist it into the right Prisma model.
 *
 * Adding a new static-table import = one entry in `HANDLERS` below. The
 * handler receives the row pre-coerced (string → number / boolean / Date),
 * the organisation scope, and the acting user. It returns an outcome that
 * the route adds into a running tally.
 *
 * Why keep this separate from form-record imports
 * -----------------------------------------------
 * Form-builder rows are schema-less by construction (everything lives in
 * `recordData` JSON). Static-page rows must satisfy real column types,
 * unique constraints, and relations — they need real Prisma writes and
 * real error handling per row. Sharing a single "write to any module" path
 * would either bypass column validation or grow into a generic ORM, neither
 * of which we want.
 */
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { getStaticFormsForModule } from '@/lib/static-page-fields';
import { SUBMODULE_SCHEMAS as INV_SCHEMAS } from '@/lib/inventory-system/schema';
import { SUBMODULE_SCHEMAS as PUR_SCHEMAS } from '@/lib/purchase-system/schema';
import { getPurchasePermissions, sanitizePurchaseImport } from '@/lib/permissions/purchase-permissions';
import type { PurchasePermissions } from '@/lib/purchase-system/types';

export type RowOutcome =
  // `action` distinguishes a brand-new row from an idempotent update of an
  // existing one, so the UI can show "created vs updated" — i.e. prove it
  // isn't re-importing duplicates.
  | { status: 'success'; action?: 'created' | 'updated' }
  | { status: 'failed'; error: string }
  | { status: 'skipped'; reason: string };

export interface ImportContext {
  organizationId: string;
  actingUserId: string;
}

export interface StaticImportHandler {
  /** Synthetic form id (e.g. `static:employee-master`). Matches the formId
   *  surfaced by getStaticFormEntries(). */
  formId: string;
  /** Static-form moduleName from the registry — used to look up the field
   *  list for column coercion. */
  moduleName: string;
  handle: (
    row: Record<string, unknown>,
    ctx: ImportContext,
  ) => Promise<RowOutcome>;
  /**
   * Set-based fast path. The streaming route calls this ONCE with the WHOLE
   * file, so the import is a handful of SQL statements — one dedup SELECT for
   * all rows + bulk inserts/updates — instead of N sequential round-trips.
   * Since each round-trip to a pooled cloud Postgres costs ~1s+, collapsing
   * them is the difference between a 7k-row import taking ~5s vs. minutes.
   *
   * `onProgress(processed)` is invoked after each internal write batch so the
   * caller can stream live progress to the browser.
   *
   * Contract: returns one outcome per input row, in the SAME order, and never
   * throws — it wraps everything and returns `{ status: 'failed' }` per row it
   * couldn't write.
   */
  handleBatch?: (
    rows: Record<string, unknown>[],
    ctx: ImportContext,
    onProgress?: (processed: number) => void,
  ) => Promise<RowOutcome[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coercion helpers — used by every handler so date / number / boolean parsing
// behaves the same regardless of which static table is being written.
// ─────────────────────────────────────────────────────────────────────────────

function asString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function asNumber(v: unknown): number | null {
  const s = asString(v);
  if (s === null) return null;
  // Strip currency symbols / commas before parsing. Whitespace already gone.
  const cleaned = s.replace(/[,₹$]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function asBool(v: unknown): boolean | null {
  const s = asString(v);
  if (s === null) return null;
  const norm = s.toLowerCase();
  if (['true', 'yes', 'y', '1', 'on'].includes(norm)) return true;
  if (['false', 'no', 'n', '0', 'off'].includes(norm)) return false;
  return null;
}

function asDate(v: unknown): Date | null {
  const s = asString(v);
  if (s === null) return null;
  // Accept ISO and common DD/MM/YYYY or DD-MM-YYYY orderings — falls back to
  // Date constructor for everything else. Reject NaN dates.
  const slash = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function asInt(v: unknown): number | null {
  const n = asNumber(v);
  return n === null ? null : Math.round(n);
}

/** Normalise free-text to an enum member (UPPER_SNAKE). Falls back to
 *  `fallback` when the value is empty or not a recognised member. */
function asEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const s = asString(v);
  if (s === null) return fallback;
  const norm = s.toUpperCase().replace(/[\s-]+/g, "_");
  return (allowed as readonly string[]).includes(norm) ? (norm as T) : fallback;
}

/** "YYYY-MM-DD" string (matches Attendance.date / LeaveRequest.startDate). */
function asDateString(v: unknown): string | null {
  const d = asDate(v);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};
function asMonth(v: unknown): number | null {
  const s = asString(v);
  if (s === null) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return Math.round(n);
  return MONTH_NAMES[s.toLowerCase()] ?? null;
}

// ── Reference resolvers — link import rows to existing records ───────────────
// All org-scoped where the target table carries an org (directly or via User).

/** Resolve a User by id or email within the org. Returns the User.id or null. */
async function resolveUserId(value: unknown, orgId: string): Promise<string | null> {
  const v = asString(value);
  if (!v) return null;
  const byId = await prisma.user.findFirst({
    where: { id: v, organizationId: orgId }, select: { id: true },
  });
  if (byId) return byId.id;
  const byEmail = await prisma.user.findFirst({
    where: { email: v, organizationId: orgId }, select: { id: true },
  });
  return byEmail?.id ?? null;
}

/** Resolve an Employee by name or email (org-scoped through the linked User,
 *  or unlinked employees created in this org). Returns Employee.id or null. */
async function resolveEmployeeId(
  nameOrEmail: unknown, orgId: string,
): Promise<string | null> {
  const v = asString(nameOrEmail);
  if (!v) return null;
  const emp = await prisma.employee.findFirst({
    where: {
      OR: [
        { employeeName: { equals: v, mode: "insensitive" } },
        { emailAddress1: { equals: v, mode: "insensitive" } },
        { emailAddress2: { equals: v, mode: "insensitive" } },
      ],
      AND: [{ OR: [{ user: { organizationId: orgId } }, { userId: null }] }],
    },
    select: { id: true },
  });
  return emp?.id ?? null;
}

/** Resolve a LeaveType by code (preferred) or name. LeaveType is global. */
async function resolveLeaveTypeId(code: unknown, name: unknown): Promise<string | null> {
  const c = asString(code);
  if (c) {
    const byCode = await prisma.leaveType.findFirst({ where: { code: c }, select: { id: true } });
    if (byCode) return byCode.id;
  }
  const n = asString(name);
  if (n) {
    const byName = await prisma.leaveType.findFirst({
      where: { name: { equals: n, mode: "insensitive" } }, select: { id: true },
    });
    if (byName) return byName.id;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee Master — primary handler. Creates a User row (so the employee
// can log in / be referenced by Attendance) and an Employee row linked to
// it. If the email already exists in the org we skip to avoid creating
// duplicate users on re-import.
// ─────────────────────────────────────────────────────────────────────────────

async function handleEmployeeMaster(
  row: Record<string, unknown>,
  ctx: ImportContext,
): Promise<RowOutcome> {
  const firstName = asString(row.firstName);
  const lastName = asString(row.lastName);
  const employeeName =
    asString(row.employeeName) ||
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    null;
  if (!employeeName) {
    return { status: 'failed', error: 'Missing employee name (employeeName / firstName + lastName)' };
  }

  const email =
    asString(row.emailAddress1) || asString(row.emailAddress2) || null;

  try {
    return await prisma.$transaction(async (tx) => {
      // Find-or-create the user. Org-scoped uniqueness on email — the global
      // User table has unique email so a collision means the same person; we
      // skip rather than crash so re-imports stay idempotent.
      let userId: string | null = null;
      if (email) {
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) {
          if (existing.organizationId !== ctx.organizationId) {
            return {
              status: 'failed',
              error: `Email ${email} exists in another organisation`,
            };
          }
          userId = existing.id;
        } else {
          const u = await tx.user.create({
            data: {
              email,
              organizationId: ctx.organizationId,
              first_name: firstName ?? '',
              last_name: lastName ?? '',
              status: 'ACTIVE',
              email_verified: true,
            },
          });
          userId = u.id;
        }
        // If a Employee row already exists for this user, skip — caller
        // can choose "update" mode in a future iteration but for now we
        // refuse to clobber.
        if (userId) {
          const dup = await tx.employee.findFirst({ where: { userId } });
          if (dup) {
            return {
              status: 'skipped',
              reason: `Employee for ${email} already exists`,
            };
          }
        }
      }

      const data: any = {
        employeeName,
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
        salutation: asString(row.salutation) ?? undefined,
        gender: asString(row.gender)?.toUpperCase() as any,
        dob: asDate(row.dob),
        nativePlace: asString(row.nativePlace) ?? undefined,
        country: asString(row.country) ?? undefined,
        department: asString(row.department) ?? undefined,
        designation: asString(row.designation) ?? undefined,
        companyName: asString(row.companyName) ?? undefined,
        employeeEngagementTeamName:
          asString(row.employeeEngagementTeamName) ?? undefined,
        dateOfJoining: asDate(row.dateOfJoining),
        dateOfLeaving: asDate(row.dateOfLeaving),
        emailAddress1: asString(row.emailAddress1) ?? undefined,
        emailAddress2: asString(row.emailAddress2) ?? undefined,
        personalContact: asString(row.personalContact) ?? undefined,
        alternateNo1: asString(row.alternateNo1) ?? undefined,
        alternateNo2: asString(row.alternateNo2) ?? undefined,
        permanentAddress: asString(row.permanentAddress) ?? undefined,
        currentAddress: asString(row.currentAddress) ?? undefined,
        shiftType: asString(row.shiftType) ?? undefined,
        inTime: asString(row.inTime) ?? undefined,
        outTime: asString(row.outTime) ?? undefined,
        totalSalary: asNumber(row.totalSalary) ?? undefined,
        givenSalary: asNumber(row.givenSalary) ?? undefined,
        bonusAmount: asNumber(row.bonusAmount) ?? undefined,
        nightAllowance: asNumber(row.nightAllowance) ?? undefined,
        overTime: asNumber(row.overTime) ?? undefined,
        oneHourExtra: asNumber(row.oneHourExtra) ?? undefined,
        incrementMonth: asNumber(row.incrementMonth) ?? undefined,
        yearsOfAgreement: asNumber(row.yearsOfAgreement) ?? undefined,
        bonusAfterYears: asNumber(row.bonusAfterYears) ?? undefined,
        bankName: asString(row.bankName) ?? undefined,
        bankAccountNo: asString(row.bankAccountNo) ?? undefined,
        ifscCode: asString(row.ifscCode) ?? undefined,
        aadharCardNo: asString(row.aadharCardNo) ?? undefined,
        companySimIssue: asBool(row.companySimIssue) ?? undefined,
        userId: userId ?? undefined,
      };

      // Strip undefineds so Prisma doesn't set columns to null we didn't
      // ask about (matters for partial-column CSVs).
      Object.keys(data).forEach((k) => {
        if (data[k] === undefined) delete data[k];
      });

      await tx.employee.create({ data });
      return { status: 'success' };
    });
  } catch (err: any) {
    return {
      status: 'failed',
      error: err?.message || String(err) || 'Unknown error',
    };
  }
}

const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;

/** Build the Employee column bag from a coerced row (no userId — the caller
 *  links it). Shared by the single + batch employee handlers. */
function buildEmployeeColumns(
  row: Record<string, unknown>,
  firstName: string | null,
  lastName: string | null,
  employeeName: string,
): Record<string, any> {
  const g = asString(row.gender)?.toUpperCase();
  const data: Record<string, any> = {
    employeeName,
    firstName: firstName ?? undefined,
    lastName: lastName ?? undefined,
    salutation: asString(row.salutation) ?? undefined,
    gender: g && (GENDERS as readonly string[]).includes(g) ? g : undefined,
    dob: asDate(row.dob) ?? undefined,
    nativePlace: asString(row.nativePlace) ?? undefined,
    country: asString(row.country) ?? undefined,
    department: asString(row.department) ?? undefined,
    designation: asString(row.designation) ?? undefined,
    companyName: asString(row.companyName) ?? undefined,
    employeeEngagementTeamName: asString(row.employeeEngagementTeamName) ?? undefined,
    dateOfJoining: asDate(row.dateOfJoining) ?? undefined,
    dateOfLeaving: asDate(row.dateOfLeaving) ?? undefined,
    emailAddress1: asString(row.emailAddress1) ?? undefined,
    emailAddress2: asString(row.emailAddress2) ?? undefined,
    personalContact: asString(row.personalContact) ?? undefined,
    alternateNo1: asString(row.alternateNo1) ?? undefined,
    alternateNo2: asString(row.alternateNo2) ?? undefined,
    permanentAddress: asString(row.permanentAddress) ?? undefined,
    currentAddress: asString(row.currentAddress) ?? undefined,
    shiftType: asString(row.shiftType) ?? undefined,
    inTime: asString(row.inTime) ?? undefined,
    outTime: asString(row.outTime) ?? undefined,
    totalSalary: asNumber(row.totalSalary) ?? undefined,
    givenSalary: asNumber(row.givenSalary) ?? undefined,
    bonusAmount: asNumber(row.bonusAmount) ?? undefined,
    nightAllowance: asNumber(row.nightAllowance) ?? undefined,
    overTime: asNumber(row.overTime) ?? undefined,
    oneHourExtra: asNumber(row.oneHourExtra) ?? undefined,
    incrementMonth: asInt(row.incrementMonth) ?? undefined,
    yearsOfAgreement: asInt(row.yearsOfAgreement) ?? undefined,
    bonusAfterYears: asInt(row.bonusAfterYears) ?? undefined,
    bankName: asString(row.bankName) ?? undefined,
    bankAccountNo: asString(row.bankAccountNo) ?? undefined,
    ifscCode: asString(row.ifscCode) ?? undefined,
    aadharCardNo: asString(row.aadharCardNo) ?? undefined,
    companySimIssue: asBool(row.companySimIssue) ?? undefined,
  };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee Master — BATCH fast path. Replaces 7k× (find user + create user +
// find employee + create employee) transactions with: one users-by-email
// SELECT, one employees-by-userId SELECT, one users createMany, one employees
// createMany. Idempotent: an existing employee for an email is skipped; a user
// that exists without an employee gets one linked. Rows without an email always
// insert (can't be deduped). Per-row fallback covers any bulk-insert rejection.
// ─────────────────────────────────────────────────────────────────────────────
async function handleEmployeeMasterBatch(
  rows: Record<string, unknown>[],
  ctx: ImportContext,
  onProgress?: (processed: number) => void,
): Promise<RowOutcome[]> {
  const n = rows.length;
  const outcomes: RowOutcome[] = new Array(n);
  let processed = 0;
  const tick = (delta: number) => { processed += delta; onProgress?.(processed); };

  type Prep = {
    i: number;
    employeeName: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    columns: Record<string, any>;
  };
  const prepared: Prep[] = [];

  for (let i = 0; i < n; i++) {
    const row = rows[i];
    const firstName = asString(row.firstName);
    const lastName = asString(row.lastName);
    const employeeName =
      asString(row.employeeName) ||
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      null;
    if (!employeeName) {
      outcomes[i] = { status: 'failed', error: 'Missing employee name (employeeName / firstName + lastName)' };
      continue;
    }
    const email = asString(row.emailAddress1) || asString(row.emailAddress2) || null;
    prepared.push({
      i, employeeName, email, firstName, lastName,
      columns: buildEmployeeColumns(row, firstName, lastName, employeeName),
    });
  }
  if (n - prepared.length > 0) tick(n - prepared.length); // missing-name rows decided
  if (!prepared.length) return outcomes;

  try {
    // Existing users for the emails in this chunk (one query).
    const emails = Array.from(new Set(prepared.filter((p) => p.email).map((p) => p.email!)));
    const existingUsers = emails.length
      ? await prisma.user.findMany({
          where: { email: { in: emails } },
          select: { id: true, email: true, organizationId: true },
        })
      : [];
    const userByEmail = new Map(existingUsers.map((u) => [u.email, u]));

    // Which of those users already have an Employee (one query).
    const existingUserIds = existingUsers.map((u) => u.id);
    const existingEmployees = existingUserIds.length
      ? await prisma.employee.findMany({
          where: { userId: { in: existingUserIds } },
          select: { userId: true },
        })
      : [];
    const userIdsWithEmployee = new Set(existingEmployees.map((e) => e.userId));

    const usersToCreate: any[] = [];
    const employeesToCreate: Array<Record<string, any> & { _outIdx: number }> = [];
    const claimedEmail = new Set<string>(); // first row per email in this chunk wins

    for (const p of prepared) {
      if (p.email) {
        const existing = userByEmail.get(p.email);
        if (existing) {
          if (existing.organizationId !== ctx.organizationId) {
            outcomes[p.i] = { status: 'failed', error: `Email ${p.email} exists in another organisation` };
            tick(1);
            continue;
          }
          if (userIdsWithEmployee.has(existing.id) || claimedEmail.has(p.email)) {
            outcomes[p.i] = { status: 'skipped', reason: `Employee for ${p.email} already exists` };
            tick(1);
            continue;
          }
          claimedEmail.add(p.email);
          employeesToCreate.push({ ...p.columns, userId: existing.id, _outIdx: p.i });
        } else {
          if (claimedEmail.has(p.email)) {
            outcomes[p.i] = { status: 'skipped', reason: `Duplicate email ${p.email} in file` };
            tick(1);
            continue;
          }
          claimedEmail.add(p.email);
          const newUserId = uuidv4();
          usersToCreate.push({
            id: newUserId,
            email: p.email,
            organizationId: ctx.organizationId,
            first_name: p.firstName ?? '',
            last_name: p.lastName ?? '',
            status: 'ACTIVE',
            email_verified: true,
          });
          employeesToCreate.push({ ...p.columns, userId: newUserId, _outIdx: p.i });
        }
      } else {
        // No email → no dedup key, always insert an unlinked Employee.
        employeesToCreate.push({ ...p.columns, userId: null, _outIdx: p.i });
      }
    }

    if (usersToCreate.length) {
      try {
        await prisma.user.createMany({ data: usersToCreate, skipDuplicates: true });
      } catch {
        // Fall back per-user so one bad row doesn't sink the whole chunk; the
        // ids are pre-assigned so the linked employees still resolve.
        for (const u of usersToCreate) {
          try { await prisma.user.create({ data: u }); } catch { /* employee insert will fail → row marked failed */ }
        }
      }
    }

    // Bulk-insert employees in chunks so the browser sees live progress.
    const EMP_CHUNK = 1000;
    for (let off = 0; off < employeesToCreate.length; off += EMP_CHUNK) {
      const chunk = employeesToCreate.slice(off, off + EMP_CHUNK);
      const records = chunk.map(({ _outIdx, ...r }) => r);
      try {
        await prisma.employee.createMany({ data: records as any, skipDuplicates: true });
        for (const e of chunk) outcomes[e._outIdx] = { status: 'success', action: 'created' };
      } catch {
        for (const e of chunk) {
          const { _outIdx, ...rec } = e;
          try { await prisma.employee.create({ data: rec as any }); outcomes[_outIdx] = { status: 'success', action: 'created' }; }
          catch (err: any) { outcomes[_outIdx] = { status: 'failed', error: err?.message || 'Insert failed' }; }
        }
      }
      tick(chunk.length);
    }

    // Any prepared row we never assigned (shouldn't happen) → mark failed.
    for (const p of prepared) if (!outcomes[p.i]) outcomes[p.i] = { status: 'failed', error: 'Not processed' };
    return outcomes;
  } catch (err: any) {
    // Whole-chunk failure (e.g. DB unreachable) — mark every unresolved row.
    for (const p of prepared) if (!outcomes[p.i]) outcomes[p.i] = { status: 'failed', error: err?.message || 'Batch failed' };
    return outcomes;
  }
}

// ── Enum value sets (UPPER_SNAKE) used for safe coercion ────────────────────
const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY', 'CONSULTANT'] as const;
const STAFFING_PLAN_STATUS = ['DRAFT', 'OPEN', 'ON_HOLD', 'FILLED', 'CANCELLED'] as const;
const JOB_OPENING_STATUS = ['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED'] as const;
const JOB_APPLICATION_STATUS = ['NEW', 'SCREENING', 'INTERVIEWING', 'SHORTLISTED', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN', 'ON_HOLD'] as const;
const APPLICANT_SOURCE = ['REFERRAL', 'JOB_PORTAL', 'COMPANY_WEBSITE', 'LINKEDIN', 'AGENCY', 'WALK_IN', 'CAMPUS', 'OTHER'] as const;
const JOB_OFFER_STATUS = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'] as const;
const APPOINTMENT_LETTER_STATUS = ['DRAFT', 'ISSUED', 'SIGNED', 'REVOKED'] as const;
const EMPLOYEE_REFERRAL_STATUS = ['NEW', 'REVIEWED', 'INTERVIEWING', 'HIRED', 'REJECTED'] as const;
const PROPERTY_TYPE = ['RESIDENTIAL', 'COMMERCIAL', 'LAND', 'INDUSTRIAL', 'AGRICULTURAL'] as const;
const PROPERTY_SUBTYPE = ['APARTMENT', 'VILLA', 'HOUSE', 'TOWNHOUSE', 'STUDIO', 'PENTHOUSE', 'OFFICE', 'RETAIL', 'WAREHOUSE', 'HOTEL', 'PLOT', 'FARM', 'OTHER'] as const;
const PROPERTY_STATUS = ['DRAFT', 'AVAILABLE', 'UNDER_CONTRACT', 'SOLD', 'WITHDRAWN', 'EXPIRED'] as const;
const COMMISSION_TERM_TYPE = ['PERCENTAGE', 'FLAT_FEE'] as const;
const LEAD_ORIGIN = ['AGENT', 'COMPANY'] as const;
const LEAD_STATUS = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_SCHEDULED', 'NEGOTIATING', 'CONVERTED', 'LOST'] as const;
const LEAD_SCORE = ['HOT', 'WARM', 'COLD'] as const;
const LEAD_SOURCE = ['WEBSITE', 'REFERRAL', 'WALK_IN', 'PORTAL', 'SOCIAL', 'CAMPAIGN', 'WEBHOOK', 'OTHER'] as const;
const LEAVE_REQUEST_STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
const INVENTORY_PRODUCT_STATUS = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;

// Drop undefined keys so Prisma update() doesn't clobber columns absent from a
// partial CSV (undefined is already ignored by Prisma, but this keeps create
// payloads tidy too).
function clean<T extends Record<string, any>>(obj: T): T {
  Object.keys(obj).forEach((k) => obj[k] === undefined && delete obj[k]);
  return obj;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recruitment — Staffing Plan (standalone)
// ─────────────────────────────────────────────────────────────────────────────
async function handleStaffingPlan(row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> {
  const profileName = asString(row.profileName);
  const department = asString(row.department);
  const designation = asString(row.designation);
  if (!profileName || !department || !designation) {
    return { status: 'failed', error: 'Missing required field (profileName / department / designation)' };
  }
  const data = clean({
    planCode: asString(row.planCode) ?? undefined,
    profileName, department, designation,
    employmentType: asEnum(row.employmentType, EMPLOYMENT_TYPES, 'FULL_TIME'),
    vacancies: asInt(row.vacancies) ?? 1,
    estimatedCostPerPerson: asNumber(row.estimatedCostPerPerson) ?? undefined,
    totalEstimatedCost: asNumber(row.totalEstimatedCost) ?? undefined,
    status: asEnum(row.status, STAFFING_PLAN_STATUS, 'DRAFT'),
    notes: asString(row.notes) ?? undefined,
    organizationId: ctx.organizationId,
    createdById: ctx.actingUserId,
  });
  try {
    const code = asString(row.planCode);
    if (code) {
      const existing = await prisma.staffingPlan.findUnique({ where: { planCode: code }, select: { id: true } });
      if (existing) { await prisma.staffingPlan.update({ where: { id: existing.id }, data }); return { status: 'success' }; }
    }
    await prisma.staffingPlan.create({ data: data as any });
    return { status: 'success' };
  } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recruitment — Job Opening (standalone)
// ─────────────────────────────────────────────────────────────────────────────
async function handleJobOpening(row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> {
  const profileName = asString(row.profileName);
  const department = asString(row.department);
  const designation = asString(row.designation);
  if (!profileName || !department || !designation) {
    return { status: 'failed', error: 'Missing required field (profileName / department / designation)' };
  }
  const data = clean({
    jobCode: asString(row.jobCode) ?? undefined,
    profileName, department, designation,
    employmentType: asEnum(row.employmentType, EMPLOYMENT_TYPES, 'FULL_TIME'),
    vacancies: asInt(row.vacancies) ?? 1,
    status: asEnum(row.status, JOB_OPENING_STATUS, 'OPEN'),
    publishOnWebsite: asBool(row.publishOnWebsite) ?? false,
    salaryApprox: asString(row.salaryApprox) ?? undefined,
    jobDescription: asString(row.jobDescription) ?? '',
    organizationId: ctx.organizationId,
    createdById: ctx.actingUserId,
  });
  try {
    const code = asString(row.jobCode);
    if (code) {
      const existing = await prisma.jobOpening.findUnique({ where: { jobCode: code }, select: { id: true } });
      if (existing) { await prisma.jobOpening.update({ where: { id: existing.id }, data }); return { status: 'success' }; }
    }
    await prisma.jobOpening.create({ data: data as any });
    return { status: 'success' };
  } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recruitment — Job Application (links to opening by jobCode if present)
// ─────────────────────────────────────────────────────────────────────────────
async function handleJobApplication(row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> {
  const applicantName = asString(row.applicantName);
  const applicantEmail = asString(row.applicantEmail);
  const applicantMobile = asString(row.applicantMobile);
  if (!applicantName || !applicantEmail || !applicantMobile) {
    return { status: 'failed', error: 'Missing required field (applicantName / applicantEmail / applicantMobile)' };
  }
  let jobOpeningId: string | undefined;
  const jobCode = asString(row.jobCode);
  if (jobCode) {
    const op = await prisma.jobOpening.findUnique({ where: { jobCode }, select: { id: true } });
    jobOpeningId = op?.id;
  }
  const data = clean({
    applicationCode: asString(row.applicationCode) ?? undefined,
    jobOpeningId,
    applicantName, applicantEmail, applicantMobile,
    applicantSource: row.applicantSource ? asEnum(row.applicantSource, APPLICANT_SOURCE, 'OTHER') : undefined,
    applicantResumeUrl: asString(row.applicantResumeUrl) ?? undefined,
    applicantResumeName: asString(row.applicantResumeName) ?? undefined,
    department: asString(row.department) ?? undefined,
    designation: asString(row.designation) ?? undefined,
    employmentType: row.employmentType ? asEnum(row.employmentType, EMPLOYMENT_TYPES, 'FULL_TIME') : undefined,
    salaryExpectation: asString(row.salaryExpectation) ?? undefined,
    coverLetter: asString(row.coverLetter) ?? undefined,
    jobDescription: asString(row.jobDescription) ?? undefined,
    applicantRating: asInt(row.applicantRating) ?? undefined,
    status: asEnum(row.status, JOB_APPLICATION_STATUS, 'NEW'),
    organizationId: ctx.organizationId,
    createdById: ctx.actingUserId,
  });
  try {
    const code = asString(row.applicationCode);
    if (code) {
      const existing = await prisma.jobApplication.findUnique({ where: { applicationCode: code }, select: { id: true } });
      if (existing) { await prisma.jobApplication.update({ where: { id: existing.id }, data }); return { status: 'success' }; }
    }
    await prisma.jobApplication.create({ data: data as any });
    return { status: 'success' };
  } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recruitment — Job Offer
// ─────────────────────────────────────────────────────────────────────────────
async function handleJobOffer(row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> {
  const applicantName = asString(row.applicantName);
  if (!applicantName) return { status: 'failed', error: 'Missing applicantName' };
  const data = clean({
    offerCode: asString(row.offerCode) ?? undefined,
    applicantName,
    applicantEmail: asString(row.applicantEmail) ?? undefined,
    offerDate: asDate(row.offerDate) ?? new Date(),
    status: asEnum(row.status, JOB_OFFER_STATUS, 'DRAFT'),
    jobOfferTerm: asString(row.jobOfferTerm) ?? undefined,
    valueDescription: asString(row.valueDescription) ?? undefined,
    termsAndConditions: asString(row.termsAndConditions) ?? undefined,
    organizationId: ctx.organizationId,
    createdById: ctx.actingUserId,
  });
  try {
    const code = asString(row.offerCode);
    if (code) {
      const existing = await prisma.jobOffer.findUnique({ where: { offerCode: code }, select: { id: true } });
      if (existing) { await prisma.jobOffer.update({ where: { id: existing.id }, data }); return { status: 'success' }; }
    }
    await prisma.jobOffer.create({ data: data as any });
    return { status: 'success' };
  } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recruitment — Appointment Letter
// ─────────────────────────────────────────────────────────────────────────────
async function handleAppointmentLetter(row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> {
  const applicantName = asString(row.applicantName);
  if (!applicantName) return { status: 'failed', error: 'Missing applicantName' };
  const data = clean({
    letterCode: asString(row.letterCode) ?? undefined,
    applicantName,
    applicantEmail: asString(row.applicantEmail) ?? undefined,
    company: asString(row.company) ?? undefined,
    appointmentDate: asDate(row.appointmentDate) ?? new Date(),
    templateName: asString(row.templateName) ?? undefined,
    status: asEnum(row.status, APPOINTMENT_LETTER_STATUS, 'DRAFT'),
    title: asString(row.title) ?? undefined,
    introduction: asString(row.introduction) ?? undefined,
    description: asString(row.description) ?? undefined,
    closingNotes: asString(row.closingNotes) ?? undefined,
    signed: asBool(row.signed) ?? false,
    signedDate: asDate(row.signedDate) ?? undefined,
    organizationId: ctx.organizationId,
    createdById: ctx.actingUserId,
  });
  try {
    const code = asString(row.letterCode);
    if (code) {
      const existing = await prisma.appointmentLetter.findUnique({ where: { letterCode: code }, select: { id: true } });
      if (existing) { await prisma.appointmentLetter.update({ where: { id: existing.id }, data }); return { status: 'success' }; }
    }
    await prisma.appointmentLetter.create({ data: data as any });
    return { status: 'success' };
  } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recruitment — Employee Referral (referrer must resolve to an Employee)
// ─────────────────────────────────────────────────────────────────────────────
async function handleEmployeeReferral(row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> {
  const applicantName = asString(row.applicantName);
  const applicantEmail = asString(row.applicantEmail);
  const applicantMobile = asString(row.applicantMobile);
  const referrerFirstName = asString(row.referrerFirstName);
  if (!applicantName || !applicantEmail || !applicantMobile || !referrerFirstName) {
    return { status: 'failed', error: 'Missing required field (applicantName / applicantEmail / applicantMobile / referrerFirstName)' };
  }
  const referringEmployeeId = await resolveEmployeeId(referrerFirstName, ctx.organizationId);
  if (!referringEmployeeId) {
    return { status: 'failed', error: `Referring employee not found: "${referrerFirstName}"` };
  }
  const data = clean({
    referralCode: asString(row.referralCode) ?? undefined,
    applicantName, applicantEmail, applicantMobile,
    applicantResumeUrl: asString(row.applicantResumeUrl) ?? undefined,
    applicantResumeName: asString(row.applicantResumeName) ?? undefined,
    referralDate: asDate(row.referralDate) ?? new Date(),
    designation: asString(row.designation) ?? undefined,
    referringEmployeeId,
    referrerFirstName,
    referrerDepartment: asString(row.referrerDepartment) ?? undefined,
    remark: asString(row.remark) ?? undefined,
    status: asEnum(row.status, EMPLOYEE_REFERRAL_STATUS, 'NEW'),
    organizationId: ctx.organizationId,
    createdById: ctx.actingUserId,
  });
  try {
    const code = asString(row.referralCode);
    if (code) {
      const existing = await prisma.employeeReferral.findUnique({ where: { referralCode: code }, select: { id: true } });
      if (existing) { await prisma.employeeReferral.update({ where: { id: existing.id }, data }); return { status: 'success' }; }
    }
    await prisma.employeeReferral.create({ data: data as any });
    return { status: 'success' };
  } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// HR — Payroll Record (keyed by employeeId + month + year)
// ─────────────────────────────────────────────────────────────────────────────
async function handlePayrollRecord(row: Record<string, unknown>, _ctx: ImportContext): Promise<RowOutcome> {
  const employeeId = asString(row.employeeId);
  const month = asMonth(row.month);
  const year = asInt(row.year);
  if (!employeeId || !month || !year) {
    return { status: 'failed', error: 'Missing required field (employeeId / month / year)' };
  }
  const baseSalary = asNumber(row.basicSalary) ?? 0;
  const allowances = asNumber(row.totalAllowances) ?? 0;
  const deductions = asNumber(row.totalDeductions) ?? 0;
  const data = clean({
    employeeId, month, year,
    presentDays: asInt(row.daysWorked) ?? 0,
    leaveDays: asNumber(row.daysAbsent) ?? 0,
    overtimeHours: asNumber(row.overtimeHours) ?? 0,
    baseSalary,
    grossSalary: baseSalary + allowances,
    deductions,
    netSalary: asNumber(row.netSalary) ?? (baseSalary + allowances - deductions),
    status: asString(row.status) ?? 'pending',
    paidAt: asDate(row.paymentDate) ?? undefined,
  });
  try {
    const existing = await prisma.payrollRecord.findUnique({
      where: { employeeId_month_year: { employeeId, month, year } }, select: { id: true },
    });
    if (existing) { await prisma.payrollRecord.update({ where: { id: existing.id }, data }); return { status: 'success' }; }
    await prisma.payrollRecord.create({ data: data as any });
    return { status: 'success' };
  } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// HR — Attendance (keyed by user + date; user resolved by id/email)
// ─────────────────────────────────────────────────────────────────────────────
async function handleAttendance(row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> {
  const userId = await resolveUserId(row.userId, ctx.organizationId);
  const date = asDateString(row.date);
  if (!userId) return { status: 'failed', error: `Employee/user not found: "${asString(row.userId) ?? ''}"` };
  if (!date) return { status: 'failed', error: 'Missing or invalid date' };
  const data = clean({
    userId, date,
    organizationId: ctx.organizationId,
    checkedIn: asBool(row.checkedIn) ?? undefined,
    checkedOut: asBool(row.checkedOut) ?? undefined,
    checkInAt: asDate(row.checkInAt) ?? undefined,
    checkOutAt: asDate(row.checkOutAt) ?? undefined,
    lateMinutes: asInt(row.lateMinutes) ?? undefined,
    earlyOutMinutes: asInt(row.earlyOutMinutes) ?? undefined,
    overtimeMinutes: asInt(row.overtimeMinutes) ?? undefined,
    overtimeOptedIn: asBool(row.overtimeOptedIn) ?? undefined,
    overtimeStartedAt: asDate(row.overtimeStartedAt) ?? undefined,
    isAutoCheckedOut: asBool(row.isAutoCheckedOut) ?? undefined,
  });
  try {
    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId, date } }, select: { id: true },
    });
    if (existing) { await prisma.attendance.update({ where: { id: existing.id }, data }); return { status: 'success' }; }
    await prisma.attendance.create({ data: data as any });
    return { status: 'success' };
  } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// HR — Leave Request (user resolved by email, leave type by code/name)
// ─────────────────────────────────────────────────────────────────────────────
function mapLeaveDuration(v: unknown): 'FULL_DAY' | 'HALF_DAY_FIRST' | 'HALF_DAY_SECOND' {
  const s = (asString(v) ?? '').toUpperCase();
  if (s.includes('SECOND') || s.includes('AFTERNOON')) return 'HALF_DAY_SECOND';
  if (s.includes('HALF') || s.includes('FIRST') || s.includes('MORNING')) return 'HALF_DAY_FIRST';
  return 'FULL_DAY';
}
async function handleLeaveRequest(row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> {
  const userId = await resolveUserId(row.applicantEmail, ctx.organizationId);
  if (!userId) return { status: 'failed', error: `Applicant not found by email: "${asString(row.applicantEmail) ?? ''}"` };
  const leaveTypeId = await resolveLeaveTypeId(row.leaveTypeCode, row.leaveTypeName);
  if (!leaveTypeId) return { status: 'failed', error: `Leave type not found: "${asString(row.leaveTypeCode) ?? asString(row.leaveTypeName) ?? ''}"` };
  const startDate = asDateString(row.startDate);
  const endDate = asDateString(row.endDate) ?? startDate;
  if (!startDate || !endDate) return { status: 'failed', error: 'Missing or invalid startDate / endDate' };
  const data = clean({
    organizationId: ctx.organizationId,
    userId, leaveTypeId, startDate, endDate,
    duration: mapLeaveDuration(row.duration),
    totalDays: asNumber(row.totalDays) ?? 1,
    reason: asString(row.reason) ?? undefined,
    attachmentUrl: asString(row.attachmentUrl) ?? undefined,
    isEmergency: asBool(row.isEmergency) ?? false,
    status: asEnum(row.status, LEAVE_REQUEST_STATUS, 'PENDING'),
    appliedAt: asDate(row.appliedAt) ?? undefined,
    decidedAt: asDate(row.decidedAt) ?? undefined,
    decisionNote: asString(row.decisionNote) ?? undefined,
  });
  try {
    await prisma.leaveRequest.create({ data: data as any });
    return { status: 'success' };
  } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Real Estate — Property (keyed by org + code for re-import)
// ─────────────────────────────────────────────────────────────────────────────
async function handleProperty(row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> {
  const title = asString(row.title);
  if (!title) return { status: 'failed', error: 'Missing title' };
  const data = clean({
    organizationId: ctx.organizationId,
    title,
    code: asString(row.code) ?? undefined,
    description: asString(row.description) ?? undefined,
    type: asEnum(row.type, PROPERTY_TYPE, 'RESIDENTIAL'),
    subType: row.subType ? asEnum(row.subType, PROPERTY_SUBTYPE, 'OTHER') : undefined,
    status: asEnum(row.status, PROPERTY_STATUS, 'DRAFT'),
    addressLine1: asString(row.addressLine1) ?? '',
    addressLine2: asString(row.addressLine2) ?? undefined,
    city: asString(row.city) ?? '',
    state: asString(row.state) ?? undefined,
    country: asString(row.country) ?? '',
    postalCode: asString(row.postalCode) ?? undefined,
    listingPrice: asNumber(row.listingPrice) ?? 0,
    currency: asString(row.currency) ?? 'INR',
    area: asNumber(row.area) ?? undefined,
    areaUnit: asString(row.areaUnit) ?? undefined,
    bedrooms: asInt(row.bedrooms) ?? undefined,
    bathrooms: asInt(row.bathrooms) ?? undefined,
    parkingSpots: asInt(row.parkingSpots) ?? undefined,
    yearBuilt: asInt(row.yearBuilt) ?? undefined,
    commissionTermType: asEnum(row.commissionTermType, COMMISSION_TERM_TYPE, 'PERCENTAGE'),
    commissionPercentage: asNumber(row.commissionPercentage) ?? undefined,
    commissionFlatFee: asNumber(row.commissionFlatFee) ?? undefined,
    listedAt: asDate(row.listedAt) ?? undefined,
    expectedClosingAt: asDate(row.expectedClosingAt) ?? undefined,
    finalClosingAt: asDate(row.finalClosingAt) ?? undefined,
    listingAgentId: ctx.actingUserId,
    createdById: ctx.actingUserId,
  });
  try {
    const code = asString(row.code);
    if (code) {
      const existing = await prisma.property.findFirst({
        where: { organizationId: ctx.organizationId, code }, select: { id: true },
      });
      if (existing) { await prisma.property.update({ where: { id: existing.id }, data }); return { status: 'success' }; }
    }
    await prisma.property.create({ data: data as any });
    return { status: 'success' };
  } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Real Estate — Lead (deduped by org + email when an email is present)
// ─────────────────────────────────────────────────────────────────────────────
async function handleLead(row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> {
  const name = asString(row.name);
  if (!name) return { status: 'failed', error: 'Missing name' };
  const email = asString(row.email);
  const phone = asString(row.phone);
  const data = clean({
    organizationId: ctx.organizationId,
    name, email: email ?? undefined, phone: phone ?? undefined,
    altPhone: asString(row.altPhone) ?? undefined,
    origin: asEnum(row.origin, LEAD_ORIGIN, 'AGENT'),
    status: asEnum(row.status, LEAD_STATUS, 'NEW'),
    score: asEnum(row.score, LEAD_SCORE, 'WARM'),
    source: asEnum(row.source, LEAD_SOURCE, 'OTHER'),
    sourceDetails: asString(row.sourceDetails) ?? undefined,
    budgetMin: asNumber(row.budgetMin) ?? undefined,
    budgetMax: asNumber(row.budgetMax) ?? undefined,
    bedroomsMin: asInt(row.bedroomsMin) ?? undefined,
    assignedAt: asDate(row.assignedAt) ?? undefined,
    nextFollowUpAt: asDate(row.nextFollowUpAt) ?? undefined,
    lastContactedAt: asDate(row.lastContactedAt) ?? undefined,
    convertedAt: asDate(row.convertedAt) ?? undefined,
    lostReason: asString(row.lostReason) ?? undefined,
    notes: asString(row.notes) ?? undefined,
    emailNormalized: email ? email.toLowerCase() : undefined,
    phoneNormalized: phone ? phone.replace(/\D/g, '') : undefined,
    createdById: ctx.actingUserId,
  });
  try {
    if (email) {
      const existing = await prisma.lead.findFirst({
        where: { organizationId: ctx.organizationId, emailNormalized: email.toLowerCase() }, select: { id: true },
      });
      if (existing) { await prisma.lead.update({ where: { id: existing.id }, data }); return { status: 'success' }; }
    }
    await prisma.lead.create({ data: data as any });
    return { status: 'success' };
  } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory — Product catalog (the one inventory page with a real DB table).
// Keyed by (organizationId, slug); slug derived from name when not provided.
// ─────────────────────────────────────────────────────────────────────────────
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
async function handleInventoryProduct(row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> {
  const name = asString(row.name);
  if (!name) return { status: 'failed', error: 'Missing product name' };
  const slug = asString(row.slug) || slugify(name);
  if (!slug) return { status: 'failed', error: 'Could not derive a slug from the name' };
  const data = clean({
    organizationId: ctx.organizationId,
    name,
    slug,
    sku: asString(row.sku) ?? undefined,
    shortDescription: asString(row.shortDescription) ?? undefined,
    description: asString(row.description) ?? undefined,
    status: asEnum(row.status, INVENTORY_PRODUCT_STATUS, 'DRAFT'),
    price: asNumber(row.price) ?? 0,
    compareAtPrice: asNumber(row.compareAtPrice) ?? undefined,
    currency: asString(row.currency) ?? 'INR',
    taxRate: asNumber(row.taxRate) ?? undefined,
    stockQty: asInt(row.stockQty) ?? 0,
    lowStockThreshold: asInt(row.lowStockThreshold) ?? undefined,
    brand: asString(row.brand) ?? undefined,
    category: asString(row.category) ?? undefined,
    weight: asNumber(row.weight) ?? undefined,
    weightUnit: asString(row.weightUnit) ?? undefined,
    metaTitle: asString(row.metaTitle) ?? undefined,
    metaDescription: asString(row.metaDescription) ?? undefined,
    metaKeywords: asString(row.metaKeywords) ?? undefined,
    createdById: ctx.actingUserId,
  });
  try {
    const existing = await prisma.inventoryProduct.findFirst({
      where: { organizationId: ctx.organizationId, slug }, select: { id: true },
    });
    if (existing) { await prisma.inventoryProduct.update({ where: { id: existing.id }, data }); return { status: 'success' }; }
    await prisma.inventoryProduct.create({ data: data as any });
    return { status: 'success' };
  } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory & Purchase systems — generic schema-driven handlers.
// These write a JSON `data` bag (not typed columns) into inventory_records /
// purchase_records, coercing each cell per the submodule's FieldDef type.
// lineItems + computed fields are skipped (not expressible as flat CSV columns).
// Idempotent: re-import merges onto the existing row matched by the dedup key
// (itemCode for inventory, docNo for purchase). Rows missing the key fail.
// ─────────────────────────────────────────────────────────────────────────────
function buildDataBag(fields: any[], row: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === 'lineItems' || f.computed) continue;
    const raw = row[f.key];
    if (raw === undefined || raw === '') continue;
    switch (f.type) {
      case 'number':
      case 'currency': { const n = asNumber(raw); if (n !== null) data[f.key] = n; break; }
      case 'checkbox': { const b = asBool(raw); if (b !== null) data[f.key] = b; break; }
      case 'date': { const d = asDateString(raw); if (d) data[f.key] = d; break; }
      default: { const s = asString(raw); if (s !== null) data[f.key] = s; }
    }
  }
  return data;
}

// Resolve the acting user's purchase permissions once per import run (memoised
// on the ctx object) so bulk imports don't re-query per row. Used to strip
// guarded fields (productionApproval/approvalStatus/stockUpdated) a non-
// privileged importer isn't allowed to set — see sanitizePurchaseImport.
const _purchasePermsByCtx = new WeakMap<ImportContext, Promise<PurchasePermissions>>();
function ctxPurchasePerms(ctx: ImportContext): Promise<PurchasePermissions> {
  let p = _purchasePermsByCtx.get(ctx);
  if (!p) {
    p = getPurchasePermissions(ctx.actingUserId);
    _purchasePermsByCtx.set(ctx, p);
  }
  return p;
}

function makeInventoryHandler(submodule: string, fields: any[], dedupKey: string) {
  return async (row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> => {
    const data = buildDataBag(fields, row);
    const code = asString(data[dedupKey]);
    if (!code) return { status: 'failed', error: `Missing ${dedupKey}` };
    try {
      const existing = await prisma.inventoryRecord.findFirst({
        where: { organizationId: ctx.organizationId, submodule, data: { path: [dedupKey], equals: code } },
        select: { id: true, data: true },
      });
      const status = asString(data.status) ?? null;
      if (existing) {
        await prisma.inventoryRecord.update({
          where: { id: existing.id },
          data: { data: { ...(existing.data as object), ...data } as any, status },
        });
        return { status: 'success' };
      }
      await prisma.inventoryRecord.create({
        data: { organizationId: ctx.organizationId, submodule, data: data as any, status, createdById: ctx.actingUserId },
      });
      return { status: 'success' };
    } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
  };
}

function makePurchaseHandler(submodule: string, fields: any[], dedupKey: string) {
  return async (row: Record<string, unknown>, ctx: ImportContext): Promise<RowOutcome> => {
    const data = buildDataBag(fields, row);
    // Drop approval/stock fields the importer isn't allowed to set (same gate as
    // the API: only Approver/Purchase Manager/Store Keeper or admin may flip them).
    sanitizePurchaseImport(submodule, data, await ctxPurchasePerms(ctx));
    const code = asString(data[dedupKey]);
    if (!code) return { status: 'failed', error: `Missing ${dedupKey}` };
    try {
      const existing = await prisma.purchaseRecord.findFirst({
        where: { organizationId: ctx.organizationId, submodule, data: { path: [dedupKey], equals: code } },
        select: { id: true, data: true },
      });
      const status = asString(data.status) ?? null;
      if (existing) {
        await prisma.purchaseRecord.update({
          where: { id: existing.id },
          data: { data: { ...(existing.data as object), ...data } as any, status },
        });
        return { status: 'success' };
      }
      await prisma.purchaseRecord.create({
        data: { organizationId: ctx.organizationId, submodule, data: data as any, status, createdById: ctx.actingUserId },
      });
      return { status: 'success' };
    } catch (e: any) { return { status: 'failed', error: e?.message || String(e) }; }
  };
}

// ── Inventory / Purchase BATCH fast path ─────────────────────────────────────
// One dedup SELECT (data->>'<key>' = ANY(codes), org+submodule scoped) instead
// of a findFirst per row, then a single createMany for new rows + grouped
// updates for existing ones. Turns a 500-row chunk from ~500 round-trips into
// ~3. The dedup key (itemCode / docNo) is a code-controlled constant, so it is
// safe to bind into the SQL; `codes` is parameterised.
async function loadExistingByCode(
  table: 'inventory_records' | 'purchase_records',
  dedupKey: string,
  orgId: string,
  submodule: string,
  codes: string[],
): Promise<Map<string, { id: string; data: any }>> {
  const map = new Map<string, { id: string; data: any }>();
  if (!codes.length) return map;
  // dedupKey is a code-controlled constant (itemCode / docNo). Inline it as a
  // literal JSON key so the `->>` operator resolves unambiguously (a bound
  // param can trip Postgres's text/int operator overloading); the codes go
  // through Prisma.join → ($1,$2,…) which is the safe parameterised form.
  if (!/^[a-zA-Z0-9_]+$/.test(dedupKey)) return map;
  const keyExpr = Prisma.raw(`data->>'${dedupKey}'`);
  const found = await prisma.$queryRaw<Array<{ id: string; code: string | null; data: any }>>(Prisma.sql`
    SELECT id, ${keyExpr} AS code, data
    FROM ${Prisma.raw(table)}
    WHERE organization_id = ${orgId}
      AND submodule = ${submodule}
      AND ${keyExpr} IN (${Prisma.join(codes)})
  `);
  for (const r of found) {
    if (r.code != null && !map.has(r.code)) map.set(r.code, { id: r.id, data: r.data });
  }
  return map;
}

// Bulk-update many records in ONE statement via UPDATE … FROM (VALUES …).
// Used on re-import so updating N existing rows costs ~1 round-trip per 500
// rows instead of N. Each row's merged `data` is sent as a jsonb literal.
async function bulkUpdateRecords(
  table: 'inventory_records' | 'purchase_records',
  orgId: string,
  items: Array<{ id: string; data: any; status: string | null }>,
): Promise<void> {
  if (!items.length) return;
  const values = Prisma.join(
    items.map((it) => Prisma.sql`(${it.id}, ${JSON.stringify(it.data)}::jsonb, ${it.status}::text)`),
  );
  await prisma.$executeRaw(Prisma.sql`
    UPDATE ${Prisma.raw(table)} AS t
    SET data = v.data, status = v.status, updated_at = now()
    FROM (VALUES ${values}) AS v(id, data, status)
    WHERE t.id = v.id AND t.organization_id = ${orgId}
  `);
}

const INSERT_CHUNK = 2500; // rows per bulk INSERT (≈8 params/row, well under 65k)
const UPDATE_CHUNK = 1500; // rows per bulk UPDATE … FROM VALUES (3 params/row)

// True if merging `incoming` onto `existing` would actually change the row.
// Lets a re-import of unchanged rows skip the (expensive) UPDATE entirely — so
// re-importing the same file is near-instant instead of rewriting every row.
// Loose (String) compare because numbers round-trip through jsonb.
function recordChanged(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): boolean {
  for (const k of Object.keys(incoming)) {
    if (String(existing?.[k] ?? '') !== String(incoming[k] ?? '')) return true;
  }
  return false;
}

function makeRecordBatchHandler(
  delegate: any,
  table: 'inventory_records' | 'purchase_records',
  submodule: string,
  fields: any[],
  dedupKey: string,
) {
  return async (
    rows: Record<string, unknown>[],
    ctx: ImportContext,
    onProgress?: (processed: number) => void,
  ): Promise<RowOutcome[]> => {
    const n = rows.length;
    const outcomes: RowOutcome[] = new Array(n);
    let processed = 0;
    const tick = (delta: number) => { processed += delta; onProgress?.(processed); };

    // Purchase imports: resolve the importer's approval permissions once, then
    // strip guarded fields they can't set from every row (mirrors the API guard).
    const purchasePerms =
      table === 'purchase_records' ? await ctxPurchasePerms(ctx) : null;

    type Prep = { i: number; data: Record<string, unknown>; code: string };
    const prepared: Prep[] = [];
    for (let i = 0; i < n; i++) {
      const data = buildDataBag(fields, rows[i]);
      if (purchasePerms) sanitizePurchaseImport(submodule, data, purchasePerms);
      const code = asString(data[dedupKey]);
      if (!code) { outcomes[i] = { status: 'failed', error: `Missing ${dedupKey}` }; continue; }
      prepared.push({ i, data, code });
    }
    // Missing-key rows are already decided — count them toward progress.
    if (n - prepared.length > 0) tick(n - prepared.length);
    if (!prepared.length) return outcomes;

    try {
      // ONE dedup query for the whole file (index-backed), not per chunk.
      const codes = Array.from(new Set(prepared.map((p) => p.code)));
      const existing = await loadExistingByCode(table, dedupKey, ctx.organizationId, submodule, codes);

      // Intra-file dedup: a code appearing twice keeps the LAST row's data;
      // earlier occurrences fold into the same record (counted as success).
      const lastIdxByCode = new Map<string, number>();
      prepared.forEach((p, idx) => lastIdxByCode.set(p.code, idx));

      const toCreate: Array<Record<string, any> & { _outIdx: number }> = [];
      const toUpdate: Array<{ id: string; data: any; status: string | null; outIdx: number }> = [];

      prepared.forEach((p, idx) => {
        if (lastIdxByCode.get(p.code) !== idx) {
          outcomes[p.i] = { status: 'skipped', reason: `Duplicate ${dedupKey} "${p.code}" — superseded by a later row in the file` };
          tick(1); return;
        }
        const status = asString(p.data.status) ?? null;
        const ex = existing.get(p.code);
        if (ex) {
          const exData = (ex.data as Record<string, unknown>) || {};
          if (!recordChanged(exData, p.data)) {
            // Identical to what's already stored — skip (no duplicate, no write).
            outcomes[p.i] = { status: 'skipped', reason: `Already up to date (${dedupKey} "${p.code}")` };
            tick(1);
          } else {
            toUpdate.push({ id: ex.id, data: { ...exData, ...p.data }, status, outIdx: p.i });
          }
        } else {
          const now = new Date();
          toCreate.push({
            _outIdx: p.i,
            id: uuidv4(),
            organizationId: ctx.organizationId,
            submodule,
            data: p.data,
            status,
            createdById: ctx.actingUserId,
            createdAt: now,
            updatedAt: now,
          });
        }
      });

      // ── Bulk inserts (chunked), streaming progress between chunks ──
      for (let off = 0; off < toCreate.length; off += INSERT_CHUNK) {
        const chunk = toCreate.slice(off, off + INSERT_CHUNK);
        const records = chunk.map(({ _outIdx, ...r }) => r);
        try {
          await delegate.createMany({ data: records });
          for (const r of chunk) outcomes[r._outIdx] = { status: 'success', action: 'created' };
        } catch {
          for (const r of chunk) {
            const { _outIdx, ...rec } = r;
            try { await delegate.create({ data: rec }); outcomes[_outIdx] = { status: 'success', action: 'created' }; }
            catch (e: any) { outcomes[_outIdx] = { status: 'failed', error: e?.message || 'Insert failed' }; }
          }
        }
        tick(chunk.length);
      }

      // ── Bulk updates (chunked), with per-row fallback ──
      for (let off = 0; off < toUpdate.length; off += UPDATE_CHUNK) {
        const chunk = toUpdate.slice(off, off + UPDATE_CHUNK);
        try {
          await bulkUpdateRecords(table, ctx.organizationId, chunk);
          for (const u of chunk) outcomes[u.outIdx] = { status: 'success', action: 'updated' };
        } catch {
          for (const u of chunk) {
            try {
              await delegate.update({ where: { id: u.id }, data: { data: u.data, status: u.status } });
              outcomes[u.outIdx] = { status: 'success', action: 'updated' };
            } catch (e: any) { outcomes[u.outIdx] = { status: 'failed', error: e?.message || 'Update failed' }; }
          }
        }
        tick(chunk.length);
      }

      for (const p of prepared) if (!outcomes[p.i]) outcomes[p.i] = { status: 'failed', error: 'Not processed' };
      return outcomes;
    } catch (err: any) {
      for (const p of prepared) if (!outcomes[p.i]) outcomes[p.i] = { status: 'failed', error: err?.message || 'Batch failed' };
      return outcomes;
    }
  };
}

const makeInventoryBatchHandler = (submodule: string, fields: any[], dedupKey: string) =>
  makeRecordBatchHandler(prisma.inventoryRecord, 'inventory_records', submodule, fields, dedupKey);
const makePurchaseBatchHandler = (submodule: string, fields: any[], dedupKey: string) =>
  makeRecordBatchHandler(prisma.purchaseRecord, 'purchase_records', submodule, fields, dedupKey);

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

const HANDLERS: StaticImportHandler[] = [
  { formId: 'static:inventory-product', moduleName: 'Products', handle: handleInventoryProduct },

  // Inventory system (dedup by itemCode)
  { formId: 'static:inv-store',   moduleName: 'Store Inventory',   handle: makeInventoryHandler('store',   INV_SCHEMAS.store.fields,   'itemCode'), handleBatch: makeInventoryBatchHandler('store',   INV_SCHEMAS.store.fields,   'itemCode') },
  { formId: 'static:inv-machine', moduleName: 'Machine Inventory', handle: makeInventoryHandler('machine', INV_SCHEMAS.machine.fields, 'itemCode'), handleBatch: makeInventoryBatchHandler('machine', INV_SCHEMAS.machine.fields, 'itemCode') },
  { formId: 'static:inv-metal',   moduleName: 'Metal Inventory',   handle: makeInventoryHandler('metal',   INV_SCHEMAS.metal.fields,   'itemCode'), handleBatch: makeInventoryBatchHandler('metal',   INV_SCHEMAS.metal.fields,   'itemCode') },

  // Purchase system (dedup by docNo)
  { formId: 'static:pur-supplier', moduleName: 'Supplier Master',      handle: makePurchaseHandler('supplier', PUR_SCHEMAS.supplier.fields, 'docNo'), handleBatch: makePurchaseBatchHandler('supplier', PUR_SCHEMAS.supplier.fields, 'docNo') },
  { formId: 'static:pur-pr',       moduleName: 'Purchase Requisition', handle: makePurchaseHandler('pr',       PUR_SCHEMAS.pr.fields,       'docNo'), handleBatch: makePurchaseBatchHandler('pr',       PUR_SCHEMAS.pr.fields,       'docNo') },
  { formId: 'static:pur-sourcing', moduleName: 'Supplier Sourcing',    handle: makePurchaseHandler('sourcing', PUR_SCHEMAS.sourcing.fields, 'docNo'), handleBatch: makePurchaseBatchHandler('sourcing', PUR_SCHEMAS.sourcing.fields, 'docNo') },
  { formId: 'static:pur-po',       moduleName: 'Purchase Order',       handle: makePurchaseHandler('po',       PUR_SCHEMAS.po.fields,       'docNo'), handleBatch: makePurchaseBatchHandler('po',       PUR_SCHEMAS.po.fields,       'docNo') },
  { formId: 'static:pur-grn',      moduleName: 'Goods Receipt',        handle: makePurchaseHandler('grn',      PUR_SCHEMAS.grn.fields,      'docNo'), handleBatch: makePurchaseBatchHandler('grn',      PUR_SCHEMAS.grn.fields,      'docNo') },
  { formId: 'static:pur-payment',  moduleName: 'Payment Request',      handle: makePurchaseHandler('payment',  PUR_SCHEMAS.payment.fields,  'docNo'), handleBatch: makePurchaseBatchHandler('payment',  PUR_SCHEMAS.payment.fields,  'docNo') },
  { formId: 'static:employee-master', moduleName: 'Employee Master', handle: handleEmployeeMaster, handleBatch: handleEmployeeMasterBatch },
  { formId: 'static:staffing-plan', moduleName: 'Staffing Plan', handle: handleStaffingPlan },
  { formId: 'static:job-opening', moduleName: 'Job Opening', handle: handleJobOpening },
  { formId: 'static:job-application', moduleName: 'Job Application', handle: handleJobApplication },
  { formId: 'static:job-offer', moduleName: 'Job Offer', handle: handleJobOffer },
  { formId: 'static:appointment-letter', moduleName: 'Appointment Letter', handle: handleAppointmentLetter },
  { formId: 'static:employee-referral', moduleName: 'Employee Referral', handle: handleEmployeeReferral },
  { formId: 'static:payroll', moduleName: 'Payroll', handle: handlePayrollRecord },
  { formId: 'static:attendance', moduleName: 'Attendance', handle: handleAttendance },
  { formId: 'static:leave-request', moduleName: 'Leave', handle: handleLeaveRequest },
  { formId: 'static:property', moduleName: 'Properties', handle: handleProperty },
  { formId: 'static:lead', moduleName: 'Leads', handle: handleLead },
];

export function getStaticImportHandler(formId: string): StaticImportHandler | null {
  return HANDLERS.find((h) => h.formId === formId) ?? null;
}

export function getStaticImportHandlerForModule(
  moduleName: string,
): StaticImportHandler | null {
  const forms = getStaticFormsForModule(moduleName);
  for (const f of forms) {
    const handler = getStaticImportHandler(f.formId);
    if (handler) return handler;
  }
  return null;
}

export function listStaticImportFormIds(): string[] {
  return HANDLERS.map((h) => h.formId);
}
