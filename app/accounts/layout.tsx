"use client";

import { AccountsProvider } from "@/lib/accounts-system/store";
import { PurchaseProvider } from "@/lib/purchase-system/store";
import { AccountsNav } from "@/components/accounts/module-nav";

/**
 * Accounts module shell. Provides the Accounts optimistic data context for the
 * finance documents, and ALSO the Purchase context — the procurement-side
 * Payment Request screen is surfaced here and reads POs / GRN invoices from the
 * purchase store. Both are localStorage-backed and independent.
 */
export default function AccountsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PurchaseProvider>
      <AccountsProvider>
        <div className="flex flex-col h-full min-h-0">
          <AccountsNav />
          <div className="flex-1 min-h-0">{children}</div>
        </div>
      </AccountsProvider>
    </PurchaseProvider>
  );
}
