"use client";

import PageBackLink from "@/components/shared/page-back-link";
import { ProcessBuilder } from "@/components/approvals/process-builder";

export default function NewInventoryApprovalProcessPage() {
  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl">
      <div className="mb-4">
        <PageBackLink href="/settings/inventory/approval-processes" label="Approval Processes" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">New Approval Process</h1>
      <ProcessBuilder module="inventory" />
    </div>
  );
}
