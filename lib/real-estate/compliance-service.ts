/**
 * Compliance service — single source of truth for "is this agent compliant?"
 *
 * Rules (FR-8):
 *   - Each agent must have one VERIFIED document of every REQUIRED type whose
 *     expiry date is in the future.
 *   - If any required doc is missing → PENDING_KYC.
 *   - If any required doc is REJECTED, EXPIRED, or past its expiryDate →
 *     NON_COMPLIANT.
 *   - Otherwise → COMPLIANT.
 *
 * The agent's `AgentProfile.complianceStatus` is denormalised onto the row
 * for fast filtering. We recompute it whenever a doc is uploaded, verified,
 * rejected, or via the explicit `recomputeForAgent` and `recomputeAllStale`
 * functions.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

// FR-8.1 — required docs to be considered COMPLIANT.
export const REQUIRED_DOC_TYPES = [
  "GOVERNMENT_ID",
  "REAL_ESTATE_LICENSE",
  "TAX_FORM",
  "AGENCY_AGREEMENT",
] as const;

export type RequiredDocType = (typeof REQUIRED_DOC_TYPES)[number];

// FR-8.3 — notify at these intervals before expiry.
export const EXPIRY_WARN_DAYS = [30, 14, 7] as const;

interface DocSummary {
  type: string;
  status: string;
  expiryDate: Date | null;
}

function summariseStatus(docs: DocSummary[]): {
  complianceStatus: "COMPLIANT" | "PENDING_KYC" | "NON_COMPLIANT";
  reasons: string[];
} {
  const reasons: string[] = [];
  const now = Date.now();

  // Group docs by type — keep only the "best" doc per type (latest VERIFIED
  // takes priority over PENDING / REJECTED / EXPIRED).
  const byType = new Map<string, DocSummary>();
  const order = (s: string) =>
    s === "VERIFIED" ? 0 : s === "PENDING" ? 1 : s === "REJECTED" ? 2 : 3;
  for (const d of docs) {
    const existing = byType.get(d.type);
    if (!existing || order(d.status) < order(existing.status)) {
      byType.set(d.type, d);
    }
  }

  let anyExpired = false;
  let anyRejected = false;
  let missing = false;

  for (const required of REQUIRED_DOC_TYPES) {
    const doc = byType.get(required);
    if (!doc) {
      missing = true;
      reasons.push(`Missing ${required}`);
      continue;
    }
    if (doc.status === "REJECTED") {
      anyRejected = true;
      reasons.push(`${required} rejected`);
      continue;
    }
    if (doc.status === "EXPIRED") {
      anyExpired = true;
      reasons.push(`${required} expired`);
      continue;
    }
    if (doc.status === "PENDING") {
      missing = true;
      reasons.push(`${required} pending verification`);
      continue;
    }
    // VERIFIED — ensure not past expiry
    if (doc.expiryDate && doc.expiryDate.getTime() < now) {
      anyExpired = true;
      reasons.push(`${required} past expiry`);
    }
  }

  if (anyRejected || anyExpired)
    return { complianceStatus: "NON_COMPLIANT", reasons };
  if (missing) return { complianceStatus: "PENDING_KYC", reasons };
  return { complianceStatus: "COMPLIANT", reasons: [] };
}

export const ComplianceService = {
  /**
   * Recompute `AgentProfile.complianceStatus` for one agent based on its
   * current ComplianceDocument set + the agent's own license expiry. Also
   * flips any past-expiry doc to status=EXPIRED so the verification queue
   * filters work cleanly.
   */
  async recomputeForAgent(tx: Tx, agentProfileId: string) {
    const docs = await tx.complianceDocument.findMany({
      where: { agentProfileId },
      select: { id: true, type: true, status: true, expiryDate: true },
    });

    // Auto-flip past-expiry VERIFIED rows to EXPIRED before computing.
    const now = Date.now();
    for (const d of docs) {
      if (
        d.status === "VERIFIED" &&
        d.expiryDate &&
        d.expiryDate.getTime() < now
      ) {
        await tx.complianceDocument.update({
          where: { id: d.id },
          data: { status: "EXPIRED" },
        });
        d.status = "EXPIRED";
      }
    }

    const result = summariseStatus(
      docs.map((d) => ({
        type: d.type,
        status: d.status,
        expiryDate: d.expiryDate ?? null,
      })),
    );

    await tx.agentProfile.update({
      where: { id: agentProfileId },
      data: { complianceStatus: result.complianceStatus },
    });

    return result;
  },

  /**
   * Sweep all agents in an org and recompute their compliance. Useful as a
   * daily cron — picks up newly-expired docs even if no UI action triggered
   * a recompute.
   */
  async recomputeAllStale(tx: Tx, organizationId: string) {
    const agents = await tx.agentProfile.findMany({
      where: { organizationId, status: { not: "TERMINATED" } },
      select: { id: true },
    });
    const stats = { COMPLIANT: 0, PENDING_KYC: 0, NON_COMPLIANT: 0 };
    for (const a of agents) {
      const r = await this.recomputeForAgent(tx, a.id);
      stats[r.complianceStatus]++;
    }
    return { evaluated: agents.length, ...stats };
  },

  /**
   * Returns the list of agents whose VERIFIED docs expire within `daysAhead`
   * (default 30). Used by the compliance dashboard to surface expiring
   * licenses ahead of time.
   */
  async listExpiringSoon(
    tx: Tx,
    organizationId: string,
    daysAhead = 30,
  ) {
    const cutoff = new Date(Date.now() + daysAhead * 86400000);
    return tx.complianceDocument.findMany({
      where: {
        organizationId,
        status: "VERIFIED",
        expiryDate: { lte: cutoff, gt: new Date() },
      },
      orderBy: { expiryDate: "asc" },
      include: {
        agentProfile: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        },
      },
    });
  },
};
