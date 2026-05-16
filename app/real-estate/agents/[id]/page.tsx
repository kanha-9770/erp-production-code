"use client";

/**
 * Agent profile — header, status/license, hierarchy info, downline preview,
 * promotion log. Edit-in-place for status, rank, license, bio.
 */

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  useGetAgentQuery,
  useUpdateAgentMutation,
  useDeleteAgentMutation,
  useGetRanksQuery,
  useGetAgentsQuery,
} from "@/lib/api/real-estate/agents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Mail,
  Phone,
  Sparkles,
  Shield,
  Network,
  Users,
  Calendar,
  AlertTriangle,
  Save,
  Trash2,
} from "lucide-react";
import {
  AGENT_STATUS_LABEL,
  AGENT_STATUS_OPTIONS,
  AGENT_STATUS_VARIANT,
  AGENT_COMPLIANCE_LABEL,
  AGENT_COMPLIANCE_VARIANT,
  fullName,
  initials,
  formatDate,
  formatDateTime,
} from "@/components/real-estate/constants";
import { AgentSlabHistoryCard } from "@/components/real-estate/agent-slab-history-card";

export default function AgentProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { toast } = useToast();

  const { data, isLoading } = useGetAgentQuery(id);
  const { data: ranksData } = useGetRanksQuery();
  const { data: allAgentsData } = useGetAgentsQuery({ limit: 500 });
  const [update, { isLoading: saving }] = useUpdateAgentMutation();
  const [remove] = useDeleteAgentMutation();

  const agent = data?.data;
  const ranks = ranksData?.data ?? [];
  const allAgents = allAgentsData?.data ?? [];

  const [draft, setDraft] = useState({
    status: "",
    rankId: "",
    parentId: "",
    licenseNumber: "",
    licenseAuthority: "",
    licenseIssuedAt: "",
    licenseExpiresAt: "",
    bio: "",
    suspensionReason: "",
    promotionReason: "",
  });

  useEffect(() => {
    if (!agent) return;
    setDraft({
      status: agent.status,
      rankId: agent.rankId ?? "",
      parentId: agent.parentId ?? "",
      licenseNumber: agent.licenseNumber ?? "",
      licenseAuthority: agent.licenseAuthority ?? "",
      licenseIssuedAt: agent.licenseIssuedAt
        ? agent.licenseIssuedAt.slice(0, 10)
        : "",
      licenseExpiresAt: agent.licenseExpiresAt
        ? agent.licenseExpiresAt.slice(0, 10)
        : "",
      bio: agent.bio ?? "",
      suspensionReason: agent.suspensionReason ?? "",
      promotionReason: "",
    });
  }, [agent]);

  if (isLoading)
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-5xl space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );

  if (!agent)
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-3xl">
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Agent not found.</p>
            <Button asChild variant="link" className="mt-2">
              <Link href="/real-estate/agents">Back to agents</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  const u = agent.user!;
  const expiringSoonDays = agent.licenseExpiresAt
    ? (new Date(agent.licenseExpiresAt).getTime() - Date.now()) / 86400000
    : null;
  const expiringSoon =
    expiringSoonDays != null && expiringSoonDays >= 0 && expiringSoonDays <= 30;
  const expired = expiringSoonDays != null && expiringSoonDays < 0;

  const hasChanges =
    draft.status !== agent.status ||
    (draft.rankId || null) !== agent.rankId ||
    (draft.parentId || null) !== agent.parentId ||
    draft.licenseNumber !== (agent.licenseNumber ?? "") ||
    draft.licenseAuthority !== (agent.licenseAuthority ?? "") ||
    draft.licenseIssuedAt !==
      (agent.licenseIssuedAt ? agent.licenseIssuedAt.slice(0, 10) : "") ||
    draft.licenseExpiresAt !==
      (agent.licenseExpiresAt ? agent.licenseExpiresAt.slice(0, 10) : "") ||
    draft.bio !== (agent.bio ?? "") ||
    draft.suspensionReason !== (agent.suspensionReason ?? "");

  const save = async () => {
    try {
      await update({
        id,
        body: {
          status: draft.status as any,
          rankId: draft.rankId || null,
          parentId: draft.parentId || null,
          licenseNumber: draft.licenseNumber || null,
          licenseAuthority: draft.licenseAuthority || null,
          licenseIssuedAt: draft.licenseIssuedAt || null,
          licenseExpiresAt: draft.licenseExpiresAt || null,
          bio: draft.bio || null,
          suspensionReason: draft.suspensionReason || null,
          promotionReason: draft.promotionReason || undefined,
        } as any,
      }).unwrap();
      toast({ title: "Agent updated" });
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  const onTerminate = async () => {
    if (!confirm("Terminate this agent? They won't be able to list or earn commissions.")) return;
    try {
      await remove(id).unwrap();
      toast({ title: "Agent terminated" });
      router.push("/real-estate/agents");
    } catch (e: any) {
      toast({ title: "Could not terminate", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          <Button asChild variant="ghost" size="icon" className="shrink-0 mt-1">
            <Link href="/real-estate/agents" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Avatar className="h-14 w-14 shrink-0">
            <AvatarImage src={u.avatar ?? undefined} alt={fullName(u)} />
            <AvatarFallback className="text-lg">{initials(u)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
                {fullName(u)}
              </h1>
              <Badge variant={AGENT_STATUS_VARIANT[agent.status]}>
                {AGENT_STATUS_LABEL[agent.status]}
              </Badge>
              {agent.rank && (
                <Badge variant="outline" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  {agent.rank.name}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
              <a href={`mailto:${u.email}`} className="flex items-center gap-1 hover:underline">
                <Mail className="h-3.5 w-3.5" /> {u.email}
              </a>
              {u.phone && (
                <a href={`tel:${u.phone}`} className="flex items-center gap-1 hover:underline">
                  <Phone className="h-3.5 w-3.5" /> {u.phone}
                </a>
              )}
              {agent.sponsorCode && (
                <span className="font-mono text-xs">code: {agent.sponsorCode}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={save} disabled={!hasChanges || saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {agent.status !== "TERMINATED" && (
            <Button variant="destructive" onClick={onTerminate}>
              <Trash2 className="h-4 w-4 mr-2" /> Terminate
            </Button>
          )}
        </div>
      </div>

      {/* Compliance + license alert */}
      {(expiringSoon || expired || agent.complianceStatus !== "COMPLIANT") && (
        <Card
          className={
            expired || agent.complianceStatus === "NON_COMPLIANT"
              ? "border-destructive/40 bg-destructive/5"
              : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
          }
        >
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <div className="flex-1">
              {expired && <span>License expired on {formatDate(agent.licenseExpiresAt)}. </span>}
              {expiringSoon && <span>License expires in {Math.round(expiringSoonDays!)} day(s). </span>}
              {agent.complianceStatus !== "COMPLIANT" && (
                <Badge variant={AGENT_COMPLIANCE_VARIANT[agent.complianceStatus]} className="ml-2">
                  <Shield className="h-3 w-3 mr-1" />
                  {AGENT_COMPLIANCE_LABEL[agent.complianceStatus]}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Editable details */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status & rank</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGENT_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Rank</Label>
                <Select
                  value={draft.rankId || "NONE"}
                  onValueChange={(v) => setDraft({ ...draft, rankId: v === "NONE" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="No rank" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    {ranks.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name} (lvl {r.level})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {draft.status === "SUSPENDED" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-medium text-muted-foreground">Suspension reason</Label>
                  <Input
                    value={draft.suspensionReason}
                    onChange={(e) => setDraft({ ...draft, suspensionReason: e.target.value })}
                  />
                </div>
              )}
              {draft.rankId !== (agent.rankId ?? "") && draft.rankId && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-medium text-muted-foreground">Promotion reason</Label>
                  <Input
                    value={draft.promotionReason}
                    onChange={(e) => setDraft({ ...draft, promotionReason: e.target.value })}
                    placeholder="Recorded in the rank promotion audit"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hierarchy</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Sponsor</Label>
                <div className="text-sm py-2">
                  {agent.sponsor ? (
                    <Link href={`/real-estate/agents/${agent.sponsor.id}`} className="hover:underline">
                      {fullName(agent.sponsor.user!)}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Root</span>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Parent (re-parent allowed)</Label>
                <Select
                  value={draft.parentId || "NONE"}
                  onValueChange={(v) => setDraft({ ...draft, parentId: v === "NONE" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="No parent (root)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None (root)</SelectItem>
                    {allAgents
                      .filter((a) => a.id !== id)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {fullName(a.user!)} {a.rank ? `· ${a.rank.name}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Cycle prevention is enforced server-side (BR-10).
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">License</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">License number</Label>
                <Input
                  value={draft.licenseNumber}
                  onChange={(e) => setDraft({ ...draft, licenseNumber: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Authority</Label>
                <Input
                  value={draft.licenseAuthority}
                  onChange={(e) => setDraft({ ...draft, licenseAuthority: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Issued on</Label>
                <Input
                  type="date"
                  value={draft.licenseIssuedAt}
                  onChange={(e) => setDraft({ ...draft, licenseIssuedAt: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Expires on</Label>
                <Input
                  type="date"
                  value={draft.licenseExpiresAt}
                  onChange={(e) => setDraft({ ...draft, licenseExpiresAt: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bio</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={draft.bio}
                onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                rows={4}
              />
            </CardContent>
          </Card>
        </div>

        {/* Side: hierarchy / counts / promotions */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Team
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Stat label="Direct recruits" value={agent.recruits?.length ?? 0} />
              <Stat label="Direct reports" value={agent.children?.length ?? 0} />
              <Stat label="Joined" value={formatDate(agent.joinedAt)} />
              {agent.suspendedAt && <Stat label="Suspended" value={formatDate(agent.suspendedAt)} />}
              {agent.terminatedAt && <Stat label="Terminated" value={formatDate(agent.terminatedAt)} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Network className="h-4 w-4" /> Direct downline
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(agent.children?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No direct reports.</p>
              ) : (
                <ul className="divide-y">
                  {agent.children!.map((c: any) => (
                    <li key={c.id} className="py-2">
                      <Link
                        href={`/real-estate/agents/${c.id}`}
                        className="flex items-center justify-between gap-2 hover:underline"
                      >
                        <span className="truncate">{fullName(c.user)}</span>
                        <Badge variant={AGENT_STATUS_VARIANT[c.status as keyof typeof AGENT_STATUS_VARIANT]} className="text-[10px] shrink-0">
                          {AGENT_STATUS_LABEL[c.status as keyof typeof AGENT_STATUS_LABEL]}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Promotion log
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(agent.promotions?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No promotions yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {agent.promotions!.map((p: any) => (
                    <li key={p.id} className="py-2">
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(p.createdAt)}
                      </div>
                      <div>
                        {p.fromRankId
                          ? `${ranks.find((r) => r.id === p.fromRankId)?.name ?? "—"} → `
                          : "Initial → "}
                        {ranks.find((r) => r.id === p.toRankId)?.name ?? "—"}
                      </div>
                      {p.reason && <div className="text-xs text-muted-foreground">{p.reason}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Full-width slab history — current position, every upgrade event,
          every deal, and every override earned from the downline. */}
      <AgentSlabHistoryCard agentId={id} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
