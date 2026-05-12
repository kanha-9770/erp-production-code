"use client";

/**
 * Global Cmd+K command palette for the Real Estate module.
 *
 * - Opens with ⌘K / Ctrl+K from any /real-estate/* page (mounted via the
 *   module layout).
 * - Fuzzy-searches properties, agents, leads, and transactions in parallel
 *   via RTK Query (each query is bounded by the search term, so no fetch
 *   fires until the user types).
 * - Static "Pages" group jumps you anywhere in the module.
 *
 * Why a custom palette and not just the sidebar search: this one is
 * data-aware — typing "andheri" finds properties in Andheri, "priya" finds
 * the agent. Builds the "feels familiar" muscle memory the user asked for.
 */

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Building2,
  Users,
  Inbox,
  Receipt,
  Wallet,
  Shield,
  BarChart3,
  Network,
  Sparkles,
  CalendarDays,
  Plus,
  Home,
  Banknote,
  TrendingUp,
  ShieldCheck,
  UserPlus,
  Coins,
  List,
  GitBranch,
  Trophy,
  Activity,
  Boxes,
} from "lucide-react";
import { useGetPropertiesQuery } from "@/lib/api/real-estate/properties";
import { useGetAgentsQuery } from "@/lib/api/real-estate/agents";
import { useGetLeadsQuery } from "@/lib/api/real-estate/leads";
import { useGetTransactionsQuery } from "@/lib/api/real-estate/transactions";
import {
  formatCurrency,
  fullName,
  PROPERTY_STATUS_LABEL,
  AGENT_STATUS_LABEL,
  LEAD_STATUS_LABEL,
  TRANSACTION_STATUS_LABEL,
} from "@/components/real-estate/constants";

interface PaletteContextValue {
  open: boolean;
  setOpen: (o: boolean) => void;
}
const PaletteContext = createContext<PaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("useCommandPalette outside <CommandPaletteProvider>");
  return ctx;
}

const STATIC_PAGES = [
  { href: "/real-estate", icon: Home, label: "Dashboard" },
  { href: "/real-estate/dashboards/sales", icon: TrendingUp, label: "Sales Dashboard" },
  { href: "/real-estate/dashboards/network", icon: Network, label: "Agent Network Dashboard" },
  { href: "/real-estate/properties", icon: Building2, label: "Properties" },
  { href: "/real-estate/agents", icon: Users, label: "Agents" },
  { href: "/real-estate/agents/tree", icon: Network, label: "Hierarchy: Tree" },
  { href: "/real-estate/agents/hierarchy-list", icon: List, label: "Hierarchy: List" },
  { href: "/real-estate/agents/binary", icon: GitBranch, label: "Hierarchy: Binary" },
  { href: "/real-estate/agents/sponsor", icon: Network, label: "Hierarchy: Sponsor" },
  { href: "/real-estate/agents/ranks", icon: Sparkles, label: "Ranks" },
  { href: "/real-estate/members/active", icon: Users, label: "Active Network Members" },
  { href: "/real-estate/members/pending", icon: UserPlus, label: "Pending Onboarding" },
  { href: "/real-estate/members/kyc", icon: Shield, label: "KYC Details" },
  { href: "/real-estate/leads", icon: Inbox, label: "Leads" },
  { href: "/real-estate/viewings", icon: CalendarDays, label: "Viewings" },
  { href: "/real-estate/transactions", icon: Receipt, label: "Transactions" },
  { href: "/real-estate/wallet", icon: Wallet, label: "My wallet" },
  { href: "/real-estate/payouts", icon: Banknote, label: "Payouts" },
  { href: "/real-estate/compliance", icon: Shield, label: "My compliance" },
  { href: "/real-estate/reports", icon: BarChart3, label: "Reports hub" },
  { href: "/real-estate/reports/sales", icon: Receipt, label: "Sales Report" },
  { href: "/real-estate/reports/payouts", icon: Banknote, label: "Payout Report" },
  { href: "/real-estate/reports/top-earners", icon: Trophy, label: "Top Earners" },
  { href: "/real-estate/reports/joining", icon: UserPlus, label: "Joining Report" },
  { href: "/real-estate/reports/member-income", icon: Coins, label: "Member Income Report" },
  { href: "/real-estate/reports/fund-transfer", icon: Coins, label: "Fund Transfer Report" },
  { href: "/real-estate/reports/point-history", icon: Activity, label: "Wallet Activity" },
  { href: "/real-estate/admin/sub-admins", icon: ShieldCheck, label: "Sub-Admins" },
  { href: "/real-estate/admin/fund-credit", icon: Coins, label: "Fund Credit (admin)" },
  { href: "/real-estate/admin/settings", icon: Sparkles, label: "Module Settings (RERA, Plan Engine)" },
  { href: "/real-estate/admin/plan-designer", icon: Sparkles, label: "Plan Designer" },
  { href: "/real-estate/my-team", icon: Users, label: "My Team" },
  // Inventory module — listed in the real-estate palette so Cmd+K reaches
  // it from anywhere; it isn't part of REBM but it's a convenience hop.
  { href: "/inventory", icon: Boxes, label: "Inventory: Products" },
  { href: "/inventory/new", icon: Plus, label: "New product" },
];

