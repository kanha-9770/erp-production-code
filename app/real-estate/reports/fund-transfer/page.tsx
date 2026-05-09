"use client";

/**
 * Fund Transfer report — every manual ledger adjustment posted via the
 * Fund Credit page. Default-filtered to category=ADJUSTMENT so admins can
 * audit who credited/debited which wallets and why.
 */

import { Coins } from "lucide-react";
import { LedgerReportShell } from "@/components/real-estate/reports/ledger-report-shell";

export default function FundTransferReportPage() {
  return (
    <LedgerReportShell
      pageTitle="Fund Transfer Report"
      pageSubtitle="Manual ledger adjustments — credits and debits posted by admins."
      pageIcon={<Coins className="h-6 w-6 text-primary" />}
      defaultCategory="ADJUSTMENT"
      showCategoryFilter={false}
    />
  );
}
