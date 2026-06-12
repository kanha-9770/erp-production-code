"use client";

import PageBackLink from "@/components/shared/page-back-link";
import { ProcessList } from "@/components/approvals/process-list";

export default function InventoryApprovalProcessesPage() {
  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      <div className="mb-4">
        <PageBackLink href="/settings" label="Setup" />
      </div>
      <ProcessList module="inventory" />
    </div>
  );
}
