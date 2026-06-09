"use client";

/**
 * "How it works" — an always-visible, ungated workflow guide for the Purchase
 * module. Any employee can open it to learn the procure-to-pay process, who is
 * responsible at each stage, and how goods flow into inventory. Rendered in the
 * ModuleNav so it appears on every purchase page.
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
import { HelpCircle, ArrowRight, PackageCheck, ShieldCheck } from "lucide-react";

const FLOW = ["Requisition", "Sourcing", "Purchase Order", "Goods Receipt", "Payment"];

const STEPS: Array<{
  n: number;
  title: string;
  who: string;
  whoTone: string;
  what: string;
  action: string;
  result: string;
}> = [
  {
    n: 1,
    title: "Raise a Requisition (PR)",
    who: "Any employee",
    whoTone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    what: "You need something — a laptop, raw material, a service. Raise a requisition describing the item, quantity and priority. It auto-records your name and department.",
    action: 'Click "New requisition".',
    result: "Status → PR Raised",
  },
  {
    n: 2,
    title: "Approve the Requisition",
    who: "Approver",
    whoTone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    what: "The department/approver reviews the request and approves or rejects it. Only an Approver can set this.",
    action: "Open the PR → Edit → set Production Approval = Approved.",
    result: "Status → Approved",
  },
  {
    n: 3,
    title: "Source / get quotes (RFQ)",
    who: "Buyer",
    whoTone: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    what: "For new items the buyer requests quotations from suppliers and selects the best one. Repeat items can skip straight to a PO.",
    action: 'On the PR click "Raise RFQ" (or "Convert to PO" for repeat buys).',
    result: "Status → Sourcing → Selected",
  },
  {
    n: 4,
    title: "Create & approve the Purchase Order",
    who: "Buyer / Purchase Manager",
    whoTone: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    what: "The buyer raises the PO to the chosen supplier; the Purchase Manager approves the spend. The PO is the formal order.",
    action: 'Click "Convert to PO", then the manager sets Approval = Approved.',
    result: "Status → Approved → Sent",
  },
  {
    n: 5,
    title: "Receive the goods (GRN)",
    who: "Store Keeper",
    whoTone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    what: "When goods arrive, the store records a Goods Receipt: gate entry, inspection, and the received quantity per invoice. Then posts it to inventory, which raises stock.",
    action: 'On the PO click "Receive (GRN)", complete it, then "Post to inventory".',
    result: "Status → Received → Stock Updated",
  },
  {
    n: 6,
    title: "Pay the supplier",
    who: "Accounts",
    whoTone: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
    what: "Accounts raises a payment request against the PO/GRN invoice. A payment can also be raised directly from the PO for an advance.",
    action: 'Click "Raise Payment" on the GRN (or on the PO for an advance).',
    result: "Status → Requested → Paid",
  },
];

const ROLES: Array<{ name: string; can: string }> = [
  { name: "Requester (any employee)", can: "Raise and track their own requisitions." },
  { name: "Approver", can: "Approve / reject purchase requisitions." },
  { name: "Buyer (Process Purchase)", can: "Raise RFQs, create & convert POs, manage suppliers, edit/delete documents." },
  { name: "Purchase Manager", can: "Approve purchase orders (authorise the spend)." },
  { name: "Store Keeper", can: "Receive GRNs, post goods to inventory, manage stock movements." },
  { name: "Accounts", can: "Raise and process payment requests." },
];

export function WorkflowGuide() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">How it works</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" /> Purchase Workflow — how it works
          </DialogTitle>
          <DialogDescription>
            From raising a request to paying the supplier — and how received goods become stock. Everyone can read this;
            what you can <em>do</em> depends on your role (see the bottom).
          </DialogDescription>
        </DialogHeader>

        {/* Flow strip */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/40 p-3">
          {FLOW.map((f, i) => (
            <span key={f} className="flex items-center gap-1.5">
              <span className="text-xs font-medium rounded-md bg-background border px-2 py-1">{f}</span>
              {i < FLOW.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </span>
          ))}
        </div>

        {/* Steps */}
        <ol className="space-y-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                {s.n}
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.title}</span>
                  <Badge variant="outline" className={s.whoTone + " border-transparent"}>{s.who}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{s.what}</p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Action: </span>{s.action}{" "}
                  <span className="text-muted-foreground">· {s.result}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>

        <Separator />

        {/* GRN detail */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <PackageCheck className="h-4 w-4" /> Inside a Goods Receipt (GRN)
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {["Gate Entry", "Inspection", "Received", "Post to Inventory (stock ↑)", "Ready for Payment"].map((g, i, arr) => (
              <span key={g} className="flex items-center gap-1.5">
                <span className="rounded bg-muted px-2 py-1">{g}</span>
                {i < arr.length - 1 && <ArrowRight className="h-3 w-3" />}
              </span>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Posting is idempotent (it can't double-count) and only the Store Keeper can do it. Matching items increase in
            stock; brand-new items are auto-created in Store Inventory.
          </p>
        </div>

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
