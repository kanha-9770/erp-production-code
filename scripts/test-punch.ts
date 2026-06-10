import { prisma } from "@/lib/prisma";
import { recordPunch } from "@/lib/hr/attendance-service";
async function main() {
  // Find a user with an org to punch as.
  const u: any = await prisma.user.findFirst({
    where: { organizationId: { not: null } },
    select: { id: true, organizationId: true },
  });
  if (!u) { console.log("NO_USER"); return; }

  // Clean any existing row for today so IN can run.
  const { getToday } = await import("@/lib/attendance");
  // Try an IN punch (no geo → inside-fence logic returns true when no fence set).
  try {
    const r = await recordPunch({
      userId: u.id,
      organizationId: u.organizationId,
      type: "IN",
      geo: null,
      source: "WEB",
      idempotencyKey: "test-" + u.id,
    });
    console.log("PUNCH_IN_OK state:", r.status.state, "checkedIn:", r.status.checkedIn);
  } catch (e:any) {
    console.log("PUNCH_IN_ERR:", String(e.message||e).split("\n")[0], "code:", e?.code);
  }
}
main().catch(e=>console.error("ERR", e?.message||e)).finally(()=>prisma.$disconnect());
