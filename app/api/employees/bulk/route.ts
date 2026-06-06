export const dynamic = 'force-dynamic';

import { type NextRequest } from "next/server";
import { UserManagementHandlers as H } from "@/lib/api-handlers/user-management";

// POST /api/employees/bulk — apply one action (delete / status change) to many
// employees at once. See UserManagementHandlers.bulkUpdateEmployees.
export async function POST(request: NextRequest) {
  return H.bulkUpdateEmployees(request);
}
