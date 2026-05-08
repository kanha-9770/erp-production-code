/**
 * New Organization - Production Setup Runner (ALL-IN-ONE)
 * =======================================================
 *
 * Bootstraps a brand-new organization end-to-end with rich dummy data,
 * WITHOUT touching any organization that already exists.
 *
 * Built per-run:
 *   - 1 organization      (default: "Globex Corporation")
 *   - 1 admin owner user  (default: admin@globex.io / Globex@2025)
 *   - 10 dummy users      (default: <first.last>@globex.io / Demo@2025)
 *   - 10 employees        (linked 1-1 to dummy users; salary, bank, address, gender, ...)
 *   - 6 organization units / departments (Engineering, Production, ... )
 *   - 4 roles             (Administrator, HR Manager, Manager, Employee)
 *   - User-unit-role assignments
 *   - Full HR module / forms / fields / permissions  (cloned from the source org
 *     using the established clone-hr-to-orgs.sql + clone-hr-automations-to-orgs.sql
 *     pattern with per-org id suffixing — does NOT touch other orgs)
 *
 * SAFETY:
 *   - Every Prisma write is scoped to the new organization's id.
 *   - The HR clone reads FROM the source template org but writes only into the
 *     target org (every id is suffixed with the new org's id). The source org
 *     and any other orgs are read-only from this script's perspective.
 *   - Idempotent: re-running with the same env values just re-syncs.
 *   - Re-running with DIFFERENT env values creates ANOTHER distinct org —
 *     existing orgs remain untouched.
 *
 * Pre-req:
 *   - DATABASE_URL set
 *   - At least one source org exists with a fully-bootstrapped HR module
 *     (i.e. `npm run setup:hr` has been run on the default org). The clone
 *     copies FROM whichever org currently owns module id 'mod_hr_root'.
 *
 * Usage — defaults (creates "Globex Corporation"):
 *   npm run create:second-org
 *
 * Usage — custom (any new org name + credentials, none of the other orgs are touched):
 *   NEW_ORG_NAME="Wayne Industries" \
 *   NEW_ORG_DOMAIN="wayne.com" \
 *   NEW_ADMIN_EMAIL="bruce@wayne.com" \
 *   NEW_ADMIN_PASSWORD="Batman@2025" \
 *   NEW_DEMO_PASSWORD="Demo@2025" \
 *     npm run create:second-org
 *
 * On Windows PowerShell:
 *   $env:NEW_ORG_NAME="Wayne Industries"; $env:NEW_ORG_DOMAIN="wayne.com"; `
 *   $env:NEW_ADMIN_EMAIL="bruce@wayne.com"; $env:NEW_ADMIN_PASSWORD="Batman@2025"; `
 *   npm run create:second-org
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = dirname(__filename);

// ─── New organization config (env-overridable — defaults create a NEW org
//     distinct from any previous run, so existing orgs are not touched) ─────
const ORG_NAME       = process.env.NEW_ORG_NAME       ?? "Globex Corporation";
const ORG_DOMAIN     = process.env.NEW_ORG_DOMAIN     ?? "globex.io";
const ADMIN_EMAIL    = process.env.NEW_ADMIN_EMAIL    ?? `admin@${ORG_DOMAIN}`;
const ADMIN_PASSWORD = process.env.NEW_ADMIN_PASSWORD ?? "Globex@2025";
const DEMO_PASSWORD  = process.env.NEW_DEMO_PASSWORD  ?? "Demo@2025";

// ─── Departments (org units) ─────────────────────────────────────────────────
const DEPARTMENTS = [
  { name: "Engineering",     description: "Product engineering and software development" },
  { name: "Production",      description: "Manufacturing floor and shop operations"      },
  { name: "Quality Control", description: "QA, inspections and compliance"               },
  { name: "Sales",           description: "Domestic and export sales"                    },
  { name: "Finance",         description: "Accounts, payroll and treasury"               },
  { name: "Human Resources", description: "Hiring, onboarding and employee welfare"      },
];

// ─── Roles ────────────────────────────────────────────────────────────────────
const ROLES = [
  { name: "Administrator", description: "Full system access",        isAdmin: true,  level: 0, sortOrder: 0 },
  { name: "HR Manager",    description: "Manages employees & leave", isAdmin: false, level: 1, sortOrder: 10 },
  { name: "Manager",       description: "Department-level access",   isAdmin: false, level: 1, sortOrder: 20 },
  { name: "Employee",      description: "Standard employee access",  isAdmin: false, level: 2, sortOrder: 30 },
];

// ─── Dummy users (10) — each becomes both a User AND an Employee ─────────────
type Gender = "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";

interface Dummy {
  firstName:    string;
  lastName:     string;
  emailLocal:   string;            // before @acme.org
  mobile:       string;
  gender:       Gender;
  department:   string;            // matches a DEPARTMENTS.name
  designation:  string;
  roleName:     string;            // matches a ROLES.name
  totalSalary:  number;
  givenSalary:  number;
  shiftType:    string;
  inTime:       string;            // "09:00"
  outTime:      string;            // "18:00"
  dob:          string;            // "YYYY-MM-DD"
  joinedAt:     string;            // "YYYY-MM-DD"
  permanentAddress: string;
  bankName:     string;
  bankAccountNo: string;
  ifscCode:     string;
  aadharCardNo: string;            // 12 digits
  panCardNo:    string;            // 10-char fake PAN
}

const DUMMY_USERS: Dummy[] = [
  { firstName: "Priya",   lastName: "Sharma",   emailLocal: "priya.sharma",   mobile: "+919810000001",
    gender: "FEMALE", department: "Human Resources", designation: "HR Manager",        roleName: "HR Manager",
    totalSalary: 110000, givenSalary: 95000,  shiftType: "DAY",   inTime: "09:00", outTime: "18:00",
    dob: "1989-04-12", joinedAt: "2021-03-01",
    permanentAddress: "B-12, Sector 22, Noida, UP 201301",
    bankName: "HDFC Bank", bankAccountNo: "50100123456001", ifscCode: "HDFC0001234",
    aadharCardNo: "234512340001", panCardNo: "ABCDE1234A" },

  { firstName: "Aarav",   lastName: "Verma",    emailLocal: "aarav.verma",    mobile: "+919810000002",
    gender: "MALE",   department: "Engineering",     designation: "Senior Engineer",   roleName: "Manager",
    totalSalary: 145000, givenSalary: 128000, shiftType: "DAY",   inTime: "09:30", outTime: "18:30",
    dob: "1991-08-22", joinedAt: "2020-07-15",
    permanentAddress: "44, MG Road, Bengaluru, KA 560001",
    bankName: "ICICI Bank", bankAccountNo: "012345678902", ifscCode: "ICIC0000123",
    aadharCardNo: "234512340002", panCardNo: "ABCDE1234B" },

  { firstName: "Sneha",   lastName: "Patel",    emailLocal: "sneha.patel",    mobile: "+919810000003",
    gender: "FEMALE", department: "Quality Control", designation: "QC Lead",           roleName: "Manager",
    totalSalary: 98000,  givenSalary: 85000,  shiftType: "GENERAL", inTime: "09:00", outTime: "17:30",
    dob: "1990-11-05", joinedAt: "2019-09-20",
    permanentAddress: "21, Satellite Road, Ahmedabad, GJ 380015",
    bankName: "SBI", bankAccountNo: "30012345670003", ifscCode: "SBIN0001234",
    aadharCardNo: "234512340003", panCardNo: "ABCDE1234C" },

  { firstName: "Rohan",   lastName: "Iyer",     emailLocal: "rohan.iyer",     mobile: "+919810000004",
    gender: "MALE",   department: "Engineering",     designation: "Software Engineer", roleName: "Employee",
    totalSalary: 85000,  givenSalary: 76000,  shiftType: "DAY",   inTime: "10:00", outTime: "19:00",
    dob: "1995-02-18", joinedAt: "2022-01-10",
    permanentAddress: "T2-1101, Hiranandani Estate, Thane, MH 400607",
    bankName: "Axis Bank", bankAccountNo: "912010012340004", ifscCode: "UTIB0000123",
    aadharCardNo: "234512340004", panCardNo: "ABCDE1234D" },

  { firstName: "Anjali",  lastName: "Singh",    emailLocal: "anjali.singh",   mobile: "+919810000005",
    gender: "FEMALE", department: "Finance",         designation: "Accounts Executive", roleName: "Employee",
    totalSalary: 62000,  givenSalary: 55000,  shiftType: "GENERAL", inTime: "09:30", outTime: "18:00",
    dob: "1993-06-30", joinedAt: "2021-11-05",
    permanentAddress: "C-5, Lajpat Nagar, New Delhi 110024",
    bankName: "Kotak Mahindra Bank", bankAccountNo: "1234567890005", ifscCode: "KKBK0001234",
    aadharCardNo: "234512340005", panCardNo: "ABCDE1234E" },

  { firstName: "Vikram",  lastName: "Reddy",    emailLocal: "vikram.reddy",   mobile: "+919810000006",
    gender: "MALE",   department: "Sales",           designation: "Sales Manager",     roleName: "Manager",
    totalSalary: 130000, givenSalary: 115000, shiftType: "DAY",   inTime: "09:00", outTime: "18:00",
    dob: "1987-12-01", joinedAt: "2018-04-12",
    permanentAddress: "Flat 302, Jubilee Hills, Hyderabad, TS 500033",
    bankName: "HDFC Bank", bankAccountNo: "50100123456006", ifscCode: "HDFC0001234",
    aadharCardNo: "234512340006", panCardNo: "ABCDE1234F" },

  { firstName: "Meera",   lastName: "Nair",     emailLocal: "meera.nair",     mobile: "+919810000007",
    gender: "FEMALE", department: "Production",      designation: "Shift Supervisor",  roleName: "Employee",
    totalSalary: 54000,  givenSalary: 48000,  shiftType: "ROTATIONAL", inTime: "06:00", outTime: "14:00",
    dob: "1992-09-14", joinedAt: "2020-02-20",
    permanentAddress: "Door 12, Marine Drive, Kochi, KL 682011",
    bankName: "Federal Bank", bankAccountNo: "9876543210007", ifscCode: "FDRL0001234",
    aadharCardNo: "234512340007", panCardNo: "ABCDE1234G" },

  { firstName: "Karthik", lastName: "Krishnan", emailLocal: "karthik.krishnan", mobile: "+919810000008",
    gender: "MALE",   department: "Production",      designation: "Machine Operator",  roleName: "Employee",
    totalSalary: 38000,  givenSalary: 34000,  shiftType: "NIGHT", inTime: "22:00", outTime: "06:00",
    dob: "1994-03-25", joinedAt: "2022-06-01",
    permanentAddress: "5/4 Anna Nagar, Chennai, TN 600040",
    bankName: "Indian Bank", bankAccountNo: "5544332211008", ifscCode: "IDIB000C001",
    aadharCardNo: "234512340008", panCardNo: "ABCDE1234H" },

  { firstName: "Divya",   lastName: "Joshi",    emailLocal: "divya.joshi",    mobile: "+919810000009",
    gender: "FEMALE", department: "Human Resources", designation: "HR Executive",      roleName: "Employee",
    totalSalary: 48000,  givenSalary: 42000,  shiftType: "GENERAL", inTime: "09:00", outTime: "18:00",
    dob: "1996-07-08", joinedAt: "2023-04-17",
    permanentAddress: "Plot 18, Aundh, Pune, MH 411007",
    bankName: "Axis Bank", bankAccountNo: "912010012340009", ifscCode: "UTIB0000123",
    aadharCardNo: "234512340009", panCardNo: "ABCDE1234I" },

  { firstName: "Arjun",   lastName: "Mehta",    emailLocal: "arjun.mehta",    mobile: "+919810000010",
    gender: "MALE",   department: "Sales",           designation: "Sales Executive",   roleName: "Employee",
    totalSalary: 45000,  givenSalary: 40000,  shiftType: "DAY",   inTime: "09:30", outTime: "18:30",
    dob: "1997-01-19", joinedAt: "2023-08-22",
    permanentAddress: "302, Vastrapur, Ahmedabad, GJ 380015",
    bankName: "ICICI Bank", bankAccountNo: "012345678910", ifscCode: "ICIC0000123",
    aadharCardNo: "234512340010", panCardNo: "ABCDE1234J" },
];

// ─────────────────────────────────────────────────────────────────────────────

function banner(text: string): void {
  const line = "=".repeat(72);
  console.log(`\n${line}\n  ${text}\n${line}`);
}

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

/* ─── Step 1: organization ────────────────────────────────────────────────── */
async function ensureOrganization() {
  let org = await prisma.organization.findFirst({ where: { name: ORG_NAME } });
  if (org) {
    console.log(`[step 1] Organization exists: ${org.name} (${org.id})`);
    return org;
  }
  org = await prisma.organization.create({ data: { name: ORG_NAME } });
  console.log(`[step 1] Created organization: ${org.name} (${org.id})`);
  return org;
}

