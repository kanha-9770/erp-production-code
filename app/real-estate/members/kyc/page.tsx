"use client";

/**
 * KYC Details — admin view focused on agents whose compliance is anything
 * other than COMPLIANT. Used to clear the verification backlog and to spot
 * agents whose docs are about to expire.
 *
 * The verification queue itself (per-document review with verify/reject
 * actions) lives at /real-estate/admin/compliance — this page is the
 * agent-level summary that links into it.
 */

import Link from "next/link";
import { useMemo } from "react";
import { useGetAgentsQuery } from "@/lib/api/real-estate/agents";
import { useGetExpiringSoonQuery, useGetComplianceQueueQuery }
  from "@/lib/api/real-estate/compliance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Shield, AlertTriangle, ExternalLink, Inbox, ArrowRight, ChevronRight,
} from "lucide-react";
import {
  AGENT_STATUS_LABEL, AGENT_STATUS_VARIANT,
  AGENT_COMPLIANCE_LABEL, AGENT_COMPLIANCE_VARIANT,
  fullName, initials, formatDate,
  COMPLIANCE_DOC_STATUS_LABEL, COMPLIANCE_DOC_STATUS_VARIANT,
  COMPLIANCE_DOC_TYPE_LABEL,
} from "@/components/real-estate/constants";

export default function KycDetailsPage() {
  // All agents — we'll bucket them ourselves.
  const agentsQ = useGetAgentsQuery({ limit: 500 });

  // Documents expiring in the next 30 days.
  const expiringQ = useGetExpiringSoonQuery({ days: 30 });

  // Pending verification queue size.
  const queueQ = useGetComplianceQueueQuery();

  const agents = agentsQ.data?.data ?? [];

  const buckets = useMemo(() => {
    const compliant = agents.filter((a) => a.complianceStatus === "COMPLIANT");
    const pending = agents.filter((a) => a.complianceStatus === "PENDING_KYC");
    const nonCompliant = agents.filter((a) => a.complianceStatus === "NON_COMPLIANT");
    return { compliant, pending, nonCompliant };
  }, [agents]);

  const expiringDocs = expiringQ.data?.data ?? [];
  const queueSize = queueQ.data?.data?.length ?? 0;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Real Estate</span>
            <span>·</span>
            <span>Members</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            KYC Details
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agent compliance overview. Review pending submissions and
            licenses about to expire.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="default">
            <Link href="/real-estate/admin/compliance">
              <Inbox className="h-4 w-4 mr-1.5" />
              Open verification queue
              {queueSize > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px]">{queueSize}</Badge>
              )}
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Compliant"
          value={buckets.compliant.length}
          tint="emerald"
          description="all 4 required docs verified"
          href="/real-estate/members/active"
        />
        <SummaryCard
          label="Pending KYC"
          value={buckets.pending.length}
          tint="amber"
          description="docs uploaded, awaiting review"
          href="/real-estate/members/pending"
        />
        <SummaryCard
          label="Non-compliant"
          value={buckets.nonCompliant.length}
          tint="red"
          description="rejected or expired docs"
        />
      </div>

      {/* Expiring soon */}
      {expiringDocs.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
          <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold">{expiringDocs.length} document{expiringDocs.length === 1 ? "" : "s"} expiring within 30 days</h2>
          </div>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-amber-100/50 dark:bg-amber-950/20 text-xs uppercase tracking-wider text-amber-800 dark:text-amber-300">
                <tr>
                  <th className="px-3 py-2 text-left">Agent</th>
                  <th className="px-3 py-2 text-left">Document</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Expires</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {expiringDocs.slice(0, 12).map((d) => {
                  const u = d.agentProfile?.user;
                  return (
                    <tr key={d.id} className="border-t border-amber-200 dark:border-amber-900 hover:bg-amber-100/40 dark:hover:bg-amber-950/20">
                      <td className="px-3 py-2">
                        {u ? (
                          <Link href={`/real-estate/agents/${d.agentProfileId}`} className="flex items-center gap-2 hover:underline">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={u.avatar ?? undefined} />
                              <AvatarFallback className="text-[10px]">{initials(u)}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium truncate">{fullName(u)}</span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 truncate">{d.name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {COMPLIANCE_DOC_TYPE_LABEL[d.type]}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums font-medium text-amber-700 dark:text-amber-400">
                        {formatDate(d.expiryDate)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={COMPLIANCE_DOC_STATUS_VARIANT[d.status]} className="text-[10px]">
                          {COMPLIANCE_DOC_STATUS_LABEL[d.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <Link href={`/real-estate/agents/${d.agentProfileId}`}>
                            View <ChevronRight className="h-3 w-3 ml-0.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Non-compliant table */}
      <Card>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Non-compliant agents</h2>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link href="/real-estate/admin/compliance">
              Open queue <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
        <CardContent className="p-0">
          {buckets.nonCompliant.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No non-compliant agents. Everyone is in good standing.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left w-10">#</th>
                  <th className="px-3 py-2 text-left">Agent</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">License Expires</th>
                  <th className="px-3 py-2 text-left">Joined</th>
                  <th className="px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {buckets.nonCompliant.map((a, idx) => {
                  const u = a.user!;
                  return (
                    <tr key={a.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/real-estate/agents/${a.id}`} className="flex items-center gap-2 hover:underline">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={u.avatar ?? undefined} />
                            <AvatarFallback className="text-[10px]">{initials(u)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{fullName(u)}</div>
                            <div className="text-[10px] text-muted-foreground">{u.email}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={AGENT_STATUS_VARIANT[a.status]} className="text-[10px]">
                          {AGENT_STATUS_LABEL[a.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                        {a.licenseExpiresAt ? formatDate(a.licenseExpiresAt) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                        {formatDate(a.joinedAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-7">
                          <Link href={`/real-estate/agents/${a.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label, value, tint, description, href,
}: {
  label: string;
  value: number;
  tint: "emerald" | "amber" | "red";
  description: string;
  href?: string;
}) {
  const tintCls = {
    emerald: "border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400",
    amber: "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400",
    red: "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400",
  }[tint];
  const inner = (
    <div className={`p-4 rounded-lg border-2 ${tintCls} h-full`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-3xl font-bold tabular-nums mt-1">{value.toLocaleString()}</div>
      <div className="text-[11px] mt-1 opacity-70">{description}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:scale-[1.02] transition-transform">{inner}</Link>
  ) : (
    inner
  );
}

