'use client';

/**
 * Employee leave page — balance overview, calendar view, apply form, my requests.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useIsMobile } from '@/hooks/use-mobile';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  LeaveCalendar,
  LeaveCalendarLegend,
  type CalendarHoliday,
  type CalendarLeave,
  dateToYmd,
} from '@/components/leave/leave-calendar';
// LeaveDateRangePicker is 311 lines and only renders inside the Apply
// Leave Sheet — dynamic-import keeps its weight (incl. date-fns deps
// already in the bundle, plus its own picker UI) out of the initial leave
// page chunk. The Sheet stays mounted but inactive on page load, so we
// also conditionally render the picker below.
const LeaveDateRangePicker = dynamic(
  () => import('@/components/leave/leave-date-range-picker').then((m) => m.LeaveDateRangePicker),
  { ssr: false },
);
import {
  WorkspaceShell,
  WorkspaceHeader,
  DataTable,
  type ColumnDef,
  FilterChips,
} from '@/components/real-estate/workspace';
import {
  computeShortLeaveSlots,
  formatWindowHours,
} from '@/lib/hr/short-leave-slots';


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
  // Short-leave slot window ("HH:MM"); null for half/full-day leaves.
  startTime: string | null;
  endTime: string | null;
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
  
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shortenTarget, setShortenTarget] = useState<LeaveRequest | null>(null);
  // Id of the request awaiting cancel confirmation. Drives a styled
  // AlertDialog instead of the browser's native confirm() popup.
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [shortenDate, setShortenDate] = useState('');
  const [shortenReason, setShortenReason] = useState('');

  const [monthlyShortLeaveQuota, setMonthlyShortLeaveQuota] = useState<number | null>(null);
  // Shift + short-leave window from Attendance Configuration, used to derive
  // the preset short-leave slots offered in the apply form.
  const [shortLeaveHours, setShortLeaveHours] = useState<number | null>(null);
  const [shiftStart, setShiftStart] = useState<string | null>(null);
  const [shiftEnd, setShiftEnd] = useState<string | null>(null);

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
      const [bRes, rRes, cRes, aRes, tRes] = await Promise.all([
        fetch('/api/leaves/balance', { cache: 'no-store', credentials: 'include' }),
        fetch('/api/leaves?limit=200', { cache: 'no-store', credentials: 'include' }),
        fetch(`/api/leaves/calendar?from=${from}&to=${to}&scope=mine`, {
          cache: 'no-store',
          credentials: 'include',
        }),
        fetch('/api/attendance-config', {
          cache: 'no-store',
          credentials: 'include',
        }),
        // Employee's effective shift (their inTime/outTime override, else the
        // org default) — used to anchor the short-leave slots to the same
        // clock the employee checks in/out against. Best-effort: this is a
        // non-critical extra, so a network rejection resolves to null instead
        // of failing the whole Promise.all and blocking the leave data.
        fetch('/api/attendance/today', {
          cache: 'no-store',
          credentials: 'include',
        }).catch(() => null),
      ]);
      const bJson = await bRes.json();
      const rJson = await rRes.json();
      const cJson = await cRes.json();
      const aJson = await aRes.json().catch(() => ({ success: false }));
      const tJson = tRes ? await tRes.json().catch(() => ({ success: false })) : { success: false };
      if (bJson.success) setBalances(bJson.balances ?? []);
      if (rJson.success) setRequests(rJson.requests ?? []);
      if (aJson?.success && aJson.config) {
        const raw = aJson.config.monthlyShortLeaveQuota;
        setMonthlyShortLeaveQuota(
          Number.isFinite(Number(raw)) ? Math.max(0, Math.floor(Number(raw))) : 0,
        );
        const slh = Number(aJson.config.shortLeaveHours);
        setShortLeaveHours(Number.isFinite(slh) ? Math.max(0, slh) : null);
        // Org-default shift is the fallback; the employee's own shift (below)
        // overrides it when available.
        setShiftStart(
          typeof aJson.config.defaultShiftStart === 'string'
            ? aJson.config.defaultShiftStart
            : null,
        );
        setShiftEnd(
          typeof aJson.config.defaultShiftEnd === 'string'
            ? aJson.config.defaultShiftEnd
            : null,
        );
      }
      // Prefer the employee's effective shift so the slot windows match their
      // personal check-in/out timing. Runs after the config block so these
      // setState calls win.
      const empShift = tJson?.success ? tJson.status?.shift : null;
      if (empShift && typeof empShift.start === 'string' && typeof empShift.end === 'string') {
        setShiftStart(empShift.start);
        setShiftEnd(empShift.end);
      }
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

  const shortLeaveUsedThisMonth = useMemo(() => {
    const shortIds = new Set(
      (balances ?? [])
        .filter((b) => b.leaveType.category === 'SHORT_LEAVE')
        .map((b) => b.leaveType.id),
    );
    if (shortIds.size === 0) return 0;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return (requests ?? []).filter((r) => {
      if (!shortIds.has(r.leaveTypeId)) return false;
      if (r.status !== 'PENDING' && r.status !== 'APPROVED') return false;
      const d = new Date(`${r.startDate}T00:00:00`);
      return d.getFullYear() === y && d.getMonth() === m;
    }).length;
  }, [balances, requests]);

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

  const typeName = useCallback((id: string) => balances?.find((b) => b.leaveType.id === id)?.leaveType.name ?? '—', [balances]);

  const openShorten = useCallback((r: LeaveRequest) => {
    setShortenTarget(r);
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
  }, []);

  const closeShorten = useCallback(() => {
    setShortenTarget(null);
    setShortenDate('');
    setShortenReason('');
  }, []);

  const submitShorten = useCallback(async () => {
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
      refresh();
    } catch (e: any) {
      toast({
        title: 'Could not request early return',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  }, [shortenTarget, shortenDate, shortenReason, toast, closeShorten, refresh]);

  const cancel = useCallback(async (id: string) => {
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
      refresh();
    } catch (e: any) {
      toast({ title: 'Could not cancel', description: e?.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }, [refresh, toast]);

  const columns: ColumnDef<LeaveRequest>[] = useMemo(
    () => [
      {
        id: "type",
        header: "Type",
        width: 180,
        pinned: true,
        sortKey: "leaveTypeId",
        cell: (r) => (
          <div className="flex items-center gap-1.5 font-medium">
            <span>{typeName(r.leaveTypeId)}</span>
            {r.isEmergency && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                Emergency
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "dates",
        header: "Dates",
        width: 200,
        sortKey: "startDate",
        cell: (r) => (
          <div className="text-sm tabular-nums flex flex-col">
            <span>
              {r.startDate}
              {r.startDate !== r.endDate ? ` → ${r.endDate}` : ''}
            </span>
            {r.originalEndDate && r.originalEndDate !== r.endDate && (
              <span className="text-[11px] text-muted-foreground mt-0.5">
                shortened from <span className="line-through">{r.originalEndDate}</span>
              </span>
            )}
          </div>
        ),
      },
      {
        id: "days",
        header: "Days",
        width: 80,
        // Short leaves are shown as their org-fixed window (e.g. "2.5h") so the
        // amount matches the apply screen and the slot window in the Duration
        // column — not "1.0" days. Everything else shows day count.
        cell: (r) =>
          r.startTime && r.endTime ? (
            <span className="tabular-nums text-sm">
              {formatWindowHours(slotWindowHours(r.startTime, r.endTime))}
            </span>
          ) : (
            <span className="tabular-nums text-sm">{r.totalDays.toFixed(1)}</span>
          ),
      },
      {
        id: "duration",
        header: "Duration",
        width: 130,
        cell: (r) => (
          <span className="text-sm">
            {/* Short leaves carry a slot window — surface the concrete times
                so approvers see exactly when, not just "1st half". */}
            {r.startTime && r.endTime ? (
              <>
                Short leave
                <span className="block text-[11px] text-muted-foreground tabular-nums">
                  {r.startTime}–{r.endTime}
                </span>
              </>
            ) : (
              durationLabel(r.duration)
            )}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 150,
        sortKey: "status",
        cell: (r) => (
          <div>
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
          </div>
        ),
      },
      {
        id: "reason",
        header: "Reason",
        width: 250,
        cell: (r) => (
          <div className="text-sm truncate" title={r.reason ?? ''}>
            {r.reason || <span className="text-muted-foreground">—</span>}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        width: 200,
        align: "right",
        cell: (r) => {
          const cancellable = r.status === 'PENDING' || (r.status === 'APPROVED' && r.startDate > todayStr());
          // Early return only applies to a multi-day leave that has already
          // STARTED and hasn't ended yet. It needs at least one valid earlier
          // end date (newEndDate must be >= start and < end), so a single-day
          // leave (start === end) can't be shortened — Cancel it instead. A
          // not-yet-started leave likewise has no valid earlier date.
          const shortenable =
            r.status === 'APPROVED' &&
            r.startDate < r.endDate &&
            r.startDate <= todayStr() &&
            r.endDate >= todayStr() &&
            r.shortenStatus !== 'PENDING';
          return (
            <div className="flex justify-end gap-1">
              {shortenable && (
                <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => openShorten(r)}>
                  <LogOut className="h-3 w-3 mr-1" /> Early return
                </Button>
              )}
              {cancellable && (
                <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => setCancelTargetId(r.id)}>
                  <X className="h-3 w-3 mr-1" /> Cancel
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [typeName, busyId, openShorten]
  );

  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    let res = requests;
    if (statusFilter) res = res.filter(r => r.status === statusFilter);
    const today = todayStr();
    if (timeFilter === 'upcoming') {
      res = res.filter(r => r.endDate >= today && (r.status === 'PENDING' || r.status === 'APPROVED'));
    } else if (timeFilter === 'past') {
      res = res.filter(r => r.endDate < today || r.status === 'CANCELLED' || r.status === 'REJECTED');
    }
    return res;
  }, [requests, statusFilter, timeFilter]);

  const STATUS_OPTIONS = [
    { value: "PENDING", label: "Pending", tint: "#eab308" },
    { value: "APPROVED", label: "Approved", tint: "#22c55e" },
    { value: "REJECTED", label: "Rejected", tint: "#ef4444" },
    { value: "CANCELLED", label: "Cancelled", tint: "#94a3b8" },
  ];

  const TIME_OPTIONS = [
    { value: "upcoming", label: "Upcoming" },
    { value: "past", label: "Past" },
  ];

  return (
    <>
      <WorkspaceShell
        scope="leaves"
        selectedId={null}
        onCloseSelection={() => {}}
        header={
          <WorkspaceHeader
            icon={<CalendarDays className="h-5 w-5" />}
            title="My Leaves"
          >
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={refreshing}
                title="Refresh"
                className="h-8 px-2 shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 sm:mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button onClick={() => setApplyOpen(true)} size="sm" className="h-8 px-2 sm:px-3">
                <Plus className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Apply Leave</span>
                <span className="sm:hidden">Apply</span>
              </Button>
            </div>
          </WorkspaceHeader>
        }
        list={
          <div className="flex flex-col h-full bg-muted/10">
            <div className="p-3 sm:p-4 pb-2 space-y-3">
              {/* Balance cards */}
              {loading ? (
                <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 bg-background border rounded-lg" />
                  ))}
                </div>
              ) : balances && balances.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No leave types are configured yet.</p>
                    <p className="text-xs mt-1">Ask your admin to set up leave types.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  {balances
                    ?.filter(
                      (b) =>
                        b.leaveType.category !== 'HOURLY' &&
                        b.leaveType.code !== 'HOURLY_LEAVE',
                    )
                    .map((b) =>
                      b.leaveType.category === 'SHORT_LEAVE' ? (
                        // Short leave is a MONTHLY allowance that resets each
                        // month (unused ones expire) — so we show this month's
                        // quota and usage, not the yearly LeaveBalance.
                        <BalanceCard
                          key={b.leaveType.id}
                          b={{
                            ...b,
                            allocated: monthlyShortLeaveQuota ?? b.allocated,
                            carriedForward: 0,
                            used: shortLeaveUsedThisMonth,
                            pending: 0,
                            available: Math.max(
                              0,
                              (monthlyShortLeaveQuota ?? b.allocated) -
                                shortLeaveUsedThisMonth,
                            ),
                          }}
                          periodHint="this month · resets monthly"
                        />
                      ) : (
                        <BalanceCard key={b.leaveType.id} b={b} />
                      ),
                    )}
                </div>
              )}

              {/* View Tabs & Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Tabs value={view} onValueChange={(v) => setView(v as any)} className="w-full sm:w-auto">
                  <TabsList className="w-full sm:w-auto grid grid-cols-2 h-7">
                    <TabsTrigger value="calendar" className="text-xs">Calendar</TabsTrigger>
                    <TabsTrigger value="list" className="text-xs">List View</TabsTrigger>
                  </TabsList>
                </Tabs>

                {view === 'list' && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-1 sm:pl-3 sm:border-l">
                    <FilterChips
                      value={timeFilter}
                      onChange={(v) => setTimeFilter(v as any || 'all')}
                      options={TIME_OPTIONS}
                    />
                    <FilterChips
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={STATUS_OPTIONS}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 px-3 sm:px-4 pb-4">
              {view === 'calendar' ? (
                <div className="h-full bg-background border rounded-xl shadow-sm overflow-hidden flex flex-col">
                  <CalendarTab
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    data={calendarData}
                    loading={loading}
                  />
                </div>
              ) : (
                <div className="h-full bg-background border rounded-xl shadow-sm overflow-hidden flex flex-col">
                  <DataTable<LeaveRequest>
                    tableId="my-leaves"
                    columns={columns}
                    rows={filteredRequests}
                    rowId={(r) => r.id}
                    isLoading={loading && !requests}
                    selectedId={null}
                    onRowClick={() => {}}
                    emptyState={
                      <div className="py-16 text-center text-muted-foreground">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        No leave records found.
                      </div>
                    }
                  />
                </div>
              )}
            </div>
          </div>
        }
        preview={null}
      />

      <ApplyLeaveSheet
        open={applyOpen}
        onOpenChange={setApplyOpen}
        balances={balances ?? []}
        holidays={calendarData.holidays}
        weeklyOffDays={calendarData.weeklyOffDays}
        existingLeaves={allMyActiveLeaves}
        monthlyShortLeaveQuota={monthlyShortLeaveQuota}
        shortLeaveUsedThisMonth={shortLeaveUsedThisMonth}
        shortLeaveHours={shortLeaveHours}
        shiftStart={shiftStart}
        shiftEnd={shiftEnd}
        onApplied={() => {
          setApplyOpen(false);
          refresh();
        }}
      />
      
      {/* Cancel confirmation — styled in-app dialog, replaces the native
          window.confirm() popup. */}
      <AlertDialog
        open={!!cancelTargetId}
        onOpenChange={(o) => {
          if (!o) setCancelTargetId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this leave request?</AlertDialogTitle>
            <AlertDialogDescription>
              This withdraws the request and releases any pending balance hold.
              You can apply again later if you change your mind.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busyId}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!busyId}
              onClick={() => {
                const id = cancelTargetId;
                setCancelTargetId(null);
                if (id) cancel(id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance card — collapsed by default (just type + available count + badge),
// taps to expand revealing the progress bar and Used / Pending stats. Cuts
// vertical space in half on first paint; full details are one tap away.
// ─────────────────────────────────────────────────────────────────────────────

function BalanceCard({ b, periodHint }: { b: BalanceRow; periodHint?: string }) {
  const [expanded, setExpanded] = useState(false);
  const total = b.allocated + b.carriedForward;
  const pct = total > 0 ? Math.min(100, ((b.used + b.pending) / total) * 100) : 0;
  const accent = b.leaveType.color || '#94a3b8';
  const low = total > 0 && b.available <= total * 0.2;
  return (
    <Card
      className="relative overflow-hidden hover:shadow-md transition-shadow bg-background cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }}
      aria-expanded={expanded}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: accent }}
        aria-hidden
      />
      <CardContent className="pl-3.5 pr-3 py-2.5 space-y-1.5">
        {/* Collapsed-state row — type + available count + badge + chevron */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
              {b.leaveType.name}
            </span>
            <span className="flex items-baseline gap-1 shrink-0">
              <span
                className={`text-lg font-bold tabular-nums leading-none ${low ? 'text-destructive' : ''}`}
              >
                {b.available.toFixed(b.available % 1 === 0 ? 0 : 1)}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums font-medium">
                / {total.toFixed(0)}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {b.isPaid ? (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                Paid
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                Unpaid
              </Badge>
            )}
            <ChevronRight
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          </div>
        </div>
        {periodHint && (
          <div className="text-[9px] text-muted-foreground/80 -mt-0.5 leading-none">
            {periodHint}
          </div>
        )}
        {/* Expanded details — progress bar + Used / Pending counters. */}
        {expanded && (
          <>
            <Progress value={pct} className="h-1 bg-muted/50" />
            <div className="text-[10px] text-muted-foreground flex justify-between tabular-nums font-medium leading-tight">
              <span>Used {b.used.toFixed(1)}</span>
              {b.pending > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  Pending {b.pending.toFixed(1)}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
      {/* Month nav lives inside the LeaveCalendar widget itself
          (react-day-picker chevrons), so the outer header now shows only
          the legend — no duplicate prev/next buttons. */}
      <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
        <LeaveCalendarLegend className="gap-2 flex-wrap" />
      </CardHeader>
      <CardContent className="px-3 sm:px-4 pb-3">
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

function durationLabel(d: Duration) {
  return d === 'FULL_DAY' ? 'Full Day' : d === 'HALF_DAY_FIRST' ? '½ (1st half)' : '½ (2nd half)';
}

// Hours spanned by a short-leave slot window ("HH:MM"–"HH:MM"). Used so the
// "Days" column shows the org-fixed window (e.g. "2.5h") for short leaves,
// matching the apply screen — instead of a misleading "0.5 / 1.0 day".
function slotWindowHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return 0;
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
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
  monthlyShortLeaveQuota,
  shortLeaveUsedThisMonth,
  shortLeaveHours,
  shiftStart,
  shiftEnd,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  balances: BalanceRow[];
  holidays: CalendarHoliday[];
  weeklyOffDays: number[];
  existingLeaves: CalendarLeave[];
  /** Cap from Attendance Configuration. null = not loaded yet → don't gate. */
  monthlyShortLeaveQuota: number | null;
  /** PENDING + APPROVED short-leave occurrences in the current calendar month. */
  shortLeaveUsedThisMonth: number;
  /** Fixed short-leave window length in hours (Attendance Config). */
  shortLeaveHours: number | null;
  /** Org shift bounds ("HH:MM") — anchor the preset short-leave slots. */
  shiftStart: string | null;
  shiftEnd: string | null;
  onApplied: () => void;
}) {
  const isMobile = useIsMobile();
  // Short Leave is blocked once the monthly allowance is hit (or when the
  // quota is configured as 0). Half-day and Full-day remain available.
  const shortLeaveBlocked =
    monthlyShortLeaveQuota != null &&
    shortLeaveUsedThisMonth >= monthlyShortLeaveQuota;
  const isTypeDisabled = (b: BalanceRow) =>
    b.leaveType.category === 'SHORT_LEAVE' && shortLeaveBlocked;
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

  // The leave-type CATEGORY drives which Duration options are valid.
  //   FULL_DAY    → full day only ("full day means full day"). Half-days are NOT
  //                 selectable here; an employee who needs a half-day uses the
  //                 Half Day type, which cascades into the Full Day quota once
  //                 its own quota is exhausted (lib/hr/leave-service.ts reroute).
  //   HALF_DAY    → only ½ AM / ½ PM (a half-day leave is, by definition, half a day)
  //   SHORT_LEAVE → two preset slots (start-of-shift / end-of-shift), each a
  //                 FIXED window of `shortLeaveHours`, so the date picker stays
  //                 single-day and the half/full grid is replaced by a slot
  //                 picker. The duration value still rides on HALF_DAY_FIRST
  //                 (start-anchored) / HALF_DAY_SECOND (end-anchored).
  // The model field (LeaveRequest.duration) is unchanged; we just constrain
  // which values the form can produce so the request the user submits matches
  // the type name (no more "Half Day Leave for 1.0 day").
  const selectedCategory =
    balances.find((b) => b.leaveType.id === leaveTypeId)?.leaveType.category ?? null;
  const isHalfDayType = selectedCategory === 'HALF_DAY';
  const isShortLeaveType = selectedCategory === 'SHORT_LEAVE';
  // Show the half/full-day grid ONLY for Half Day leave types. Full Day leaves
  // are always a full day (no half-day sub-options), and short leave gets the
  // slot picker instead — so both hide this grid.
  const durationLocked = !isHalfDayType;
  // Preset short-leave slots derived from the org shift + window. Empty when
  // the org hasn't configured a shift/window yet → the form shows a hint.
  const shortLeaveSlots = useMemo(
    () =>
      isShortLeaveType
        ? computeShortLeaveSlots(shiftStart, shiftEnd, shortLeaveHours)
        : [],
    [isShortLeaveType, shiftStart, shiftEnd, shortLeaveHours],
  );
  const activeShortSlot =
    shortLeaveSlots.find((s) => s.id === duration) ?? null;

  const defaultDurationFor = (category: string | null): Duration => {
    if (category === 'HALF_DAY' || category === 'SHORT_LEAVE') return 'HALF_DAY_FIRST';
    return 'FULL_DAY';
  };

  // Reset on open so a fresh form appears each time. Mirror the dropdown's
  // filter + disable rules when picking the default so the form never opens
  // with a hidden (hourly) or disabled (short-leave over quota) type
  // pre-selected.
  useEffect(() => {
    if (open) {
      const firstSelectable = balances.find(
        (b) =>
          b.leaveType.category !== 'HOURLY' &&
          b.leaveType.code !== 'HOURLY_LEAVE' &&
          !isTypeDisabled(b),
      );
      setLeaveTypeId(firstSelectable?.leaveType.id ?? '');
      setRange({ startDate: null, endDate: null });
      setDuration(defaultDurationFor(firstSelectable?.leaveType.category ?? null));
      setReason('');
      setIsEmergency(false);
    }
    // Deliberately omit `isTypeDisabled` — it's a closure over props, and
    // including it would reset the form on every parent re-render. The cap
    // can only change between Apply-sheet openings anyway (refresh runs on
    // submit), so re-evaluating on `open` is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, balances, shortLeaveBlocked]);

  // If user picks half-day, lock to single date.
  useEffect(() => {
    if (duration !== 'FULL_DAY' && range.startDate) {
      if (range.endDate !== range.startDate) {
        setRange((r) => ({ startDate: r.startDate, endDate: r.startDate }));
      }
    }
  }, [duration, range.startDate, range.endDate]);

  // Normalise duration when the user switches leave type so the value can
  // never contradict the type name:
  //   HALF_DAY  → snap FULL_DAY to HALF_DAY_FIRST
  //   SHORT     → snap to HALF_DAY_FIRST (selector is hidden anyway)
  //   FULL_DAY  → snap any half value back to FULL_DAY (the grid is hidden, so
  //               the user can't fix a leftover half value themselves)
  useEffect(() => {
    if (!selectedCategory) return;
    if (
      (selectedCategory === 'HALF_DAY' || selectedCategory === 'SHORT_LEAVE') &&
      duration === 'FULL_DAY'
    ) {
      setDuration('HALF_DAY_FIRST');
    } else if (selectedCategory === 'FULL_DAY' && duration !== 'FULL_DAY') {
      setDuration('FULL_DAY');
    }
  }, [selectedCategory, duration]);

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

  // Half Day → Full Day quota cascade hint. When the selected type is a Half
  // Day leave and its quota is exhausted, the server reroutes the request onto
  // the Full Day quota (or marks it unpaid if that's gone too). Mirror that
  // decision here so the employee sees it BEFORE submitting. Mirrors the
  // server logic in lib/hr/leave-service.ts (apply-time reroute).
  const cascadeHintText = useMemo<string | null>(() => {
    if (!isHalfDayType || !balance) return null;
    if (balance.available > 1e-9) return null; // still within Half Day quota
    const fullDay = balances.find(
      (b) => b.leaveType.category === 'FULL_DAY',
    );
    const fullAvail = fullDay?.available ?? 0;
    if (fullAvail > 1e-9) {
      return 'Half Day quota is used up — this request will draw 0.5 day from your Full Day quota.';
    }
    return 'Half Day and Full Day quota are both used up — this day will be unpaid (LOP).';
  }, [isHalfDayType, balance, balances]);

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
        side={isMobile ? 'bottom' : 'right'}
        className={`w-full sm:max-w-md flex flex-col p-0 gap-0 ${
          isMobile ? 'h-[96dvh] rounded-t-2xl' : 'h-full'
        }`}
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
                {balances
                  // Hourly leave is intentionally hidden from this form — the
                  // option is kept in the data model so existing rows still
                  // resolve, but new requests can no longer choose it.
                  .filter(
                    (b) =>
                      b.leaveType.category !== 'HOURLY' &&
                      b.leaveType.code !== 'HOURLY_LEAVE',
                  )
                  .map((b) => {
                    // Short Leave is disabled when this calendar month's usage
                    // has hit the org's "Short leaves / month" allowance set
                    // in Attendance Configuration.
                    const disabled = isTypeDisabled(b);
                    return (
                      <SelectItem
                        key={b.leaveType.id}
                        value={b.leaveType.id}
                        disabled={disabled}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              backgroundColor:
                                b.leaveType.color || '#94a3b8',
                            }}
                          />
                          <span>{b.leaveType.name}</span>
                          {disabled && (
                            <span className="text-[10px] text-muted-foreground">
                              · monthly limit reached
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
            {shortLeaveBlocked &&
              balances.some(
                (b) => b.leaveType.category === 'SHORT_LEAVE',
              ) && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                  {monthlyShortLeaveQuota === 0
                    ? 'Short leave is not allowed by your organization. Pick a half-day or full-day leave instead.'
                    : `You've used all ${monthlyShortLeaveQuota} short leave${monthlyShortLeaveQuota === 1 ? '' : 's'} for this month. Pick a half-day or full-day leave instead.`}
                </div>
              )}
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

          {/* Duration selector — only shown for HALF_DAY types (½ AM / ½ PM).
              FULL_DAY is always a full day so it has no selector; SHORT_LEAVE
              uses the slot picker below instead. */}
          {!durationLocked && (
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Duration
              </Label>
              <div className="grid grid-cols-2 gap-1 rounded-md border p-1 bg-muted/20">
                {(
                  [
                    ['HALF_DAY_FIRST', '½ AM'],
                    ['HALF_DAY_SECOND', '½ PM'],
                  ] as const
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setDuration(val)}
                    aria-pressed={duration === val}
                    className={`h-9 text-xs font-semibold rounded-sm transition-colors ${
                      duration === val
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-background hover:text-foreground'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Short-leave slot picker — two fixed-length windows anchored to the
              org shift, sourced from Attendance Configuration. The chosen slot
              sets `duration` (HALF_DAY_FIRST = start, HALF_DAY_SECOND = end).
              Falls back to a hint when the org hasn't set a shift/window. */}
          {isShortLeaveType && (
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Short leave slot
                {shortLeaveHours != null && shortLeaveHours > 0 && (
                  <span className="ml-auto font-normal text-muted-foreground/70 normal-case">
                    fixed {formatWindowHours(shortLeaveHours)}
                  </span>
                )}
              </Label>
              {shortLeaveSlots.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {shortLeaveSlots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setDuration(slot.id)}
                      aria-pressed={duration === slot.id}
                      className={`flex flex-col items-start gap-0.5 rounded-md border p-2.5 text-left transition-colors ${
                        duration === slot.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-input hover:bg-muted/40'
                      }`}
                    >
                      <span className="text-xs font-semibold">{slot.label}</span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {slot.startTime}–{slot.endTime}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 flex items-start gap-1.5">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    Short-leave slots aren&apos;t configured yet. Ask your admin
                    to set the shift times and a short-leave window in Attendance
                    Configuration.
                  </span>
                </div>
              )}
            </div>
          )}

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
              shortLeaveDurationLabel={
                isShortLeaveType && shortLeaveHours != null && shortLeaveHours > 0
                  ? formatWindowHours(shortLeaveHours)
                  : null
              }
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
                  {isShortLeaveType && shortLeaveHours != null && shortLeaveHours > 0
                    ? formatWindowHours(shortLeaveHours)
                    : `${reqDays.toFixed(1)} day${reqDays === 1 ? '' : 's'}`}
                </span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatYmd(range.startDate)}
                {/* Short leave: show the concrete slot window (09:30–11:30).
                    Multi-day full leave: show the end date. Half-day: which
                    half. */}
                {isShortLeaveType && activeShortSlot
                  ? ` · ${activeShortSlot.startTime}–${activeShortSlot.endTime}`
                  : range.endDate && range.endDate !== range.startDate
                    ? ` → ${formatYmd(range.endDate)}`
                    : duration !== 'FULL_DAY'
                      ? ` · ${duration === 'HALF_DAY_FIRST' ? 'first half' : 'second half'}`
                      : ''}
              </div>
              {cascadeHintText && (
                <div className="mt-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-800">
                  {cascadeHintText}
                </div>
              )}
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
