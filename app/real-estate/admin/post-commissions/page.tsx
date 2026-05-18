"use client";

/**
 * Post commissions (admin).
 *
 * Agents close their deals with proof (CONTRACT or SALE_DEED). Closed deals
 * land here in a queue with no wallets credited yet. The admin filters by
 * month and/or by listing/selling agent, picks the deals, and clicks
 * "Post commissions" — the engine fires for every selection and posts
 * ON_HOLD ledger entries to each beneficiary wallet.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetEligibleForPostQuery,
  useBulkPostCommissionsMutation,
} from "@/lib/api/real-estate/transactions";
import { useGetAgentsQuery } from "@/lib/api/real-estate/agents";
import { useGetUserQuery } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Coins,
  Lock,
  CheckCircle2,
  AlertCircle,
  Receipt,
  Users,
  X,
  ShieldOff,
} from "lucide-react";
import {
  formatCurrency,
  formatDate,
  fullName,
} from "@/components/real-estate/constants";

function currentMonthYYYYMM(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function PostCommissionsPage() {
  // Admin gate. Posting commissions credits real wallets, so this page is
  // strictly admin-only — the server enforces it on every endpoint, and we
  // mirror it here so agents don't land on a broken-looking empty shell.
  const { data: userResp, isLoading: userLoading } = useGetUserQuery();
  const isAdminUser =
    Boolean(userResp?.user?.isAdmin) || Boolean(userResp?.user?.isOrgOwner);

  if (userLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-3xl">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (!isAdminUser) return <ForbiddenCard />;

  return <PostCommissionsPageInner />;
}

function ForbiddenCard() {
  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-2xl">
      <Card className="border-destructive/30">
        <CardContent className="py-10 text-center space-y-3">
          <ShieldOff className="h-10 w-10 mx-auto text-destructive opacity-70" />
          <div>
            <h1 className="text-lg font-semibold">Admin access required</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Posting commissions credits agent wallets, so this page is
              restricted to organization admins.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/real-estate">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Real Estate
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PostCommissionsPageInner() {
  const { toast } = useToast();
  const [month, setMonth] = useState<string>(currentMonthYYYYMM());
  const [scopeAll, setScopeAll] = useState(false);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastRun, setLastRun] = useState<{
    posted: number;
    failed: number;
    results: Array<{
      id: string;
      code: string | null;
      ok: boolean;
      baseCommission?: number;
      splitsCount?: number;
      error?: string;
    }>;
  } | null>(null);

  const { data: agentsResp } = useGetAgentsQuery({ status: "ACTIVE", limit: 200 });
  const agents = agentsResp?.data ?? [];

  const { data, isLoading, isFetching, refetch } = useGetEligibleForPostQuery({
    ...(scopeAll ? {} : { month }),
    ...(agentIds.length > 0 ? { agentIds } : {}),
  });
  const [bulkPost, { isLoading: posting }] = useBulkPostCommissionsMutation();

  const items = data?.data ?? [];

  const saleTotal = useMemo(
    () => items.reduce((sum, t) => sum + (t.salePrice ?? 0), 0),
    [items],
  );

  const allChecked =
    items.length > 0 && items.every((t) => selected.has(t.id));
  const someChecked = items.some((t) => selected.has(t.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => {
      if (items.every((t) => prev.has(t.id))) return new Set();
      return new Set(items.map((t) => t.id));
    });
  };

  const onPost = async () => {
    const ids =
      selected.size > 0 ? Array.from(selected) : items.map((t) => t.id);
    if (ids.length === 0) {
      toast({ title: "Nothing to post", variant: "destructive" });
      return;
    }
    if (
      !confirm(
        `Post commissions for ${ids.length} transaction${ids.length === 1 ? "" : "s"}? ` +
          `Every beneficiary wallet (listing, selling, override, brokerage) ` +
          `will receive a ledger credit. This cannot be undone in bulk — ` +
          `individual reversals require a per-transaction cancel.`,
      )
    )
      return;

    try {
      const res = await bulkPost({
        ids,
        month: scopeAll ? undefined : month,
        agentIds: agentIds.length > 0 ? agentIds : undefined,
      }).unwrap();
      setLastRun(res.data);
      setSelected(new Set());
      toast({
        title: `Posted ${res.data.posted} of ${res.data.posted + res.data.failed}`,
        description:
          res.data.failed > 0
            ? `${res.data.failed} failed — see the results panel below.`
            : "All selected transactions posted; beneficiary wallets credited.",
        variant: res.data.failed > 0 ? "destructive" : "default",
      });
      refetch();
    } catch (e: any) {
      toast({
        title: "Bulk post failed",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/real-estate" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
              <Coins className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
              Post commissions
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Closed transactions awaiting commission posting. Wallets are
              credited (ON_HOLD) on post; auto-release runs as the hold
              period elapses.
            </p>
          </div>
        </div>
        <Button
          onClick={onPost}
          disabled={posting || items.length === 0}
          size="lg"
        >
          <Lock className="h-4 w-4 mr-2" />
          {posting
            ? "Posting…"
            : selected.size > 0
              ? `Post ${selected.size} selected`
              : `Post all (${items.length})`}
        </Button>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="month" className="text-xs">
                Closed in (month, UTC)
              </Label>
              <Input
                id="month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                disabled={scopeAll}
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center">
              <Checkbox
                id="all-time"
                checked={scopeAll}
                onCheckedChange={(v) => setScopeAll(Boolean(v))}
              />
              <Label htmlFor="all-time" className="text-sm">
                Ignore month
              </Label>
            </div>
            <AgentMultiSelect
              agents={agents}
              selected={agentIds}
              onChange={setAgentIds}
            />
            <div className="text-sm text-muted-foreground sm:ml-auto tabular-nums whitespace-nowrap">
              {isLoading || isFetching ? (
                <Skeleton className="h-4 w-32" />
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    {items.length}
                  </span>{" "}
                  closed · sale-price total{" "}
                  <span className="font-medium text-foreground">
                    {formatCurrency(saleTotal)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Active filter pills */}
          {agentIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {agentIds.map((uid) => {
                const a = agents.find((x) => x.userId === uid);
                return (
                  <Badge
                    key={uid}
                    variant="secondary"
                    className="gap-1 cursor-pointer"
                    onClick={() =>
                      setAgentIds((prev) => prev.filter((id) => id !== uid))
                    }
                  >
                    {a?.user ? fullName(a.user) : uid.slice(0, 8)}
                    <X className="h-3 w-3" />
                  </Badge>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setAgentIds([])}
              >
                Clear all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Queue */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Awaiting commission posting</CardTitle>
          <p className="text-xs text-muted-foreground">
            Status = CLOSED · no commission splits posted yet
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">
                No closed transactions awaiting posting
                {scopeAll
                  ? ""
                  : ` for ${month}${agentIds.length > 0 ? ` and the selected agent${agentIds.length === 1 ? "" : "s"}` : ""}`}
                .
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 w-10">
                      <Checkbox
                        checked={
                          allChecked
                            ? true
                            : someChecked
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="text-left p-3">Transaction</th>
                    <th className="text-left p-3">Property</th>
                    <th className="text-left p-3">Buyer</th>
                    <th className="text-right p-3">Sale price</th>
                    <th className="text-left p-3">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-muted/30">
                      <td className="p-3">
                        <Checkbox
                          checked={selected.has(t.id)}
                          onCheckedChange={() => toggleOne(t.id)}
                          aria-label={`Select ${t.code ?? t.id}`}
                        />
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/real-estate/transactions/${t.id}`}
                          className="font-mono text-xs hover:underline"
                        >
                          {t.code ?? t.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="p-3">
                        <div className="font-medium truncate max-w-[260px]">
                          {t.property?.title ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.property?.city ?? ""}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {t.buyer?.name ?? "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums font-medium">
                        {formatCurrency(t.salePrice, t.currency)}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground tabular-nums">
                        {t.closedAt ? formatDate(t.closedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last-run results */}
      {lastRun && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Last run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <strong>{lastRun.posted}</strong> posted
              </span>
              <span className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <strong>{lastRun.failed}</strong> failed
              </span>
            </div>
            <ul className="divide-y text-sm">
              {lastRun.results.map((r) => (
                <li
                  key={r.id}
                  className="py-2 flex items-center justify-between gap-3"
                >
                  <span className="font-mono text-xs">
                    {r.code ?? r.id.slice(0, 8)}
                  </span>
                  {r.ok ? (
                    <span className="text-xs text-emerald-600 text-right">
                      Posted ·{" "}
                      {r.baseCommission != null
                        ? formatCurrency(r.baseCommission)
                        : "—"}{" "}
                      across {r.splitsCount ?? 0} splits
                    </span>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">
                      {r.error ?? "Failed"}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AgentMultiSelect({
  agents,
  selected,
  onChange,
}: {
  agents: Array<{
    userId: string;
    user?: { first_name: string | null; last_name: string | null; email: string };
  }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents.slice(0, 50);
    return agents
      .filter((a) => {
        const name = a.user ? fullName(a.user).toLowerCase() : "";
        return name.includes(q) || (a.user?.email ?? "").toLowerCase().includes(q);
      })
      .slice(0, 50);
  }, [agents, search]);

  const toggle = (uid: string) => {
    onChange(
      selected.includes(uid)
        ? selected.filter((x) => x !== uid)
        : [...selected, uid],
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 self-end">
          <Users className="h-4 w-4" />
          {selected.length === 0
            ? "Filter by agent"
            : `${selected.length} agent${selected.length === 1 ? "" : "s"}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-2 border-b">
          <Input
            placeholder="Search agents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-4 text-xs text-muted-foreground text-center">
              No agents match.
            </li>
          ) : (
            filtered.map((a) => {
              const isOn = selected.includes(a.userId);
              return (
                <li key={a.userId}>
                  <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 cursor-pointer text-sm">
                    <Checkbox
                      checked={isOn}
                      onCheckedChange={() => toggle(a.userId)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {a.user ? fullName(a.user) : a.userId.slice(0, 8)}
                      </span>
                      {a.user?.email && (
                        <span className="block text-[10px] text-muted-foreground truncate">
                          {a.user.email}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
