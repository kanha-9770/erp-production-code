"use client";

/** Top sub-navigation for the Accounts module. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/accounts/payment-request", label: "Payment Request", icon: Banknote },
];

export function AccountsNav() {
  const pathname = usePathname();
  return (
    <div className="border-b bg-background shrink-0">
      <div className="flex items-center gap-1 px-2 sm:px-4 h-12 overflow-x-auto">
        <div className="flex items-center gap-2 pr-3 mr-1 border-r shrink-0">
          <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Landmark className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold whitespace-nowrap hidden sm:inline">Accounts</span>
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
