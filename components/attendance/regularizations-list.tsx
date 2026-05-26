"use client";

/**
 * Attendance Regularizations — request a correction to a missed or wrong
 * punch (employee tab) and approve/reject the queue (approver tab).
 *
 * Uses the same WorkspaceShell + WorkspaceHeader chrome as My Attendance /
 * My Leave so the three sit visually flush. The list pane hosts the
 * employee/approver tab switcher, the records table, and the inline empty/
 * loading states; the review-decision dialog stays as an overlay.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CircleSlash,
  Edit3,
  Inbox,
  FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateLong, formatTimeShort } from "./attendance-format";
import {
  WorkspaceShell,
  WorkspaceHeader,
} from "@/components/real-estate/workspace";

interface Regularization {
  id: string;
  date: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reason: string;
  currentCheckInAt: string | null;
  currentCheckOutAt: string | null;
  requestedCheckInAt: string | null;
  requestedCheckOutAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
  requestedBy: { name: string; email: string } | null;
  reviewedBy: { name: string; email: string } | null;
}

interface ListResponse {
  success: boolean;
  scope: "mine" | "all";
  isAdmin: boolean;
  // canApprove covers both org admins and users assigned an approver role
  // configured on AttendanceConfiguration.attendanceApproverRoleIds. The
  // regularizations queue is gated on this, not on isAdmin alone.
  canApprove: boolean;
  regularizations: Regularization[];
  error?: string;
}

const STATUS_CLASS: Record<Regularization["status"], string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-red-100 text-red-700 border-red-200",
  CANCELLED: "bg-gray-100 text-gray-700 border-gray-200",
};

export function RegularizationsList() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [data, setData] = useState<{
    mine: Regularization[];
    all: Regularization[];
  }>({ mine: [], all: [] });
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{
    id: string;
    action: "approve" | "reject";
  } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchScope = useCallback(async (scope: "mine" | "all") => {
    const res = await fetch(`/api/attendance/regularize?scope=${scope}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) throw new Error("Not authenticated");
    const json = (await res.json()) as ListResponse;
    if (!res.ok || !json?.success) {
      throw new Error(json?.error ?? "Failed to load");
    }
    return json;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mine = await fetchScope("mine");
      // canApprove covers both admins and configured approver roles. The
      // server falls back to canApprove=false when the property is absent.
      const approver = !!(mine as any).canApprove || mine.isAdmin;
      setCanApprove(approver);
      const next = { mine: mine.regularizations, all: [] as Regularization[] };
      if (approver) {
        const all = await fetchScope("all");
        next.all = all.regularizations;
      }
      setData(next);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [fetchScope]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submitReview = useCallback(async () => {
    if (!reviewing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/attendance/regularize/${reviewing.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: reviewing.action,
          note: reviewNote.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed");
      }
      toast({
        title:
          reviewing.action === "approve"
            ? "Regularization approved"
            : "Regularization rejected",
      });
      setReviewing(null);
      setReviewNote("");
      refresh();
    } catch (e: any) {
      toast({
        title: "Could not save",
        description: e?.message ?? "Try again",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [reviewing, reviewNote, refresh, toast]);

  const cancelOwn = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/attendance/regularize/${id}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          throw new Error(json?.error ?? "Failed");
        }
        toast({ title: "Request cancelled" });
        refresh();
      } catch (e: any) {
        toast({
          title: "Cancel failed",
          description: e?.message ?? "Try again",
          variant: "destructive",
        });
      }
    },
    [refresh, toast],
  );

  const pendingCount = useMemo(
    () => data.all.filter((r) => r.status === "PENDING").length,
    [data.all],
  );

  return (
    <>
      <WorkspaceShell
        scope="attendance-regularizations"
        selectedId={null}
        onCloseSelection={() => {}}
        header={
          <WorkspaceHeader
            icon={<Edit3 className="h-5 w-5" />}
            title="Regularizations"
            subtitle={
              canApprove
                ? `${data.mine.length} yours · ${pendingCount} pending review`
                : `${data.mine.length} request${data.mine.length === 1 ? "" : "s"}`
            }
          >
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={loading}
                title="Refresh"
                className="h-8 px-2 shrink-0"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 sm:mr-1 ${loading ? "animate-spin" : ""}`}
                />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </WorkspaceHeader>
        }
        list={
          <div className="flex flex-col h-full bg-muted/10">
            <div className="p-3 sm:p-4 pb-2 space-y-3">
              {/* Helper strip — describes the feature in one sentence so
                  first-time users know what they're looking at without
                  reading the docs. */}
              <div className="rounded-md border bg-background/60 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
                Request a correction to a missed or wrong punch. Approvers
                review; on approval the change is written to the Attendance
                row and the audit log + workflow rules fire.
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as "mine" | "all")}
              >
                <TabsList className="h-8">
                  <TabsTrigger value="mine" className="text-xs">
                    My requests ({data.mine.length})
                  </TabsTrigger>
                  {canApprove && (
                    <TabsTrigger value="all" className="text-xs">
                      Pending review ({pendingCount})
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            </div>

            <div className="flex-1 min-h-0 px-3 sm:px-4 pb-4">
              <div className="h-full bg-background border rounded-xl shadow-sm overflow-hidden flex flex-col">
                {tab === "mine" ? (
                  <RegList
                    rows={data.mine}
                    mine
                    onCancel={cancelOwn}
                    loading={loading}
                  />
                ) : canApprove ? (
                  <RegList
                    rows={data.all}
                    mine={false}
                    onApprove={(id) =>
                      setReviewing({ id, action: "approve" })
                    }
                    onReject={(id) =>
                      setReviewing({ id, action: "reject" })
                    }
                    loading={loading}
                  />
                ) : null}
              </div>
            </div>
          </div>
        }
        preview={null}
      />

      <Dialog
        open={!!reviewing}
        onOpenChange={(o) => {
          if (!o) {
            setReviewing(null);
            setReviewNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewing?.action === "approve"
                ? "Approve regularization"
                : "Reject regularization"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground leading-relaxed">
              {reviewing?.action === "approve"
                ? "Approving will write the requested values to the Attendance row immediately. Audit log + workflow rules will fire."
                : "Rejection is final. The requester can submit a new one if needed."}
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="review-note"
                className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Note (optional, visible to requester)
              </Label>
              <Textarea
                id="review-note"
                value={reviewNote}
                maxLength={2000}
                onChange={(e) => setReviewNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReviewing(null);
                setReviewNote("");
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={submitReview}
              disabled={busy}
              className={
                reviewing?.action === "reject"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : ""
              }
            >
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {reviewing?.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface RegListProps {
  rows: Regularization[];
  mine: boolean;
  loading: boolean;
  onCancel?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

function RegList({
  rows,
  mine,
  loading,
  onCancel,
  onApprove,
  onReject,
}: RegListProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        {mine ? (
          <>
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              You haven&apos;t submitted any regularizations.
            </p>
            <p className="text-xs mt-1 text-muted-foreground/80">
              Open a record in My Attendance and click &quot;Request
              correction&quot; to start one.
            </p>
          </>
        ) : (
          <>
            <Inbox className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nothing pending review.</p>
            <p className="text-xs mt-1 text-muted-foreground/80">
              New requests will appear here.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            {!mine && <TableHead>Employee</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead>Current</TableHead>
            <TableHead>Requested</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="align-top">
              <TableCell className="whitespace-nowrap font-medium">
                {formatDateLong(r.date)}
              </TableCell>
              {!mine && (
                <TableCell>
                  <div className="text-sm">
                    {r.user?.name ?? r.user?.email}
                  </div>
                  {r.user?.name && r.user?.email && (
                    <div className="text-[11px] text-muted-foreground">
                      {r.user.email}
                    </div>
                  )}
                </TableCell>
              )}
              <TableCell>
                <Badge variant="outline" className={STATUS_CLASS[r.status]}>
                  {r.status.toLowerCase()}
                </Badge>
                {r.reviewedBy && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    by {r.reviewedBy.name}
                  </div>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs tabular-nums">
                <div>in: {formatTimeShort(r.currentCheckInAt)}</div>
                <div>out: {formatTimeShort(r.currentCheckOutAt)}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs tabular-nums">
                <div className="text-emerald-700 dark:text-emerald-400">
                  in: {formatTimeShort(r.requestedCheckInAt)}
                </div>
                <div className="text-emerald-700 dark:text-emerald-400">
                  out: {formatTimeShort(r.requestedCheckOutAt)}
                </div>
              </TableCell>
              <TableCell className="text-xs max-w-xs">
                <div className="line-clamp-3 whitespace-pre-line">
                  {r.reason}
                </div>
                {r.reviewNote && (
                  <div className="mt-2 rounded bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                    Review: {r.reviewNote}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {mine && r.status === "PENDING" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCancel?.(r.id)}
                  >
                    <CircleSlash className="h-3.5 w-3.5 mr-1" />
                    Cancel
                  </Button>
                )}
                {!mine && r.status === "PENDING" && (
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-700 border-red-200 hover:bg-red-50 dark:text-red-300 dark:border-red-900/60 dark:hover:bg-red-950/40"
                      onClick={() => onReject?.(r.id)}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => onApprove?.(r.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Approve
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
