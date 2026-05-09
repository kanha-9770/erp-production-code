"use client";

/**
 * Real Estate Brokerage — module landing page.
 * KPI tiles + quick links to Properties / Agents / Leads / Viewings.
 *
 * Counts come from the existing list endpoints; we ask for limit=1 and read
 * `meta.total` so we don't pull every row just to paint a number.
 */

import Link from "next/link";
import { useGetPropertiesQuery } from "@/lib/api/real-estate/properties";
import { useGetAgentsQuery } from "@/lib/api/real-estate/agents";
import { useGetLeadsQuery, useGetViewingsQuery } from "@/lib/api/real-estate/leads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Users,
  Inbox,
  CalendarDays,
  ArrowRight,
  Plus,
  TrendingUp,
} from "lucide-react";

export default function RealEstateDashboard() {
  // Tile counts — keep payload minimal; we only need meta.total.
  const propertiesQ = useGetPropertiesQuery({ limit: 1 });
  const availablePropertiesQ = useGetPropertiesQuery({ status: "AVAILABLE", limit: 1 });
  const agentsQ = useGetAgentsQuery({ limit: 1 });
  const activeAgentsQ = useGetAgentsQuery({ status: "ACTIVE", limit: 1 });
  const leadsQ = useGetLeadsQuery({ limit: 1 });
  const openLeadsQ = useGetLeadsQuery({ status: "QUALIFIED", limit: 1 });

  // Viewings in next 7 days.
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const viewingsQ = useGetViewingsQuery({
    from: now.toISOString(),
    to: weekFromNow.toISOString(),
    status: "SCHEDULED",
    limit: 5,
  });

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            Real Estate Brokerage
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Property inventory, agent hierarchy, leads, and commissions.
          </p>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiTile
          title="Properties"
          icon={<Building2 className="h-4 w-4" />}
          loading={propertiesQ.isLoading}
          primary={propertiesQ.data?.meta.total ?? 0}
          secondary={`${availablePropertiesQ.data?.meta.total ?? 0} available`}
          href="/real-estate/properties"
        />
        <KpiTile
          title="Agents"
          icon={<Users className="h-4 w-4" />}
          loading={agentsQ.isLoading}
          primary={agentsQ.data?.meta.total ?? 0}
          secondary={`${activeAgentsQ.data?.meta.total ?? 0} active`}
          href="/real-estate/agents"
        />
        <KpiTile
          title="Leads"
          icon={<Inbox className="h-4 w-4" />}
          loading={leadsQ.isLoading}
          primary={leadsQ.data?.meta.total ?? 0}
          secondary={`${openLeadsQ.data?.meta.total ?? 0} qualified`}
          href="/real-estate/leads"
        />
        <KpiTile
          title="Viewings (7d)"
          icon={<CalendarDays className="h-4 w-4" />}
          loading={viewingsQ.isLoading}
          primary={viewingsQ.data?.data.length ?? 0}
          secondary="next 7 days"
          href="/real-estate/viewings"
        />
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Button asChild variant="outline" className="justify-start h-auto py-3">
            <Link href="/real-estate/properties/new">
              <Plus className="h-4 w-4 mr-2" /> New property listing
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start h-auto py-3">
            <Link href="/real-estate/leads/new">
              <Plus className="h-4 w-4 mr-2" /> Capture lead
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start h-auto py-3">
            <Link href="/real-estate/agents/new">
              <Plus className="h-4 w-4 mr-2" /> Onboard agent
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start h-auto py-3">
            <Link href="/real-estate/agents/tree">
              <TrendingUp className="h-4 w-4 mr-2" /> View agent tree
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Upcoming viewings */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Upcoming viewings</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/real-estate/viewings">
              View all <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {viewingsQ.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : !viewingsQ.data?.data.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No viewings scheduled in the next 7 days.
            </p>
          ) : (
            <ul className="divide-y">
              {viewingsQ.data.data.map((v) => (
                <li key={v.id} className="py-3 flex items-start gap-3">
                  <CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">
                        {v.property?.title ?? "Property"}
                      </span>
                      <Badge variant="default" className="shrink-0 text-[10px]">
                        {v.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(v.scheduledAt).toLocaleString()} ·{" "}
                      {v.lead?.name ?? "—"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiTile({
  title,
  icon,
  loading,
  primary,
  secondary,
  href,
}: {
  title: string;
  icon: React.ReactNode;
  loading: boolean;
  primary: number;
  secondary: string;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="hover:shadow-md transition-shadow h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-3xl font-bold tabular-nums">{primary}</div>
          )}
          <div className="text-xs text-muted-foreground mt-1">{secondary}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
