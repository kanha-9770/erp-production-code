export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { JobApplicationHandlers as H } from "@/lib/api-handlers/job-applications";

export async function GET(request: NextRequest) {
  return H.list(request);
}

export async function POST(request: NextRequest) {
  return H.create(request);
}