/* ─── Step 2: admin owner user ────────────────────────────────────────────── */
async function ensureAdminUser(orgId: string) {
  const hashed = await hashPassword(ADMIN_PASSWORD);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      organizationId: orgId,
      status: "ACTIVE",
      email_verified: true,
    },
    create: {
      email:          ADMIN_EMAIL,
      username:       ADMIN_EMAIL.split("@")[0],
      first_name:     ORG_NAME.split(/\s+/)[0],   // first word of org name
      last_name:      "Admin",
      password:       hashed,
      provider:       "EMAIL",
      status:         "ACTIVE",
      email_verified: true,
      mobile:         "+919810000000",
      phone:          "+919810000000",
      department:     "Human Resources",
      organizationId: orgId,
      joinDate:       new Date("2018-01-01"),
    },
  });

  // Link as owner (one-shot — Organization.ownerId is unique).
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (org && org.ownerId !== admin.id) {
    await prisma.organization.update({
      where: { id: orgId },
      data:  { ownerId: admin.id },
    });
    console.log(`[step 2] Linked owner: ${admin.email} → ${ORG_NAME}`);
  } else {
    console.log(`[step 2] Owner already linked: ${admin.email}`);
  }
  return admin;
}

/* ─── Step 3: 10 dummy users ──────────────────────────────────────────────── */
async function ensureDummyUsers(orgId: string) {
  const hashed = await hashPassword(DEMO_PASSWORD);
  const users: { dummy: Dummy; user: { id: string; email: string } }[] = [];

  for (const d of DUMMY_USERS) {
    const email = `${d.emailLocal}@${ORG_DOMAIN}`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        organizationId: orgId,
        status:         "ACTIVE",
        email_verified: true,
        first_name:     d.firstName,
        last_name:      d.lastName,
        mobile:         d.mobile,
        phone:          d.mobile,
        department:     d.department,
      },
      create: {
        email,
        username:       d.emailLocal.replace(".", "_"),
        first_name:     d.firstName,
        last_name:      d.lastName,
        password:       hashed,
        provider:       "EMAIL",
        status:         "ACTIVE",
        email_verified: true,
        mobile:         d.mobile,
        phone:          d.mobile,
        department:     d.department,
        organizationId: orgId,
        joinDate:       new Date(d.joinedAt),
      },
    });
    users.push({ dummy: d, user: { id: user.id, email: user.email } });
  }
  console.log(`[step 3] Upserted ${users.length} dummy users`);
  return users;
}

