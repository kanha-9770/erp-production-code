"use client";

/**
 * "How it works" — an always-visible, ungated workflow guide for the Purchase
 * module, rendered as a step-by-step vertical TIMELINE / flowchart so any
 * employee can follow the procure-to-pay process at a glance. Floats in the
 * bottom-right corner of every purchase page.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  HelpCircle,
  ArrowRight,
  ArrowDown,
  PackageCheck,
  ShieldCheck,
  FileText,
  CheckCircle2,
  Search,
  FileSignature,
  Banknote,
  type LucideIcon,
} from "lucide-react";

interface Step {
  title: string;
  who: string;
  icon: LucideIcon;
  /** node + accent colours */
  ring: string;
  what: string;
  action: string;
  result: string;
  /** optional nested sub-steps (the GRN internal flow) */
  sub?: string[];
}

const STEPS: Step[] = [
  {
    title: "Raise a Requisition (PR)",
    who: "Any employee",
    icon: FileText,
    ring: "bg-slate-500",
    what: "Describe what you need — item, quantity, priority. Your name & department are recorded automatically.",
    action: 'Click "New requisition".',
    result: "PR Raised",
  },
  {
    title: "Approve the Requisition",
    who: "Approver",
    icon: CheckCircle2,
    ring: "bg-amber-500",
    what: "The approver reviews and approves (or rejects) the request. Only an Approver can set this.",
    action: "Open PR → Edit → Production Approval = Approved.",
    result: "Approved",
  },
  {
    title: "Source / get quotes (RFQ)",
    who: "Buyer",
    icon: Search,
    ring: "bg-blue-500",
    what: "Buyer requests quotations and selects the best supplier. Repeat buys can skip straight to a PO.",
    action: 'On the PR click "Raise RFQ" (or "Convert to PO").',
    result: "Sourcing → Selected",
  },
  {
    title: "Create & approve the Purchase Order",
    who: "Buyer / Purchase Manager",
    icon: FileSignature,
    ring: "bg-indigo-500",
    what: "Buyer raises the PO to the supplier; the Purchase Manager approves the spend. The PO is the formal order.",
    action: 'Click "Convert to PO", then manager sets Approval = Approved.',
    result: "Approved → Sent",
  },
  {
    title: "Gate Entry & inspection",
    who: "Gate → QC → Store",
    icon: PackageCheck,
    ring: "bg-emerald-500",
    what: "When goods arrive they are logged at the gate as a separate Gate Entry document, which runs a sequential, permission-gated timeline: each stage owner fills their part and clicks “Complete & forward”. After Store inspection passes, the gate entry is CLEARED.",
    action: 'On the PO click "Receive (Gate Entry)"; then each stage owner completes & forwards (Gate → QC → Store).',
    result: "Gate Entry → QC → Store → Cleared",
    sub: [
      "Gate Entry — security records arrival, vehicle/challan, items, gate inspection (Gate Entry · Stage 1)",
      "QC Inspection — purchase/quality signs off (Gate Entry · QC Inspection)",
      "Store Inspection — store verifies + confirms quantities, then clears (Gate Entry · Store Inspection)",
    ],
  },
  {
    title: "Create the GRN & post stock",
    who: "Store Incharge",
    icon: PackageCheck,
    ring: "bg-teal-500",
    what: "Once a gate entry is CLEARED, the store incharge creates the GRN from it — pulling supplier / warehouse / items — and posts the received quantities into store inventory. Creating the GRN consumes the gate entry.",
    action: 'On the cleared Gate Entry click "Create GRN", review, save, then "Post to inventory".',
    result: "Create GRN → Stock Posted",
  },
  {
    title: "Pay the supplier",
    who: "Accounts",
    icon: Banknote,
    ring: "bg-fuchsia-500",
    what: "Accounts raises a payment against the PO/GRN invoice (or directly from the PO for an advance). Moving it on — Approve / Hold / Reject / Mark paid — needs the Approve Payment Request permission.",
    action: 'Click "Raise Payment" on the GRN (or on the PO).',
    result: "Requested → Approved → Paid",
  },
];

const FLOW = ["Requisition", "Sourcing", "Purchase Order", "Gate Entry", "Goods Receipt", "Payment"];

const ROLES: Array<{ name: string; can: string }> = [
  { name: "Requester (any employee)", can: "Raise and track their own requisitions." },
  { name: "Approver", can: "Approve / reject purchase requisitions." },
  { name: "Buyer (Process Purchase)", can: "Raise RFQs, create & convert POs, manage suppliers, edit/delete docs." },
  { name: "Purchase Manager", can: "Approve purchase orders (authorise the spend)." },
  { name: "Gate / Security (Gate Entry · Stage 1)", can: "Log the gate inward: arrival, vehicle/challan, items, gate inspection, then forward." },
  { name: "QC Inspector (Gate Entry · QC)", can: "Run the purchase/quality inspection on a forwarded gate entry, then forward." },
  { name: "Store Incharge (Store Inspection + Create GRN + Post)", can: "Store inspection + clear; then create the GRN from the cleared gate entry and post to inventory." },
  { name: "Accounts", can: "Raise payment requests; approving / paying needs Approve Payment Request." },
];

export function WorkflowGuide() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* Floating help button, pinned to the bottom-right corner. */}
        <Button
          size="lg"
          className="fixed bottom-6 right-6 z-50 h-12 rounded-full shadow-lg gap-2 px-5"
          aria-label="How it works"
        >
          <HelpCircle className="h-5 w-5" />
          <span className="hidden sm:inline">How it works</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" /> Purchase Workflow — step by step
          </DialogTitle>
          <DialogDescription>
            Follow the process from raising a request to paying the supplier. What you can <em>do</em> depends on your
            role (legend at the bottom).
          </DialogDescription>
        </DialogHeader>

        {/* Quick horizontal overview */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/40 p-2.5">
          {FLOW.map((f, i) => (
            <span key={f} className="flex items-center gap-1.5">
              <span className="text-xs font-medium rounded-md bg-background border px-2 py-1">{f}</span>
              {i < FLOW.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </span>
          ))}
        </div>

        {/* Vertical timeline / flowchart */}
        <ol className="relative mt-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const last = i === STEPS.length - 1;
            return (
              <li key={s.title} className="relative flex gap-4 pb-7 last:pb-0">
                {/* connector line to the next node */}
                {!last && <span className="absolute left-4 top-9 bottom-0 w-0.5 -translate-x-1/2 bg-border" />}
                {/* node */}
                <span
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow ${s.ring}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {/* content */}
                <div className="min-w-0 flex-1 -mt-0.5 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">Step {i + 1}</span>
                    <span className="font-medium">{s.title}</span>
                    <Badge variant="secondary" className="text-[10px]">{s.who}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{s.what}</p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Action: </span>
                    {s.action}
                  </p>
                  {s.sub && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {s.sub.map((g, j, arr) => (
                        <span key={g} className="flex items-center gap-1.5">
                          <span className="rounded bg-muted px-2 py-0.5 text-[11px]">{g}</span>
                          {j < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <ArrowDown className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline" className="text-[10px] font-normal">{s.result}</Badge>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <Separator />

        {/* Roles legend */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Who does what
          </h3>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {ROLES.map((r) => (
              <div key={r.name} className="text-sm">
                <dt className="font-medium">{r.name}</dt>
                <dd className="text-muted-foreground">{r.can}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Buttons you don&apos;t have permission for are hidden, and pages you can&apos;t access don&apos;t appear in
            the menu. Ask an admin to grant a role on the Approvals &amp; Permissions page.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
