"use client";

import { use } from "react";
import PageBackLink from "@/components/shared/page-back-link";
import { ProcessBuilder } from "@/components/approvals/process-builder";

export default function EditPurchaseApprovalProcessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl">
      <div className="mb-4">
        <PageBackLink href="/settings/purchase/approval-processes" label="Approval Processes" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">Edit Approval Process</h1>
      <ProcessBuilder module="purchase" processId={id} />
    </div>
  );
}
