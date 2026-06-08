"use client";

import { ProductProvider } from "@/lib/product-system/store";
import { ProductNav } from "@/components/product/module-nav";

/**
 * Product Master module shell. Provides the optimistic data context once for
 * the whole module and renders the sub-navigation above the active page.
 */
export default function ProductMasterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProductProvider>
      <div className="flex flex-col h-full min-h-0">
        <ProductNav />
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </ProductProvider>
  );
}
