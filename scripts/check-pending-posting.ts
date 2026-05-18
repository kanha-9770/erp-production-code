/**
 * Smoke-test the pending-posting projection for a given user.
 *
 *   npx tsx scripts/check-pending-posting.ts <userEmail>
 */

import { PrismaClient, Prisma } from "@prisma/client";
import {
  calculateSlabCommission,
  getAgentCumulativeArea,
  resolveActivePlan,
  toSquareYards,
} from "../lib/real-estate/slab-engine";

const p = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: check-pending-posting.ts <userEmail>");
    process.exit(1);
  }
  const user = await p.user.findFirst({
    where: { email },
    select: { id: true, organizationId: true, first_name: true },
  });
  if (!user) {
    console.error(`User ${email} not found`);
    process.exit(1);
  }

  const orgId = user.organizationId!;

  const deals = await p.transaction.findMany({
    where: {
      organizationId: orgId,
      status: "CLOSED",
      commissionSplits: { none: {} },
    },
    select: {
      id: true,
      code: true,
      salePrice: true,
      listingAgentId: true,
      sellingAgentId: true,
      property: { select: { title: true, area: true, areaUnit: true } },
    },
    take: 100,
  });

  console.log(`\nClosed-unposted deals in org: ${deals.length}`);

  let myShare = 0;
  let myArea = new Prisma.Decimal(0);
  const breakdown: Array<{ code: string | null; share: number; sqyd: number; mine: boolean }> = [];

  for (const d of deals) {
    try {
      const calc = await calculateSlabCommission(p, d.id);
      const splits = (calc as any).splits as Array<{ userId?: string; amount: any }>;
      const share = splits
        .filter((s) => s.userId === user.id)
        .reduce((sum, s) => sum + Number(s.amount), 0);
      if (share <= 0) continue;
      const sellerId = d.sellingAgentId ?? d.listingAgentId;
      const isMine = sellerId === user.id;
      const sqyd = toSquareYards(
        new Prisma.Decimal(d.property.area ?? 0),
        d.property.areaUnit,
      );
      if (isMine) myArea = myArea.plus(sqyd);
      myShare += share;
      breakdown.push({ code: d.code, share, sqyd: Number(sqyd), mine: isMine });
    } catch (e: any) {
      // skip
    }
  }

  let curArea = new Prisma.Decimal(0);
  try {
    const plan = await resolveActivePlan(p, orgId);
    const profile = await p.agentProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (profile) {
      curArea = await getAgentCumulativeArea(p, orgId, profile.id, plan.id, {
        slabs: plan.slabs,
      });
    }
  } catch (e) {}

  console.log(`\n${user.first_name} <${email}>`);
  console.log(`  Possible commission     : ₹${myShare}`);
  console.log(`  Pending area (my sales) : ${myArea} sqyd`);
  console.log(`  Cumulative before       : ${curArea} sqyd`);
  console.log(`  Cumulative after        : ${curArea.plus(myArea)} sqyd`);
  if (breakdown.length > 0) {
    console.log("  Breakdown:");
    for (const b of breakdown) {
      console.log(
        `    - ${b.code}: ₹${b.share.toFixed(2)}${b.mine ? `  (my sale, ${b.sqyd} sqyd)` : ""}`,
      );
    }
  }
}

main().finally(() => p.$disconnect());
