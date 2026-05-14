import { NextRequest } from "next/server";
import { ReferralHandlers } from "@/lib/api-handlers/real-estate-my-team";

export const POST = (req: NextRequest) => ReferralHandlers.onboardAsAgent(req);
