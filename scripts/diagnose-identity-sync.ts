/**
 * READ-ONLY identity/sync diagnostic.
 *
 * Finds the data problems we've been chasing without writing anything:
 *   1. Employees whose contact email (emailAddress1) ≠ their linked login
 *      (User.email)  → the "two different emails for one person" case.
 *   2. Duplicate contact emails shared by 2+ employees.
 *   3. Duplicate login emails (should be impossible — flags DB drift).
 *   4. Employees whose stored firstName/lastName disagree with employeeName
 *      → the "edit shows another user's data" case.
 *   5. Placeholder logins (…@placeholder.local) that still carry a real
 *      contact email — i.e. an employee that never got a real login.
 *
 * Run:  npx tsx scripts/diagnose-identity-sync.ts
 * (or)  npx ts-node scripts/diagnose-identity-sync.ts
 *
 * It only SELECTs — safe to run against any environment. Share the summary
 * counts (not the raw PII) and we'll build a targeted repair from it.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const lc = (s?: string | null) => (s ?? "").trim().toLowerCase();
const isPlaceholder = (e?: string | null) => lc(e).endsWith("@placeholder.local");

async function main() {
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeName: true,
      firstName: true,
      lastName: true,
      emailAddress1: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          organizationId: true,
        },
      },
    },
  });

  console.log(`\nScanned ${employees.length} employee rows.\n`);

  // 1. contact email ≠ login email
  const emailDiverged = employees.filter(
    (e) =>
      e.emailAddress1 &&
      e.user?.email &&
      lc(e.emailAddress1) !== lc(e.user.email)
  );

  type Row = (typeof employees)[number];

  // 2. duplicate contact emails
  const byContact = new Map<string, Row[]>();
  for (const e of employees) {
    if (!e.emailAddress1) continue;
    const k = lc(e.emailAddress1);
    const arr = byContact.get(k) ?? [];
    arr.push(e);
    byContact.set(k, arr);
  }
  const dupContact = [...byContact.entries()].filter(([, rows]) => rows.length > 1);

  // 3. duplicate login emails (only counting linked employees here)
  const byLogin = new Map<string, Row[]>();
  for (const e of employees) {
    if (!e.user?.email) continue;
    const k = lc(e.user.email);
    const arr = byLogin.get(k) ?? [];
    arr.push(e);
    byLogin.set(k, arr);
  }
  const dupLogin = [...byLogin.entries()].filter(([, rows]) => rows.length > 1);

  // 4. name desync (employeeName vs firstName+lastName)
  const nameDiverged = employees.filter((e) => {
    if (!e.employeeName) return false;
    if (!e.firstName && !e.lastName) return false;
    const composed = `${lc(e.firstName)} ${lc(e.lastName)}`.trim();
    return composed !== lc(e.employeeName);
  });

  // 5. placeholder login but a real contact email
  const placeholderWithRealEmail = employees.filter(
    (e) => isPlaceholder(e.user?.email) && e.emailAddress1 && !isPlaceholder(e.emailAddress1)
  );

  const section = (title: string, rows: any[], render: (e: any) => string) => {
    console.log(`\n=== ${title}: ${rows.length} ===`);
    rows.slice(0, 100).forEach((e) => console.log("  " + render(e)));
    if (rows.length > 100) console.log(`  …and ${rows.length - 100} more`);
  };

  section("1. Contact email ≠ login email", emailDiverged, (e) =>
    `emp=${e.id} "${e.employeeName}"  contact=${e.emailAddress1}  login=${e.user?.email}`
  );

  console.log(`\n=== 2. Duplicate contact email (shared by 2+ employees): ${dupContact.length} groups ===`);
  dupContact.slice(0, 100).forEach(([email, rows]) => {
    console.log(`  ${email} → ${rows.map((r) => `${r.id}("${r.employeeName}")`).join(", ")}`);
  });

  console.log(`\n=== 3. Duplicate login email (should be 0): ${dupLogin.length} groups ===`);
  dupLogin.slice(0, 100).forEach(([email, rows]) => {
    console.log(`  ${email} → ${rows.map((r) => r.id).join(", ")}`);
  });

  section("4. Name desync (employeeName vs first/last)", nameDiverged, (e) =>
    `emp=${e.id}  employeeName="${e.employeeName}"  first/last="${e.firstName ?? ""} ${e.lastName ?? ""}"  login=${e.user?.email}`
  );

  section("5. Placeholder login but real contact email", placeholderWithRealEmail, (e) =>
    `emp=${e.id} "${e.employeeName}"  contact=${e.emailAddress1}  login=${e.user?.email}`
  );

  console.log(`\n--- SUMMARY ---`);
  console.log(`Total employees:                 ${employees.length}`);
  console.log(`Contact ≠ login email:           ${emailDiverged.length}`);
  console.log(`Duplicate contact-email groups:  ${dupContact.length}`);
  console.log(`Duplicate login-email groups:    ${dupLogin.length}`);
  console.log(`Name desync rows:                ${nameDiverged.length}`);
  console.log(`Placeholder login + real email:  ${placeholderWithRealEmail.length}\n`);
}

main()
  .catch((e) => {
    console.error("Diagnostic failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