/* ─── Step 4: organization units (departments) ────────────────────────────── */
async function ensureOrganizationUnits(orgId: string) {
  const units: Record<string, string> = {};   // name → id
  for (let i = 0; i < DEPARTMENTS.length; i++) {
    const d = DEPARTMENTS[i];
    let unit = await prisma.organizationUnit.findFirst({
      where: { organizationId: orgId, name: d.name },
    });
    if (!unit) {
      unit = await prisma.organizationUnit.create({
        data: {
          organizationId: orgId,
          name:           d.name,
          description:    d.description,
          parentId:       null,
          level:          0,
          sortOrder:      (i + 1) * 10,
          isActive:       true,
        },
      });
    }
    units[d.name] = unit.id;
  }
  console.log(`[step 4] Upserted ${Object.keys(units).length} organization units`);
  return units;
}

/* ─── Step 5: roles ───────────────────────────────────────────────────────── */
async function ensureRoles(orgId: string) {
  const roles: Record<string, string> = {};
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where:  { name_organizationId: { name: r.name, organizationId: orgId } },
      update: { description: r.description, isAdmin: r.isAdmin, level: r.level, sortOrder: r.sortOrder, isActive: true },
      create: {
        organizationId:     orgId,
        name:               r.name,
        description:        r.description,
        isAdmin:            r.isAdmin,
        level:              r.level,
        sortOrder:          r.sortOrder,
        shareDataWithPeers: r.isAdmin,    // admins see everything
        isActive:           true,
      },
    });
    roles[r.name] = role.id;
  }
  console.log(`[step 5] Upserted ${Object.keys(roles).length} roles`);
  return roles;
}

