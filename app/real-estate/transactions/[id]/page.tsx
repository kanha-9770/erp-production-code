"use client";

/**
 * Transaction detail — pricing summary, document upload, commission preview /
 * actual splits panel, audit log, close / cancel actions.
 *
 * Close fires the commission engine (FR-5). Preview shows what the splits
 * WOULD be without writing anything. Cancel reverses via offsetting ledger
 * entries on a CLOSED transaction (FR-5.13 / BR-7).
 */

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  useGetTransactionQuery,
  useCloseTransactionMutation,
  usePostCommissionsForTransactionMutation,
  useCancelTransactionMutation,
  usePreviewCommissionMutation,
  useAddTransactionDocumentMutation,
  useRemoveTransactionDocumentMutation,
} from "@/lib/api/real-estate/transactions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useGetUserQuery } from "@/lib/api/auth";
import {
  ArrowLeft,
  Receipt,
  FileText,
  Upload,
  ExternalLink,
  Trash2,
  Calculator,
  Lock,
  XCircle,
  Sparkles,
  History,
} from "lucide-react";
import {
  TRANSACTION_STATUS_LABEL,
  TRANSACTION_STATUS_VARIANT,
  TRANSACTION_DOC_TYPE_LABEL,
  TRANSACTION_DOC_TYPE_OPTIONS,
  COMMISSION_ROLE_LABEL,
  COMMISSION_STATUS_LABEL,
  COMMISSION_STATUS_VARIANT,
  formatCurrency,
  formatDate,
  formatDateTime,
} from "@/components/real-estate/constants";

interface PreviewSplit {
  role: string;
  level: number | null;
  beneficiaryUserId: string | null;
  percent: number;
  amount: number;
}

