"use client";

/** Top sub-navigation for the Inventory module (submodules + master). */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Cog,
  Layers,
  SlidersHorizontal,
  Warehouse,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/inventory-management/store-inventory", label: "Store", icon: Boxes },
  { href: "/inventory-management/inward", label: "Inward", icon: ArrowDownToLine },
  { href: "/inventory-management/outward", label: "Outward", icon: ArrowUpFromLine },
  { href: "/inventory-management/machine-inventory", label: "Machine", icon: Cog },
  { href: "/inventory-management/metal-inventory", label: "Metal", icon: Layers },
  { href: "/inventory-management/master", label: "Inventory Master", icon: SlidersHorizontal },
];

export function ModuleNav() {
  const pathname = usePathname();
  return (
    <div className="border-b bg-background shrink-0">
      <div className="flex items-center gap-1 px-2 sm:px-4 h-12 overflow-x-auto">
        <div className="flex items-center gap-2 pr-3 mr-1 border-r shrink-0">
          <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Warehouse className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold whitespace-nowrap hidden sm:inline">Inventory</span>
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
        {/* Discoverability link to the cross-module approvals inbox (page lives under Settings). */}
        <Link
          href="/settings/approvals"
          className="ml-auto inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">My Approvals</span>
        </Link>
      </div>
    </div>
  );
}
