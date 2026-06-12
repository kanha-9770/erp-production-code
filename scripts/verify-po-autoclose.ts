/**
 * Verify PO auto-close against the real purchase handler: a GRN that fully
 * receives a PO flips the PO to CLOSED; reducing the receipt re-opens it;
 * deleting the GRN leaves it open. Self-cleaning.
 *
 *   npx tsx scripts/verify-po-autoclose.ts --org "Nessco Groupo"
 */
import { prisma } from "@/lib/prisma";
import { PurchaseHandlers } from "@/lib/api-handlers/purchase-system";

const TAG = `poac-${Date.now()}`;
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `  — ${extra}`}`); };

async function poStatus(id: string): Promise<string> {
  const r = await prisma.purchaseRecord.findUnique({ where: { id }, select: { data: true } });
  return String(((r?.data as any) ?? {}).status ?? "");
}

async function main() {
  const i = process.argv.indexOf("--org");
  const orgName = i >= 0 ? process.argv[i + 1] : "Nessco Groupo";
  const org = await prisma.organization.findFirst({ where: { name: orgName }, select: { id: true, name: true, ownerId: true } });
  if (!org) throw new Error(`Org "${orgName}" not found`);
  // An admin user (bypasses purchase create perms) to drive the handler.
  const adminRole = await prisma.role.findFirst({ where: { organizationId: org.id, isAdmin: true, isActive: true }, select: { id: true } });
  const adminAssign = adminRole
    ? await prisma.userUnitAssignment.findFirst({ where: { roleId: adminRole.id, unit: { isActive: true } }, select: { userId: true } })
    : null;
  const userId = org.ownerId ?? adminAssign?.userId;
  if (!userId) throw new Error("No admin/owner user found to drive the handler");
  const ctx = { organizationId: org.id, userId };
  console.log(`\n=== ${org.name} — PO auto-close ===\n`);

  const poNo = `${TAG}-PO`;
  const po = await prisma.purchaseRecord.create({
    data: { organizationId: org.id, submodule: "po", status: "SENT", createdById: userId,
      data: { docNo: poNo, status: "SENT", itemName: "Widget", quantity: 5, rate: 10, amount: 50, supplier: "TestVendor" } },
  });
  let grnId = "";
  try {
    check("PO starts as SENT", (await poStatus(po.id)) === "SENT");

    // GRN fully receiving the PO (5 of 5) — no-invoice flat lines.
    const grn: any = await PurchaseHandlers.createRecord(ctx, "grn", {
      docDate: "2026-06-11", supplier: "TestVendor", receivedAgainst: "NO_INVOICE", status: "GATE_ENTRY",
      receiptLines: [{ poRef: poNo, itemName: "Widget", invoiceQty: 5, receivedQty: 5, amount: 50 }],
    });
    grnId = grn.id;
    check("Full receipt → PO auto-closes (CLOSED)", (await poStatus(po.id)) === "CLOSED", `got ${await poStatus(po.id)}`);

    // Reduce the receipt to 3 of 5 — PO must re-open.
    await PurchaseHandlers.updateRecord(ctx, grnId, "grn", {
      receiptLines: [{ poRef: poNo, itemName: "Widget", invoiceQty: 5, receivedQty: 3, amount: 30 }],
    });
    check("Partial receipt → PO re-opens (SENT)", (await poStatus(po.id)) === "SENT", `got ${await poStatus(po.id)}`);

    // Back to full → closes again.
    await PurchaseHandlers.updateRecord(ctx, grnId, "grn", {
      receiptLines: [{ poRef: poNo, itemName: "Widget", invoiceQty: 5, receivedQty: 5, amount: 50 }],
    });
    check("Re-full → PO closes again (CLOSED)", (await poStatus(po.id)) === "CLOSED", `got ${await poStatus(po.id)}`);

    // Delete the GRN → nothing received → PO open again.
    await PurchaseHandlers.deleteRecord(ctx, grnId);
    grnId = "";
    check("GRN deleted → PO re-opens (SENT)", (await poStatus(po.id)) === "SENT", `got ${await poStatus(po.id)}`);
  } finally {
    if (grnId) await prisma.purchaseRecord.deleteMany({ where: { id: grnId } });
    await prisma.purchaseRecord.deleteMany({ where: { id: po.id } });
    console.log("\n  (temp PO + GRN cleaned up)");
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
