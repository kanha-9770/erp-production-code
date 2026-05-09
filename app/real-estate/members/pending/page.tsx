"use client";

/**
 * Pending Onboarding — every agent in `PENDING_KYC` status, the staging area
 * the MLM-template calls "Holding Tank". Showing them as a focused list lets
 * an admin work through the queue end-to-end.
 *
 * From here, an admin typically opens the agent → verifies their KYC docs
 * (which auto-flips compliance) → flips status to ACTIVE.
 */

import { UserPlus } from "lucide-react";
import { MemberListShell } from "@/components/real-estate/members/member-list-shell";

export default function PendingMembersPage() {
  return (
    <MemberListShell
      scope="members-pending"
      pageTitle="Pending Onboarding"
      pageSubtitle="agent(s) awaiting KYC"
      pageIcon={<UserPlus className="h-4 w-4" />}
      statusFilter="PENDING_KYC"
      emptyState={
        <div className="py-10 text-center">
          <UserPlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p>No agents waiting on KYC. Nicely done.</p>
        </div>
      }
    />
  );
}
