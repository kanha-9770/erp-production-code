export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { OnboardingChecklistHandlers as H } from "@/lib/api-handlers/onboarding-checklists";

// Tasks only support PUT (no list/get/delete in this surface — tasks are
// always loaded via their parent checklist and deleted when the checklist
// is trashed).
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return H.updateTask(req, (await ctx.params).id);
}
