"use client";

/**
 * Point History (Wallet Activity) report — every ledger entry across every
 * wallet in the brokerage. The category filter is exposed so admins can
 * focus on COMMISSION, OVERRIDE, BONUS, etc.
 *
 * The MLM-template label "Point History" maps to wallet activity in real-
 * estate context — there are no "points", just rupees moving in/out.
 */

import { Activity } from "lucide-react";
import { LedgerReportShell } from "@/components/real-estate/reports/ledger-report-shell";

export default function PointHistoryReportPage() {
  return (
    <LedgerReportShell
      pageTitle="Wallet Activity"
      pageSubtitle="Full ledger feed — every credit, debit, hold, release, and reversal across all wallets."
      pageIcon={<Activity className="h-6 w-6 text-primary" />}
      showCategoryFilter
    />
  );
}
