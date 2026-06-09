// app/api/users/route.ts
export const dynamic = 'force-dynamic';

import { type NextRequest } from "next/server";
import { UserManagementHandlers as H } from "@/lib/api-handlers/user-management";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  console.log("[DEBUG] GET /api/users invoked with query:", query);
  const response = await H.getUsers(request);
  try {
    const clone = response.clone();
    const data = await clone.json();
    if (Array.isArray(data)) {
      console.log(`[DEBUG] GET /api/users returned legacy array of length ${data.length}`);
    } else {
      console.log(`[DEBUG] GET /api/users returned paginated object: success=${data.success}, data.length=${data.data?.length}, total=${data.total}, page=${data.page}, pageSize=${data.pageSize}`);
    }
  } catch (err: any) {
    console.log("[DEBUG] GET /api/users response could not be parsed as JSON:", err?.message);
  }
  return response;
}

export async function POST(request: NextRequest) {
  return H.createUser(request);
}
