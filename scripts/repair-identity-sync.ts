/**
 * Repairs the issues found by diagnose-identity-sync.ts.
 *
 * DRY-RUN BY DEFAULT — prints the exact plan and writes NOTHING. To actually
 * apply the changes, pass --apply:
 *
 *   npx tsx scripts/repair-identity-sync.ts            # preview only
 *   npx tsx scripts/repair-identity-sync.ts --apply    # write changes
 *
 * What it fixes:
 *   A) Duplicate contact emails — in each group of employees sharing one
 *      emailAddress1, the rightful owner is the one whose LOGIN (User.email)
 *      equals that email. We clear emailAddress1 on everyone else in the group.
 *      If no member's login matches, we keep the oldest row and clear the rest
 *      (and log a warning so you can review).
 *   B) Name desync — when firstName+lastName don't compose back to employeeName,
 *      we re-derive firstName/lastName FROM employeeName (the canonical display
 *      name). employeeName is never changed.
 *
 * It does NOT touch User.email, salary, or any other field.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const lc = (s?: string | null) => (s ?? "").trim().toLowerCase();

async function main() {
  console.log(APPLY ? "\n*** APPLY MODE — writing changes ***\n" : "\n--- DRY RUN (no writes). Pass --apply to commit. ---\n");

  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeName: true,
      firstName: true,
      lastName: true,
      emailAddress1: true,
      createdAt: true,
      user: { select: { email: true } },
    },
  });

  type Row = (typeof employees)[number];

  // ── A) Duplicate contact emails ──────────────────────────────────────────
  const byContact = new Map<string, Row[]>();
  for (const e of employees) {
    if (!e.emailAddress1) continue;
    const k = lc(e.emailAddress1);
    const arr = byContact.get(k) ?? [];
    arr.push(e);
    byContact.set(k, arr);
  }

  const emailClears: { id: string; name: string; email: string; reason: string }[] = [];
  for (const [email, rows] of byContact) {
    if (rows.length < 2) continue;
    const owner = rows.find((r) => lc(r.user?.email) === email);
    let keep: Row;
    if (owner) {
      keep = owner;
    } else {
      // No login owner — keep the oldest, clear the rest.
      keep = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      console.warn(`! No login owns "${email}". Keeping oldest emp=${keep.id} ("${keep.employeeName}"), clearing the rest.`);
    }
    for (const r of rows) {
      if (r.id === keep.id) continue;
      emailClears.push({
        id: r.id,
        name: r.employeeName ?? "",
        email: r.emailAddress1 ?? "",
        reason: owner
          ? `belongs to login ${owner.user?.email} (emp ${owner.id})`
          : `kept oldest emp ${keep.id}`,
      });
    }
  }

  // ── B) Name desync ───────────────────────────────────────────────────────
  const nameFixes: { id: string; from: string; toFirst: string; toLast: string | null }[] = [];
  for (const e of employees) {
    if (!e.employeeName) continue;
    if (!e.firstName && !e.lastName) continue;
    const composed = `${lc(e.firstName)} ${lc(e.lastName)}`.trim();
    if (composed === lc(e.employeeName)) continue;
    const parts = e.employeeName.trim().split(/\s+/);
    const toFirst = parts[0] ?? "";
    const toLast = parts.slice(1).join(" ") || null;
    nameFixes.push({
      id: e.id,
      from: `"${e.firstName ?? ""} ${e.lastName ?? ""}".trim() vs employeeName "${e.employeeName}"`,
      toFirst,
      toLast,
    });
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`=== A) Clear duplicate contact emails: ${emailClears.length} ===`);
  emailClears.forEach((c) => console.log(`  emp=${c.id} "${c.name}"  clear ${c.email}  (${c.reason})`));

  console.log(`\n=== B) Recompose names from employeeName: ${nameFixes.length} ===`);
  nameFixes.forEach((n) => console.log(`  emp=${n.id}  → firstName="${n.toFirst}" lastName=${n.toLast === null ? "null" : `"${n.toLast}"`}   [${n.from}]`));

  if (!APPLY) {
    console.log(`\n--- DRY RUN complete. Re-run with --apply to write these ${emailClears.length + nameFixes.length} change(s). ---\n`);
    return;
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  let written = 0;
  for (const c of emailClears) {
    await prisma.employee.update({ where: { id: c.id }, data: { emailAddress1: null } });
    written++;
  }
  for (const n of nameFixes) {
    await prisma.employee.update({ where: { id: n.id }, data: { firstName: n.toFirst, lastName: n.toLast } });
    written++;
  }
  console.log(`\n*** Applied ${written} change(s). ***\n`);
}

main()
  .catch((e) => {
    console.error("Repair failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
