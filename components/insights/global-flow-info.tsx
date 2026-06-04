"use client";

/**
 * Global "how it works" beacon.
 *
 * Mounted once in the app shell. It reads the current route, looks up the
 * matching module flow from the registry, and renders the floating "!" help
 * beacon — so every module gets an instant, self-explanatory workflow diagram
 * with zero per-page wiring. On routes with no defined flow (dashboard,
 * settings, profile…) it renders nothing.
 */

import { usePathname } from "next/navigation";
import { getModuleFlow } from "@/lib/module-flows";
import { ModuleFlowInfo } from "@/components/insights/module-flow-info";

export function GlobalFlowInfo() {
  const pathname = usePathname();
  const flow = getModuleFlow(pathname);
  if (!flow) return null;
  return <ModuleFlowInfo flow={flow} trigger="floating" />;
}