const QUICK_ACTIONS = [
  { href: "/real-estate/properties/new", icon: Plus, label: "New property listing" },
  { href: "/real-estate/leads/new", icon: Plus, label: "Capture lead" },
  { href: "/real-estate/agents/new", icon: Plus, label: "Onboard agent" },
];

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const router = useRouter();

  // Global keybinding.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trimmed = search.trim();
  const skip = trimmed.length < 2;

  // Each list query takes the same `search` param — when omitted, RTK skips.
  const propsQ = useGetPropertiesQuery({ search: trimmed, limit: 6 }, { skip });
  const agentsQ = useGetAgentsQuery({ search: trimmed, limit: 6 }, { skip });
  const leadsQ = useGetLeadsQuery({ search: trimmed, limit: 6 }, { skip });
  const txQ = useGetTransactionsQuery({ limit: 6 }, { skip });

  const properties = propsQ.data?.data ?? [];
  const agents = agentsQ.data?.data ?? [];
  const leads = leadsQ.data?.data ?? [];
  // Transactions endpoint doesn't take a search; filter client-side by code.
  const transactions = (txQ.data?.data ?? []).filter((t) =>
    !skip && t.code ? t.code.toLowerCase().includes(trimmed.toLowerCase()) : false,
  );

  const go = (href: string) => {
    router.push(href);
    setOpen(false);
    setSearch("");
  };

  const filteredPages = trimmed
    ? STATIC_PAGES.filter((p) =>
        p.label.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : STATIC_PAGES;

  return (
    <PaletteContext.Provider value={{ open, setOpen }}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search properties, agents, leads, transactions… or jump to a page"
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>
            {skip
              ? "Type at least 2 characters to search the directory."
              : "No matches."}
          </CommandEmpty>

          {!skip && properties.length > 0 && (
            <CommandGroup heading="Properties">
              {properties.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`prop ${p.title} ${p.code ?? ""} ${p.city}`}
                  onSelect={() => go(`/real-estate/properties/${p.id}`)}
                >
                  <Building2 className="text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {p.city} · {formatCurrency(p.listingPrice, p.currency)} ·{" "}
                      {PROPERTY_STATUS_LABEL[p.status]}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!skip && agents.length > 0 && (
            <CommandGroup heading="Agents">
              {agents.map((a) => {
                const u = a.user;
                return (
                  <CommandItem
                    key={a.id}
                    value={`agent ${u ? fullName(u) : ""} ${u?.email ?? ""} ${a.sponsorCode ?? ""}`}
                    onSelect={() => go(`/real-estate/agents/${a.id}`)}
                  >
                    <Users className="text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{u ? fullName(u) : "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {u?.email}
                        {a.rank ? ` · ${a.rank.name}` : ""} ·{" "}
                        {AGENT_STATUS_LABEL[a.status]}
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {!skip && leads.length > 0 && (
            <CommandGroup heading="Leads">
              {leads.map((l) => (
                <CommandItem
                  key={l.id}
                  value={`lead ${l.name} ${l.email ?? ""} ${l.phone ?? ""}`}
                  onSelect={() => go(`/real-estate/leads/${l.id}`)}
                >
                  <Inbox className="text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{l.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {LEAD_STATUS_LABEL[l.status]} · {l.email ?? l.phone ?? "—"}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {!skip && transactions.length > 0 && (
            <CommandGroup heading="Transactions">
              {transactions.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`txn ${t.code ?? ""} ${t.property?.title ?? ""}`}
                  onSelect={() => go(`/real-estate/transactions/${t.id}`)}
                >
                  <Receipt className="text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">
                      {t.code ?? t.id.slice(0, 8)} ·{" "}
                      {t.property?.title ?? "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {formatCurrency(t.salePrice, t.currency)} ·{" "}
                      {TRANSACTION_STATUS_LABEL[t.status]}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator />
          <CommandGroup heading="Quick actions">
            {QUICK_ACTIONS.map((a) => (
              <CommandItem
                key={a.href}
                value={`action ${a.label}`}
                onSelect={() => go(a.href)}
              >
                <a.icon className="text-muted-foreground" />
                <span>{a.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Pages">
            {filteredPages.map((p) => (
              <CommandItem
                key={p.href}
                value={`page ${p.label}`}
                onSelect={() => go(p.href)}
              >
                <p.icon className="text-muted-foreground" />
                <span>{p.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />
          <div className="px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Tip: ⌘K opens this anywhere in Real Estate</span>
            <CommandShortcut>↵ to open</CommandShortcut>
          </div>
        </CommandList>
      </CommandDialog>
    </PaletteContext.Provider>
  );
}
