"use client";

/**
 * Onboard agent — pick an existing ERP user, set sponsor / rank / license,
 * and create the AgentProfile. We intentionally don't create users here; the
 * existing /admin user-management flow does that.
 */

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateAgentMutation,
  useGetAgentsQuery,
  useGetRanksQuery,
} from "@/lib/api/real-estate/agents";
import { useGetAdminUsersQuery } from "@/lib/api/users";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { ArrowLeft, UserPlus } from "lucide-react";
import { fullName } from "@/components/real-estate/constants";

export default function NewAgentPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [userId, setUserId] = useState("");
  const [sponsorId, setSponsorId] = useState("");
  const [rankId, setRankId] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseAuthority, setLicenseAuthority] = useState("");
  const [licenseIssuedAt, setLicenseIssuedAt] = useState("");
  const [licenseExpiresAt, setLicenseExpiresAt] = useState("");
  const [bio, setBio] = useState("");

  const { data: usersData } = useGetAdminUsersQuery();
  const { data: agentsData } = useGetAgentsQuery({ limit: 500 });
  const { data: ranksData } = useGetRanksQuery();

  const allUsers = usersData?.data ?? [];
  const existingAgents = agentsData?.data ?? [];
  const ranks = ranksData?.data ?? [];

  // Filter out users who already have an agent profile so the dropdown only
  // surfaces eligible candidates.
  const existingAgentUserIds = new Set(existingAgents.map((a) => a.userId));
  const eligibleUsers = allUsers.filter((u) => !existingAgentUserIds.has(u.id));

  const [create, { isLoading }] = useCreateAgentMutation();

  // Default rank to the lowest level (Trainee-like) when ranks load.
  useEffect(() => {
    if (!rankId && ranks.length > 0) {
      const sorted = [...ranks].sort((a, b) => a.level - b.level);
      setRankId(sorted[0].id);
    }
  }, [ranks, rankId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      toast({ title: "Pick an ERP user to make an agent", variant: "destructive" });
      return;
    }
    try {
      const res = await create({
        userId,
        sponsorId: sponsorId || undefined,
        rankId: rankId || undefined,
        licenseNumber: licenseNumber || undefined,
        licenseAuthority: licenseAuthority || undefined,
        licenseIssuedAt: licenseIssuedAt || undefined,
        licenseExpiresAt: licenseExpiresAt || undefined,
        bio: bio || undefined,
      }).unwrap();
      toast({ title: "Agent profile created" });
      router.push(`/real-estate/agents/${res.data.id}`);
    } catch (err: any) {
      toast({
        title: "Could not onboard agent",
        description: err?.data?.error || err?.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/real-estate/agents" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-primary" />
            Onboard agent
          </h1>
          <p className="text-sm text-muted-foreground">
            Attach an agent profile to an existing ERP user. Need to add the
            user first?{" "}
            <Link href="/admin/users" className="underline">
              Open user management
            </Link>
            .
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User & hierarchy</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium text-muted-foreground">
                User *
              </Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an ERP user" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleUsers.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      All users already have agent profiles
                    </SelectItem>
                  ) : (
                    eligibleUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {fullName(u)} — {u.email}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Sponsor (optional)
              </Label>
              <Select value={sponsorId || "NONE"} onValueChange={(v) => setSponsorId(v === "NONE" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No sponsor (root)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None (root)</SelectItem>
                  {existingAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {fullName(a.user!)}{" "}
                      {a.rank ? `· ${a.rank.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Sponsor doubles as the direct manager. Re-parent later from the
                agent profile if needed.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Rank
              </Label>
              <Select value={rankId} onValueChange={setRankId}>
                <SelectTrigger>
                  <SelectValue placeholder="No rank" />
                </SelectTrigger>
                <SelectContent>
                  {ranks.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} (lvl {r.level})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">License (real estate)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                License number
              </Label>
              <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Issuing authority
              </Label>
              <Input value={licenseAuthority} onChange={(e) => setLicenseAuthority(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Issued on
              </Label>
              <Input type="date" value={licenseIssuedAt} onChange={(e) => setLicenseIssuedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Expires on
              </Label>
              <Input type="date" value={licenseExpiresAt} onChange={(e) => setLicenseExpiresAt(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Bio
              </Label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="Specialisation, areas served, languages…"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/real-estate/agents")}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Creating…" : "Create agent profile"}
          </Button>
        </div>
      </form>
    </div>
  );
}
