export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { LeadHandlers as H } from "@/lib/api-handlers/real-estate-leads";

// GET /api/real-estate/admin/lead-duplicates — admin/MD-only.
//
// Returns every AGENT-origin lead that was silently flagged as a duplicate
// on capture, grouped by the ORIGINAL lead they cloned. Used by the admin
// "duplicate review" surface; regular agents must never see this data.
export async function GET(req: NextRequest) {
  return H.duplicates(req);
}
