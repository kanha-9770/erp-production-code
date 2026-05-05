'use client';

/**
 * Employee leave page — balance overview, apply form, my requests.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CalendarDays, Plus, RefreshCw, AlertCircle, CheckCircle2, X, FileText } from 'lucide-react';

type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
type Duration = 'FULL_DAY' | 'HALF_DAY_FIRST' | 'HALF_DAY_SECOND';

interface BalanceRow {
  leaveType: { id: string; name: string; code: string; category: string; color: string | null };
  year: number;
  allocated: number;
  carriedForward: number;
  used: number;
  pending: number;
  available: number;
  isPaid: boolean;
}

interface LeaveRequest {
  id: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  duration: Duration;
  totalDays: number;
  reason: string | null;
  status: LeaveStatus;
  appliedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  cancelReason: string | null;
}

const STATUS_VARIANT: Record<LeaveStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  APPROVED: 'default',
  REJECTED: 'destructive',
  CANCELLED: 'outline',
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function LeavePage() {
  const { toast } = useToast();

  const [balances, setBalances] = useState<BalanceRow[] | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [bRes, rRes] = await Promise.all([
        fetch('/api/leaves/balance', { cache: 'no-store', credentials: 'include' }),
        fetch('/api/leaves?limit=200', { cache: 'no-store', credentials: 'include' }),
      ]);
      const bJson = await bRes.json();
      const rJson = await rRes.json();
      if (bJson.success) setBalances(bJson.balances ?? []);
      if (rJson.success) setRequests(rJson.requests ?? []);
    } catch (e) {
      toast({ title: 'Failed to load leave data', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const today = todayStr();
  const upcoming = useMemo(
    () => (requests ?? []).filter((r) => r.endDate >= today && (r.status === 'PENDING' || r.status === 'APPROVED')),
    [requests, today],
  );
  const past = useMemo(
    () => (requests ?? []).filter((r) => r.endDate < today || r.status === 'CANCELLED' || r.status === 'REJECTED'),
    [requests, today],
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <CalendarDays className="h-8 w-8 text-primary" />
            My Leaves
          </h1>
          <p className="text-muted-foreground mt-1">
            Apply, track balance, and view your leave history.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setApplyOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Apply Leave
          </Button>
        </div>
      </div>

      {/* Balance cards */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : balances && balances.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No leave types are configured yet.</p>
            <p className="text-sm mt-1">Ask your admin to set up leave types.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {balances?.map((b) => {
            const total = b.allocated + b.carriedForward;
            const pct = total > 0 ? Math.min(100, ((b.used + b.pending) / total) * 100) : 0;
            return (
              <Card key={b.leaveType.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span>{b.leaveType.name}</span>
                    {b.isPaid ? (
                      <Badge variant="secondary" className="text-xs">Paid</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Unpaid</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {b.available.toFixed(1)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}/ {total.toFixed(0)}
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5 mt-2" />
                  <div className="text-xs text-muted-foreground mt-2 flex justify-between">
                    <span>Used: {b.used.toFixed(1)}</span>
                    <span>Pending: {b.pending.toFixed(1)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Requests */}
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          <TabsTrigger value="all">All ({requests?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          <RequestTable
            requests={upcoming}
            balances={balances ?? []}
            onChanged={refresh}
            loading={loading}
            emptyHint="You have no upcoming leaves. Click Apply Leave to request one."
          />
        </TabsContent>
        <TabsContent value="past">
          <RequestTable
            requests={past}
            balances={balances ?? []}
            onChanged={refresh}
            loading={loading}
            emptyHint="No past leave records."
          />
        </TabsContent>
        <TabsContent value="all">
          <RequestTable
            requests={requests ?? []}
            balances={balances ?? []}
            onChanged={refresh}
            loading={loading}
            emptyHint="No leave records yet."
          />
        </TabsContent>
      </Tabs>

      <ApplyLeaveSheet
        open={applyOpen}
        onOpenChange={setApplyOpen}
        balances={balances ?? []}
        onApplied={() => {
          setApplyOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Request table
// ─────────────────────────────────────────────────────────────────────────────

function RequestTable({
  requests,
  balances,
  onChanged,
  loading,
  emptyHint,
}: {
  requests: LeaveRequest[];
  balances: BalanceRow[];
  onChanged: () => void;
  loading: boolean;
  emptyHint: string;
}) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = todayStr();

  const typeName = (id: string) => balances.find((b) => b.leaveType.id === id)?.leaveType.name ?? '—';

  const cancel = async (id: string) => {
    if (!confirm('Cancel this leave request?')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/leaves/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Cancel failed');
      toast({ title: 'Leave cancelled' });
      onChanged();
    } catch (e: any) {
      toast({ title: 'Could not cancel', description: e?.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          {emptyHint}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Dates</th>
                <th className="text-left p-3">Days</th>
                <th className="text-left p-3">Duration</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Reason</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const cancellable =
                  r.status === 'PENDING' ||
                  (r.status === 'APPROVED' && r.startDate > today);
                return (
                  <tr key={r.id} className="border-b hover:bg-muted/40">
                    <td className="p-3 font-medium">{typeName(r.leaveTypeId)}</td>
                    <td className="p-3 text-sm">
                      {r.startDate}
                      {r.startDate !== r.endDate ? ` → ${r.endDate}` : ''}
                    </td>
                    <td className="p-3 text-sm">{r.totalDays.toFixed(1)}</td>
                    <td className="p-3 text-sm">{durationLabel(r.duration)}</td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                    </td>
                    <td className="p-3 text-sm max-w-[300px] truncate" title={r.reason ?? ''}>
                      {r.reason || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-right">
                      {cancellable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === r.id}
                          onClick={() => cancel(r.id)}
                        >
                          <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function durationLabel(d: Duration) {
  return d === 'FULL_DAY' ? 'Full Day' : d === 'HALF_DAY_FIRST' ? '½ (1st half)' : '½ (2nd half)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply form
// ─────────────────────────────────────────────────────────────────────────────

function ApplyLeaveSheet({
  open,
  onOpenChange,
  balances,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  balances: BalanceRow[];
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [duration, setDuration] = useState<Duration>('FULL_DAY');
  const [reason, setReason] = useState('');

  // Reset on open so a fresh form appears each time.
  useEffect(() => {
    if (open) {
      setLeaveTypeId(balances[0]?.leaveType.id ?? '');
      setStartDate('');
      setEndDate('');
      setDuration('FULL_DAY');
      setReason('');
    }
  }, [open, balances]);

  // If user picks a half-day, force endDate=startDate.
  useEffect(() => {
    if (duration !== 'FULL_DAY') {
      setEndDate(startDate);
    }
  }, [duration, startDate]);

  const balance = balances.find((b) => b.leaveType.id === leaveTypeId);

  const submit = async () => {
    if (!leaveTypeId) {
      toast({ title: 'Pick a leave type', variant: 'destructive' });
      return;
    }
    if (!startDate || !endDate) {
      toast({ title: 'Pick start and end date', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          leaveTypeId,
          startDate,
          endDate,
          duration,
          reason: reason || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Apply failed');
      toast({
        title: 'Leave applied',
        description: 'Waiting for approval.',
      });
      onApplied();
    } catch (e: any) {
      toast({
        title: 'Could not apply',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Apply for Leave</SheetTitle>
          <SheetDescription>
            Submit a leave request. Approvers will be notified.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 flex-1 overflow-y-auto py-4">
          <div className="space-y-2">
            <Label>Leave Type</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {balances.map((b) => (
                  <SelectItem key={b.leaveType.id} value={b.leaveType.id}>
                    {b.leaveType.name} — {b.available.toFixed(1)} available
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {balance && (
              <p className="text-xs text-muted-foreground">
                {balance.isPaid
                  ? `Paid leave • ${balance.available.toFixed(1)} of ${(balance.allocated + balance.carriedForward).toFixed(0)} remaining`
                  : 'Unpaid leave — counts as loss-of-pay in payroll.'}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Duration</Label>
            <Select value={duration} onValueChange={(v) => setDuration(v as Duration)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL_DAY">Full Day</SelectItem>
                <SelectItem value="HALF_DAY_FIRST">Half Day — First Half</SelectItem>
                <SelectItem value="HALF_DAY_SECOND">Half Day — Second Half</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={duration !== 'FULL_DAY'}
                min={startDate || undefined}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              placeholder="Why are you taking this leave?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Submit
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
