"use client";

import { PurchaseProvider } from "@/lib/purchase-system/store";
import { AccountsNav } from "@/components/accounts/module-nav";

/**
 * Accounts module shell. Reuses the purchase optimistic data context so the
 * Payment Request screen can read POs and GRN invoices (the same shared store
 * that powers the Purchase module), and renders the Accounts sub-navigation.
 */
export default function AccountsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PurchaseProvider>
      <div className="flex flex-col h-full min-h-0">
        <AccountsNav />
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </PurchaseProvider>
  );
}
