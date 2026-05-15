'use client';

/**
 * Employee leave page — balance overview, calendar view, apply form, my requests.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  CalendarDays,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Clock,
  MessageSquare,
  Info,
  LogOut,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  LeaveCalendar,
  LeaveCalendarLegend,
  type CalendarHoliday,
  type CalendarLeave,
  dateToYmd,
} from '@/components/leave/leave-calendar';
import { LeaveDateRangePicker } from '@/components/leave/leave-date-range-picker';

type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
type Duration = 'FULL_DAY' | 'HALF_DAY_FIRST' | 'HALF_DAY_SECOND';
type ShortenStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface BalanceRow {
  leaveType: { id: string; name: string; code: string; category: string; color: string | null };
  year: number;
  allocated: number;
  carriedForward: number;
  used: number;
  pending: number;
  available: number;
  isPaid: boolean;
  minNoticeDays: number | null;
  maxConsecutiveDays: number | null;
  requiresApproval: boolean;
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
  isEmergency: boolean;
  originalEndDate: string | null;
  shortenRequestedEndDate: string | null;
  shortenRequestedReason: string | null;
  shortenStatus: ShortenStatus | null;
  shortenDecisionNote: string | null;
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

// Returns "YYYY-MM-DD" first and last day of the given month (anchorDate).
function monthBounds(anchor: Date) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  return { from: dateToYmd(first), to: dateToYmd(last) };
}

export default function LeavePage() {
  const { toast } = useToast();

  const [balances, setBalances] = useState<BalanceRow[] | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  // Calendar state — month being viewed + the month's calendar data.
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [calendarData, setCalendarData] = useState<{
    weeklyOffDays: number[];
    holidays: CalendarHoliday[];
    leaves: CalendarLeave[];
  }>({ weeklyOffDays: [0], holidays: [], leaves: [] });

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { from, to } = monthBounds(calendarMonth);
      const [bRes, rRes, cRes] = await Promise.all([
        fetch('/api/leaves/balance', { cache: 'no-store', credentials: 'include' }),
        fetch('/api/leaves?limit=200', { cache: 'no-store', credentials: 'include' }),
        fetch(`/api/leaves/calendar?from=${from}&to=${to}&scope=mine`, {
          cache: 'no-store',
          credentials: 'include',
        }),
      ]);
      const bJson = await bRes.json();
      const rJson = await rRes.json();
      const cJson = await cRes.json();
      if (bJson.success) setBalances(bJson.balances ?? []);
      if (rJson.success) setRequests(rJson.requests ?? []);
      if (cJson.success) {
        setCalendarData({
          weeklyOffDays: cJson.weeklyOffDays ?? [0],
          holidays: cJson.holidays ?? [],
          leaves: (cJson.leaves ?? []).map((l: any) => ({
            ...l,
            leaveType: l.leaveType?.name ?? null,
          })),
        });
      }
    } catch {
      toast({ title: 'Failed to load leave data', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast, calendarMonth]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const today = todayStr();
  const upcoming = useMemo(
    () =>
      (requests ?? []).filter(
        (r) => r.endDate >= today && (r.status === 'PENDING' || r.status === 'APPROVED'),
      ),
    [requests, today],
  );
  const past = useMemo(
    () =>
      (requests ?? []).filter(
        (r) => r.endDate < today || r.status === 'CANCELLED' || r.status === 'REJECTED',
      ),
    [requests, today],
  );

  // Used by the Apply form to flag overlap; covers a wide window so picking
  // a date 6 months out still detects an existing leave there.
  const allMyActiveLeaves = useMemo<CalendarLeave[]>(
    () =>
      (requests ?? [])
        .filter((r) => r.status === 'PENDING' || r.status === 'APPROVED')
        .map((r) => ({
          id: r.id,
          startDate: r.startDate,
          endDate: r.endDate,
          status: r.status,
          duration: r.duration,
        })),
    [requests],
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <CalendarDays className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            <span className="truncate">My Leaves</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Apply, track balance, and view your leave history.
          </p>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh"
            className="shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setApplyOpen(true)} className="flex-1 sm:flex-none">
            <Plus className="h-4 w-4 mr-2" />
            Apply Leave
          </Button>
        </div>
      </div>

      {/* Balance cards */}
      {loading ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {balances?.map((b) => {
            const total = b.allocated + b.carriedForward;
            const pct = total > 0 ? Math.min(100, ((b.used + b.pending) / total) * 100) : 0;
            const accent = b.leaveType.color || '#94a3b8';
            const low = total > 0 && b.available <= total * 0.2;
            return (
              <Card
                key={b.leaveType.id}
                className="relative overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* color stripe */}
                <span
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ backgroundColor: accent }}
                  aria-hidden
                />
                <CardHeader className="pb-2 pl-5">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between gap-2">
                    <span className="truncate">{b.leaveType.name}</span>
                    {b.isPaid ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] shrink-0 px-1.5 py-0 h-5"
                      >
                        Paid
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0 px-1.5 py-0 h-5"
                      >
                        Unpaid
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pl-5 space-y-2">
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-3xl font-bold tabular-nums leading-none ${low ? 'text-destructive' : ''}`}
                    >
                      {b.available.toFixed(b.available % 1 === 0 ? 0 : 1)}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      / {total.toFixed(0)}
                    </span>
                  </div>
                  <Progress value={pct} className="h-1" />
                  <div className="text-[11px] text-muted-foreground flex justify-between tabular-nums">
                    <span>Used {b.used.toFixed(1)}</span>
                    {b.pending > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        Pending {b.pending.toFixed(1)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="calendar">
        <TabsList className="w-full sm:w-auto overflow-x-auto justify-start sm:justify-center">
          <TabsTrigger value="calendar" className="flex-1 sm:flex-none">Calendar</TabsTrigger>
          <TabsTrigger value="upcoming" className="flex-1 sm:flex-none">
            <span className="sm:hidden">Up</span>
            <span className="hidden sm:inline">Upcoming</span>
            <span className="ml-1">({upcoming.length})</span>
          </TabsTrigger>
          <TabsTrigger value="past" className="flex-1 sm:flex-none">
            Past ({past.length})
          </TabsTrigger>
          <TabsTrigger value="all" className="flex-1 sm:flex-none">
            All ({requests?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <CalendarTab
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            data={calendarData}
            loading={loading}
          />
        </TabsContent>

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
        holidays={calendarData.holidays}
        weeklyOffDays={calendarData.weeklyOffDays}
        existingLeaves={allMyActiveLeaves}
        onApplied={() => {
          setApplyOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar tab
// ─────────────────────────────────────────────────────────────────────────────

function CalendarTab({
  month,
  onMonthChange,
  data,
  loading,
}: {
  month: Date;
  onMonthChange: (m: Date) => void;
  data: { weeklyOffDays: number[]; holidays: CalendarHoliday[]; leaves: CalendarLeave[] };
  loading: boolean;
}) {
  const monthLabel = month.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const prev = () => {
    const n = new Date(month);
    n.setMonth(n.getMonth() - 1);
    onMonthChange(n);
  };
  const next = () => {
    const n = new Date(month);
    n.setMonth(n.getMonth() + 1);
    onMonthChange(n);
  };

  // Day-list summary for this month.
  const monthEvents = useMemo(() => {
    const events: Array<{ date: string; label: string; kind: 'HOLIDAY' | 'LEAVE' }> = [];
    for (const h of data.holidays) {
      events.push({ date: h.date, label: h.name, kind: 'HOLIDAY' });
    }
    for (const l of data.leaves) {
      events.push({
        date: l.startDate,
        label: `${l.status} • ${l.leaveType ?? 'Leave'}${
          l.startDate !== l.endDate ? ` (${l.startDate} → ${l.endDate})` : ''
        }`,
        kind: 'LEAVE',
      });
    }
    return events.sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">{monthLabel}</CardTitle>
          <div className="flex items-center justify-between sm:justify-end gap-2">
            <LeaveCalendarLegend className="gap-2" />
            <div className="flex shrink-0">
              <Button size="icon" variant="outline" onClick={prev} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={next}
                className="ml-1"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-72" />
        ) : (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-[auto_1fr]">
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <LeaveCalendar
                month={month}
                onMonthChange={onMonthChange}
                holidays={data.holidays}
                weeklyOffDays={data.weeklyOffDays}
                leaves={data.leaves}
              />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="text-sm font-medium mb-2">Events this month</div>
              {monthEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No holidays or leaves in {monthLabel}.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {monthEvents.map((e, i) => (
                    <li key={`${e.date}-${i}`} className="flex items-start gap-2">
                      <Badge
                        variant={e.kind === 'HOLIDAY' ? 'destructive' : 'secondary'}
                        className="text-[10px] mt-0.5 shrink-0"
                      >
                        {e.kind}
                      </Badge>
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-muted-foreground">{e.date}</div>
                        <div className="break-words">{e.label}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
  const [shortenTarget, setShortenTarget] = useState<LeaveRequest | null>(null);
  const [shortenDate, setShortenDate] = useState('');
  const [shortenReason, setShortenReason] = useState('');
  const today = todayStr();

  const typeName = (id: string) =>
    balances.find((b) => b.leaveType.id === id)?.leaveType.name ?? '—';

  const openShorten = (r: LeaveRequest) => {
    setShortenTarget(r);
    // Default to today if it falls inside the leave; otherwise to the day
    // before the current end so we never propose an end date outside [start,
    // end-1].
    const t = todayStr();
    const defaultDate =
      t >= r.startDate && t < r.endDate
        ? t
        : (() => {
            const [y, m, d] = r.endDate.split('-').map(Number);
            const prev = new Date(y, m - 1, d - 1);
            return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
          })();
    setShortenDate(defaultDate);
    setShortenReason('');
  };

  const closeShorten = () => {
    setShortenTarget(null);
    setShortenDate('');
    setShortenReason('');
  };

  const submitShorten = async () => {
    if (!shortenTarget) return;
    if (!shortenDate) {
      toast({ title: 'Pick a new end date', variant: 'destructive' });
      return;
    }
    setBusyId(shortenTarget.id);
    try {
      const res = await fetch(`/api/leaves/${shortenTarget.id}/shorten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newEndDate: shortenDate, reason: shortenReason || null }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed to request early return');
      toast({
        title: 'Early-return requested',
        description: 'Your approver will review the request.',
      });
      closeShorten();
      onChanged();
    } catch (e: any) {
      toast({
        title: 'Could not request early return',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

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
        {/* Mobile: card list — tables don't fit on phones without horizontal scroll. */}
        <ul className="divide-y md:hidden">
          {requests.map((r) => {
            const cancellable =
              r.status === 'PENDING' || (r.status === 'APPROVED' && r.startDate > today);
            // Early-return is only meaningful while the leave hasn't fully
            // ended (so a return-earlier-than-end still saves at least one
            // day) and only on APPROVED requests with no in-flight shorten.
            const shortenable =
              r.status === 'APPROVED' &&
              r.endDate > today &&
              r.shortenStatus !== 'PENDING';
            return (
              <li key={r.id} className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium truncate flex items-center gap-1.5">
                    {typeName(r.leaveTypeId)}
                    {r.isEmergency && (
                      <Badge
                        variant="destructive"
                        className="text-[9px] px-1.5 py-0 h-4 shrink-0"
                      >
                        Emergency
                      </Badge>
                    )}
                  </div>
                  <Badge variant={STATUS_VARIANT[r.status]} className="shrink-0">
                    {r.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {r.startDate}
                  {r.startDate !== r.endDate ? ` → ${r.endDate}` : ''} · {r.totalDays.toFixed(1)}{' '}
                  day{r.totalDays === 1 ? '' : 's'} · {durationLabel(r.duration)}
                </div>
                {r.reason && (
                  <div className="text-xs text-muted-foreground line-clamp-2">{r.reason}</div>
                )}
                {r.shortenStatus === 'PENDING' && r.shortenRequestedEndDate && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Early-return pending — new end:{' '}
                    <span className="font-medium tabular-nums">{r.shortenRequestedEndDate}</span>
                  </div>
                )}
                {r.shortenStatus === 'REJECTED' && (
                  <div className="text-xs text-muted-foreground">
                    Early-return rejected{r.shortenDecisionNote ? ` · ${r.shortenDecisionNote}` : ''}
                  </div>
                )}
                {r.originalEndDate && r.originalEndDate !== r.endDate && (
                  <div className="text-xs text-muted-foreground">
                    Shortened from <span className="line-through">{r.originalEndDate}</span> →{' '}
                    {r.endDate}
                  </div>
                )}
                {(cancellable || shortenable) && (
                  <div className="pt-1 flex gap-2 flex-wrap">
                    {shortenable && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() => openShorten(r)}
                        className="h-8"
                      >
                        <LogOut className="h-3 w-3 mr-1" /> Early return
                      </Button>
                    )}
                    {cancellable && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() => cancel(r.id)}
                        className="h-8"
                      >
                        <X className="h-3 w-3 mr-1" /> Cancel
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Tablet+: table view. */}
        <div className="hidden md:block overflow-x-auto">
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
                const shortenable =
                  r.status === 'APPROVED' &&
                  r.endDate > today &&
                  r.shortenStatus !== 'PENDING';
                return (
                  <tr key={r.id} className="border-b hover:bg-muted/40">
                    <td className="p-3 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span>{typeName(r.leaveTypeId)}</span>
                        {r.isEmergency && (
                          <Badge
                            variant="destructive"
                            className="text-[9px] px-1.5 py-0 h-4 shrink-0"
                          >
                            Emergency
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-sm tabular-nums">
                      {r.startDate}
                      {r.startDate !== r.endDate ? ` → ${r.endDate}` : ''}
                      {r.originalEndDate && r.originalEndDate !== r.endDate && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          shortened from <span className="line-through">{r.originalEndDate}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-sm tabular-nums">{r.totalDays.toFixed(1)}</td>
                    <td className="p-3 text-sm">{durationLabel(r.duration)}</td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                      {r.shortenStatus === 'PENDING' && r.shortenRequestedEndDate && (
                        <div className="text-[11px] text-amber-700 mt-1">
                          Early-return pending → {r.shortenRequestedEndDate}
                        </div>
                      )}
                      {r.shortenStatus === 'REJECTED' && (
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Early-return rejected
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-sm max-w-[300px] truncate" title={r.reason ?? ''}>
                      {r.reason || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {shortenable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === r.id}
                          onClick={() => openShorten(r)}
                        >
                          <LogOut className="h-3 w-3 mr-1" /> Early return
                        </Button>
                      )}
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

      {/* Early-return dialog — appears when an APPROVED leave's "Early return"
          button is clicked. Date input is bounded to (startDate, endDate-1)
          so the user can't pick a date that doesn't actually shorten the
          leave. */}
      <Dialog open={!!shortenTarget} onOpenChange={(o) => !o && closeShorten()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request early return</DialogTitle>
            <DialogDescription>
              Submit a request to end this leave earlier. Your approver will
              decide; on approval, the unused days will be returned to your
              balance.
            </DialogDescription>
          </DialogHeader>
          {shortenTarget && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
                Current leave:{' '}
                <span className="font-medium tabular-nums">
                  {shortenTarget.startDate} → {shortenTarget.endDate}
                </span>{' '}
                · {shortenTarget.totalDays.toFixed(1)} day
                {shortenTarget.totalDays === 1 ? '' : 's'}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shorten-date" className="text-xs">
                  New end date
                </Label>
                <Input
                  id="shorten-date"
                  type="date"
                  value={shortenDate}
                  onChange={(e) => setShortenDate(e.target.value)}
                  min={shortenTarget.startDate}
                  max={(() => {
                    // endDate - 1, so the picked date is strictly before
                    // the original end.
                    const [y, m, d] = shortenTarget.endDate.split('-').map(Number);
                    const prev = new Date(y, m - 1, d - 1);
                    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
                  })()}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shorten-reason" className="text-xs">
                  Reason (optional)
                </Label>
                <Textarea
                  id="shorten-reason"
                  value={shortenReason}
                  onChange={(e) => setShortenReason(e.target.value)}
                  placeholder="e.g. recovered early and ready to come back"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeShorten} disabled={busyId !== null}>
              Cancel
            </Button>
            <Button onClick={submitShorten} disabled={busyId !== null || !shortenDate}>
              {busyId !== null ? 'Submitting…' : 'Submit request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function durationLabel(d: Duration) {
  return d === 'FULL_DAY' ? 'Full Day' : d === 'HALF_DAY_FIRST' ? '½ (1st half)' : '½ (2nd half)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply form — uses the date-range picker with overlap detection.
// ─────────────────────────────────────────────────────────────────────────────

function ApplyLeaveSheet({
  open,
  onOpenChange,
  balances,
  holidays,
  weeklyOffDays,
  existingLeaves,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  balances: BalanceRow[];
  holidays: CalendarHoliday[];
  weeklyOffDays: number[];
  existingLeaves: CalendarLeave[];
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [range, setRange] = useState<{ startDate: string | null; endDate: string | null }>({
    startDate: null,
    endDate: null,
  });
  const [duration, setDuration] = useState<Duration>('FULL_DAY');
  const [reason, setReason] = useState('');
  // Emergency leave: bypasses the leave type's minNoticeDays so today's date
  // becomes eligible. Past dates remain disabled regardless.
  const [isEmergency, setIsEmergency] = useState(false);

  // Reset on open so a fresh form appears each time.
  useEffect(() => {
    if (open) {
      setLeaveTypeId(balances[0]?.leaveType.id ?? '');
      setRange({ startDate: null, endDate: null });
      setDuration('FULL_DAY');
      setReason('');
      setIsEmergency(false);
    }
  }, [open, balances]);

  // If user picks half-day, lock to single date.
  useEffect(() => {
    if (duration !== 'FULL_DAY' && range.startDate) {
      if (range.endDate !== range.startDate) {
        setRange((r) => ({ startDate: r.startDate, endDate: r.startDate }));
      }
    }
  }, [duration, range.startDate, range.endDate]);

  const balance = balances.find((b) => b.leaveType.id === leaveTypeId);
  const ruleMinNoticeDays = balance?.minNoticeDays ?? 0;
  // Emergency leaves bypass the notice rule but the picker still floors to
  // today so users can't backdate.
  const minNoticeDays = isEmergency ? 0 : ruleMinNoticeDays;
  const maxConsecutiveDays = balance?.maxConsecutiveDays ?? null;

  // Whenever the user switches leave type, drop a previously-picked range if
  // it now violates the new type's notice period — avoids the "I picked it,
  // why is it rejected?" loop. Skipped in emergency mode since the picker is
  // already unrestricted.
  useEffect(() => {
    if (!range.startDate || !minNoticeDays) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const earliest = new Date(today);
    earliest.setDate(earliest.getDate() + minNoticeDays);
    const [y, m, d] = range.startDate.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    if (start < earliest) setRange({ startDate: null, endDate: null });
  }, [leaveTypeId, minNoticeDays, range.startDate]);

  // Overlap check repeated client-side so the submit button reflects state.
  // endDate can be null when the user has only picked a start date — treat
  // that as a single-day request for the overlap math.
  const hasOverlap = useMemo(() => {
    if (!range.startDate) return false;
    const effectiveEnd = range.endDate ?? range.startDate;
    return existingLeaves.some(
      (l) =>
        (l.status === 'PENDING' || l.status === 'APPROVED') &&
        l.startDate <= effectiveEnd &&
        l.endDate >= range.startDate!,
    );
  }, [range, existingLeaves]);

  // Calendar-day span — used to enforce maxConsecutiveDays before submit.
  const spanDays = useMemo(() => {
    if (!range.startDate) return 0;
    const end = range.endDate ?? range.startDate;
    const [sy, sm, sd] = range.startDate.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const ms = new Date(ey, em - 1, ed).getTime() - new Date(sy, sm - 1, sd).getTime();
    return Math.floor(ms / 86400000) + 1;
  }, [range]);

  const exceedsMax =
    duration === 'FULL_DAY' && maxConsecutiveDays != null && spanDays > maxConsecutiveDays;

  const submit = async () => {
    if (!leaveTypeId) {
      toast({ title: 'Pick a leave type', variant: 'destructive' });
      return;
    }
    if (!range.startDate) {
      toast({ title: 'Pick a date', variant: 'destructive' });
      return;
    }
    if (hasOverlap) {
      toast({ title: 'Range overlaps an existing leave', variant: 'destructive' });
      return;
    }
    if (exceedsMax) {
      toast({
        title: `Max ${maxConsecutiveDays} consecutive days`,
        description: `Selected range is ${spanDays} day(s).`,
        variant: 'destructive',
      });
      return;
    }
    // If only a start date was picked, treat as a single-day request.
    const startDate = range.startDate;
    const endDate = range.endDate ?? range.startDate;
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
          isEmergency,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Apply failed');
      toast({ title: 'Leave applied', description: 'Waiting for approval.' });
      onApplied();
    } catch (e: any) {
      toast({
        title: 'Could not apply',
        description: e?.message || 'Server rejected the request.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const ruleHints: string[] = [];
  if (balance) {
    if (minNoticeDays > 0)
      ruleHints.push(`${minNoticeDays} day${minNoticeDays === 1 ? '' : 's'} advance notice`);
    if (maxConsecutiveDays != null)
      ruleHints.push(`max ${maxConsecutiveDays} consecutive days`);
    if (!balance.requiresApproval) ruleHints.push('auto-approved');
  }

  // Live summary — only renders when both dates are picked.
  const reqDays = useMemo(() => {
    if (!range.startDate) return 0;
    if (duration !== 'FULL_DAY') return 0.5;
    const end = range.endDate ?? range.startDate;
    const offSet = new Set(weeklyOffDays);
    const holidaySet = new Set(holidays.filter((h) => !h.isOptional).map((h) => h.date));
    const [sy, sm, sd] = range.startDate.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const cur = new Date(sy, sm - 1, sd);
    const last = new Date(ey, em - 1, ed);
    let count = 0;
    while (cur <= last) {
      const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      if (!offSet.has(cur.getDay()) && !holidaySet.has(ymd)) count += 1;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }, [range, duration, weeklyOffDays, holidays]);

  const formatYmd = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col p-0 gap-0"
      >
        <SheetHeader className="px-5 py-4 border-b shrink-0 space-y-1 text-left">
          <SheetTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Apply for Leave
          </SheetTitle>
          <SheetDescription className="text-xs">
            Submit a leave request. Approvers will be notified.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 flex-1 overflow-y-auto px-5 py-5">
          {/* Leave Type */}
          <div className="space-y-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              Leave Type
            </Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {balances.map((b) => (
                  <SelectItem key={b.leaveType.id} value={b.leaveType.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: b.leaveType.color || '#94a3b8' }}
                      />
                      {b.leaveType.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {balance && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs space-y-1.5">
                <div className="font-medium">
                  {balance.isPaid ? 'Paid leave' : 'Unpaid (LOP)'}
                </div>
                {ruleHints.length > 0 && (
                  <div className="text-muted-foreground flex items-start gap-1.5">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{ruleHints.join(' · ')}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Emergency toggle — bypasses the leave type's minNoticeDays rule
              so today's date becomes selectable. Visible only when the chosen
              type actually has a notice requirement, otherwise it's a no-op. */}
          {ruleMinNoticeDays > 0 && (
            <div
              className={`rounded-lg border p-3 transition-colors ${
                isEmergency
                  ? 'border-destructive/50 bg-destructive/5'
                  : 'bg-muted/20'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <AlertCircle
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isEmergency ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    />
                    Emergency leave
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {isEmergency
                      ? `Skipping the ${ruleMinNoticeDays}-day notice rule. You can pick today.`
                      : `Normally requires ${ruleMinNoticeDays} day${
                          ruleMinNoticeDays === 1 ? '' : 's'
                        } notice. Turn on if it's urgent.`}
                  </p>
                </div>
                <Switch
                  checked={isEmergency}
                  onCheckedChange={(v) => {
                    setIsEmergency(v);
                    // Drop a previously-picked future date so the user can
                    // re-pick today now that the floor moved.
                    if (v) setRange({ startDate: null, endDate: null });
                  }}
                  aria-label="Emergency leave"
                  className="shrink-0 mt-0.5"
                />
              </div>
            </div>
          )}

          {/* Duration as segmented control on mobile */}
          <div className="space-y-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Duration
            </Label>
            <div className="grid grid-cols-3 gap-1 rounded-md border p-1 bg-muted/20">
              {(
                [
                  ['FULL_DAY', 'Full'],
                  ['HALF_DAY_FIRST', '½ AM'],
                  ['HALF_DAY_SECOND', '½ PM'],
                ] as const
              ).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDuration(val)}
                  className={`h-9 text-xs font-medium rounded-sm transition-colors ${
                    duration === val
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="space-y-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {duration === 'FULL_DAY' ? 'Dates' : 'Date'}
            </Label>
            <LeaveDateRangePicker
              value={range}
              onChange={setRange}
              holidays={holidays}
              weeklyOffDays={weeklyOffDays}
              existingLeaves={existingLeaves}
              singleDateOnly={duration !== 'FULL_DAY'}
              minNoticeDays={minNoticeDays}
              placeholder={duration === 'FULL_DAY' ? 'Pick start and end' : 'Pick a date'}
            />
            {minNoticeDays > 0 ? (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Earliest start: {minNoticeDays} day{minNoticeDays === 1 ? '' : 's'} from today.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Today is the earliest you can pick — past dates are disabled.
              </p>
            )}
            {exceedsMax && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Max {maxConsecutiveDays} consecutive days allowed — you picked {spanDays}.
              </p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Reason
              <span className="ml-auto font-normal text-muted-foreground/70 lowercase">
                {reason.length}/2000
              </span>
            </Label>
            <Textarea
              placeholder="Why are you taking this leave?"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 2000))}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Live request preview */}
          {range.startDate && balance && (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
                Request Preview
                {isEmergency && (
                  <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                    Emergency
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium truncate">{balance.leaveType.name}</span>
                <span className="tabular-nums shrink-0">
                  {reqDays.toFixed(1)} day{reqDays === 1 ? '' : 's'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatYmd(range.startDate)}
                {range.endDate && range.endDate !== range.startDate
                  ? ` → ${formatYmd(range.endDate)}`
                  : duration !== 'FULL_DAY'
                    ? ` · ${duration === 'HALF_DAY_FIRST' ? 'first half' : 'second half'}`
                    : ''}
              </div>
            </div>
          )}
        </div>
        <SheetFooter className="px-5 py-3 border-t shrink-0 flex-row gap-2 sm:gap-2 bg-background">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="flex-1 h-11"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || hasOverlap || exceedsMax || !range.startDate || !leaveTypeId}
            className="flex-1 h-11"
          >
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
