"use client";

/**
 * Agents — list page. Filter by status / compliance / rank, search by name
 * or email or sponsor code. Each row is a clickable card opening the agent
 * profile.
 */

import Link from "next/link";
import { useState } from "react";
import { useGetAgentsQuery, useGetRanksQuery } from "@/lib/api/real-estate/agents";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Search,
  Plus,
  Network,
  Shield,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import {
  AGENT_STATUS_LABEL,
  AGENT_STATUS_OPTIONS,
  AGENT_STATUS_VARIANT,
  AGENT_COMPLIANCE_LABEL,
  AGENT_COMPLIANCE_VARIANT,
  fullName,
  initials,
} from "@/components/real-estate/constants";

export default function AgentsListPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [compliance, setCompliance] = useState<string>("");
  const [rankId, setRankId] = useState<string>("");

  const { data, isLoading } = useGetAgentsQuery({
    search: search || undefined,
    status: status || undefined,
    compliance: compliance || undefined,
    rankId: rankId || undefined,
    limit: 100,
  });

  const { data: ranksData } = useGetRanksQuery();

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const ranks = ranksData?.data ?? [];

  const expiringSoon = items.filter((a) => {
    if (!a.licenseExpiresAt) return false;
    const days = (new Date(a.licenseExpiresAt).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 30;
  });

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Users className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            Agents
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} agent{total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/real-estate/agents/tree">
              <Network className="h-4 w-4 mr-2" /> Hierarchy tree
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/real-estate/agents/ranks">
              <Sparkles className="h-4 w-4 mr-2" /> Ranks
            </Link>
          </Button>
          <Button asChild>
            <Link href="/real-estate/agents/new">
              <Plus className="h-4 w-4 mr-2" /> Onboard agent
            </Link>
          </Button>
        </div>
      </div>

      {/* Compliance alert strip */}
      {expiringSoon.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>
              <strong>{expiringSoon.length}</strong> agent
              {expiringSoon.length === 1 ? "" : "s"} have a license expiring in
              the next 30 days.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2 flex gap-2">
            <Input
              placeholder="Name, email, sponsor code…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput.trim())}
            />
            <Button variant="outline" size="icon" onClick={() => setSearch(searchInput.trim())} aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Select value={status || "ALL"} onValueChange={(v) => setStatus(v === "ALL" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {AGENT_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={compliance || "ALL"} onValueChange={(v) => setCompliance(v === "ALL" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All compliance" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All compliance</SelectItem>
              <SelectItem value="COMPLIANT">Compliant</SelectItem>
              <SelectItem value="PENDING_KYC">Pending KYC</SelectItem>
              <SelectItem value="NON_COMPLIANT">Non-compliant</SelectItem>
            </SelectContent>
          </Select>
          <Select value={rankId || "ALL"} onValueChange={(v) => setRankId(v === "ALL" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All ranks" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All ranks</SelectItem>
              {ranks.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No agents found.</p>
            <Button asChild variant="link">
              <Link href="/real-estate/agents/new">Onboard your first agent</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => {
            const u = a.user!;
            const sponsorName = a.sponsor?.user
              ? fullName({ first_name: a.sponsor.user.first_name, last_name: a.sponsor.user.last_name })
              : null;
            return (
              <Link
                key={a.id}
                href={`/real-estate/agents/${a.id}`}
                className="block group"
              >
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardContent className="p-4 flex gap-3">
                    <Avatar>
                      <AvatarImage src={u.avatar ?? undefined} alt={fullName(u)} />
                      <AvatarFallback>{initials(u)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{fullName(u)}</div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                        </div>
                        <Badge variant={AGENT_STATUS_VARIANT[a.status]} className="shrink-0 text-[10px]">
                          {AGENT_STATUS_LABEL[a.status]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {a.rank && (
                          <Badge variant="outline" className="text-[10px]">
                            <Sparkles className="h-3 w-3 mr-1" />
                            {a.rank.name}
                          </Badge>
                        )}
                        <Badge variant={AGENT_COMPLIANCE_VARIANT[a.complianceStatus]} className="text-[10px]">
                          <Shield className="h-3 w-3 mr-1" />
                          {AGENT_COMPLIANCE_LABEL[a.complianceStatus]}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground mt-2 tabular-nums">
                        <span>
                          {a._count?.recruits ?? 0} recruits · {a._count?.children ?? 0} direct
                        </span>
                        {sponsorName && (
                          <span className="truncate ml-2">via {sponsorName}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
