export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { AppointmentLetterHandlers as H } from "@/lib/api-handlers/appointment-letters";

export async function GET(request: NextRequest) {
  return H.list(request);
}

export async function POST(request: NextRequest) {
  return H.create(request);
}