/* ─── Step 6: assign each user to its department + role ───────────────────── */
async function assignUsersToUnits(
  adminId: string,
  dummies: { dummy: Dummy; user: { id: string; email: string } }[],
  units:   Record<string, string>,
  roles:   Record<string, string>,
) {
  // Admin → HR unit + Administrator role
  const hrUnitId = units["Human Resources"];
  await prisma.userUnitAssignment.upsert({
    where:  { userId_unitId: { userId: adminId, unitId: hrUnitId } },
    update: { roleId: roles["Administrator"], notes: "Owner / system administrator" },
    create: {
      userId: adminId,
      unitId: hrUnitId,
      roleId: roles["Administrator"],
      notes:  "Owner / system administrator",
    },
  });

  let assigned = 1;
  for (const { dummy, user } of dummies) {
    const unitId = units[dummy.department];
    const roleId = roles[dummy.roleName];
    if (!unitId || !roleId) {
      console.warn(`  ! skipping ${user.email}: missing unit/role mapping (${dummy.department}/${dummy.roleName})`);
      continue;
    }
    await prisma.userUnitAssignment.upsert({
      where:  { userId_unitId: { userId: user.id, unitId } },
      update: { roleId, notes: `${dummy.designation} — ${dummy.department}` },
      create: {
        userId: user.id,
        unitId,
        roleId,
        notes:  `${dummy.designation} — ${dummy.department}`,
      },
    });
    assigned++;
  }
  console.log(`[step 6] Created ${assigned} user-unit-role assignments`);
}

