export const dynamic = 'force-dynamic';

import { type NextRequest } from "next/server";
import { UserManagementHandlers as H } from "@/lib/api-handlers/user-management";

export async function GET(request: NextRequest) {
  return H.getEmployees(request);
}

export async function POST(request: NextRequest) {
  return H.createEmployee(request);
}
