"use client";

/**
 * Active Network Members — every agent currently `ACTIVE`. The MLM-template
 * equivalent of "Network Members". Fully interactive table (the same Excel-
 * style primitive used everywhere else).
 */

import { Users } from "lucide-react";
import { MemberListShell } from "@/components/real-estate/members/member-list-shell";

export default function ActiveMembersPage() {
  return (
    <MemberListShell
      scope="members-active"
      pageTitle="Active Network Members"
      pageSubtitle="active agent(s)"
      pageIcon={<Users className="h-4 w-4" />}
      statusFilter="ACTIVE"
      emptyState={
        <div className="py-10 text-center">
          <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p>No active agents yet.</p>
        </div>
      }
    />
  );
}