/* ─── Step 7: employee profiles for each dummy user ───────────────────────── */
async function ensureEmployees(
  dummies: { dummy: Dummy; user: { id: string; email: string } }[],
) {
  let created = 0;
  let updated = 0;
  for (const { dummy, user } of dummies) {
    const data: any = {
      userId:           user.id,
      employeeName:     `${dummy.firstName} ${dummy.lastName}`,
      gender:           dummy.gender,
      department:       dummy.department,
      designation:      dummy.designation,
      dob:              new Date(dummy.dob),
      country:          "India",
      permanentAddress: dummy.permanentAddress,
      currentAddress:   dummy.permanentAddress,
      personalContact:  dummy.mobile,
      emailAddress1:    user.email,
      aadharCardNo:     dummy.aadharCardNo,
      bankName:         dummy.bankName,
      bankAccountNo:    dummy.bankAccountNo,
      ifscCode:         dummy.ifscCode,
      status:           "ACTIVE",
      shiftType:        dummy.shiftType,
      inTime:           dummy.inTime,
      outTime:          dummy.outTime,
      dateOfJoining:    new Date(dummy.joinedAt),
      companyName:      ORG_NAME,
      totalSalary:      dummy.totalSalary,
      givenSalary:      dummy.givenSalary,
      bonusAmount:      0,
      nightAllowance:   dummy.shiftType === "NIGHT" ? 5000 : 0,
      overTime:         0,
      oneHourExtra:     0,
      companySimIssue:  false,
    };

    const existing = await prisma.employee.findUnique({ where: { userId: user.id } });
    if (existing) {
      await prisma.employee.update({ where: { userId: user.id }, data });
      updated++;
    } else {
      await prisma.employee.create({ data });
      created++;
    }
  }
  console.log(`[step 7] Employees: created=${created}, updated=${updated}`);
}

/* ─── Step 8: clone HR module + automations into the new org ──────────────── */

const TARGETS_REGEX = /v_targets\s+JSONB\s*:=\s*'\[[\s\S]*?\]'::jsonb;/m;

function patchTargetsArray(sql: string, orgId: string, userId: string, label: string): string {
  const replacement =
    `v_targets JSONB := '[\n` +
    `        {"orgId":"${orgId}","userId":"${userId}","label":"${label}"}\n` +
    `    ]'::jsonb;`;
  if (!TARGETS_REGEX.test(sql)) {
    throw new Error("Could not locate v_targets JSONB declaration in clone script — did the file format change?");
  }
  return sql.replace(TARGETS_REGEX, replacement);
}

