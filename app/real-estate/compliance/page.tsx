"use client";

/**
 * My Compliance — agent uploads KYC documents and tracks verification status.
 * Each required type renders its own slot so agents see what's missing at a
 * glance.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetMyComplianceQuery,
  useUploadMyDocumentMutation,
  useDeleteComplianceDocumentMutation,
} from "@/lib/api/real-estate/compliance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  Shield,
  Upload,
  ExternalLink,
  Trash2,
  Plus,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  AGENT_COMPLIANCE_LABEL,
  AGENT_COMPLIANCE_VARIANT,
  COMPLIANCE_DOC_STATUS_LABEL,
  COMPLIANCE_DOC_STATUS_VARIANT,
  COMPLIANCE_DOC_TYPE_LABEL,
  COMPLIANCE_DOC_TYPE_OPTIONS,
  formatDate,
} from "@/components/real-estate/constants";
import type { ComplianceDocument } from "@/lib/api/real-estate/types";

export default function MyCompliancePage() {
  const { data, isLoading } = useGetMyComplianceQuery();
  const payload = data?.data;
  const docs = payload?.documents ?? [];

  // Group docs by type — show the latest VERIFIED if present, else the
  // latest of any status. Required types still render even if empty.
  const docsByType = useMemo(() => {
    const map = new Map<string, ComplianceDocument[]>();
    for (const d of docs) {
      const list = map.get(d.type) ?? [];
      list.push(d);
      map.set(d.type, list);
    }
    return map;
  }, [docs]);

  if (isLoading)
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-4xl space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32" />
        <Skeleton className="h-72" />
      </div>
    );

  if (!payload)
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-3xl">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Shield className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>You don't have an agent profile yet.</p>
          </CardContent>
        </Card>
      </div>
    );

  const { agent, requiredTypes } = payload;
  const required = new Set(requiredTypes as string[]);

  const allTypes = COMPLIANCE_DOC_TYPE_OPTIONS;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/real-estate" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            My compliance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload required KYC documents. Once verified, you can earn
            commissions and request payouts.
          </p>
        </div>
      </div>

      {/* Status banner */}
      <Card>
        <CardContent className="py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {agent.complianceStatus === "COMPLIANT" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            <div>
              <div className="font-medium">
                {AGENT_COMPLIANCE_LABEL[agent.complianceStatus]}
              </div>
              <div className="text-xs text-muted-foreground">
                {agent.complianceStatus === "COMPLIANT"
                  ? "All required documents are verified."
                  : "Upload missing documents to get verified."}
              </div>
            </div>
          </div>
          <Badge variant={AGENT_COMPLIANCE_VARIANT[agent.complianceStatus]}>
            {AGENT_COMPLIANCE_LABEL[agent.complianceStatus]}
          </Badge>
        </CardContent>
      </Card>

      {/* Required slots */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Documents</CardTitle>
          <UploadDocumentButton />
        </CardHeader>
        <CardContent className="space-y-3">
          {allTypes.map(({ value, label }) => {
            const list = docsByType.get(value) ?? [];
            const isRequired = required.has(value);
            const verified = list.find((d) => d.status === "VERIFIED");
            const pending = list.find((d) => d.status === "PENDING");
            return (
              <div
                key={value}
                className={`rounded-md border p-3 ${
                  isRequired && list.length === 0
                    ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{label}</span>
                    {isRequired && (
                      <Badge variant="outline" className="text-[10px]">Required</Badge>
                    )}
                    {verified && (
                      <Badge className="text-[10px] gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Verified
                      </Badge>
                    )}
                    {!verified && pending && (
                      <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                    )}
                  </div>
                </div>

                {list.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {isRequired ? "Required — please upload." : "Not uploaded."}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {list.map((d) => <DocRow key={d.id} doc={d} />)}
                  </ul>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Doc row ─────────────────────────────────────────────────────────────────

function DocRow({ doc }: { doc: ComplianceDocument }) {
  const { toast } = useToast();
  const [remove, { isLoading }] = useDeleteComplianceDocumentMutation();

  const onDelete = async () => {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    try {
      await remove(doc.id).unwrap();
      toast({ title: "Document removed" });
    } catch (e: any) {
      toast({
        title: "Could not delete",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  const expiringSoon =
    doc.expiryDate &&
    new Date(doc.expiryDate).getTime() - Date.now() < 30 * 86400000 &&
    new Date(doc.expiryDate).getTime() > Date.now();

  return (
    <li className="py-2 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{doc.name}</span>
          <Badge variant={COMPLIANCE_DOC_STATUS_VARIANT[doc.status]} className="text-[10px]">
            {COMPLIANCE_DOC_STATUS_LABEL[doc.status]}
          </Badge>
          {expiringSoon && (
            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-400">
              Expiring soon
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {doc.documentNumber && <span>#{doc.documentNumber} · </span>}
          {doc.expiryDate && <span>expires {formatDate(doc.expiryDate)}</span>}
          {!doc.expiryDate && <span>no expiry</span>}
        </div>
        {doc.status === "REJECTED" && doc.rejectionReason && (
          <div className="text-xs text-destructive mt-1">
            Rejected: {doc.rejectionReason}
          </div>
        )}
      </div>
      <Button asChild variant="ghost" size="sm">
        <a href={doc.url} target="_blank" rel="noreferrer">
          Open <ExternalLink className="h-3 w-3 ml-1" />
        </a>
      </Button>
      {doc.status !== "VERIFIED" && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={isLoading}
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  );
}

// ─── Upload dialog ───────────────────────────────────────────────────────────

function UploadDocumentButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("GOVERNMENT_ID");
  const [name, setName] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [upload] = useUploadMyDocumentMutation();

  const reset = () => {
    setType("GOVERNMENT_ID");
    setName("");
    setDocNumber("");
    setIssuedBy("");
    setIssuedAt("");
    setExpiryDate("");
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (!name.trim()) {
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
      await upload({
        type,
        name: name.trim(),
        url: j.imageUrl,
        documentNumber: docNumber || undefined,
        issuedBy: issuedBy || undefined,
        issuedAt: issuedAt || undefined,
        expiryDate: expiryDate || undefined,
      }).unwrap();
      toast({ title: "Document uploaded — awaiting verification" });
      reset();
      setOpen(false);
    } catch (e: any) {
      toast({
        title: "Could not upload",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5 mr-1" /> Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload compliance document</DialogTitle>
          <DialogDescription>
            Documents are reviewed by the compliance officer before they count
            toward your COMPLIANT status.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type *">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMPLIANCE_DOC_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Name *">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aadhaar 2024" />
            </Field>
            <Field label="Document number">
              <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
            </Field>
            <Field label="Issued by">
              <Input value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} />
            </Field>
            <Field label="Issued on">
              <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
            </Field>
            <Field label="Expires on">
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
            Cancel
          </Button>
          <label className="cursor-pointer">
            <input
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            <span className="inline-flex items-center text-sm rounded-md bg-primary text-primary-foreground px-4 py-2 hover:opacity-90">
              <Upload className="h-3.5 w-3.5 mr-2" />
              {uploading ? "Uploading…" : "Pick file & upload"}
            </span>
          </label>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
