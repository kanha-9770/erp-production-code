"use client";

/**
 * Fund Credit (admin manual ledger adjustment).
 *
 * MLM-template equivalent: "Financial → Fund Credit". For real-estate this
 * is the admin tool for one-off corrections — onboarding bonuses, refunds,
 * good-faith credits, claw-backs.
 *
 * Backend rule (BR-14): every adjustment requires *two* admin signatures —
 * the operator (you) and a different "co-signer" admin. The handler enforces
 * this — the second-approver picker on the form is the UI half of that
 * dual-authorization gate.
 *
 * After submit, the wallet aggregate updates immediately (the entry is
 * written RELEASED) and a row appears on the Fund Transfer report.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetAllWalletsQuery, useAdjustWalletMutation,
} from "@/lib/api/real-estate/finance";
import { useGetAdminUsersQuery } from "@/lib/api/users";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Coins, ArrowLeft, ShieldCheck, AlertTriangle,
  TrendingUp, TrendingDown, CheckCircle2,
} from "lucide-react";
import {
  formatCurrency, fullName, initials,
} from "@/components/real-estate/constants";
import { useToast } from "@/hooks/use-toast";

export default function FundCreditPage() {
  const { toast } = useToast();
  const walletsQ = useGetAllWalletsQuery();
  const adminsQ = useGetAdminUsersQuery();
  const [adjust, adjustState] = useAdjustWalletMutation();

  const wallets = walletsQ.data?.data ?? [];
  const allAdmins = adminsQ.data?.data ?? [];

  // Form state.
  const [walletUserId, setWalletUserId] = useState("");
  const [type, setType] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [coSignerId, setCoSignerId] = useState("");
  const [submitted, setSubmitted] = useState<{ amount: number; type: string; user: string } | null>(null);

  const selectedWallet = useMemo(
    () => wallets.find((w) => w.userId === walletUserId),
    [wallets, walletUserId],
  );

  // Co-signer must be an admin (any admin role) and not the current user.
  const coSignerCandidates = useMemo(
    () =>
      allAdmins.filter((u) =>
        (u.unitsAndRoles ?? u.unitAssignments ?? []).some(
          (ur: any) => ur.role?.isAdmin,
        ),
      ),
    [allAdmins],
  );

  const amountNum = parseFloat(amount);
  const isValid =
    walletUserId &&
    !Number.isNaN(amountNum) &&
    amountNum > 0 &&
    reason.trim().length >= 4 &&
    coSignerId &&
    coSignerId !== walletUserId;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    try {
      const res = await adjust({
        userId: walletUserId,
        type,
        amount: amountNum,
        reason: reason.trim(),
        secondApproverId: coSignerId,
      }).unwrap();
      setSubmitted({
        amount: amountNum,
        type,
        user: selectedWallet?.user
          ? fullName(selectedWallet.user)
          : walletUserId,
      });
      toast({
        title: "Adjustment posted",
        description: `${type === "CREDIT" ? "Credited" : "Debited"} ${formatCurrency(amountNum)} to ${selectedWallet?.user ? fullName(selectedWallet.user) : "wallet"}.`,
      });
      // Reset.
      setAmount("");
      setReason("");
    } catch (err: any) {
      toast({
        title: "Adjustment failed",
        description: err?.data?.error ?? err?.message ?? "Server rejected the request.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href="/real-estate/wallet" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <div className="text-xs text-muted-foreground">Real Estate · Financial</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary" />
            Fund Credit
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manual wallet credit / debit (admin-only). Every adjustment is
            recorded in the ledger and requires a second admin co-signer.
          </p>
        </div>
      </div>

      {submitted && (
        <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="flex-1">
              <strong>Posted.</strong> {submitted.type === "CREDIT" ? "Credited" : "Debited"}{" "}
              <span className="tabular-nums font-semibold">{formatCurrency(submitted.amount)}</span> to{" "}
              <strong>{submitted.user}</strong>. Visible immediately on
              their wallet and on the Fund Transfer report.
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href="/real-estate/reports/fund-transfer">View report</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <form onSubmit={onSubmit}>
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Form */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div>
                  <Label htmlFor="wallet" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Recipient wallet
                  </Label>
                  <Select value={walletUserId} onValueChange={setWalletUserId}>
                    <SelectTrigger id="wallet" className="mt-1.5">
                      <SelectValue placeholder="Select an agent's wallet…" />
                    </SelectTrigger>
                    <SelectContent>
                      {walletsQ.isLoading ? (
                        <div className="p-2"><Skeleton className="h-8" /></div>
                      ) : wallets.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">No wallets found.</div>
                      ) : (
                        wallets.map((w) => {
                          const u = w.user;
                          if (!u) return null;
                          return (
                            <SelectItem key={w.userId} value={w.userId}>
                              <span className="flex items-center gap-2">
                                <span className="truncate">{fullName(u)}</span>
                                <span className="text-muted-foreground text-xs tabular-nums">
                                  · {formatCurrency(w.availableBalance, w.currency)}
                                </span>
                              </span>
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Direction
                  </Label>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <button
                      type="button"
                      onClick={() => setType("CREDIT")}
                      className={`relative border rounded-md p-3 text-sm font-medium flex items-center gap-2 transition ${
                        type === "CREDIT"
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <TrendingUp className="h-4 w-4" />
                      Credit (add funds)
                    </button>
                    <button
                      type="button"
                      onClick={() => setType("DEBIT")}
                      className={`relative border rounded-md p-3 text-sm font-medium flex items-center gap-2 transition ${
                        type === "DEBIT"
                          ? "border-red-500 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <TrendingDown className="h-4 w-4" />
                      Debit (remove funds)
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="amount" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Amount
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 5000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1.5 text-lg tabular-nums"
                  />
                  {amountNum > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      = <span className="font-semibold tabular-nums">{formatCurrency(amountNum)}</span>
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="reason" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Reason (audit log) *
                  </Label>
                  <Textarea
                    id="reason"
                    placeholder="e.g. Onboarding bonus per HR offer letter, Refund for cancelled txn TXN-2025-014, etc."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-1.5"
                    rows={3}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Required. Stored verbatim in <code>re_ledger_entries.description</code>.
                  </p>
                </div>

                <div>
                  <Label htmlFor="cosigner" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Second-admin co-signer * (BR-14)
                  </Label>
                  <Select value={coSignerId} onValueChange={setCoSignerId}>
                    <SelectTrigger id="cosigner" className="mt-1.5">
                      <SelectValue placeholder="Select another admin to co-sign…" />
                    </SelectTrigger>
                    <SelectContent>
                      {adminsQ.isLoading ? (
                        <div className="p-2"><Skeleton className="h-8" /></div>
                      ) : coSignerCandidates.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">
                          No other admin found in this organization.
                        </div>
                      ) : (
                        coSignerCandidates.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            <span className="flex items-center gap-2">
                              <span className="truncate">{u.fullName || u.email}</span>
                              <span className="text-muted-foreground text-xs">· {u.email}</span>
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Manual adjustments require dual authorization — pick a
                    different admin who has approved this change.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button type="submit" disabled={!isValid || adjustState.isLoading}>
                    {adjustState.isLoading ? "Posting…" : `Post ${type === "CREDIT" ? "credit" : "debit"} of ${formatCurrency(amountNum || 0)}`}
                  </Button>
                  <Button asChild type="button" variant="ghost" size="sm">
                    <Link href="/real-estate/reports/fund-transfer">
                      Recent adjustments →
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Live preview */}
          <div className="space-y-4">
            <Card>
              <div className="px-4 py-3 border-b">
                <h2 className="text-sm font-semibold">Wallet preview</h2>
              </div>
              <CardContent className="p-4">
                {!selectedWallet ? (
                  <div className="text-sm text-muted-foreground">
                    Select a wallet to preview the impact of this adjustment.
                  </div>
                ) : (
                  <WalletPreview wallet={selectedWallet} amount={amountNum} type={type} />
                )}
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
              <CardContent className="p-4 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <strong>Adjustments are non-reversible by re-running this form.</strong>{" "}
                  If you make a mistake, post the opposite-sign adjustment with
                  a reason like "Reversing entry XXX". The original entry stays
                  in the ledger for full audit history.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

function WalletPreview({
  wallet, amount, type,
}: {
  wallet: any;
  amount: number;
  type: "CREDIT" | "DEBIT";
}) {
  const u = wallet.user;
  const delta = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const after = type === "CREDIT" ? wallet.availableBalance + delta : wallet.availableBalance - delta;

  return (
    <div className="space-y-3">
      {u && (
        <div className="flex items-center gap-2 pb-2 border-b">
          <Avatar className="h-9 w-9">
            <AvatarImage src={u.avatar ?? undefined} />
            <AvatarFallback>{initials(u)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-medium truncate">{fullName(u)}</div>
            <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
          </div>
        </div>
      )}
      <Row label="Available before" value={formatCurrency(wallet.availableBalance, wallet.currency)} />
      <Row
        label={type === "CREDIT" ? "+ Credit" : "− Debit"}
        value={formatCurrency(delta, wallet.currency)}
        accent={type === "CREDIT" ? "emerald" : "red"}
      />
      <div className="border-t pt-2">
        <Row
          label="Available after"
          value={formatCurrency(after, wallet.currency)}
          bold
          accent={after < 0 ? "red" : type === "CREDIT" ? "emerald" : undefined}
        />
        {after < 0 && (
          <div className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> This debit would push the balance negative — admin override required.
          </div>
        )}
      </div>
      {wallet.isFrozen && (
        <Badge variant="destructive" className="text-[10px]">
          Wallet is frozen — ledger writes still allowed.
        </Badge>
      )}
    </div>
  );
}

function Row({ label, value, accent, bold }: { label: string; value: React.ReactNode; accent?: "emerald" | "red"; bold?: boolean }) {
  const c = accent === "emerald" ? "text-emerald-700 dark:text-emerald-400" : accent === "red" ? "text-red-600 dark:text-red-400" : "";
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : ""} ${c}`}>{value}</span>
    </div>
  );
}