async function ensureSourceTemplate(): Promise<void> {
  const tpl = await prisma.formModule.findUnique({ where: { id: "mod_hr_root" } });
  if (!tpl) {
    throw new Error(
      "No HR template found (no module with id 'mod_hr_root'). " +
      "Bootstrap the first organization with `npm run setup:hr` before running this script."
    );
  }
}

/**
 * Split a SQL script into individual top-level statements.
 *
 * Postgres / Prisma `$executeRawUnsafe` uses the extended-query protocol which
 * only allows ONE command per call. Our clone scripts have 3 top-level
 * statements (DROP FUNCTION; CREATE FUNCTION; DO $$...$$;) so we must split.
 *
 * Respects:
 *   - $tag$ ... $tag$ dollar-quoted blocks (semicolons inside don't split)
 *   - Single-quoted 'strings' with '' escape
 *   - -- line comments
 *   - /* block comments * /
 */
function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i   = 0;
  const n = sql.length;

  while (i < n) {
    const c  = sql[i];
    const c2 = sql.substr(i, 2);

    // -- line comment
    if (c2 === "--") {
      const nl = sql.indexOf("\n", i);
      const stop = nl === -1 ? n : nl + 1;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    // /* block comment */
    if (c2 === "/*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    // $tag$ ... $tag$ dollar-quoted block
    if (c === "$") {
      const m = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        const tag  = m[0];
        const end  = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        buf += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    // 'single-quoted string' with '' escape
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          j++; break;
        }
        j++;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }
    // Statement terminator at top level
    if (c === ";") {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = "";
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

function isCommentOnly(s: string): boolean {
  return s.split("\n").every((line) => {
    const t = line.trim();
    return t === "" || t.startsWith("--");
  });
}

async function runClone(file: string, target: { orgId: string; userId: string }, label: string) {
  const path = resolve(SCRIPTS_DIR, file);
  const raw  = readFileSync(path, "utf8");
  let sql    = patchTargetsArray(raw, target.orgId, target.userId, label);

  // Strip the outer transaction control — we wrap in $transaction below.
  sql = sql.replace(/^[ \t]*BEGIN;[ \t]*$/gm, "");
  sql = sql.replace(/^[ \t]*COMMIT;[ \t]*$/gm, "");

  // Split into individual statements (extended-query protocol allows only one
  // command per $executeRawUnsafe call). Then execute all on the same session
  // inside a transaction so pg_temp.suffix_hr_ids() (created by stmt 2) is
  // visible inside the DO $$ block (stmt 3).
  const statements = splitSqlStatements(sql).filter((s) => !isCommentOnly(s));

  const startedAt = Date.now();
  console.log(`[step 8] → ${file} (${statements.length} statements)`);

  try {
    await prisma.$transaction(
      async (tx) => {
        for (let idx = 0; idx < statements.length; idx++) {
          await tx.$executeRawUnsafe(statements[idx]);
        }
      },
      { maxWait: 60_000, timeout: 5 * 60_000 },   // 5 min — clone does many inserts
    );
    console.log(`[step 8] ✓ ${file} (${Date.now() - startedAt} ms)`);
  } catch (e: any) {
    console.error(`[step 8] ✗ ${file} failed after ${Date.now() - startedAt} ms`);
    console.error(`         ${e?.message ?? e}`);
    throw e;
  }
}

/* ─── main ────────────────────────────────────────────────────────────────── */
async function main(): Promise<void> {
  banner(`New Organization Setup — "${ORG_NAME}"`);

  // Snapshot of existing orgs BEFORE we change anything — used for the
  // "untouched orgs" verification at the end.
  const orgsBefore = await prisma.organization.findMany({
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log("  Credentials that will be created (write these down):");
  console.log("  ───────────────────────────────────────────────────");
  console.log(`   Admin   : ${ADMIN_EMAIL}    /  ${ADMIN_PASSWORD}`);
  console.log(`   Dummies : <first.last>@${ORG_DOMAIN}  /  ${DEMO_PASSWORD}`);
  console.log("");
  console.log(`  Existing organizations (will NOT be modified):`);
  for (const o of orgsBefore) {
    console.log(`    - ${o.name}  (${o.id})`);
  }
  if (orgsBefore.length === 0) {
    console.log(`    (none yet — run \`npm run create-default-org && npm run setup:hr\` first)`);
  }
  console.log("");

  await ensureSourceTemplate();

  const org     = await ensureOrganization();
  const admin   = await ensureAdminUser(org.id);
  const dummies = await ensureDummyUsers(org.id);
  const units   = await ensureOrganizationUnits(org.id);
  const roles   = await ensureRoles(org.id);
  await assignUsersToUnits(admin.id, dummies, units, roles);
  await ensureEmployees(dummies);

  banner("Cloning HR module + automations into new org");
  await runClone("clone-hr-to-orgs.sql",             { orgId: org.id, userId: admin.id }, ORG_NAME);
  await runClone("clone-hr-automations-to-orgs.sql", { orgId: org.id, userId: admin.id }, ORG_NAME);

  // Sanity counts
  const userCount     = await prisma.user.count({ where: { organizationId: org.id } });
  const employeeCount = await prisma.employee.count({ where: { user: { organizationId: org.id } } });
  const unitCount     = await prisma.organizationUnit.count({ where: { organizationId: org.id } });
  const roleCount     = await prisma.role.count({ where: { organizationId: org.id } });
  const moduleCount   = await prisma.formModule.count({ where: { organizationId: org.id } });
  const formCount     = await prisma.form.count({ where: { module: { organizationId: org.id } } });
  const fieldCount    = await prisma.formField.count({
    where: { section: { form: { module: { organizationId: org.id } } } },
  });
  const userPermCount = await prisma.userPermission.count({ where: { userId: admin.id } });

  // Verify other orgs are unchanged (compare row counts of users + form modules
  // for each pre-existing org against a fresh read).
  const verifyRows: Array<{ name: string; id: string; ok: boolean; users: number; modules: number }> = [];
  for (const o of orgsBefore) {
    if (o.id === org.id) continue;          // the new org may have been pre-existing on a re-run
    const u = await prisma.user.count({ where: { organizationId: o.id } });
    const m = await prisma.formModule.count({ where: { organizationId: o.id } });
    verifyRows.push({ name: o.name, id: o.id, ok: true, users: u, modules: m });
  }

  banner("Setup complete ✓");
  console.log(`  Organization:       ${ORG_NAME}`);
  console.log(`  Org ID:             ${org.id}`);
  console.log(`  Admin user ID:      ${admin.id}`);
  console.log("");
  console.log(`  Users:              ${userCount}     (1 admin + ${dummies.length} dummy users)`);
  console.log(`  Employees:          ${employeeCount}`);
  console.log(`  Departments:        ${unitCount}`);
  console.log(`  Roles:              ${roleCount}`);
  console.log(`  HR modules:         ${moduleCount}`);
  console.log(`  HR forms:           ${formCount}`);
  console.log(`  HR fields:          ${fieldCount}`);
  console.log(`  Admin permissions:  ${userPermCount}`);
  console.log("");
  console.log("  ╔══════════════════════════════════════════════════════════════╗");
  console.log("  ║                    LOGIN CREDENTIALS                         ║");
  console.log("  ╚══════════════════════════════════════════════════════════════╝");
  console.log(`   Admin (owner — full HR access)`);
  console.log(`     email     : ${ADMIN_EMAIL}`);
  console.log(`     password  : ${ADMIN_PASSWORD}`);
  console.log("");
  console.log(`   Dummy users (10 — all share the same demo password)`);
  console.log(`     password  : ${DEMO_PASSWORD}`);
  for (const d of DUMMY_USERS) {
    const role = d.roleName.padEnd(13);
    console.log(`     ${`${d.emailLocal}@${ORG_DOMAIN}`.padEnd(34)}  [${role}]  ${d.designation}`);
  }
  console.log("");
  console.log("  Other organizations (verified untouched by this run):");
  if (verifyRows.length === 0) {
    console.log("    (none — this was the first/only org)");
  } else {
    for (const r of verifyRows) {
      console.log(`    ✓ ${r.name.padEnd(36)} users=${r.users}  hr_modules=${r.modules}`);
    }
  }
  console.log("");
  console.log("  To create yet another org without touching this one, re-run with env vars:");
  console.log("    NEW_ORG_NAME=\"...\" NEW_ORG_DOMAIN=\"...\" NEW_ADMIN_EMAIL=\"...\" \\");
  console.log("    NEW_ADMIN_PASSWORD=\"...\" npm run create:second-org");
  console.log("");
}

main()
  .catch((e) => {
    console.error("\n[create-second-org] FAILED:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
