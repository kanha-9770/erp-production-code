import sys
import re

file_path = 'c:/Users/taman/erp-production-code/app/leave/page.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add workspace imports
imports = """import {
  WorkspaceShell,
  WorkspaceHeader,
  DataTable,
  type ColumnDef,
  FilterChips,
} from '@/components/real-estate/workspace';
"""
content = content.replace("import { LeaveDateRangePicker } from '@/components/leave/leave-date-range-picker';", "import { LeaveDateRangePicker } from '@/components/leave/leave-date-range-picker';\n" + imports)

# 2. Extract RequestTable's durationLabel just in case. Wait, durationLabel is at the bottom.
# 3. We will replace `export default function LeavePage() { ... }` up to `// ─────────────────────────────────────────────────────────────────────────────\n// Calendar tab`

new_leave_page = """export default function LeavePage() {
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
  const [shortenDate, setShortenDate] = useState('');
  const [shortenReason, setShortenReason] = useState('');

  const [monthlyShortLeaveQuota, setMonthlyShortLeaveQuota] = useState<number | null>(null);

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
      const [bRes, rRes, cRes, aRes] = await Promise.all([
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
      ]);
      const bJson = await bRes.json();
      const rJson = await rRes.json();
      const cJson = await cRes.json();
      const aJson = await aRes.json().catch(() => ({ success: false }));
      if (bJson.success) setBalances(bJson.balances ?? []);
      if (rJson.success) setRequests(rJson.requests ?? []);
      if (aJson?.success && aJson.config) {
        const raw = aJson.config.monthlyShortLeaveQuota;
        setMonthlyShortLeaveQuota(
          Number.isFinite(Number(raw)) ? Math.max(0, Math.floor(Number(raw))) : 0,
        );
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
        cell: (r) => <span className="tabular-nums text-sm">{r.totalDays.toFixed(1)}</span>,
      },
      {
        id: "duration",
        header: "Duration",
        width: 130,
        cell: (r) => <span className="text-sm">{durationLabel(r.duration)}</span>,
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
          const shortenable = r.status === 'APPROVED' && r.endDate > todayStr() && r.shortenStatus !== 'PENDING';
          return (
            <div className="flex justify-end gap-1">
              {shortenable && (
                <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => openShorten(r)}>
                  <LogOut className="h-3 w-3 mr-1" /> Early return
                </Button>
              )}
              {cancellable && (
                <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => cancel(r.id)}>
                  <X className="h-3 w-3 mr-1" /> Cancel
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [typeName, busyId, cancel, openShorten]
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
            subtitle="Apply, track balance, and view your leave history."
          >
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={refreshing}
                title="Refresh"
                className="h-9 px-3 shrink-0"
              >
                <RefreshCw className={`h-4 w-4 sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button onClick={() => setApplyOpen(true)} size="sm" className="h-9">
                <Plus className="h-4 w-4 mr-2" />
                Apply Leave
              </Button>
            </div>
          </WorkspaceHeader>
        }
        list={
          <div className="flex flex-col h-full bg-muted/10">
            <div className="p-4 sm:p-6 pb-2 space-y-4 sm:space-y-6">
              {/* Balance cards */}
              {loading ? (
                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32 bg-background border rounded-xl" />
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
                  {balances
                    ?.filter(
                      (b) =>
                        b.leaveType.category !== 'HOURLY' &&
                        b.leaveType.code !== 'HOURLY_LEAVE',
                    )
                    .map((b) => {
                    const total = b.allocated + b.carriedForward;
                    const pct = total > 0 ? Math.min(100, ((b.used + b.pending) / total) * 100) : 0;
                    const accent = b.leaveType.color || '#94a3b8';
                    const low = total > 0 && b.available <= total * 0.2;
                    return (
                      <Card
                        key={b.leaveType.id}
                        className="relative overflow-hidden hover:shadow-md transition-shadow bg-background"
                      >
                        <span
                          className="absolute left-0 top-0 bottom-0 w-1"
                          style={{ backgroundColor: accent }}
                          aria-hidden
                        />
                        <CardHeader className="pb-2 pl-5">
                          <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between gap-2">
                            <span className="truncate">{b.leaveType.name}</span>
                            {b.isPaid ? (
                              <Badge
                                variant="secondary"
                                className="text-[9px] shrink-0 px-1.5 py-0 h-4"
                              >
                                Paid
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[9px] shrink-0 px-1.5 py-0 h-4"
                              >
                                Unpaid
                              </Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pl-5 space-y-2">
                          <div className="flex items-baseline gap-1">
                            <span
                              className={`text-2xl font-bold tabular-nums leading-none ${low ? 'text-destructive' : ''}`}
                            >
                              {b.available.toFixed(b.available % 1 === 0 ? 0 : 1)}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums font-medium">
                              / {total.toFixed(0)}
                            </span>
                          </div>
                          <Progress value={pct} className="h-1 bg-muted/50" />
                          <div className="text-[10px] text-muted-foreground flex justify-between tabular-nums font-medium">
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

              {/* View Tabs & Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Tabs value={view} onValueChange={(v) => setView(v as any)} className="w-full sm:w-auto">
                  <TabsList className="w-full sm:w-auto grid grid-cols-2 h-9">
                    <TabsTrigger value="calendar" className="text-xs">Calendar</TabsTrigger>
                    <TabsTrigger value="list" className="text-xs">List View</TabsTrigger>
                  </TabsList>
                </Tabs>
                
                {view === 'list' && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-1 sm:pl-3 sm:border-l">
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

            <div className="flex-1 min-h-0 px-4 sm:px-6 pb-6">
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
        onApplied={() => {
          setApplyOpen(false);
          refresh();
        }}
      />
      
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
"""

# Extract the parts to keep
start_idx = content.find("export default function LeavePage() {")
end_idx = content.find("// ─────────────────────────────────────────────────────────────────────────────\n// Calendar tab")

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_leave_page + "\n" + content[end_idx:]

# Remove RequestTable entirely
request_table_start = content.find("// ─────────────────────────────────────────────────────────────────────────────\n// Request table")
duration_label_start = content.find("function durationLabel(d: Duration) {")

if request_table_start != -1 and duration_label_start != -1:
    content = content[:request_table_start] + content[duration_label_start:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Refactored successfully")
