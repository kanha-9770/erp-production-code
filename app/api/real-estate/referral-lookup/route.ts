import { NextRequest } from "next/server";
import { ReferralHandlers } from "@/lib/api-handlers/real-estate-my-team";

export const GET = (req: NextRequest) => ReferralHandlers.lookup(req);
