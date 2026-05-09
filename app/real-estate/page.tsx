"use client";

/**
 * Real Estate dashboard. Four things to deliver in the first viewport:
 *   1. Where am I?               — module title, quick stats
 *   2. What's important now?     — KPI tiles with comparators
 *   3. What's about to happen?   — upcoming viewings list
 *   4. What can I jump to?       — quick-actions row + ⌘K palette hint
 *
 * Counts come from existing list endpoints with `limit=1` so we don't pull
 * full result sets just to paint a number.
 */

import Link from "next/link";
import { useGetPropertiesQuery } from "@/lib/api/real-estate/properties";
import { useGetAgentsQuery } from "@/lib/api/real-estate/agents";
import { useGetLeadsQuery, useGetViewingsQuery } from "@/lib/api/real-estate/leads";
import { useGetTransactionsQuery } from "@/lib/api/real-estate/transactions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Building2, Users, Inbox, CalendarDays, ArrowRight, Plus, TrendingUp,
  Search, Receipt, Wallet, Shield, BarChart3,
  Network, Sparkles, Flame,
} from "lucide-react";
import {
  formatCurrency, LEAD_STATUS_VARIANT, LEAD_STATUS_LABEL,
  fullName,
} from "@/components/real-estate/constants";
import { useCommandPalette } from "@/components/real-estate/workspace";
import { cn } from "@/lib/utils";

