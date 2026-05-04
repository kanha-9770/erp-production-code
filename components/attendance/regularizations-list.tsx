"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
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
  RefreshCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CircleSlash,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateLong, formatTimeShort } from "./attendance-format";

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
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "mine" | "all")}>
        <TabsList>
          <TabsTrigger value="mine">My requests ({data.mine.length})</TabsTrigger>
          {canApprove && (
            <TabsTrigger value="all">
              Pending review ({pendingCount})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="mine" className="mt-3">
          <RegList
            rows={data.mine}
            mine
            onCancel={cancelOwn}
            loading={loading}
          />
        </TabsContent>
        {canApprove && (
          <TabsContent value="all" className="mt-3">
            <RegList
              rows={data.all}
              mine={false}
              onApprove={(id) => setReviewing({ id, action: "approve" })}
              onReject={(id) => setReviewing({ id, action: "reject" })}
              loading={loading}
            />
          </TabsContent>
        )}
      </Tabs>

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
            <div className="text-sm text-gray-600">
              {reviewing?.action === "approve"
                ? "Approving will write the requested values to the Attendance row immediately. Audit log + workflow rules will fire."
                : "Rejection is final. The requester can submit a new one if needed."}
            </div>
            <Label htmlFor="review-note" className="text-xs text-gray-600">
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
    </div>
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

function RegList({ rows, mine, loading, onCancel, onApprove, onReject }: RegListProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-gray-500">
          {mine
            ? "You haven't submitted any regularizations."
            : "Nothing pending review. New requests will appear here."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
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
                  <div className="text-sm">{r.user?.name ?? r.user?.email}</div>
                  {r.user?.name && r.user?.email && (
                    <div className="text-[11px] text-gray-500">
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
                  <div className="text-[11px] text-gray-500 mt-1">
                    by {r.reviewedBy.name}
                  </div>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs tabular-nums">
                <div>in: {formatTimeShort(r.currentCheckInAt)}</div>
                <div>out: {formatTimeShort(r.currentCheckOutAt)}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs tabular-nums">
                <div className="text-emerald-700">
                  in: {formatTimeShort(r.requestedCheckInAt)}
                </div>
                <div className="text-emerald-700">
                  out: {formatTimeShort(r.requestedCheckOutAt)}
                </div>
              </TableCell>
              <TableCell className="text-xs text-gray-700 max-w-xs">
                <div className="line-clamp-3 whitespace-pre-line">
                  {r.reason}
                </div>
                {r.reviewNote && (
                  <div className="mt-2 rounded bg-gray-50 px-2 py-1 text-[11px] text-gray-600">
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
                      className="text-red-700 border-red-200 hover:bg-red-50"
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
