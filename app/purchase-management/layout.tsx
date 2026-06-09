"use client";

import { PurchaseProvider } from "@/lib/purchase-system/store";
import { ModuleNav } from "@/components/purchase-system/module-nav";
import { WorkflowGuide } from "@/components/purchase-system/workflow-guide";

/**
 * Purchase module shell. Provides the optimistic data context once for the
 * whole module and renders the document sub-navigation above the active page.
 * The "How it works" guide floats in the bottom-right corner of every page.
 */
export default function PurchaseManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PurchaseProvider>
      <div className="flex flex-col h-full min-h-0">
        <ModuleNav />
        <div className="flex-1 min-h-0">{children}</div>
      </div>
      <WorkflowGuide />
    </PurchaseProvider>
  );
}