export default function RealEstateDashboard() {
  const palette = useCommandPalette();

  const propsQ = useGetPropertiesQuery({ limit: 1 });
  const propsAvailQ = useGetPropertiesQuery({ status: "AVAILABLE", limit: 1 });
  const agentsQ = useGetAgentsQuery({ limit: 1 });
  const agentsActiveQ = useGetAgentsQuery({ status: "ACTIVE", limit: 1 });
  const leadsQ = useGetLeadsQuery({ limit: 1 });
  const leadsHotQ = useGetLeadsQuery({ score: "HOT", limit: 1 });
  const txnsClosedQ = useGetTransactionsQuery({ status: "CLOSED", limit: 1 });

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const viewingsQ = useGetViewingsQuery({
    from: now.toISOString(),
    to: weekFromNow.toISOString(),
    status: "SCHEDULED",
    limit: 6,
  });

  // Most recent leads — populates the activity column.
  const recentLeadsQ = useGetLeadsQuery({ limit: 6 });

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      {/* Header: title + ⌘K hint + primary CTA */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Real Estate Brokerage</span>
            <span>·</span>
            <span>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            Good {greeting()}.
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Property inventory, agent hierarchy, leads, and commissions — all in one place.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => palette.setOpen(true)} className="gap-2">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Quick search</span>
            <kbd className="hidden sm:inline-flex h-5 px-1.5 items-center rounded border bg-muted text-[10px] font-mono">⌘K</kbd>
          </Button>
          <Button asChild>
            <Link href="/real-estate/properties/new">
              <Plus className="h-4 w-4 mr-1.5" /> New listing
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Properties"
          icon={<Building2 className="h-4 w-4" />}
          loading={propsQ.isLoading}
          primary={propsQ.data?.meta.total ?? 0}
          secondary={`${propsAvailQ.data?.meta.total ?? 0} available`}
          href="/real-estate/properties"
          tint="blue"
        />
        <KpiTile
          label="Agents"
          icon={<Users className="h-4 w-4" />}
          loading={agentsQ.isLoading}
          primary={agentsQ.data?.meta.total ?? 0}
          secondary={`${agentsActiveQ.data?.meta.total ?? 0} active`}
          href="/real-estate/agents"
          tint="violet"
        />
        <KpiTile
          label="Leads"
          icon={<Inbox className="h-4 w-4" />}
          loading={leadsQ.isLoading}
          primary={leadsQ.data?.meta.total ?? 0}
          secondary={`${leadsHotQ.data?.meta.total ?? 0} hot`}
          href="/real-estate/leads"
          tint="amber"
          accent={(leadsHotQ.data?.meta.total ?? 0) > 0 ? <Flame className="h-3 w-3 text-amber-600" /> : null}
        />
        <KpiTile
          label="Closed deals"
          icon={<Receipt className="h-4 w-4" />}
          loading={txnsClosedQ.isLoading}
          primary={txnsClosedQ.data?.meta.total ?? 0}
          secondary="all-time"
          href="/real-estate/transactions"
          tint="emerald"
        />
      </div>

      {/* Two-column body: viewings + recent activity */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Upcoming viewings — wider column on desktop */}
        <Card className="lg:col-span-2">
          <div className="px-4 sm:px-5 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Next 7 days</h2>
              {!viewingsQ.isLoading && (
                <Badge variant="secondary" className="text-[10px] tabular-nums">
                  {viewingsQ.data?.data.length ?? 0}
                </Badge>
              )}
            </div>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link href="/real-estate/viewings">
                View calendar <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
          <CardContent className="p-0">
            {viewingsQ.isLoading ? (
              <div className="p-4 space-y-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : !viewingsQ.data?.data.length ? (
              <div className="py-12 text-center">
                <CalendarDays className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No viewings scheduled.
                </p>
                <Button asChild variant="link" size="sm">
                  <Link href="/real-estate/viewings/new">Schedule one</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {viewingsQ.data.data.map((v) => {
                  const when = new Date(v.scheduledAt);
                  const day = when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                  return (
                    <li key={v.id} className="px-4 sm:px-5 py-3 hover:bg-muted/30 transition-colors">
                      <Link href={`/real-estate/leads/${v.leadId}`} className="flex items-center gap-3">
                        <div className="h-10 w-12 rounded-md bg-muted/60 flex flex-col items-center justify-center shrink-0 text-[10px] uppercase tracking-wider">
                          <span className="font-bold tabular-nums leading-none">{when.getDate()}</span>
                          <span className="text-muted-foreground leading-none mt-0.5">
                            {when.toLocaleString(undefined, { month: "short" })}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate text-sm">
                            {v.property?.title ?? "Property"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {day} · {time} · {v.lead?.name ?? "—"}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {v.status}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent leads */}
        <Card>
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Recent leads</h2>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link href="/real-estate/leads">
                All <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
          <CardContent className="p-0">
            {recentLeadsQ.isLoading ? (
              <div className="p-4 space-y-2">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : !recentLeadsQ.data?.data.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No leads yet.
                <div className="mt-1">
                  <Button asChild variant="link" size="sm">
                    <Link href="/real-estate/leads/new">Capture first lead</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="divide-y">
                {recentLeadsQ.data.data.slice(0, 6).map((l) => (
                  <li key={l.id} className="px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <Link href={`/real-estate/leads/${l.id}`} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate font-medium">{l.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {l.budgetMax ? formatCurrency(l.budgetMax) : "—"} · {l.preferredCities[0] ?? "—"}
                        </div>
                      </div>
                      <Badge variant={LEAD_STATUS_VARIANT[l.status]} className="text-[10px] shrink-0">
                        {LEAD_STATUS_LABEL[l.status]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links — ribbon of secondary navigation */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Jump to</div>
          <div className="flex flex-wrap gap-2">
            <QuickLink href="/real-estate/properties/new" icon={Plus} label="New listing" />
            <QuickLink href="/real-estate/leads/new" icon={Plus} label="Capture lead" />
            <QuickLink href="/real-estate/agents/new" icon={Plus} label="Onboard agent" />
            <QuickLink href="/real-estate/agents/tree" icon={Network} label="Hierarchy tree" />
            <QuickLink href="/real-estate/agents/ranks" icon={Sparkles} label="Ranks" />
            <QuickLink href="/real-estate/wallet" icon={Wallet} label="My wallet" />
            <QuickLink href="/real-estate/compliance" icon={Shield} label="Compliance" />
            <QuickLink href="/real-estate/reports" icon={BarChart3} label="Reports" />
            <QuickLink href="/real-estate/payouts" icon={TrendingUp} label="Payouts" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function KpiTile({
  label, icon, loading, primary, secondary, href, tint, accent,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  primary: number;
  secondary: string;
  href: string;
  tint: "blue" | "violet" | "amber" | "emerald";
  accent?: React.ReactNode;
}) {
  const tintClass = {
    blue: "from-blue-500/10 to-transparent text-blue-600 dark:text-blue-400",
    violet: "from-violet-500/10 to-transparent text-violet-600 dark:text-violet-400",
    amber: "from-amber-500/10 to-transparent text-amber-600 dark:text-amber-400",
    emerald: "from-emerald-500/10 to-transparent text-emerald-600 dark:text-emerald-400",
  }[tint];

  return (
    <Link href={href} className="block group">
      <Card className="overflow-hidden h-full transition-all group-hover:shadow-md group-hover:-translate-y-px">
        <CardContent className="p-4 relative">
          <div className={cn("absolute inset-0 bg-gradient-to-br pointer-events-none opacity-50", tintClass.split(" ")[0], tintClass.split(" ")[1])} />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className={cn("h-8 w-8 rounded-lg bg-background flex items-center justify-center shadow-sm", tintClass)}>
                {icon}
              </div>
              {accent}
            </div>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              {loading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <span className="text-2xl font-bold tabular-nums">{primary.toLocaleString()}</span>
              )}
              <span className="text-xs text-muted-foreground">{secondary}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
      <Link href={href}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </Link>
    </Button>
  );
}

