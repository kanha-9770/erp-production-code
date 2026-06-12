"use client";

/**
 * Gate-entry receiving-workflow timeline. Renders the sequential stage chain
 * (Gate Entry → QC Inspection → Store Inspection → Cleared) as a vertical
 * stepper showing which stage is done / current / pending, plus an activity log
 * of who acted and when (from the server-written `data._workflow.history`).
 */

import { Check, Circle, Dot, Lock, CheckCircle2, PackageCheck, XCircle, CornerUpLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GATE_ENTRY_STAGES,
  GE_S_CLEARED,
  gateEntryStageIndex,
  gateEntryIsCleared,
  gateEntryIsConsumed,
  gateEntryIsRejected,
  readGateEntryWorkflow,
  type GateEntryWorkflowEvent,
} from "@/lib/purchase-system/gate-entry-workflow";
import type { PurchaseRecord } from "@/lib/purchase-system/types";

type NodeState = "done" | "current" | "pending";

function fmt(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

const ACTION_LABEL: Record<GateEntryWorkflowEvent["action"], string> = {
  CREATED: "started the gate entry",
  COMPLETED: "completed",
  REJECTED: "rejected",
  SENT_BACK: "sent back",
  GRN_CREATED: "raised the GRN",
};

export function GateEntryWorkflowTimeline({ record }: { record: PurchaseRecord | null }) {
  const status = String(record?.status ?? GATE_ENTRY_STAGES[0].key);
  const rejected = gateEntryIsRejected(status);
  const consumed = gateEntryIsConsumed(status); // a GRN has been raised
  const cleared = gateEntryIsCleared(status) || consumed;
  const currentIdx = gateEntryStageIndex(status);
  const history = readGateEntryWorkflow(record as Record<string, unknown> | null).history;

  // The actor + time that completed (forwarded out of) a given stage.
  const completedBy = (stageKey: string): GateEntryWorkflowEvent | undefined =>
    [...history].reverse().find((e) => e.fromStatus === stageKey && (e.action === "COMPLETED" || e.action === "SENT_BACK"));
  const clearedEvent = [...history].reverse().find((e) => e.toStatus === GE_S_CLEARED);
  const grnEvent = [...history].reverse().find((e) => e.action === "GRN_CREATED");

  // Stage nodes + the terminal "Cleared / GRN" node.
  const nodes: Array<{ key: string; label: string; blurb: string; state: NodeState; meta?: GateEntryWorkflowEvent }> = [];
  for (let i = 0; i < GATE_ENTRY_STAGES.length; i++) {
    const s = GATE_ENTRY_STAGES[i];
    let state: NodeState = "pending";
    if (rejected) state = i < currentIdx ? "done" : currentIdx === i ? "current" : "pending";
    else if (cleared) state = "done";
    else if (currentIdx < 0) state = "pending";
    else if (i < currentIdx) state = "done";
    else if (i === currentIdx) state = "current";
    nodes.push({ key: s.key, label: s.label, blurb: s.blurb, state, meta: completedBy(s.key) });
  }
  nodes.push({
    key: GE_S_CLEARED,
    label: consumed ? "GRN Created" : "Create GRN",
    blurb: consumed
      ? "A GRN has been raised from this gate entry and posted to store."
      : "Store incharge raises the GRN from the cleared gate entry.",
    state: consumed ? "done" : cleared ? "current" : "pending",
    meta: grnEvent ?? clearedEvent,
  });

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Receiving workflow
        </h3>
        {rejected ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <XCircle className="h-3.5 w-3.5" /> Rejected
          </span>
        ) : consumed ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <PackageCheck className="h-3.5 w-3.5" /> GRN created
          </span>
        ) : cleared ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Cleared
          </span>
        ) : null}
      </div>

      <ol className="space-y-0">
        {nodes.map((n, i) => {
          const last = i === nodes.length - 1;
          const isFinal = n.key === GE_S_CLEARED;
          return (
            <li key={n.key} className="flex gap-3">
              {/* rail */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] shrink-0",
                    n.state === "done" && "border-emerald-500 bg-emerald-500 text-white",
                    n.state === "current" && "border-primary bg-primary/10 text-primary",
                    n.state === "pending" && "border-muted-foreground/30 text-muted-foreground/50",
                  )}
                >
                  {n.state === "done" ? (
                    isFinal ? <PackageCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />
                  ) : n.state === "current" ? (
                    <Dot className="h-5 w-5" />
                  ) : isFinal ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <Circle className="h-2.5 w-2.5" />
                  )}
                </span>
                {!last && (
                  <span
                    className={cn(
                      "w-px flex-1 my-1",
                      n.state === "done" ? "bg-emerald-500/60" : "bg-muted-foreground/20",
                    )}
                  />
                )}
              </div>
              {/* body */}
              <div className={cn("pb-4 min-w-0", last && "pb-0")}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      n.state === "pending" && "text-muted-foreground",
                    )}
                  >
                    {n.label}
                  </span>
                  {n.state === "current" && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                      {isFinal ? "Ready" : "Current"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{n.blurb}</p>
                {n.state === "done" && n.meta && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {n.meta.action === "SENT_BACK" ? "Sent back by" : n.meta.action === "GRN_CREATED" ? "Raised by" : "Completed by"}{" "}
                    <span className="font-medium text-foreground/80">{n.meta.byName}</span>
                    {n.meta.at ? ` · ${fmt(n.meta.at)}` : ""}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {history.length > 0 && (
        <div className="space-y-1.5 border-t pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Activity
          </p>
          <ul className="space-y-1">
            {[...history].reverse().map((e, i) => (
              <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                {e.action === "REJECTED" ? (
                  <XCircle className="h-3 w-3 mt-0.5 text-destructive shrink-0" />
                ) : e.action === "SENT_BACK" ? (
                  <CornerUpLeft className="h-3 w-3 mt-0.5 shrink-0" />
                ) : (
                  <Check className="h-3 w-3 mt-0.5 text-emerald-600 shrink-0" />
                )}
                <span>
                  <span className="font-medium text-foreground/80">{e.byName}</span>{" "}
                  {ACTION_LABEL[e.action]}
                  {e.label && e.action !== "CREATED" && e.action !== "GRN_CREATED" ? ` ${e.label}` : ""}
                  {e.at ? ` · ${fmt(e.at)}` : ""}
                  {e.note ? ` — “${e.note}”` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
