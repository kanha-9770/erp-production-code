"use client";

/**
 * Wallets — admin overview. Shows total liability across all agents and
 * lets admins trigger the hold-period release job manually.
 */

import Link from "next/link";
import { useMemo } from "react";
import {
  useGetAllWalletsQuery,
  useReleaseDueCommissionsMutation,
} from "@/lib/api/real-estate/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Wallet as WalletIcon, ShieldOff, Sparkles } from "lucide-react";
import {
  formatCurrency,
  fullName,
  initials,
} from "@/components/real-estate/constants";

export default function AdminWalletsPage() {
  const { toast } = useToast();
  const { data, isLoading } = useGetAllWalletsQuery();
  const [release, { isLoading: releasing }] = useReleaseDueCommissionsMutation();

  const wallets = data?.data ?? [];

  const totals = useMemo(() => {
    let available = 0;
    let pending = 0;
    let liability = 0;
    for (const w of wallets) {
      available += w.availableBalance;
      pending += w.pendingBalance;
      liability += w.availableBalance + w.pendingBalance;
    }
    return { available, pending, liability };
  }, [wallets]);

  const onRelease = async () => {
    if (!confirm("Release every commission whose hold period has elapsed and whose agent is COMPLIANT?")) return;
    try {
      const res = await release().unwrap();
      toast({
        title: `Released ${res.released} commission entr${res.released === 1 ? "y" : "ies"}`,
      });
    } catch (e: any) {
      toast({
        title: "Could not release",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/real-estate" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
              <WalletIcon className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
              Wallets (admin)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Commission liability across {wallets.length} agent
              {wallets.length === 1 ? "" : "s"}.
            </p>
          </div>
        </div>
        <Button onClick={onRelease} disabled={releasing}>
          <Sparkles className="h-4 w-4 mr-2" />
          {releasing ? "Releasing…" : "Release due commissions"}
        </Button>
      </div>

      {/* Totals */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Total available
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <div className="text-2xl font-bold tabular-nums">{formatCurrency(totals.available)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Withdraw-able now</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Total on hold
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <div className="text-2xl font-bold tabular-nums">{formatCurrency(totals.pending)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Waiting for hold period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Total liability
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <div className="text-2xl font-bold tabular-nums">{formatCurrency(totals.liability)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Available + pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : wallets.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <WalletIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No wallets yet — they're created on first commission.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Agent</th>
                    <th className="text-right p-3">Available</th>
                    <th className="text-right p-3">On hold</th>
                    <th className="text-right p-3">Lifetime credits</th>
                    <th className="text-right p-3">Lifetime debits</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((w) => {
                    const u = w.user!;
                    return (
                      <tr key={w.id} className="border-b hover:bg-muted/30">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarImage src={u.avatar ?? undefined} />
                              <AvatarFallback className="text-[10px]">{initials(u)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{fullName(u)}</div>
                              <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-right tabular-nums font-medium">
                          {formatCurrency(w.availableBalance, w.currency)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {formatCurrency(w.pendingBalance, w.currency)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-xs text-muted-foreground">
                          {formatCurrency(w.totalCredits, w.currency)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-xs text-muted-foreground">
                          {formatCurrency(w.totalDebits, w.currency)}
                        </td>
                        <td className="p-3">
                          {w.isFrozen ? (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <ShieldOff className="h-3 w-3" /> Frozen
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Active</Badge>
                          )}
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
    </div>
  );
}
