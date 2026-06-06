"use client";

/** Top sub-navigation for the Purchase module (documents + master). */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  Search,
  FileSignature,
  PackageCheck,
  Banknote,
  SlidersHorizontal,
  ShoppingCart,
  ClipboardList,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/purchase-management/suppliers", label: "Suppliers", icon: Truck },
  { href: "/purchase-management/requisition", label: "Requisition", icon: FileText },
  { href: "/purchase-management/sourcing", label: "Sourcing", icon: Search },
  { href: "/purchase-management/purchase-order", label: "Purchase Order", icon: FileSignature },
  { href: "/purchase-management/grn", label: "GRN", icon: PackageCheck },
  { href: "/purchase-management/open-po", label: "Open POs", icon: ClipboardList },
  { href: "/purchase-management/payment-request", label: "Payment", icon: Banknote },
  { href: "/purchase-management/master", label: "Purchase Master", icon: SlidersHorizontal },
];

export function ModuleNav() {
  const pathname = usePathname();
  return (
    <div className="border-b bg-background shrink-0">
      <div className="flex items-center gap-1 px-2 sm:px-4 h-12 overflow-x-auto">
        <div className="flex items-center gap-2 pr-3 mr-1 border-r shrink-0">
          <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <ShoppingCart className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold whitespace-nowrap hidden sm:inline">Purchase</span>
        </div>
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
