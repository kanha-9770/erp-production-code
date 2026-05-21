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
import { getStaticFormsForModule } from '@/lib/static-page-fields';

export type RowOutcome =
  | { status: 'success' }
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

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

const HANDLERS: StaticImportHandler[] = [
  {
    formId: 'static:employee-master',
    moduleName: 'Employee Master',
    handle: handleEmployeeMaster,
  },
  // Future handlers go here — Leave, Engagement records, Attendance backfill,
  // etc. Each one gets its own coercion + Prisma write per the rules of the
  // target table.
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
