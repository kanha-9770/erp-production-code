"use client";

import PageBackLink from "@/components/shared/page-back-link";
import { ApprovalsWorkspace } from "@/components/approvals/approvals-workspace";

export default function ApprovalsWorkspacePage() {
  return (
    <div className="container mx-auto px-6 py-8 max-w-5xl">
      <div className="mb-4">
        <PageBackLink href="/settings" label="Setup" />
      </div>
      <ApprovalsWorkspace />
    </div>
  );
}
