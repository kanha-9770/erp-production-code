"use client";

/**
 * Organization Structure — the org-unit hierarchy, embedded inline via the
 * reusable <OrgHierarchy /> (canvas chart + list, click-to-edit, add/delete).
 */

import { OrgHierarchy } from "@/components/organization/org-hierarchy";

export function OrgStructureSection() {
  return <OrgHierarchy addLabel="New Unit" defaultView="chart" />;
}
