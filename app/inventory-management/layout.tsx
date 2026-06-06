"use client";

import { InventoryProvider } from "@/lib/inventory-system/store";
import { ModuleNav } from "@/components/inventory-system/module-nav";

/**
 * Inventory module shell. Provides the optimistic data context once for the
 * whole module (so navigating between submodules keeps state warm) and renders
 * the sub-navigation above the active page. `h-full` fills the global <main>,
 * and the page area gets the remaining space for its WorkspaceShell.
 */
export default function InventoryManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <InventoryProvider>
      <div className="flex flex-col h-full min-h-0">
        <ModuleNav />
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </InventoryProvider>
  );
}
