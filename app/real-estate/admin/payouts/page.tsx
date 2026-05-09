"use client";

/**
 * Admin payout queue — approve / reject / mark-paid pending withdrawals.
 * Inbox-style UI with status filter; tabs default to REQUESTED so pending
 * work is front and centre.
 */

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  useGetWithdrawalsQuery,
  useApproveWithdrawalMutation,
  useRejectWithdrawalMutation,
  useMarkWithdrawalPaidMutation,
} from "@/lib/api/real-estate/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ArrowLeft,
  Inbox,
  CircleCheck,
  CircleX,
  Banknote,
  ExternalLink,
} from "lucide-react";
import {
  WITHDRAWAL_STATUS_LABEL,
  WITHDRAWAL_STATUS_VARIANT,
  formatCurrency,
  formatDateTime,
} from "@/components/real-estate/constants";

const TABS = ["REQUESTED", "APPROVED", "PAID", "REJECTED", "ALL"] as const;
type TabKey = (typeof TABS)[number];

export default function AdminPayoutsPage() {
  const [tab, setTab] = useState<TabKey>("REQUESTED");
  const { data, isLoading } = useGetWithdrawalsQuery({
    scope: "all",
    status: tab === "ALL" ? undefined : tab,
  });
  const items = data?.data ?? [];

  // Counts come from the live data — fast enough at the size this admin page
  // is meant for. For large orgs, swap for separate queries per tab.
  const counts = useMemo(() => {
    const c: Record<TabKey, number> = {
      REQUESTED: 0,
      APPROVED: 0,
      PAID: 0,
      REJECTED: 0,
      ALL: items.length,
    };
    for (const i of items) {
      if (i.status in c) c[i.status as TabKey]++;
    }
    return c;
  }, [items]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/real-estate" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Inbox className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            Payout approvals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Approve or reject pending withdrawal requests, then mark paid once
            the bank transfer goes through.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="overflow-x-auto justify-start">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {t === "ALL" ? "All" : WITHDRAWAL_STATUS_LABEL[t as keyof typeof WITHDRAWAL_STATUS_LABEL]}
              {tab === t && counts[t] > 0 ? (
                <span className="ml-2 text-xs">({counts[t]})</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nothing in this queue.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((w) => <PayoutRow key={w.id} withdrawal={w} />)}
        </div>
      )}
    </div>
  );
}

function PayoutRow({ withdrawal }: { withdrawal: any }) {
  const w = withdrawal;
  const { toast } = useToast();
  const [approve, { isLoading: approving }] = useApproveWithdrawalMutation();
  const [reject, { isLoading: rejecting }] = useRejectWithdrawalMutation();
  const [markPaid, { isLoading: marking }] = useMarkWithdrawalPaidMutation();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [paidOpen, setPaidOpen] = useState(false);
  const [reference, setReference] = useState("");

  const onApprove = async () => {
    if (!confirm(`Approve payout of ${formatCurrency(w.amount, w.currency)}?`)) return;
    try {
      await approve(w.id).unwrap();
      toast({ title: "Approved" });
    } catch (e: any) {
      toast({ title: "Could not approve", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  const onReject = async () => {
    if (!rejectReason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    try {
      await reject({ id: w.id, reason: rejectReason }).unwrap();
      toast({ title: "Rejected — funds refunded" });
      setRejectOpen(false);
      setRejectReason("");
    } catch (e: any) {
      toast({ title: "Could not reject", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  const onMarkPaid = async () => {
    try {
      await markPaid({ id: w.id, reference: reference || undefined }).unwrap();
      toast({ title: "Marked paid" });
      setPaidOpen(false);
      setReference("");
    } catch (e: any) {
      toast({ title: "Could not mark paid", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold tabular-nums text-lg">
              {formatCurrency(w.amount, w.currency)}
            </span>
            <Badge variant={WITHDRAWAL_STATUS_VARIANT[w.status as keyof typeof WITHDRAWAL_STATUS_VARIANT]} className="text-[10px]">
              {WITHDRAWAL_STATUS_LABEL[w.status as keyof typeof WITHDRAWAL_STATUS_LABEL]}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Banknote className="h-3 w-3" />
              <span>
                {w.bankAccount?.bankName} · {w.bankAccount?.accountHolderName}
              </span>
              <span className="font-mono">••••{w.bankAccount?.accountNumberLast4}</span>
              <span>{w.bankAccount?.ifscOrSwift}</span>
            </div>
            <div className="tabular-nums">
              Requested {formatDateTime(w.createdAt)} · fee{" "}
              {formatCurrency(w.fee)} · net {formatCurrency(w.netAmount)}
            </div>
            <div className="tabular-nums">
              Wallet available now:{" "}
              {formatCurrency(w.wallet?.availableBalance ?? 0)}
            </div>
            {w.notes && <div className="italic">Note: {w.notes}</div>}
            {w.rejectionReason && (
              <div className="text-destructive">Rejected: {w.rejectionReason}</div>
            )}
            {w.paidAt && (
              <div className="text-emerald-600 flex items-center gap-1">
                <CircleCheck className="h-3 w-3" /> Paid {formatDateTime(w.paidAt)}
                {w.paymentReference ? ` · ${w.paymentReference}` : ""}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {w.status === "REQUESTED" && (
            <>
              <Button onClick={onApprove} disabled={approving} size="sm">
                <CircleCheck className="h-3.5 w-3.5 mr-1" />
                {approving ? "Approving…" : "Approve"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setRejectOpen(true)}
              >
                <CircleX className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
            </>
          )}
          {w.status === "APPROVED" && (
            <Button onClick={() => setPaidOpen(true)} disabled={marking} size="sm">
              <CircleCheck className="h-3.5 w-3.5 mr-1" /> Mark paid
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link href={`/real-estate/admin/wallets`}>
              Wallets <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject payout</DialogTitle>
            <DialogDescription>
              Rejecting refunds the held amount back to the agent's available
              balance via an offsetting ledger entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Reason *">
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onReject} disabled={rejecting}>
              {rejecting ? "Rejecting…" : "Reject & refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paidOpen} onOpenChange={setPaidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark payout as paid</DialogTitle>
            <DialogDescription>
              Use this once the bank transfer has gone through. The reference
              shows on the agent's payout history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Payment reference (optional)">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="UTR / NEFT ref / etc."
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidOpen(false)} disabled={marking}>
              Cancel
            </Button>
            <Button onClick={onMarkPaid} disabled={marking}>
              {marking ? "Saving…" : "Mark paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
