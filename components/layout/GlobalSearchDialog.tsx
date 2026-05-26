"use client";

/**
 * Global search command palette.
 *
 * Indexes three sources so the user can jump to anything in one place:
 *
 *   1. **Shortcuts**     — Home, AI Chatbot, Settings, Profile.
 *   2. **Static pages**  — every entry in `lib/static-pages.ts`
 *                          (Attendance, Leave, Payroll, HR, Real-Estate…).
 *                          Grouped by their `group` field so the list
 *                          stays scannable on a phone.
 *   3. **Org modules**   — the form-builder module list from
 *                          `useGetOrgModulesLiteQuery`. Only modules
 *                          with `hasForms === true` are clickable; pure
 *                          containers are skipped (their page would be
 *                          an empty record list, exactly like the
 *                          sidebar suppresses).
 *
 * Filtering is delegated to cmdk's built-in matcher — we just stuff the
 * label, description and group into the item's `value` so any of those
 * tokens will match. Selecting a result closes the dialog and routes
 * via `next/navigation`, one frame later, so the dialog's close
 * animation isn't cut off by the page transition.
 *
 * Visual: uses the project's `CommandDialog` (centred modal). Header
 * + bordered input + scrollable list — matches every other cmdk palette
 * in the codebase so a user who's seen one has seen them all.
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Home,
  Sparkles,
  Settings,
  User,
  Clock,
  Calendar,
  CalendarHeart,
  Wallet,
  Users,
  Briefcase,
  Megaphone,
  UserPlus,
  FileSignature,
  ScrollText,
  LayoutDashboard,
  Target,
  Lightbulb,
  AlertCircle,
  TrendingUp,
  MessageSquare,
  Package,
  Boxes,
  Plus,
  Building2,
  Network,
  List,
  Receipt,
  Shield,
  Folder,
  Inbox,
  Edit3,
} from "lucide-react";
import { STATIC_PAGES } from "@/lib/static-pages";
import { useGetUserQuery } from "@/lib/api/auth";
import { useGetOrgModulesLiteQuery } from "@/lib/api/modules";

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Resolve a Lucide icon component from the string identifiers used in
// `lib/static-pages.ts`. The static-pages file is intentionally decoupled
// from `lucide-react` (it's imported by server code too), so the mapping
// has to live here on the client. Unknown values fall back to a generic
// folder icon rather than a missing-component crash.
function iconFromName(name?: string | null): React.ComponentType<{
  className?: string;
}> {
  switch (name) {
    case "clock":
      return Clock;
    case "edit":
      return Edit3;
    case "users":
      return Users;
    case "settings":
      return Settings;
    case "calendar":
      return Calendar;
    case "calendar-heart":
      return CalendarHeart;
    case "inbox":
      return Inbox;
    case "wallet":
      return Wallet;
    case "briefcase":
      return Briefcase;
    case "megaphone":
      return Megaphone;
    case "user-plus":
      return UserPlus;
    case "file-signature":
      return FileSignature;
    case "scroll-text":
      return ScrollText;
    case "layout-dashboard":
      return LayoutDashboard;
    case "target":
      return Target;
    case "lightbulb":
      return Lightbulb;
    case "alert-circle":
      return AlertCircle;
    case "trending-up":
      return TrendingUp;
    case "message-square":
      return MessageSquare;
    case "package":
      return Package;
    case "boxes":
      return Boxes;
    case "plus":
      return Plus;
    case "building2":
      return Building2;
    case "network":
      return Network;
    case "list":
      return List;
    case "receipt":
      return Receipt;
    case "shield":
      return Shield;
    default:
      return Folder;
  }
}

// Match the sidebar's slug rule (sidebar.tsx → generatePath). Mirroring
// it here means a search result links to the exact same URL the sidebar
// would have routed to, so the active-route highlight on the
// destination page lights up correctly.
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "module"
  );
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: GlobalSearchDialogProps) {
  const router = useRouter();
  const { data: userData } = useGetUserQuery();
  const organizationId = userData?.user?.organization?.id ?? null;
  // Skip the modules fetch until we actually have an org id — otherwise
  // we'd dispatch a query with an empty string that the API will reject.
  const { data: modulesResp } = useGetOrgModulesLiteQuery(
    organizationId ?? "",
    { skip: !organizationId },
  );

  const moduleItems = useMemo(() => {
    const list = modulesResp?.data ?? [];
    return list
      // Only modules that own forms are clickable — pure containers
      // would route the user to an empty record list. Same filter the
      // sidebar applies in handleModuleClick.
      .filter((m) => m.hasForms)
      .map((m) => ({
        id: m.id,
        label: m.name,
        href: `/${slugify(m.name)}/${m.id}`,
      }));
  }, [modulesResp]);

  // Group static pages by their declared group so the result list reads
  // as small, scannable sections instead of a 50-row scroll.
  const pagesByGroup = useMemo(() => {
    const groups = new Map<string, typeof STATIC_PAGES>();
    for (const p of STATIC_PAGES) {
      const arr = groups.get(p.group) ?? [];
      arr.push(p);
      groups.set(p.group, arr);
    }
    return Array.from(groups.entries());
  }, []);

  const goto = (href: string) => {
    onOpenChange(false);
    // Defer the route push by one frame so the dialog's close animation
    // can start; otherwise the new page paints over the still-fading
    // overlay, which looks janky on slower phones.
    requestAnimationFrame(() => router.push(href));
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages, modules, settings…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        <CommandGroup heading="Shortcuts">
          <CommandItem
            value="home dashboard"
            onSelect={() => goto("/")}
          >
            <Home className="mr-2 h-4 w-4" />
            <span>Home</span>
          </CommandItem>
          <CommandItem
            value="ai chatbot chat assistant"
            onSelect={() => goto("/chatbot")}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            <span>AI Chatbot</span>
          </CommandItem>
          <CommandItem
            value="profile account user me"
            onSelect={() => goto("/profile")}
          >
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </CommandItem>
          <CommandItem
            value="settings preferences configuration"
            onSelect={() => goto("/settings")}
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {pagesByGroup.map(([group, pages]) => (
          <CommandGroup key={group} heading={group}>
            {pages.map((p) => {
              const Icon = iconFromName(p.icon);
              return (
                <CommandItem
                  key={p.path}
                  // Stuff label + description + group into the value so
                  // cmdk's matcher finds the row from any of them.
                  value={`${p.label} ${p.description ?? ""} ${p.group}`}
                  onSelect={() => goto(p.path)}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{p.label}</span>
                    {p.description && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {p.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}

        {moduleItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Modules">
              {moduleItems.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.label} module`}
                  onSelect={() => goto(m.href)}
                >
                  <Folder className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{m.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
