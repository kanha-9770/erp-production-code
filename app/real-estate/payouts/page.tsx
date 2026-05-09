"use client";

/**
 * Agent payouts — bank accounts management + request payout + my withdrawal
 * history. Single page with three sections so an agent can manage everything
 * from one place.
 */

import Link from "next/link";
import { useState } from "react";
import {
  useGetMyWalletQuery,
  useGetMyBankAccountsQuery,
  useCreateBankAccountMutation,
  useDeleteBankAccountMutation,
  useUpdateBankAccountMutation,
  useGetWithdrawalsQuery,
  useRequestWithdrawalMutation,
  useCancelWithdrawalMutation,
} from "@/lib/api/real-estate/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Banknote,
  Trash2,
  Star,
  Send,
  History,
  CircleCheck,
} from "lucide-react";
import {
  WITHDRAWAL_STATUS_LABEL,
  WITHDRAWAL_STATUS_VARIANT,
  formatCurrency,
  formatDateTime,
} from "@/components/real-estate/constants";

const PAYOUT_FEE = 10;
const MIN_WITHDRAWAL = 100;

export default function PayoutsPage() {
  const { toast } = useToast();
  const { data: walletResp } = useGetMyWalletQuery();
  const wallet = walletResp?.data;
  const { data: banksResp, isLoading: banksLoading } = useGetMyBankAccountsQuery();
  const banks = banksResp?.data ?? [];
  const { data: withdrawalsResp, isLoading: withdrawalsLoading } =
    useGetWithdrawalsQuery({ scope: "mine" });
  const withdrawals = withdrawalsResp?.data ?? [];

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/real-estate/wallet" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Banknote className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            Payouts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bank accounts, payout requests, and your withdrawal history.
          </p>
        </div>
      </div>

      {/* Available + Request */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Available to withdraw
            </div>
            <div className="text-3xl font-bold tabular-nums">
              {formatCurrency(wallet?.availableBalance ?? 0, wallet?.currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Minimum payout {formatCurrency(MIN_WITHDRAWAL)} · fee{" "}
              {formatCurrency(PAYOUT_FEE)}
            </p>
          </div>
          <RequestPayoutButton
            available={wallet?.availableBalance ?? 0}
            currency={wallet?.currency ?? "INR"}
            banks={banks}
            walletFrozen={wallet?.isFrozen ?? false}
          />
        </CardContent>
      </Card>

      {/* Bank accounts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Bank accounts</CardTitle>
          <AddBankAccountButton />
        </CardHeader>
        <CardContent>
          {banksLoading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : banks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No bank accounts on file. Add one to enable payouts.
            </p>
          ) : (
            <ul className="divide-y">
              {banks.map((b) => <BankRow key={b.id} bank={b} />)}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* My withdrawals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> My payouts
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {withdrawalsLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : withdrawals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No payout requests yet.
            </p>
          ) : (
            <ul className="divide-y">
              {withdrawals.map((w) => <WithdrawalRow key={w.id} withdrawal={w} />)}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Add bank account ───────────────────────────────────────────────────────

function AddBankAccountButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    label: "",
    bankName: "",
    accountHolderName: "",
    accountNumber: "",
    confirmAccountNumber: "",
    ifscOrSwift: "",
    branch: "",
  });
  const [submit, { isLoading }] = useCreateBankAccountMutation();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.accountNumber !== form.confirmAccountNumber) {
      toast({ title: "Account numbers don't match", variant: "destructive" });
      return;
    }
    try {
      await submit({
        label: form.label || undefined,
        bankName: form.bankName,
        accountHolderName: form.accountHolderName,
        accountNumber: form.accountNumber,
        ifscOrSwift: form.ifscOrSwift,
        branch: form.branch || undefined,
      }).unwrap();
      toast({ title: "Bank account added" });
      setForm({
        label: "",
        bankName: "",
        accountHolderName: "",
        accountNumber: "",
        confirmAccountNumber: "",
        ifscOrSwift: "",
        branch: "",
      });
      setOpen(false);
    } catch (e: any) {
      toast({
        title: "Could not add",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add bank account</DialogTitle>
          <DialogDescription>
            Account number is encrypted at rest (AES-256). Only the last 4
            digits are displayed in the UI.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label">
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Personal / Business"
              />
            </Field>
            <Field label="Bank name *">
              <Input
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                required
              />
            </Field>
            <Field label="Account holder name *" className="sm:col-span-2">
              <Input
                value={form.accountHolderName}
                onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })}
                required
              />
            </Field>
            <Field label="Account number *">
              <Input
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                required
                autoComplete="off"
              />
            </Field>
            <Field label="Confirm account number *">
              <Input
                value={form.confirmAccountNumber}
                onChange={(e) => setForm({ ...form, confirmAccountNumber: e.target.value })}
                required
                autoComplete="off"
              />
            </Field>
            <Field label="IFSC / SWIFT *">
              <Input
                value={form.ifscOrSwift}
                onChange={(e) => setForm({ ...form, ifscOrSwift: e.target.value.toUpperCase() })}
                required
              />
            </Field>
            <Field label="Branch">
              <Input
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving…" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BankRow({ bank }: { bank: any }) {
  const { toast } = useToast();
  const [remove, { isLoading: removing }] = useDeleteBankAccountMutation();
  const [update] = useUpdateBankAccountMutation();

  const onDelete = async () => {
    if (!confirm(`Delete bank account ending ${bank.accountNumberLast4}?`)) return;
    try {
      await remove(bank.id).unwrap();
      toast({ title: "Bank account deleted" });
    } catch (e: any) {
      toast({
        title: "Could not delete",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  const onMakePrimary = async () => {
    try {
      await update({ id: bank.id, body: { isPrimary: true } }).unwrap();
      toast({ title: "Marked primary" });
    } catch (e: any) {
      toast({
        title: "Could not update",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  return (
    <li className="py-3 flex items-center gap-3">
      <Banknote className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{bank.bankName}</span>
          {bank.label && (
            <Badge variant="outline" className="text-[10px]">{bank.label}</Badge>
          )}
          {bank.isPrimary && (
            <Badge className="text-[10px] gap-1">
              <Star className="h-3 w-3" /> Primary
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {bank.accountHolderName} · ••••{bank.accountNumberLast4} · {bank.ifscOrSwift}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {!bank.isPrimary && (
          <Button variant="ghost" size="sm" onClick={onMakePrimary}>
            Make primary
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onDelete} disabled={removing} aria-label="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

// ─── Request payout ─────────────────────────────────────────────────────────

function RequestPayoutButton({
  available,
  currency,
  banks,
  walletFrozen,
}: {
  available: number;
  currency: string;
  banks: any[];
  walletFrozen: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [request, { isLoading }] = useRequestWithdrawalMutation();
  const [amount, setAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [notes, setNotes] = useState("");

  const primary = banks.find((b) => b.isPrimary);

  const open2 = (v: boolean) => {
    if (v) {
      setAmount(String(Math.max(0, available - PAYOUT_FEE)));
      setBankAccountId(primary?.id ?? banks[0]?.id ?? "");
      setNotes("");
    }
    setOpen(v);
  };

  const onSubmit = async () => {
    const num = Number(amount);
    if (!num || num < MIN_WITHDRAWAL) {
      toast({
        title: `Minimum payout is ${formatCurrency(MIN_WITHDRAWAL)}`,
        variant: "destructive",
      });
      return;
    }
    if (!bankAccountId) {
      toast({ title: "Pick a bank account", variant: "destructive" });
      return;
    }
    try {
      await request({ amount: num, bankAccountId, notes: notes || undefined }).unwrap();
      toast({ title: "Payout requested", description: "Awaiting compliance approval." });
      setOpen(false);
    } catch (e: any) {
      toast({
        title: "Could not request",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  const disabled = walletFrozen || banks.length === 0 || available < MIN_WITHDRAWAL;

  return (
    <Dialog open={open} onOpenChange={open2}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Send className="h-4 w-4 mr-2" /> Request payout
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request payout</DialogTitle>
          <DialogDescription>
            Funds are debited immediately and held until compliance approves.
            Approval routes through the compliance officer; rejection refunds
            the hold.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Amount *">
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
              Available: {formatCurrency(available, currency)} · Fee:{" "}
              {formatCurrency(PAYOUT_FEE)} · You receive:{" "}
              <strong>
                {formatCurrency(Math.max(0, Number(amount || 0) - PAYOUT_FEE), currency)}
              </strong>
            </p>
          </Field>
          <Field label="Bank account *">
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger><SelectValue placeholder="Pick a bank account" /></SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.bankName} ••••{b.accountNumberLast4}
                    {b.isPrimary ? " (primary)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Note (optional)">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything compliance should know"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isLoading}>
            {isLoading ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Withdrawal row ─────────────────────────────────────────────────────────

function WithdrawalRow({ withdrawal }: { withdrawal: any }) {
  const { toast } = useToast();
  const [cancel, { isLoading }] = useCancelWithdrawalMutation();
  const w = withdrawal;

  const onCancel = async () => {
    if (!confirm("Cancel this payout request? Funds will be returned to your available balance.")) return;
    try {
      await cancel(w.id).unwrap();
      toast({ title: "Payout cancelled" });
    } catch (e: any) {
      toast({
        title: "Could not cancel",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  return (
    <li className="p-3 flex items-start gap-3">
      <Banknote className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-medium">
            {formatCurrency(w.amount, w.currency)}{" "}
            <span className="text-xs text-muted-foreground">
              → ••••{w.bankAccount?.accountNumberLast4}
            </span>
          </div>
          <Badge variant={WITHDRAWAL_STATUS_VARIANT[w.status as keyof typeof WITHDRAWAL_STATUS_VARIANT]} className="text-[10px]">
            {WITHDRAWAL_STATUS_LABEL[w.status as keyof typeof WITHDRAWAL_STATUS_LABEL]}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {formatDateTime(w.createdAt)} · fee {formatCurrency(w.fee)} · net{" "}
          {formatCurrency(w.netAmount)}
        </div>
        {w.status === "REJECTED" && w.rejectionReason && (
          <div className="text-xs text-destructive mt-1">
            Rejected: {w.rejectionReason}
          </div>
        )}
        {w.paidAt && (
          <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
            <CircleCheck className="h-3 w-3" /> Paid {formatDateTime(w.paidAt)}
            {w.paymentReference ? ` · ${w.paymentReference}` : ""}
          </div>
        )}
      </div>
      {w.status === "REQUESTED" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
          className="shrink-0"
        >
          Cancel
        </Button>
      )}
    </li>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
