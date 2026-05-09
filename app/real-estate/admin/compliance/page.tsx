"use client";

/**
 * Admin compliance queue (FR-8.6) — side-by-side document preview, approve /
 * reject. Defaults to PENDING tab so the work-to-do is front and centre.
 */

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  useGetComplianceQueueQuery,
  useVerifyComplianceDocumentMutation,
  useRejectComplianceDocumentMutation,
  useRecomputeAllComplianceMutation,
  useGetExpiringSoonQuery,
} from "@/lib/api/real-estate/compliance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCcw,
  AlertTriangle,
} from "lucide-react";
import {
  COMPLIANCE_DOC_STATUS_LABEL,
  COMPLIANCE_DOC_STATUS_VARIANT,
  COMPLIANCE_DOC_TYPE_LABEL,
  fullName,
  initials,
  formatDate,
  formatDateTime,
} from "@/components/real-estate/constants";
import type { ComplianceDocument } from "@/lib/api/real-estate/types";

const TABS = ["PENDING", "VERIFIED", "REJECTED", "EXPIRED", "ALL"] as const;
type TabKey = (typeof TABS)[number];

export default function AdminCompliancePage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("PENDING");
  const { data, isLoading } = useGetComplianceQueueQuery({
    status: tab === "ALL" ? undefined : tab,
  });
  const { data: expiringResp } = useGetExpiringSoonQuery({ days: 30 });
  const [recomputeAll, { isLoading: recomputing }] = useRecomputeAllComplianceMutation();

  const docs = data?.data ?? [];
  const expiringSoon = expiringResp?.data ?? [];

  const counts = useMemo(() => {
    // Counts come from the live page — for PENDING (the default tab) this is
    // exactly what's queued, so it's the value admins look at most.
    const c: Record<TabKey, number> = {
      PENDING: 0,
      VERIFIED: 0,
      REJECTED: 0,
      EXPIRED: 0,
      ALL: docs.length,
    };
    for (const d of docs) {
      if (d.status in c) c[d.status as TabKey]++;
    }
    return c;
  }, [docs]);

  const onRecompute = async () => {
    if (!confirm("Recompute compliance status for every active agent? Picks up newly-expired documents.")) return;
    try {
      const r = await recomputeAll().unwrap();
      toast({
        title: `Recomputed ${r.evaluated} agents`,
        description: `${r.COMPLIANT} compliant, ${r.PENDING_KYC} pending, ${r.NON_COMPLIANT} non-compliant.`,
      });
    } catch (e: any) {
      toast({ title: "Could not recompute", description: e?.data?.error || e?.message, variant: "destructive" });
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
              <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
              Compliance queue
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Verify or reject agent KYC submissions. Verified docs trigger
              automatic compliance recompute.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={onRecompute} disabled={recomputing}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          {recomputing ? "Recomputing…" : "Recompute all"}
        </Button>
      </div>

      {expiringSoon.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>
              <strong>{expiringSoon.length}</strong> verified document
              {expiringSoon.length === 1 ? "" : "s"} expire in the next 30
              days.
            </span>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="overflow-x-auto justify-start">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {t === "ALL" ? "All" : COMPLIANCE_DOC_STATUS_LABEL[t as keyof typeof COMPLIANCE_DOC_STATUS_LABEL]}
              {tab === t && counts[t] > 0 ? (
                <span className="ml-2 text-xs">({counts[t]})</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nothing in this queue.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {docs.map((d) => <DocReview key={d.id} doc={d} />)}
        </div>
      )}
    </div>
  );
}

function DocReview({ doc }: { doc: ComplianceDocument }) {
  const { toast } = useToast();
  const [verify, { isLoading: verifying }] = useVerifyComplianceDocumentMutation();
  const [reject, { isLoading: rejecting }] = useRejectComplianceDocumentMutation();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const onVerify = async () => {
    if (!confirm(`Verify "${doc.name}" for ${fullName(doc.agentProfile?.user ?? { email: "—" })}?`)) return;
    try {
      await verify(doc.id).unwrap();
      toast({ title: "Verified" });
    } catch (e: any) {
      toast({ title: "Could not verify", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  const onReject = async () => {
    if (!reason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    try {
      await reject({ id: doc.id, reason }).unwrap();
      toast({ title: "Rejected" });
      setRejectOpen(false);
      setReason("");
    } catch (e: any) {
      toast({ title: "Could not reject", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  const u = doc.agentProfile?.user;
  // Best-effort image preview detection from URL extension. Falls back to
  // open-in-new-tab for PDFs and the like.
  const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(doc.url);

  return (
    <Card>
      <CardContent className="p-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Preview pane */}
        <div className="rounded-md border bg-muted/30 overflow-hidden flex items-center justify-center min-h-[200px] max-h-[420px]">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.url}
              alt={doc.name}
              className="w-full h-full object-contain cursor-zoom-in"
              onClick={() => setPreviewOpen(true)}
            />
          ) : (
            <Button asChild variant="outline">
              <a href={doc.url} target="_blank" rel="noreferrer">
                Open document <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          )}
        </div>

        {/* Detail pane */}
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Avatar>
              <AvatarImage src={u?.avatar ?? undefined} />
              <AvatarFallback>{u ? initials(u) : "?"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <Link
                href={u ? `/real-estate/agents/${doc.agentProfile?.id}` : "#"}
                className="font-medium truncate hover:underline block"
              >
                {u ? fullName(u) : "—"}
              </Link>
              <div className="text-xs text-muted-foreground truncate">{u?.email ?? "—"}</div>
            </div>
          </div>

          <div className="border-t pt-2 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">
                {COMPLIANCE_DOC_TYPE_LABEL[doc.type]}
              </span>
              <Badge variant={COMPLIANCE_DOC_STATUS_VARIANT[doc.status]} className="text-[10px]">
                {COMPLIANCE_DOC_STATUS_LABEL[doc.status]}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">{doc.name}</div>
            {doc.documentNumber && (
              <div className="text-xs">
                <span className="text-muted-foreground">Number:</span>{" "}
                <span className="font-mono">{doc.documentNumber}</span>
              </div>
            )}
            {doc.issuedBy && (
              <div className="text-xs">
                <span className="text-muted-foreground">Issued by:</span> {doc.issuedBy}
              </div>
            )}
            {doc.issuedAt && (
              <div className="text-xs">
                <span className="text-muted-foreground">Issued on:</span> {formatDate(doc.issuedAt)}
              </div>
            )}
            {doc.expiryDate && (
              <div className="text-xs">
                <span className="text-muted-foreground">Expires:</span> {formatDate(doc.expiryDate)}
              </div>
            )}
            <div className="text-xs flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" /> Uploaded {formatDateTime(doc.createdAt)}
            </div>
            {doc.rejectionReason && (
              <div className="text-xs text-destructive italic">
                Previously rejected: {doc.rejectionReason}
              </div>
            )}
          </div>

          {doc.status === "PENDING" && (
            <div className="border-t pt-3 flex gap-2">
              <Button
                onClick={onVerify}
                disabled={verifying}
                size="sm"
                className="flex-1"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Verify
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={() => setRejectOpen(true)}
                disabled={rejecting}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
            </div>
          )}
          <Button asChild variant="ghost" size="sm" className="w-full">
            <a href={doc.url} target="_blank" rel="noreferrer">
              Open in new tab <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        </div>
      </CardContent>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject document</DialogTitle>
            <DialogDescription>
              The agent will see this reason on their compliance page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Reason *</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onReject} disabled={rejecting}>
              {rejecting ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image zoom dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{doc.name}</DialogTitle>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={doc.url} alt={doc.name} className="w-full h-auto rounded-md" />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
