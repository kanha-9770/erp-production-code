'use client';

/**
 * Approver inbox — pending leave requests in the org awaiting decision.
 * Visible to admins / approvers; non-approvers get a 403-style screen.
 *
 * Two views:
 *   • List      → traditional pending-request cards (default)
 *   • Calendar  → org-wide month grid showing every request (any status) so
 *                 approvers can spot conflicts (e.g. two engineers off the
 *                 same week) before approving a third.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2,
  XCircle,
  Inbox,
  RefreshCw,
  Clock,
  Mail,
  Building2,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  LogOut,
} from 'lucide-react';
import {
  LeaveCalendar,
  LeaveCalendarLegend,
  type CalendarHoliday,
  type CalendarLeave,
  dateToYmd,
} from '@/components/leave/leave-calendar';
import PageBackLink from '@/components/shared/page-back-link';

type Duration = 'FULL_DAY' | 'HALF_DAY_FIRST' | 'HALF_DAY_SECOND';
type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

// These APIs always return JSON. If we ever get HTML back (e.g. the dev server
// is mid hot-reload, or an upstream error page), parse safely and surface a
// clear message instead of crashing on "Unexpected token '<'".
async function parseJsonSafe(res: Response): Promise<any | null> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    (res as any).__rawText = text;
    return null;
  }
}
function jsonError(j: any, res: Response): string {
  if (j?.error) return j.error;
  const raw: string = (res as any).__rawText ?? '';
  if (raw.trimStart().startsWith('<')) {
    return 'Server is busy (it may be reloading) — please try again in a moment.';
  }
  return 'Action failed';
}

interface UserLite {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  department: string | null;
  avatar: string | null;
}

type ShortenStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface Request {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  duration: Duration;
  totalDays: number;
  reason: string | null;
  status: Status;
  appliedAt: string;
  user: UserLite | null;
  leaveType: { id: string; name: string; code: string; color: string | null } | null;
  originalEndDate: string | null;
  shortenRequestedEndDate: string | null;
  shortenRequestedReason: string | null;
  shortenStatus: ShortenStatus | null;
  shortenRequestedAt: string | null;
}

function monthBounds(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  return { from: dateToYmd(first), to: dateToYmd(last) };
}

export default function ApprovalsPage() {
  const { toast } = useToast();
  const [pending, setPending] = useState<Request[] | null>(null);
  // APPROVED leaves with `shortenStatus === 'PENDING'` — separate queue for
  // early-return requests so approvers can act on them without scrolling
  // through normal leave approvals.
  const [pendingShorten, setPendingShorten] = useState<Request[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  // Calendar view state — org-wide leaves for the visible month.
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [calendarData, setCalendarData] = useState<{
    weeklyOffDays: number[];
    holidays: CalendarHoliday[];
    leaves: Array<CalendarLeave & { user?: UserLite | null }>;
  }>({ weeklyOffDays: [0], holidays: [], leaves: [] });

  const [rejectFor, setRejectFor] = useState<Request | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { from, to } = monthBounds(calendarMonth);
      const [pendingRes, approvedRes, calRes] = await Promise.all([
        fetch('/api/leaves?status=PENDING&withDetails=1', {
          cache: 'no-store',
          credentials: 'include',
        }),
        // Pull APPROVED leaves so we can filter to ones with pending shorten
        // requests client-side. The list endpoint doesn't have a shorten
        // filter — adding one for this single screen wasn't worth a new query
        // param. APPROVED is a much smaller working set than the full list.
        fetch('/api/leaves?status=APPROVED&withDetails=1', {
          cache: 'no-store',
          credentials: 'include',
        }),
        fetch(
          `/api/leaves/calendar?scope=org&withDetails=1&from=${from}&to=${to}`,
          { cache: 'no-store', credentials: 'include' },
        ),
      ]);
      if (pendingRes.status === 401 || pendingRes.status === 403) {
        setForbidden(true);
        setPending([]);
        setPendingShorten([]);
        return;
      }
      const pj = await pendingRes.json();
      const aj = await approvedRes.json();
      const cj = await calRes.json();
      if (pj.success) setPending(pj.requests ?? []);
      if (aj.success) {
        const shortenQueue = (aj.requests ?? []).filter(
          (r: Request) => r.shortenStatus === 'PENDING',
        );
        setPendingShorten(shortenQueue);
      }
      if (cj.success) {
        setCalendarData({
          weeklyOffDays: cj.weeklyOffDays ?? [0],
          holidays: cj.holidays ?? [],
          leaves: (cj.leaves ?? []).map((l: any) => ({
            ...l,
            leaveType: l.leaveType?.name ?? null,
          })),
        });
      }
    } catch {
      toast({ title: 'Failed to load approvals', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast, calendarMonth]);

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
      const j = await parseJsonSafe(res);
      if (!res.ok || !j?.success) throw new Error(jsonError(j, res));
      toast({ title: decision === 'APPROVED' ? 'Leave approved' : 'Leave rejected' });
      // Optimistically remove from the pending list and refetch calendar so
      // the calendar reflects the new APPROVED/REJECTED state.
      setPending((prev) => (prev ?? []).filter((r) => r.id !== id));
      setRejectFor(null);
      setRejectNote('');
      refresh();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  // Approve or reject a pending early-return request. Mirrors `decide` —
  // optimistically drops the row from the queue and re-fetches so the
  // calendar's endDate reflects the new shortened range.
  const decideShorten = async (
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    note?: string,
  ) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/leaves/${id}/shorten/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, note: note ?? null }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok || !j?.success) throw new Error(jsonError(j, res));
      toast({
        title:
          decision === 'APPROVED'
            ? 'Early return approved'
            : 'Early return rejected',
      });
      setPendingShorten((prev) => (prev ?? []).filter((r) => r.id !== id));
      refresh();
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
              <a className="underline" href="/leave">
                My Leaves
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <PageBackLink href="/leave" label="Leave" />
          <h1 className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            Leave Approvals
          </h1>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={refresh}
          disabled={refreshing}
          className="h-8 w-8 shrink-0"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Tabs defaultValue="list">
        {/* Tabs render as an equal 3-column grid so labels fit on mobile
            without truncation ("Calendar" was being clipped to "Calenc"). */}
        <TabsList className="grid w-full grid-cols-3 h-8">
          <TabsTrigger value="list" className="text-xs gap-1 px-1.5">
            <Inbox className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Pending </span>
              <span className="sm:hidden">Pend </span>
              ({pending?.length ?? 0})
            </span>
          </TabsTrigger>
          <TabsTrigger value="early-returns" className="text-xs gap-1 px-1.5">
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Early Returns </span>
              <span className="sm:hidden">Early </span>
              ({pendingShorten?.length ?? 0})
            </span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="text-xs gap-1 px-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Calendar</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : (pending ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                <p className="text-lg font-medium">Inbox zero</p>
                <p className="text-sm">No pending leave requests.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pending!.map((r) => (
                <PendingCard
                  key={r.id}
                  request={r}
                  busy={busyId === r.id}
                  onApprove={() => decide(r.id, 'APPROVED')}
                  onRejectClick={() => {
                    setRejectFor(r);
                    setRejectNote('');
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="early-returns">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          ) : (pendingShorten ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                <p className="text-lg font-medium">No early-return requests</p>
                <p className="text-sm">
                  Employees can ask to end their approved leave earlier — those
                  requests will land here for review.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingShorten!.map((r) => (
                <ShortenCard
                  key={r.id}
                  request={r}
                  busy={busyId === r.id}
                  onApprove={() => decideShorten(r.id, 'APPROVED')}
                  onReject={() => decideShorten(r.id, 'REJECTED')}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <ApproverCalendar
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            data={calendarData}
            loading={loading}
            onApprove={(id) => decide(id, 'APPROVED')}
            onReject={(id) => {
              const target = (pending ?? []).find((r) => r.id === id);
              if (target) {
                setRejectFor(target);
                setRejectNote('');
              }
            }}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejectFor} onOpenChange={(v) => !v && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject leave request</DialogTitle>
            <DialogDescription>
              Optionally tell{' '}
              {rejectFor?.user?.firstName || rejectFor?.user?.email || 'the applicant'} why.
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

// ─────────────────────────────────────────────────────────────────────────────
// List view card
// ─────────────────────────────────────────────────────────────────────────────

function PendingCard({
  request,
  busy,
  onApprove,
  onRejectClick,
}: {
  request: Request;
  busy: boolean;
  onApprove: () => void;
  onRejectClick: () => void;
}) {
  const r = request;
  const displayName =
    r.user?.firstName || r.user?.lastName
      ? `${r.user?.firstName ?? ''} ${r.user?.lastName ?? ''}`.trim()
      : r.user?.email ?? 'Unknown user';
  const durationLabel =
    r.duration === 'FULL_DAY'
      ? 'Full Day'
      : r.duration === 'HALF_DAY_FIRST'
        ? '½ — 1st half'
        : '½ — 2nd half';
  return (
    <Card>
      <CardContent className="p-3 sm:p-4 space-y-2.5">
        {/* Identity row — name + leave-type badge, email/dept/applied
            date as a single muted line below. */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{displayName}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 h-4 shrink-0">
              {r.leaveType?.name ?? '—'}
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{r.user?.email ?? '—'}</span>
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

        {/* Date / duration grid — 4 columns even on mobile so the whole
            request fits on one line of stats below the identity row. */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <Stat label="Start" value={r.startDate} mono />
          <Stat label="End" value={r.endDate} mono />
          <Stat label="Days" value={r.totalDays.toFixed(1)} mono />
          <Stat label="Duration" value={durationLabel} />
        </div>

        {r.reason && (
          <div className="px-2.5 py-1.5 bg-muted/40 rounded text-xs">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1.5">
              Reason
            </span>
            {r.reason}
          </div>
        )}

        {/* Approve / Reject — primary actions sit at the bottom and span
            the full row on mobile so they're always easy to tap. */}
        <div className="flex gap-2 pt-0.5">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onRejectClick}
            className="h-8 flex-1"
          >
            <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
            Reject
          </Button>
          <Button size="sm" disabled={busy} onClick={onApprove} className="h-8 flex-1">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-[10px] uppercase tracking-wider leading-tight">
        {label}
      </div>
      <div
        className={`font-medium text-xs truncate ${mono ? 'tabular-nums font-mono' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar view — org-wide month grid + per-user leave list for the month.
// Highlights conflicts: rows ordered by user, dates color-coded by status.
// ─────────────────────────────────────────────────────────────────────────────

function ApproverCalendar({
  month,
  onMonthChange,
  data,
  loading,
  onApprove,
  onReject,
}: {
  month: Date;
  onMonthChange: (m: Date) => void;
  data: {
    weeklyOffDays: number[];
    holidays: CalendarHoliday[];
    leaves: Array<CalendarLeave & { user?: UserLite | null }>;
  };
  loading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [filterStatus, setFilterStatus] = useState<Status | 'ALL'>('ALL');
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

  const filteredLeaves = useMemo(
    () =>
      data.leaves.filter(
        (l) => filterStatus === 'ALL' || l.status === filterStatus,
      ),
    [data.leaves, filterStatus],
  );

  // Group leaves by user for the side panel.
  const byUser = useMemo(() => {
    const map = new Map<
      string,
      { user: UserLite | null; leaves: typeof filteredLeaves }
    >();
    for (const l of filteredLeaves) {
      const key = l.user?.id ?? 'unknown';
      const cur = map.get(key) ?? { user: l.user ?? null, leaves: [] };
      cur.leaves.push(l);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.user?.firstName ?? a.user?.email ?? '').localeCompare(
        b.user?.firstName ?? b.user?.email ?? '',
      ),
    );
  }, [filteredLeaves]);

  // Conflict detection: any date with 2+ APPROVED or PENDING leaves.
  const conflictDates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of data.leaves) {
      if (l.status !== 'APPROVED' && l.status !== 'PENDING') continue;
      // expand inclusive range
      const cur = new Date(l.startDate.split('-').map(Number) as any);
      const [sy, sm, sd] = l.startDate.split('-').map(Number);
      const [ey, em, ed] = l.endDate.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd);
      const end = new Date(ey, em - 1, ed);
      const it = new Date(start);
      while (it <= end) {
        const ymd = dateToYmd(it);
        counts.set(ymd, (counts.get(ymd) ?? 0) + 1);
        it.setDate(it.getDate() + 1);
      }
      void cur;
    }
    return new Set(Array.from(counts.entries()).filter(([, n]) => n >= 2).map(([d]) => d));
  }, [data.leaves]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base">{monthLabel}</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="PENDING">Pending only</SelectItem>
                <SelectItem value="APPROVED">Approved only</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <LeaveCalendarLegend />
            <div className="flex">
              <Button size="icon" variant="outline" onClick={prev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" onClick={next} className="ml-1">
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
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <div>
              <LeaveCalendar
                month={month}
                onMonthChange={onMonthChange}
                holidays={data.holidays}
                weeklyOffDays={data.weeklyOffDays}
                leaves={filteredLeaves}
              />
              {conflictDates.size > 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  ⚠ {conflictDates.size} date{conflictDates.size === 1 ? '' : 's'} with 2+
                  overlapping leaves
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium">Team leaves this month</div>
              {byUser.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No leaves match the current filter.
                </p>
              ) : (
                byUser.map((u) => (
                  <div
                    key={u.user?.id ?? 'unknown'}
                    className="border rounded-md p-3 space-y-2"
                  >
                    <div className="text-sm font-medium">
                      {u.user?.firstName || u.user?.lastName
                        ? `${u.user?.firstName ?? ''} ${u.user?.lastName ?? ''}`.trim()
                        : u.user?.email ?? 'Unknown'}
                      {u.user?.department && (
                        <span className="text-muted-foreground font-normal">
                          {' '}· {u.user.department}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {u.leaves
                        .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
                        .map((l) => (
                          <li key={l.id} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge
                                variant={
                                  l.status === 'APPROVED'
                                    ? 'default'
                                    : l.status === 'PENDING'
                                      ? 'secondary'
                                      : l.status === 'REJECTED'
                                        ? 'destructive'
                                        : 'outline'
                                }
                                className="text-[10px] shrink-0"
                              >
                                {l.status}
                              </Badge>
                              <span className="truncate">
                                {l.startDate}
                                {l.startDate !== l.endDate ? ` → ${l.endDate}` : ''}{' '}
                                <span className="text-muted-foreground">
                                  · {l.leaveType ?? 'Leave'}
                                </span>
                              </span>
                            </div>
                            {l.status === 'PENDING' && (
                              <div className="flex gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2"
                                  onClick={() => onReject(l.id)}
                                >
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-6 px-2"
                                  onClick={() => onApprove(l.id)}
                                >
                                  Approve
                                </Button>
                              </div>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Early-return (shorten) request card
// ─────────────────────────────────────────────────────────────────────────────

function ShortenCard({
  request,
  busy,
  onApprove,
  onReject,
}: {
  request: Request;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const r = request;
  // Day delta the approval would refund — handy context for the approver.
  const dayDelta = (() => {
    if (!r.shortenRequestedEndDate) return null;
    const [ey, em, ed] = r.endDate.split('-').map(Number);
    const [ny, nm, nd] = r.shortenRequestedEndDate.split('-').map(Number);
    const oldMs = new Date(ey, em - 1, ed).getTime();
    const newMs = new Date(ny, nm - 1, nd).getTime();
    return Math.round((oldMs - newMs) / 86_400_000);
  })();
  return (
    <Card>
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
              <Badge variant="secondary" className="text-xs">
                Early Return
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
              {r.shortenRequestedAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Requested {new Date(r.shortenRequestedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={onReject}>
              <XCircle className="h-4 w-4 mr-1 text-destructive" />
              Reject
            </Button>
            <Button size="sm" disabled={busy} onClick={onApprove}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Approve
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded border bg-muted/30 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Original range
            </div>
            <div className="font-medium tabular-nums">
              {r.startDate} → {r.endDate}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {r.totalDays.toFixed(1)} day{r.totalDays === 1 ? '' : 's'}
            </div>
          </div>
          <div className="rounded border bg-primary/5 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-primary/80">
              Requested end
            </div>
            <div className="font-medium tabular-nums">
              {r.startDate} → {r.shortenRequestedEndDate ?? '—'}
            </div>
            {dayDelta != null && dayDelta > 0 && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Refunds approximately {dayDelta} day{dayDelta === 1 ? '' : 's'}
              </div>
            )}
          </div>
        </div>
        {r.shortenRequestedReason && (
          <div className="mt-3 text-sm">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Reason
            </span>
            <p className="mt-1 text-foreground">{r.shortenRequestedReason}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