export default function TransactionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { toast } = useToast();

  const { data, isLoading, refetch } = useGetTransactionQuery(id);
  const { data: userData } = useGetUserQuery();
  // Closing a deal posts ledger entries to every beneficiary's wallet — it
  // is restricted to org admins, who run it at month-end (the server enforces
  // this; we mirror it in the UI so agents don't see a button that will 403).
  const isAdminUser =
    Boolean(userData?.user?.isAdmin) || Boolean(userData?.user?.isOrgOwner);
  const [closeTxn, { isLoading: closing }] = useCloseTransactionMutation();
  const [postCommissions, { isLoading: posting }] =
    usePostCommissionsForTransactionMutation();
  const [cancelTxn, { isLoading: cancelling }] = useCancelTransactionMutation();
  const [previewCommission, { isLoading: previewing, data: previewResp }] =
    usePreviewCommissionMutation();

  const txn = data?.data;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const onClose = async () => {
    if (
      !confirm(
        "Close this transaction with proof? It will be sent to the admin queue for commission posting.",
      )
    )
      return;
    try {
      await closeTxn(id).unwrap();
      toast({
        title: "Transaction closed",
        description: "Awaiting commission posting by admin.",
      });
      refetch();
    } catch (e: any) {
      toast({ title: "Could not close", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  const onPostCommissions = async () => {
    if (
      !confirm(
        "Post commissions for this transaction? The engine will fire and credit ledger entries to every beneficiary wallet.",
      )
    )
      return;
    try {
      const res = await postCommissions(id).unwrap();
      toast({
        title: "Commissions posted",
        description: `Base commission ${formatCurrency(res.data.baseCommission)} distributed across ${res.data.splits.length} splits.`,
      });
      refetch();
    } catch (e: any) {
      toast({
        title: "Could not post commissions",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  const onCancel = async () => {
    if (!cancelReason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    try {
      const res = await cancelTxn({ id, reason: cancelReason }).unwrap();
      toast({
        title: res.reversed ? "Transaction cancelled & commissions reversed" : "Transaction cancelled",
      });
      setCancelOpen(false);
      refetch();
    } catch (e: any) {
      toast({ title: "Could not cancel", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  const onPreview = async () => {
    try {
      await previewCommission(id).unwrap();
    } catch (e: any) {
      toast({ title: "Preview failed", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  if (isLoading)
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-6xl space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32" />
        <Skeleton className="h-72" />
      </div>
    );

  if (!txn)
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-3xl">
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Transaction not found.</p>
            <Button asChild variant="link">
              <Link href="/real-estate/transactions">Back to transactions</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  const isPending = txn.status === "PENDING";
  const isClosed = txn.status === "CLOSED";
  const isCancelled = txn.status === "CANCELLED";
  // CLOSED-but-not-yet-posted is the "awaiting admin posting" state. The
  // detail endpoint returns commissionSplits[] — empty means commissions
  // haven't been posted yet.
  const splitsCount = (txn as any).commissionSplits?.length ?? 0;
  const isClosedUnposted = isClosed && splitsCount === 0;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href="/real-estate/transactions" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate flex items-center gap-2">
                <Receipt className="h-6 w-6 text-primary" />
                {txn.property?.title ?? "Transaction"}
              </h1>
              <Badge variant={TRANSACTION_STATUS_VARIANT[txn.status]}>
                {TRANSACTION_STATUS_LABEL[txn.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {txn.code ? <span className="font-mono">{txn.code} · </span> : null}
              {txn.property?.city ?? "—"} · created {formatDateTime(txn.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {isPending && (
            <>
              <Button variant="outline" onClick={onPreview} disabled={previewing}>
                <Calculator className="h-4 w-4 mr-2" /> {previewing ? "Calculating…" : "Preview commission"}
              </Button>
              <Button onClick={onClose} disabled={closing}>
                <Lock className="h-4 w-4 mr-2" /> {closing ? "Closing…" : "Close with proof"}
              </Button>
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                <XCircle className="h-4 w-4 mr-2" /> Cancel
              </Button>
            </>
          )}
          {isClosedUnposted && isAdminUser && (
            <Button onClick={onPostCommissions} disabled={posting}>
              <Lock className="h-4 w-4 mr-2" />
              {posting ? "Posting…" : "Post commissions"}
            </Button>
          )}
          {isClosed && isAdminUser && (
            <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={cancelling}>
              <XCircle className="h-4 w-4 mr-2" /> Cancel & reverse
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sale price
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(txn.salePrice, txn.currency)}
            </div>
            {txn.property && (
              <p className="text-xs text-muted-foreground mt-1">
                Listed at {formatCurrency(txn.property.listingPrice ?? 0, txn.property.currency)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Base commission
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {txn.baseCommission != null
                ? formatCurrency(txn.baseCommission, txn.currency)
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {txn.commissionRuleVersion
                ? `Rule version ${txn.commissionRuleVersion} (frozen)`
                : "Calculated on close"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Closed at
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {txn.closedAt ? formatDate(txn.closedAt) : "—"}
            </div>
            {isCancelled && txn.cancelledAt && (
              <p className="text-xs text-destructive mt-1">
                Cancelled {formatDate(txn.cancelledAt)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent self-close requires proof. Spell it out so the agent knows
          why the Close button can fail. */}
      {isPending && (
        <Card className="border-blue-400/30 bg-blue-50/60 dark:bg-blue-950/20">
          <CardContent className="py-3 text-sm">
            <span className="font-medium">Closing this deal:</span> upload a{" "}
            <strong>CONTRACT</strong> or <strong>SALE_DEED</strong> as proof,
            then close. Once closed, the admin will review and post commissions
            to every beneficiary wallet.
          </CardContent>
        </Card>
      )}

      {/* CLOSED but commissions not yet posted — explains the holding state. */}
      {isClosedUnposted && (
        <Card className="border-amber-400/40 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-3 text-sm">
            <span className="font-medium">Awaiting commission posting:</span>{" "}
            the deal is closed. Wallet credits are pending until the admin
            posts commissions{isAdminUser ? " — use the button above." : "."}
          </CardContent>
        </Card>
      )}

      {/* Cancellation reason banner */}
      {isCancelled && txn.cancellationReason && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm">
            <span className="font-medium">Cancelled:</span> {txn.cancellationReason}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={isPending ? "documents" : "splits"}>
        <TabsList className="overflow-x-auto justify-start">
          <TabsTrigger value="splits">
            Commission splits ({(txn as any).commissionSplits?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="documents">
            Documents ({(txn as any).documents?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="audit">
            Audit ({(txn as any).commissionAudits?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="splits">
          <SplitsPanel
            splits={(txn as any).commissionSplits ?? []}
            currency={txn.currency}
          />
        </TabsContent>

        <TabsContent value="preview">
          <PreviewPanel
            preview={previewResp?.data ?? null}
            loading={previewing}
            currency={txn.currency}
            onRun={onPreview}
            isPending={isPending}
          />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsPanel
            transactionId={id}
            documents={(txn as any).documents ?? []}
            disabled={!isPending}
          />
        </TabsContent>

        <TabsContent value="audit">
          <AuditPanel audits={(txn as any).commissionAudits ?? []} />
        </TabsContent>
      </Tabs>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel transaction</DialogTitle>
            <DialogDescription>
              {isClosed
                ? "Cancelling a closed sale reverses every commission split via offsetting ledger entries (BR-7). Original entries are not modified."
                : "This will mark the transaction CANCELLED and return the property to AVAILABLE."}
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason *">
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Back
            </Button>
            <Button variant="destructive" onClick={onCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Confirm cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Splits ──────────────────────────────────────────────────────────────────

function SplitsPanel({ splits, currency }: { splits: any[]; currency: string }) {
  if (splits.length === 0)
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No splits posted yet.</p>
          <p className="text-xs mt-1">
            Close the transaction to fire the commission engine.
          </p>
        </CardContent>
      </Card>
    );

  const total = splits.reduce((acc: number, s: any) => acc + Number(s.amount), 0);

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Beneficiary</th>
              <th className="text-right p-3">%</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {splits.map((s) => (
              <tr key={s.id} className="border-b">
                <td className="p-3">
                  <span className="font-medium">{COMMISSION_ROLE_LABEL[s.role as keyof typeof COMMISSION_ROLE_LABEL] ?? s.role}</span>
                  {s.level != null && (
                    <span className="ml-1 text-xs text-muted-foreground">L{s.level}</span>
                  )}
                </td>
                <td className="p-3 font-mono text-xs">
                  {s.beneficiaryUserId
                    ? s.beneficiaryUserId.slice(0, 12) + "…"
                    : <span className="italic text-muted-foreground">house</span>}
                </td>
                <td className="p-3 text-right tabular-nums">{Number(s.percent).toFixed(4)}%</td>
                <td className="p-3 text-right tabular-nums font-medium">
                  {formatCurrency(Number(s.amount), currency)}
                </td>
                <td className="p-3">
                  <Badge variant={COMMISSION_STATUS_VARIANT[s.status as keyof typeof COMMISSION_STATUS_VARIANT]} className="text-[10px]">
                    {COMMISSION_STATUS_LABEL[s.status as keyof typeof COMMISSION_STATUS_LABEL]}
                  </Badge>
                </td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-medium">
              <td className="p-3" colSpan={3}>Total</td>
              <td className="p-3 text-right tabular-nums">{formatCurrency(total, currency)}</td>
              <td className="p-3" />
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─── Preview ─────────────────────────────────────────────────────────────────

function PreviewPanel({
  preview,
  loading,
  currency,
  onRun,
  isPending,
}: {
  preview: { baseCommission: number; ruleId: string; ruleVersion: number; splits: PreviewSplit[] } | null;
  loading: boolean;
  currency: string;
  onRun: () => void;
  isPending: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4" /> Commission preview
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onRun} disabled={loading || !isPending}>
          {loading ? "Calculating…" : "Run preview"}
        </Button>
      </CardHeader>
      <CardContent>
        {!isPending ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Preview is only available before close. See the Commission splits
            tab for the actual posted distribution.
          </p>
        ) : !preview ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Run a preview to see how the engine will distribute the commission
            without posting any ledger entries.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Base commission</span>
              <span className="text-lg font-semibold tabular-nums">
                {formatCurrency(preview.baseCommission, currency)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Rule version {preview.ruleVersion}
            </div>
            <table className="w-full text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left py-2">Role</th>
                  <th className="text-right py-2">%</th>
                  <th className="text-right py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.splits.map((s, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">
                      {COMMISSION_ROLE_LABEL[s.role as keyof typeof COMMISSION_ROLE_LABEL] ?? s.role}
                      {s.level != null && (
                        <span className="ml-1 text-xs text-muted-foreground">L{s.level}</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {s.percent.toFixed(4)}%
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCurrency(s.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Documents ───────────────────────────────────────────────────────────────

function DocumentsPanel({
  transactionId,
  documents,
  disabled,
}: {
  transactionId: string;
  documents: any[];
  disabled: boolean;
}) {
  const { toast } = useToast();
  const [docType, setDocType] = useState("CONTRACT");
  const [docName, setDocName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [add] = useAddTransactionDocumentMutation();
  const [remove] = useRemoveTransactionDocumentMutation();

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (!docName.trim()) {
      toast({ title: "Enter a document name first", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok || !j.success || !j.imageUrl)
        throw new Error(j.error || "Upload failed");
      await add({ id: transactionId, type: docType, name: docName.trim(), url: j.imageUrl }).unwrap();
      toast({ title: "Document attached" });
      setDocName("");
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!disabled && (
          <p className="text-xs text-muted-foreground">
            Documents can only be added/removed while the transaction is PENDING.
            A CONTRACT or SALE_DEED is required before close.
          </p>
        )}
        {disabled && (
          <p className="text-xs text-muted-foreground italic">
            Documents are read-only for this transaction.
          </p>
        )}

        {!disabled && (
          <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto] items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSACTION_DOC_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Name</Label>
              <Input value={docName} onChange={(e) => setDocName(e.target.value)} />
            </div>
            <label className="cursor-pointer">
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <span className="inline-flex items-center text-sm rounded-md border px-3 py-2 hover:bg-muted">
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                {uploading ? "Uploading…" : "Upload"}
              </span>
            </label>
          </div>
        )}

        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No documents attached yet.
          </p>
        ) : (
          <ul className="divide-y">
            {documents.map((d: any) => (
              <li key={d.id} className="py-2.5 flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {TRANSACTION_DOC_TYPE_LABEL[d.type as keyof typeof TRANSACTION_DOC_TYPE_LABEL] ?? d.type} · {formatDate(d.createdAt)}
                  </div>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <a href={d.url} target="_blank" rel="noreferrer">
                    Open <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      if (!confirm(`Delete "${d.name}"?`)) return;
                      try {
                        await remove({ id: transactionId, documentId: d.id }).unwrap();
                        toast({ title: "Document removed" });
                      } catch (e: any) {
                        toast({ title: "Could not delete", description: e?.message, variant: "destructive" });
                      }
                    }}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Audit ───────────────────────────────────────────────────────────────────

function AuditPanel({ audits }: { audits: any[] }) {
  if (audits.length === 0)
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No audit records yet.</p>
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardContent className="p-3">
        <ul className="space-y-3">
          {audits.map((a: any) => (
            <li key={a.id} className="border rounded-md p-3 bg-muted/20">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{a.kind}</Badge>
                  <span className="text-xs text-muted-foreground">
                    rule v{a.ruleVersion}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(a.createdAt)}
                </span>
              </div>
              {a.notes && <div className="text-sm mb-1">{a.notes}</div>}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Inputs / outputs</summary>
                <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap mt-1">{JSON.stringify({ inputs: a.inputs, outputs: a.outputs }, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      </CardContent>
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
