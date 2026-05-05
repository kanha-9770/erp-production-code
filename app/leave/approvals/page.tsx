'use client';

/**
 * Approver inbox — pending leave requests in the org awaiting decision.
 * Visible only to admins / approvers; non-approvers get a 403-style screen.
 */

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle, Inbox, RefreshCw, Clock, Mail, Building2, ShieldAlert } from 'lucide-react';

type Duration = 'FULL_DAY' | 'HALF_DAY_FIRST' | 'HALF_DAY_SECOND';

interface PendingRequest {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  duration: Duration;
  totalDays: number;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  appliedAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    department: string | null;
    avatar: string | null;
  } | null;
  leaveType: { id: string; name: string; code: string; color: string | null } | null;
}

export default function ApprovalsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<PendingRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [rejectFor, setRejectFor] = useState<PendingRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/leaves?status=PENDING&withDetails=1', {
        cache: 'no-store',
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        setRequests([]);
        return;
      }
      const j = await res.json();
      if (j.success) setRequests(j.requests ?? []);
    } catch {
      toast({ title: 'Failed to load approvals', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const decide = async (id: string, decision: 'APPROVED' | 'REJECTED', note?: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/leaves/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, note: note ?? null }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast({
        title: decision === 'APPROVED' ? 'Leave approved' : 'Leave rejected',
      });
      // Optimistic remove from the list
      setRequests((prev) => (prev ?? []).filter((r) => r.id !== id));
      setRejectFor(null);
      setRejectNote('');
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  if (forbidden) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium">Approver access required</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ask an admin to add you to the attendance-approver role pool, or visit{' '}
              <a className="underline" href="/leave">My Leaves</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Inbox className="h-8 w-8 text-primary" />
            Leave Approvals
          </h1>
          <p className="text-muted-foreground mt-1">
            Pending leave requests from your team.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (requests ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
            <p className="text-lg font-medium">Inbox zero</p>
            <p className="text-sm">No pending leave requests.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests!.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {r.user?.firstName || r.user?.lastName
                        ? `${r.user?.firstName ?? ''} ${r.user?.lastName ?? ''}`.trim()
                        : r.user?.email ?? 'Unknown user'}
                      <Badge variant="outline" className="text-xs">
                        {r.leaveType?.name ?? '—'}
                      </Badge>
                    </CardTitle>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {r.user?.email ?? '—'}
                      </span>
                      {r.user?.department && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {r.user.department}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(r.appliedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.id}
                      onClick={() => {
                        setRejectFor(r);
                        setRejectNote('');
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-1 text-destructive" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={busyId === r.id}
                      onClick={() => decide(r.id, 'APPROVED')}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Start</div>
                    <div className="font-medium">{r.startDate}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">End</div>
                    <div className="font-medium">{r.endDate}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Days</div>
                    <div className="font-medium">{r.totalDays.toFixed(1)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Duration</div>
                    <div className="font-medium">
                      {r.duration === 'FULL_DAY'
                        ? 'Full Day'
                        : r.duration === 'HALF_DAY_FIRST'
                          ? '½ — 1st half'
                          : '½ — 2nd half'}
                    </div>
                  </div>
                </div>
                {r.reason && (
                  <div className="mt-3 p-3 bg-muted/50 rounded text-sm">
                    <div className="text-xs text-muted-foreground mb-1">Reason</div>
                    {r.reason}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!rejectFor} onOpenChange={(v) => !v && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject leave request</DialogTitle>
            <DialogDescription>
              Optionally tell {rejectFor?.user?.firstName || rejectFor?.user?.email || 'the applicant'} why.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. Coverage conflict — please reschedule."
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectFor(null)}>
              Back
            </Button>
            <Button
              variant="destructive"
              disabled={busyId === rejectFor?.id}
              onClick={() => rejectFor && decide(rejectFor.id, 'REJECTED', rejectNote || undefined)}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
