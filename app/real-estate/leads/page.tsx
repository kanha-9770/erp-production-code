"use client";

/**
 * Leads — list + Kanban toggle. List view supports filters + search; Kanban
 * groups leads by pipeline stage with column counts and tinted headers
 * (FR-3.10).
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { useGetLeadsQuery } from "@/lib/api/real-estate/leads";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Inbox,
  Plus,
  Search,
  LayoutGrid,
  List,
  Phone,
  Mail,
  Calendar,
  Flame,
  Snowflake,
  Sun,
} from "lucide-react";
import {
  LEAD_PIPELINE,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_OPTIONS,
  LEAD_STATUS_TINT,
  LEAD_STATUS_VARIANT,
  LEAD_SCORE_LABEL,
  LEAD_SCORE_VARIANT,
  LEAD_SOURCE_LABEL,
  LEAD_SOURCE_OPTIONS,
  formatCurrency,
  formatDate,
} from "@/components/real-estate/constants";
import type { Lead, LeadStatus } from "@/lib/api/real-estate/types";

export default function LeadsListPage() {
  const [view, setView] = useState<"list" | "kanban">("list");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [score, setScore] = useState<string>("");
  const [source, setSource] = useState<string>("");

  const { data, isLoading } = useGetLeadsQuery({
    search: search || undefined,
    status: status || undefined,
    score: score || undefined,
    source: source || undefined,
    limit: 200,
  });

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  const grouped = useMemo(() => {
    const m = new Map<LeadStatus, Lead[]>();
    LEAD_PIPELINE.forEach((s) => m.set(s, []));
    for (const l of items) {
      const list = m.get(l.status) ?? [];
      list.push(l);
      m.set(l.status, list);
    }
    return m;
  }, [items]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Inbox className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            Leads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} lead{total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`px-3 py-1.5 text-sm rounded-sm transition-colors flex items-center gap-1.5 ${
                view === "list" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={`px-3 py-1.5 text-sm rounded-sm transition-colors flex items-center gap-1.5 ${
                view === "kanban" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
          </div>
          <Button asChild>
            <Link href="/real-estate/leads/new">
              <Plus className="h-4 w-4 mr-2" /> Capture lead
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2 flex gap-2">
            <Input
              placeholder="Name, email, phone…"
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
              {LEAD_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={score || "ALL"} onValueChange={(v) => setScore(v === "ALL" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All scores" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All scores</SelectItem>
              <SelectItem value="HOT">Hot</SelectItem>
              <SelectItem value="WARM">Warm</SelectItem>
              <SelectItem value="COLD">Cold</SelectItem>
            </SelectContent>
          </Select>
          <Select value={source || "ALL"} onValueChange={(v) => setSource(v === "ALL" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All sources" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All sources</SelectItem>
              {LEAD_SOURCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* List view */}
      {view === "list" ? (
        isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No leads match.</p>
              <Button asChild variant="link">
                <Link href="/real-estate/leads/new">Capture your first lead</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {/* Mobile card list */}
              <ul className="divide-y md:hidden">
                {items.map((l) => (
                  <li key={l.id}>
                    <Link href={`/real-estate/leads/${l.id}`} className="block p-3 hover:bg-muted/40">
                      <LeadCard lead={l} />
                    </Link>
                  </li>
                ))}
              </ul>
              {/* Tablet+ table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Lead</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Score</th>
                      <th className="text-left p-3">Source</th>
                      <th className="text-left p-3">Budget</th>
                      <th className="text-left p-3">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((l) => (
                      <tr key={l.id} className="border-b hover:bg-muted/40">
                        <td className="p-3">
                          <Link href={`/real-estate/leads/${l.id}`} className="block">
                            <div className="font-medium">{l.name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                              {l.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" /> {l.email}
                                </span>
                              )}
                              {l.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" /> {l.phone}
                                </span>
                              )}
                            </div>
                          </Link>
                        </td>
                        <td className="p-3">
                          <Badge variant={LEAD_STATUS_VARIANT[l.status]} className="text-[10px]">
                            {LEAD_STATUS_LABEL[l.status]}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <ScoreBadge score={l.score} />
                        </td>
                        <td className="p-3 text-xs">{LEAD_SOURCE_LABEL[l.source]}</td>
                        <td className="p-3 text-xs tabular-nums">
                          {l.budgetMin != null || l.budgetMax != null
                            ? `${formatCurrency(l.budgetMin ?? 0)} – ${formatCurrency(l.budgetMax ?? 0)}`
                            : "—"}
                        </td>
                        <td className="p-3 text-xs tabular-nums">
                          {l.nextFollowUpAt ? formatDate(l.nextFollowUpAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      ) : (
        // Kanban view
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <div className="flex gap-3 min-w-max">
            {LEAD_PIPELINE.map((stage) => {
              const list = grouped.get(stage) ?? [];
              return (
                <div
                  key={stage}
                  className="w-72 shrink-0 bg-muted/30 rounded-lg flex flex-col"
                >
                  <div
                    className="px-3 py-2 border-b flex items-center justify-between rounded-t-lg"
                    style={{ borderTop: `3px solid ${LEAD_STATUS_TINT[stage]}` }}
                  >
                    <span className="text-sm font-medium">
                      {LEAD_STATUS_LABEL[stage]}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">{list.length}</Badge>
                  </div>
                  <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                    {isLoading ? (
                      <Skeleton className="h-24" />
                    ) : list.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No leads.
                      </p>
                    ) : (
                      list.map((l) => (
                        <Link
                          key={l.id}
                          href={`/real-estate/leads/${l.id}`}
                          className="block bg-background rounded-md border p-2.5 hover:shadow transition-shadow"
                        >
                          <KanbanCard lead={l} />
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: Lead["score"] }) {
  const Icon = score === "HOT" ? Flame : score === "COLD" ? Snowflake : Sun;
  return (
    <Badge variant={LEAD_SCORE_VARIANT[score]} className="text-[10px] gap-1">
      <Icon className="h-3 w-3" />
      {LEAD_SCORE_LABEL[score]}
    </Badge>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 space-y-1">
        <div className="font-medium truncate">{lead.name}</div>
        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {lead.email && (
            <span className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3" /> {lead.email}
            </span>
          )}
          {lead.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> {lead.phone}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant={LEAD_STATUS_VARIANT[lead.status]} className="text-[10px]">
            {LEAD_STATUS_LABEL[lead.status]}
          </Badge>
          <ScoreBadge score={lead.score} />
        </div>
      </div>
    </div>
  );
}

function KanbanCard({ lead }: { lead: Lead }) {
  return (
    <div className="space-y-1.5">
      <div className="font-medium text-sm truncate">{lead.name}</div>
      <div className="flex items-center justify-between gap-2">
        <ScoreBadge score={lead.score} />
        <span className="text-[11px] text-muted-foreground">
          {LEAD_SOURCE_LABEL[lead.source]}
        </span>
      </div>
      {(lead.budgetMin != null || lead.budgetMax != null) && (
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {formatCurrency(lead.budgetMin ?? 0)} – {formatCurrency(lead.budgetMax ?? 0)}
        </div>
      )}
      {lead.nextFollowUpAt && (
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" /> {formatDate(lead.nextFollowUpAt)}
        </div>
      )}
    </div>
  );
}
