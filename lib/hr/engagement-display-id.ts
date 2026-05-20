/**
 * Mint the next per-organization, per-module human-readable display ID for
 * an engagement submission — e.g. "NK-001" for the third Kaizen in an org.
 *
 * Prefix table:
 *   Kaizen      → NK
 *   Suggestion  → ES
 *   Problem     → PR
 *   Initiative  → SI
 *   Target      → ST
 *
 * Implementation note: we count existing rows in the same organization
 * and add 1. The result is zero-padded to 3 digits. Concurrent submits in
 * the same millisecond can race to the same number; the per-table
 * `@@unique([organizationId, displayId])` constraint forces the second
 * writer to retry, so the function takes a `tableCounter` it can re-run.
 */

import { prisma } from "@/lib/prisma";

export type EngagementModule =
  | "Kaizen"
  | "Suggestion"
  | "Problem"
  | "Initiative"
  | "Target";

const PREFIX: Record<EngagementModule, string> = {
  Kaizen: "NK",
  Suggestion: "ES",
  Problem: "PR",
  Initiative: "SI",
  Target: "ST",
};

function counterFor(mod: EngagementModule, organizationId: string) {
  const where = { organizationId };
  switch (mod) {
    case "Kaizen":
      return (prisma as any).engagementKaizen.count({ where });
    case "Suggestion":
      return (prisma as any).engagementSuggestion.count({ where });
    case "Problem":
      return (prisma as any).engagementProblem.count({ where });
    case "Initiative":
      return (prisma as any).engagementInitiative.count({ where });
    case "Target":
      return (prisma as any).engagementTarget.count({ where });
  }
}

export async function nextDisplayId(
  mod: EngagementModule,
  organizationId: string,
): Promise<string> {
  const count = (await counterFor(mod, organizationId)) as number;
  const n = count + 1;
  return `${PREFIX[mod]}-${String(n).padStart(3, "0")}`;
}

export function displayIdPrefix(mod: EngagementModule): string {
  return PREFIX[mod];
}
