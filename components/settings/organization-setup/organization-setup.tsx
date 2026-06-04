"use client";

/**
 * OrganizationSetup — the shell for Settings → Organization Setup.
 *
 * Layout matches the reference mockup: a left section rail + a content pane.
 *   • Desktop (lg+): persistent left sidebar, content to its right.
 *   • Mobile/tablet: the rail collapses into a Sheet opened from a header
 *     button that also shows the active section.
 *
 * Every section is functional and persists to the org (Organization Details
 * via /api/organization/settings; the rest via /api/organization/setup).
 * Organization Structure embeds the live org tree inline. The active section
 * is held in `?tab=` so views are linkable & survive refresh.
 */

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ScrollText,
  Network,
  MapPin,
  Building,
  Briefcase,
  Palette,
  Send,
  KeyRound,
  Menu,
  Settings2,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import PageBackLink from "@/components/shared/page-back-link";
import { cn } from "@/lib/utils";
import { OrganizationDetails } from "./organization-details";
import { OrgPolicySection } from "./sections/org-policy";
import { OrgStructureSection } from "./sections/org-structure";
import { LocationsSection } from "./sections/locations";
import { DepartmentsSection } from "./sections/departments";
import { DesignationsSection } from "./sections/designations";
import { BrandingSection } from "./sections/branding";
import { FromAddressesSection } from "./sections/from-addresses";
import { EmailAuthSection } from "./sections/email-auth";

interface Section {
  id: string;
  label: string;
  icon: LucideIcon;
  render: () => React.ReactNode;
  /** Render with minimal chrome (used by the org structure canvas). */
  fullBleed?: boolean;
}

const SECTIONS: Section[] = [
  {
    id: "organization-details",
    label: "Organization Details",
    icon: Building2,
    render: () => <OrganizationDetails />,
  },
  {
    id: "organization-policy",
    label: "Organization Policy",
    icon: ScrollText,
    render: () => <OrgPolicySection />,
  },
  {
    id: "organization-structure",
    label: "Organization Structure",
    icon: Network,
    fullBleed: true,
    render: () => <OrgStructureSection />,
  },
  {
    id: "locations",
    label: "Locations",
    icon: MapPin,
    render: () => <LocationsSection />,
  },
  {
    id: "departments",
    label: "Departments",
    icon: Building,
    fullBleed: true,
    render: () => <DepartmentsSection />,
  },
  {
    id: "designations",
    label: "Designations",
    icon: Briefcase,
    render: () => <DesignationsSection />,
  },
  {
    id: "domains-and-rebranding",
    label: "Domains and Rebranding",
    icon: Palette,
    render: () => <BrandingSection />,
  },
  {
    id: "from-addresses",
    label: "From Addresses",
    icon: Send,
    render: () => <FromAddressesSection />,
  },
  {
    id: "email-authentication",
    label: "Email Authentication",
    icon: KeyRound,
    render: () => <EmailAuthSection />,
  },
];

export function OrganizationSetup() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeId = useMemo(() => {
    const tab = searchParams.get("tab");
    return SECTIONS.some((s) => s.id === tab) ? (tab as string) : SECTIONS[0].id;
  }, [searchParams]);

  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  const selectSection = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`/settings/organization?${params.toString()}`, {
      scroll: false,
    });
    setMobileNavOpen(false);
  };

  const NavList = ({ onPick }: { onPick: (id: string) => void }) => (
    <nav className="space-y-0.5">
      {SECTIONS.map((s) => {
        const isActive = s.id === active.id;
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
              isActive
                ? "bg-primary/10 font-medium text-primary"
                : "text-foreground/80 hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            <span className="truncate">{s.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-full bg-muted/30 dark:bg-gray-950">
      {/* Top bar — single compact row */}
      <div className="border-b bg-background">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3">
          <PageBackLink href="/settings" label="Settings" />
          <span className="h-4 w-px bg-border" />
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
            <Settings2 className="h-4 w-4" />
          </span>
          <h1 className="text-base sm:text-lg font-semibold leading-none text-foreground">
            Organization Setup
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        {/* Mobile section switcher */}
        <div className="lg:hidden mb-4">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between h-11"
              >
                <span className="flex items-center gap-2">
                  <active.icon className="h-4 w-4 text-primary" />
                  <span className="font-medium">{active.label}</span>
                </span>
                <Menu className="h-4 w-4 text-muted-foreground" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] sm:w-80 p-0">
              <SheetTitle className="px-4 pt-5 pb-3 text-sm font-semibold">
                Organization Setup
              </SheetTitle>
              <div className="px-2 pb-4">
                <NavList onPick={selectSection} />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-4 rounded-xl border bg-background p-2 shadow-sm">
              <NavList onPick={selectSection} />
            </div>
          </aside>

          {/* Content */}
          <main className="min-w-0">
            <div
              className={cn(
                "rounded-xl border bg-background shadow-sm",
                active.fullBleed
                  ? "overflow-hidden"
                  : "p-4 sm:p-6 lg:p-8",
              )}
            >
              {active.render()}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
