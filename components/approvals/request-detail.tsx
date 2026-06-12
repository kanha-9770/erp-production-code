"use client";

/**
 * Module-aware approval request detail (right sheet): record snapshot + proposed
 * changes, ordered stages, action timeline, and the viewer's actions
 * (approve/reject with comment, recall, reapply).
 */

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Check, CircleDot, Clock, Loader2, RotateCcw, Undo2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useDecideApprovalRequestMutation,
  useGetApprovalRequestQuery,
  useRecallApprovalRequestMutation,
  useResubmitApprovalMutation,
} from "@/lib/api/approvals";
import { moduleFields, type ApprovalModule } from "./module-schema";

const STATUS_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
  RECALLED: "secondary",
};
const ACTION_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  SUBMITTED: CircleDot,
  APPROVED: Check,
  REJECTED: X,
  RECALLED: Undo2,
  RESUBMITTED: RotateCcw,
};

export function RequestDetailSheet({
  requestId,
  open,
  onOpenChange,
}: {
  requestId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { data, isFetching } = useGetApprovalRequestQuery(requestId!, { skip: !requestId });
  const [decide, { isLoading: deciding }] = useDecideApprovalRequestMutation();
  const [recall, { isLoading: recalling }] = useRecallApprovalRequestMutation();
  const [resubmit, { isLoading: resubmitting }] = useResubmitApprovalMutation();
  const [comment, setComment] = useState("");

  const req = data?.request;
  const caps = data?.capabilities;
  const busy = deciding || recalling || resubmitting;

  const act = async (decision: "APPROVE" | "REJECT") => {
    if (!requestId) return;
    if (decision === "REJECT" && !comment.trim())
      return toast({ variant: "destructive", title: "Add a reason", description: "A comment is required to reject." });
    try {
      await decide({ id: requestId, decision, comment: comment.trim() || undefined }).unwrap();
      toast({ title: decision === "APPROVE" ? "Approved" : "Rejected" });
      setComment("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not record decision", description: e?.data?.error });
    }
  };
  const doRecall = async () => {
    if (!requestId) return;
    try {
      await recall({ id: requestId, comment: comment.trim() || undefined }).unwrap();
      toast({ title: "Request recalled" });
      setComment("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not recall", description: e?.data?.error });
    }
  };
  const doResubmit = async () => {
    if (!req) return;
    try {
      const res: any = await resubmit({ module: req.module, recordId: req.recordId }).unwrap();
      toast({ title: res?.data?.resubmitted ? "Resubmitted for approval" : "No matching process — record is live" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not resubmit", description: e?.data?.error });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            {req?.processName ?? "Approval Request"}
            {req && <Badge variant={STATUS_BADGE[req.status]}>{req.status}</Badge>}
          </SheetTitle>
          <SheetDescription>
            {req ? `${req.trigger === "EDIT" ? "Edit" : "New record"} • requested by ${req.requestedByName}` : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {isFetching && !data ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : data && req ? (
            <>
              <RecordSnapshot
                module={req.module as ApprovalModule}
                record={data.record}
                pendingPatch={data.pendingPatch}
              />

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approval stages</h4>
                <div className="space-y-1.5">
                  {data.stages.map((s) => {
                    const state =
                      req.status === "PENDING"
                        ? s.index < req.currentStage
                          ? "done"
                          : s.index === req.currentStage
                            ? "current"
                            : "upcoming"
                        : req.status === "APPROVED"
                          ? "done"
                          : "upcoming";
                    return (
                      <div key={s.index} className="flex items-start gap-2 text-sm">
                        <span className={state === "done" ? "text-primary" : state === "current" ? "text-amber-600" : "text-muted-foreground"}>
                          {state === "done" ? <Check className="h-4 w-4 mt-0.5" /> : <CircleDot className="h-4 w-4 mt-0.5" />}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium">
                            {s.name}{" "}
                            <span className="text-xs font-normal text-muted-foreground">
                              ({s.mode === "ALL" ? "all must approve" : "any one"})
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {s.approvers.map((a) => (
                              <Badge key={`${a.kind}-${a.id}`} variant="outline" className="text-[10px] font-normal">
                                {a.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h4>
                <ol className="space-y-3">
                  {data.actions.map((a) => {
                    const Icon = ACTION_ICON[a.type] ?? Clock;
                    return (
                      <li key={a.id} className="flex gap-2.5 text-sm">
                        <span className="mt-0.5 h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div>
                            <span className="font-medium">{a.actorName}</span>{" "}
                            <span className="text-muted-foreground">{a.type.toLowerCase()}</span>
                          </div>
                          {a.comment && <div className="text-muted-foreground">“{a.comment}”</div>}
                          <div className="text-[11px] text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-muted-foreground">Request not found.</div>
          )}
        </div>

        {data && (caps?.canAct || caps?.canRecall || caps?.canResubmit) && (
          <div className="border-t px-6 py-4 space-y-3">
            {(caps?.canAct || caps?.canRecall) && (
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={caps?.canAct ? "Add a comment (required to reject)…" : "Reason (optional)…"}
                rows={2}
              />
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              {caps?.canResubmit && (
                <Button variant="outline" onClick={doResubmit} disabled={busy} className="gap-1.5">
                  {resubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Reapply
                </Button>
              )}
              {caps?.canRecall && (
                <Button variant="outline" onClick={doRecall} disabled={busy} className="gap-1.5">
                  {recalling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                  Recall
                </Button>
              )}
              {caps?.canAct && (
                <>
                  <Button variant="outline" className="gap-1.5 text-destructive border-destructive/40" onClick={() => act("REJECT")} disabled={busy}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                  <Button className="gap-1.5" onClick={() => act("APPROVE")} disabled={busy}>
                    {deciding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Approve
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RecordSnapshot({
  module,
  record,
  pendingPatch,
}: {
  module: ApprovalModule;
  record: { id: string; submodule: string; data: Record<string, unknown> } | null;
  pendingPatch: Record<string, unknown> | null;
}) {
  if (!record) return <div className="text-sm text-muted-foreground">The record no longer exists.</div>;
  const fields = moduleFields(module, record.submodule);
  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  const shown = fields.filter((f) => f.type !== "image" && f.type !== "media" && f.type !== "textarea" && f.type !== "lineItems");

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Record</h4>
      <div className="rounded-lg border divide-y">
        {shown.map((f) => {
          const v = record.data[f.key];
          if (v == null || v === "" || typeof v === "object") return null;
          return (
            <div key={f.key} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-medium text-right truncate">{String(v)}</span>
            </div>
          );
        })}
      </div>

      {pendingPatch && Object.keys(pendingPatch).length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-600">Proposed changes</h4>
          <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 divide-y">
            {Object.entries(pendingPatch).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">{labelOf(k)}</span>
                <span className="font-medium text-right truncate">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
