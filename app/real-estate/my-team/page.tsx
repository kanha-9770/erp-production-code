"use client";

/**
 * My Team — agent's personal team workspace. Shows the agent's own profile
 * card, team stats, invite management and the direct downline table.
 */

import { useState } from "react";
import Link from "next/link";
import {
  useGetMyTeamQuery,
  useCreateInviteMutation,
  useCancelInviteMutation,
} from "@/lib/api/real-estate/my-team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  UserPlus,
  Copy,
  Check,
  X,
  ShieldCheck,
  ShieldOff,
  ExternalLink,
  GitBranch,
} from "lucide-react";

interface InviteFormState {
  prefillName: string;
  prefillEmail: string;
  prefillPhone: string;
  expiryDays: string;
}

const EMPTY_INVITE: InviteFormState = {
  prefillName: "",
  prefillEmail: "",
  prefillPhone: "",
  expiryDays: "30",
};

function agentInitials(name: string | null | undefined, email: string): string {
  if (name) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }
  return email.slice(0, 2).toUpperCase();
}

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return "default";
    case "PENDING_KYC":
      return "secondary";
    case "SUSPENDED":
    case "TERMINATED":
      return "destructive";
    default:
      return "outline";
  }
}

export default function MyTeamPage() {
  const { toast } = useToast();
  const { data, isLoading } = useGetMyTeamQuery();
  const [createInvite] = useCreateInviteMutation();
  const [cancelInvite] = useCancelInviteMutation();

  const team = data?.data;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteFormState>(EMPTY_INVITE);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const openInviteDialog = () => {
    setInviteForm(EMPTY_INVITE);
    setGeneratedUrl(null);
    setCopied(false);
    setInviteOpen(true);
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const days = parseInt(inviteForm.expiryDays, 10);
    if (isNaN(days) || days < 1) {
      toast({ title: "Expiry days must be at least 1", variant: "destructive" });
      return;
    }
    setCreatingInvite(true);
    try {
      const res = await createInvite({
        expiryDays: days,
        prefillName: inviteForm.prefillName || undefined,
        prefillEmail: inviteForm.prefillEmail || undefined,
        prefillPhone: inviteForm.prefillPhone || undefined,
      }).unwrap();
      const url = `${window.location.origin}/real-estate/join/${res.data.token}`;
      setGeneratedUrl(url);
    } catch (err: any) {
      toast({
        title: "Could not create invite",
        description: err?.data?.error || err?.message,
        variant: "destructive",
      });
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyUrl = async () => {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCancelInvite = async (id: string) => {
    if (!confirm("Cancel this invite link?")) return;
    try {
      await cancelInvite(id).unwrap();
      toast({ title: "Invite cancelled" });
    } catch (err: any) {
      toast({
        title: "Could not cancel invite",
        description: err?.data?.error || err?.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-5xl">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-36" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const agent = team?.agent;
  const stats = team?.stats;
  const downline = team?.directDownline ?? [];
  const invites = team?.pendingInvites ?? [];

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-5xl">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Users className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            My team
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your downline, send invite links and track team performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/real-estate/agents/tree">
              <GitBranch className="h-4 w-4 mr-2" />
              View full tree
            </Link>
          </Button>
          <Button onClick={openInviteDialog}>
            <UserPlus className="h-4 w-4 mr-2" />
            Generate invite link
          </Button>
        </div>
      </div>

      {/* Agent's own card */}
      {agent && (
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarFallback className="text-base">
                {agentInitials(null, "me")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {agent.designation && (
                  <Badge variant="secondary">{agent.designation.name}</Badge>
                )}
                {agent.rank && (
                  <Badge variant="outline">{agent.rank.name}</Badge>
                )}
                <Badge variant={statusVariant(agent.status)}>
                  {agent.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs">
                <AgentStat
                  label="Cumulative area"
                  value={`${(agent.cumulativeArea ?? 0).toLocaleString()} sq.yd`}
                />
                <AgentStat
                  label="RERA status"
                  value={
                    agent.reraProfile?.reraVerifiedAt ? (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <ShieldCheck className="h-3.5 w-3.5" /> Verified
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600">
                        <ShieldOff className="h-3.5 w-3.5" /> Not verified
                      </span>
                    )
                  }
                />
                <AgentStat
                  label="Sponsor code"
                  value={agent.sponsorCode ?? "—"}
                />
                <AgentStat
                  label="Joined"
                  value={new Date(agent.joinedAt).toLocaleDateString()}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total downline" value={stats.totalDownline} />
          <StatCard label="Direct" value={stats.directCount} />
          <StatCard label="Active" value={stats.activeCount} />
          <StatCard label="Pending KYC" value={stats.pendingCount} />
        </div>
      )}

      {/* Active invites */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Active invite links</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invites.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground px-4">
              No pending invites. Generate a link to bring someone on board.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Token</th>
                    <th className="text-left p-3">Pre-fill</th>
                    <th className="text-left p-3">Expires</th>
                    <th className="text-left p-3">Status</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => (
                    <tr key={inv.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs text-muted-foreground">
                        {inv.token.slice(0, 8)}…
                      </td>
                      <td className="p-3 text-xs">
                        {inv.prefillName || inv.prefillEmail ? (
                          <span>
                            {inv.prefillName}
                            {inv.prefillEmail && (
                              <span className="text-muted-foreground ml-1">
                                ({inv.prefillEmail})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-xs tabular-nums">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            inv.status === "ACTIVE" ? "secondary" : "outline"
                          }
                          className="text-[10px]"
                        >
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCancelInvite(inv.id)}
                          aria-label="Cancel invite"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Direct downline table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Direct downline</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {downline.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground px-4">
              No direct members yet. Generate an invite link to grow your team.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">RERA</th>
                    <th className="text-left p-3">Rank</th>
                    <th className="text-left p-3">Joined</th>
                    <th className="text-right p-3">Cum. area</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {downline.map((member) => {
                    const name = member.user.name;
                    const email = member.user.email;
                    return (
                      <tr key={member.id} className="border-b hover:bg-muted/30">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarImage
                                src={member.user.image ?? undefined}
                              />
                              <AvatarFallback className="text-[10px]">
                                {agentInitials(name, email)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium truncate">
                              {name ?? "—"}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {email}
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={statusVariant(member.status)}
                            className="text-[10px]"
                          >
                            {member.status.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {member.reraVerified ? (
                            <ShieldCheck className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <ShieldOff className="h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                        <td className="p-3 text-xs">
                          {member.rank?.name ?? "—"}
                        </td>
                        <td className="p-3 text-xs tabular-nums">
                          {new Date(member.joinedAt).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-right text-xs tabular-nums">
                          {(member.cumulativeArea ?? 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right">
                          <Button asChild variant="ghost" size="icon">
                            <Link
                              href={`/real-estate/agents/${member.id}`}
                              aria-label="View profile"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate invite link</DialogTitle>
            <DialogDescription>
              Pre-fill the new member's details to speed up their registration.
              The link expires after the specified number of days.
            </DialogDescription>
          </DialogHeader>

          {generatedUrl ? (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 break-all text-xs font-mono">
                {generatedUrl}
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={copyUrl}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2 text-emerald-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy to clipboard
                  </>
                )}
              </Button>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setGeneratedUrl(null);
                    setInviteForm(EMPTY_INVITE);
                  }}
                >
                  Generate another
                </Button>
                <Button onClick={() => setInviteOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreateInvite} className="space-y-3">
              <InviteField label="Name (optional)">
                <Input
                  placeholder="e.g. Jane Smith"
                  value={inviteForm.prefillName}
                  onChange={(e) =>
                    setInviteForm((s) => ({
                      ...s,
                      prefillName: e.target.value,
                    }))
                  }
                />
              </InviteField>
              <InviteField label="Email (optional)">
                <Input
                  type="email"
                  placeholder="jane@example.com"
                  value={inviteForm.prefillEmail}
                  onChange={(e) =>
                    setInviteForm((s) => ({
                      ...s,
                      prefillEmail: e.target.value,
                    }))
                  }
                />
              </InviteField>
              <InviteField label="Phone (optional)">
                <Input
                  type="tel"
                  placeholder="+91 99999 00000"
                  value={inviteForm.prefillPhone}
                  onChange={(e) =>
                    setInviteForm((s) => ({
                      ...s,
                      prefillPhone: e.target.value,
                    }))
                  }
                />
              </InviteField>
              <InviteField label="Expires in (days)">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={inviteForm.expiryDays}
                  onChange={(e) =>
                    setInviteForm((s) => ({
                      ...s,
                      expiryDays: e.target.value,
                    }))
                  }
                />
              </InviteField>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setInviteOpen(false)}
                  disabled={creatingInvite}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creatingInvite}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {creatingInvite ? "Generating…" : "Generate link"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Small reusable pieces ────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 px-4">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function AgentStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-medium text-xs mt-0.5">{value}</div>
    </div>
  );
}

function InviteField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
