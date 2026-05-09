import type { ReactNode } from "react";

/**
 * /real-estate/members/* — Members Management section.
 *
 * Three sub-pages, each a focused view over the agents data:
 *   - /active   → ACTIVE agents (the "network members" in MLM template lingo)
 *   - /pending  → PENDING_KYC agents (the "holding tank" in MLM template lingo)
 *   - /kyc      → admin compliance overview
 *
 * No layout chrome here — each page renders its own header. This file exists
 * so we can register a /real-estate/members route and have Next route the
 * children correctly.
 */
export default function MembersLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
