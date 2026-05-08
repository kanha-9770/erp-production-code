'use client';

/**
 * Admin allocation page — set yearly leave balances + view org-wide leave
 * timeline.
 *
 *   • Allocations tab: employee × leave-type grid; click cell to edit.
 *   • Calendar tab: org-wide month view of approved + pending leaves so
 *     admins can plan around team capacity dips.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Wallet,
  RefreshCw,
  Users,
  ShieldAlert,
  Sparkles,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  LeaveCalendar,
  LeaveCalendarLegend,
  type CalendarHoliday,
  type CalendarLeave,
  dateToYmd,
} from '@/components/leave/leave-calendar';
import PageBackLink from '@/components/shared/page-back-link';

interface BalanceRow {
  leaveType: { id: string; name: string; code: string; color: string | null };
  year: number;
  allocated: number;
  carriedForward: number;
  used: number;
  pending: number;
  available: number;
  isPaid: boolean;
}

interface EmployeeRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  department: string | null;
  balances: BalanceRow[];
}

const currentYear = new Date().getFullYear();

function monthBounds(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  return { from: dateToYmd(first), to: dateToYmd(last) };
}

export default function LeaveAdminPage() {
  const { toast } = useToast();
  const [year, setYear] = useState<number>(currentYear);
  const [employees, setEmployees] = useState<EmployeeRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/leaves/allocate?year=${year}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        return;
      }
      const j = await res.json();
      if (j.success) setEmployees(j.employees ?? []);
    } catch {
      toast({ title: 'Failed to load allocations', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const adjust = async (userId: string, leaveTypeId: string, amount: number) => {
    if (!Number.isFinite(amount) || amount === 0) return;
    setSavingCell(`${userId}:${leaveTypeId}`);
    try {
      const res = await fetch('/api/leaves/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, leaveTypeId, year, amount }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      setEmployees((prev) =>
        (prev ?? []).map((e) =>
          e.id === userId
            ? {
                ...e,
                balances: e.balances.map((b) =>
                  b.leaveType.id === leaveTypeId
                    ? { ...b, allocated: b.allocated + amount, available: b.available + amount }
                    : b,
                ),
              }
            : e,
        ),
      );
      toast({ title: 'Allocation updated' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSavingCell(null);
    }
  };

  if (forbidden) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium">Admin access required</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allTypes = employees?.[0]?.balances.map((b) => b.leaveType) ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1.5">
          <PageBackLink href="/leave" label="Leave" />
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Wallet className="h-8 w-8 text-primary" />
            Leave Administration
          </h1>
          <p className="text-muted-foreground mt-1">
            Set annual balances and view org-wide leave timelines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setBulkOpen(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            Bulk Allocate
          </Button>
        </div>
      </div>

      <Tabs defaultValue="allocations">
        <TabsList>
          <TabsTrigger value="allocations">
            <Wallet className="h-4 w-4 mr-2" />
            Allocations
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarDays className="h-4 w-4 mr-2" />
            Org Calendar
          </TabsTrigger>
          <TabsTrigger value="usage">
            <Users className="h-4 w-4 mr-2" />
            Usage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="allocations">
          <AllocationsGrid
            loading={loading}
            employees={employees ?? []}
            allTypes={allTypes}
            savingCell={savingCell}
            onAdjust={adjust}
          />
        </TabsContent>

        <TabsContent value="calendar">
          <OrgLeaveCalendar year={year} />
        </TabsContent>

        <TabsContent value="usage">
          <UsageSummary employees={employees ?? []} allTypes={allTypes} loading={loading} />
        </TabsContent>
      </Tabs>

      <BulkAllocateDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        leaveTypes={allTypes}
        year={year}
        onDone={() => {
          setBulkOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Allocations grid
// ─────────────────────────────────────────────────────────────────────────────

function AllocationsGrid({
  loading,
  employees,
  allTypes,
  savingCell,
  onAdjust,
}: {
  loading: boolean;
  employees: EmployeeRow[];
  allTypes: { id: string; name: string }[];
  savingCell: string | null;
  onAdjust: (userId: string, leaveTypeId: string, amount: number) => void;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </CardContent>
      </Card>
    );
  }
  if (employees.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
          No active employees in this organization.
        </CardContent>
      </Card>
    );
  }
  if (allTypes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No leave types configured. Add some via the leave-rules admin first.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead className="border-b text-xs uppercase text-muted-foreground bg-muted/30">
            <tr>
              <th className="text-left p-3 sticky left-0 bg-muted/30">Employee</th>
              {allTypes.map((t) => (
                <th key={t.id} className="text-left p-3 min-w-[160px]">
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b hover:bg-muted/20">
                <td className="p-3 sticky left-0 bg-background">
                  <div className="font-medium">
                    {e.firstName || e.lastName
                      ? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim()
                      : e.email}
                  </div>
                  <div className="text-xs text-muted-foreground">{e.email}</div>
                </td>
                {allTypes.map((t) => {
                  const b = e.balances.find((bb) => bb.leaveType.id === t.id);
                  const cellId = `${e.id}:${t.id}`;
                  return (
                    <td key={t.id} className="p-3">
                      <BalanceCell
                        available={b?.available ?? 0}
                        used={b?.used ?? 0}
                        pending={b?.pending ?? 0}
                        allocated={b?.allocated ?? 0}
                        saving={savingCell === cellId}
                        onAdjust={(delta) => onAdjust(e.id, t.id, delta)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function BalanceCell({
  available,
  used,
  pending,
  allocated,
  saving,
  onAdjust,
}: {
  available: number;
  used: number;
  pending: number;
  allocated: number;
  saving: boolean;
  onAdjust: (delta: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  const startEdit = () => {
    setVal(String(allocated));
    setEditing(true);
  };
  const commit = () => {
    const newAlloc = Number(val);
    setEditing(false);
    if (!Number.isFinite(newAlloc)) return;
    const delta = newAlloc - allocated;
    if (delta !== 0) onAdjust(delta);
  };

  if (editing) {
    return (
      <Input
        type="number"
        autoFocus
        step="0.5"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="h-8 w-24"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={saving}
      className="text-left hover:bg-muted/40 px-2 py-1 rounded -mx-2 -my-1 w-full"
      title="Click to edit allocated"
    >
      <div className="font-medium">
        {available.toFixed(1)}
        <span className="text-muted-foreground font-normal"> / {allocated.toFixed(0)}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        used {used.toFixed(1)} · pending {pending.toFixed(1)}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Org-wide leave calendar
// ─────────────────────────────────────────────────────────────────────────────

function OrgLeaveCalendar({ year }: { year: number }) {
  const { toast } = useToast();
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const d = new Date();
    d.setFullYear(year);
    d.setDate(1);
    return d;
  });
  const [data, setData] = useState<{
    weeklyOffDays: number[];
    holidays: CalendarHoliday[];
    leaves: Array<CalendarLeave & { user?: any }>;
  }>({ weeklyOffDays: [0], holidays: [], leaves: [] });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APPROVED' | 'PENDING'>('ALL');

  // Reset month when year prop changes (admin year selector at the top).
  useEffect(() => {
    if (calendarMonth.getFullYear() !== year) {
      setCalendarMonth(new Date(year, 0, 1));
    }
  }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = monthBounds(calendarMonth);
      const statusesParam =
        statusFilter === 'ALL' ? 'APPROVED,PENDING' : statusFilter;
      const res = await fetch(
        `/api/leaves/calendar?scope=org&withDetails=1&from=${from}&to=${to}&statuses=${statusesParam}`,
        { cache: 'no-store', credentials: 'include' },
      );
      const j = await res.json();
      if (j.success) {
        setData({
          weeklyOffDays: j.weeklyOffDays ?? [0],
          holidays: j.holidays ?? [],
          leaves: (j.leaves ?? []).map((l: any) => ({
            ...l,
            leaveType: l.leaveType?.name ?? null,
          })),
        });
      }
    } catch {
      toast({ title: 'Failed to load org calendar', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [calendarMonth, statusFilter, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Density per day = how many concurrent leaves on that date.
  const density = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of data.leaves) {
      const [sy, sm, sd] = l.startDate.split('-').map(Number);
      const [ey, em, ed] = l.endDate.split('-').map(Number);
      const it = new Date(sy, sm - 1, sd);
      const end = new Date(ey, em - 1, ed);
      while (it <= end) {
        const ymd = dateToYmd(it);
        counts.set(ymd, (counts.get(ymd) ?? 0) + 1);
        it.setDate(it.getDate() + 1);
      }
    }
    return counts;
  }, [data.leaves]);

  const peakDays = useMemo(() => {
    return Array.from(density.entries())
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [density]);

  const monthLabel = calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base">{monthLabel}</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[160px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Approved + Pending</SelectItem>
                <SelectItem value="APPROVED">Approved only</SelectItem>
                <SelectItem value="PENDING">Pending only</SelectItem>
              </SelectContent>
            </Select>
            <LeaveCalendarLegend />
            <div className="flex">
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  const n = new Date(calendarMonth);
                  n.setMonth(n.getMonth() - 1);
                  setCalendarMonth(n);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="ml-1"
                onClick={() => {
                  const n = new Date(calendarMonth);
                  n.setMonth(n.getMonth() + 1);
                  setCalendarMonth(n);
                }}
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
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <div>
              <LeaveCalendar
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                holidays={data.holidays}
                weeklyOffDays={data.weeklyOffDays}
                leaves={data.leaves}
              />
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium">This month</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.leaves.length} leave{data.leaves.length === 1 ? '' : 's'} ·{' '}
                  {data.holidays.length} holiday{data.holidays.length === 1 ? '' : 's'}
                </div>
              </div>

              {peakDays.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Peak overlap days</div>
                  <ul className="space-y-1.5 text-sm">
                    {peakDays.map(([d, n]) => (
                      <li key={d} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{d}</span>
                        <Badge variant={n >= 3 ? 'destructive' : 'secondary'}>
                          {n} on leave
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="text-sm font-medium mb-2">Who's out</div>
                {data.leaves.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody on leave this month.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm max-h-72 overflow-y-auto pr-1">
                    {data.leaves
                      .slice()
                      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
                      .map((l: any) => (
                        <li key={l.id} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {l.user?.firstName || l.user?.lastName
                                ? `${l.user?.firstName ?? ''} ${l.user?.lastName ?? ''}`.trim()
                                : l.user?.email ?? 'Unknown'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {l.startDate}
                              {l.startDate !== l.endDate ? ` → ${l.endDate}` : ''} ·{' '}
                              {l.leaveType ?? 'Leave'}
                            </div>
                          </div>
                          <Badge
                            variant={l.status === 'APPROVED' ? 'default' : 'secondary'}
                            className="text-[10px] shrink-0"
                          >
                            {l.status}
                          </Badge>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage summary — totals per leave type, across all employees.
// ─────────────────────────────────────────────────────────────────────────────

function UsageSummary({
  employees,
  allTypes,
  loading,
}: {
  employees: EmployeeRow[];
  allTypes: { id: string; name: string }[];
  loading: boolean;
}) {
  const totals = useMemo(() => {
    const map = new Map<string, { allocated: number; used: number; pending: number; available: number }>();
    for (const t of allTypes) {
      map.set(t.id, { allocated: 0, used: 0, pending: 0, available: 0 });
    }
    for (const e of employees) {
      for (const b of e.balances) {
        const cur = map.get(b.leaveType.id);
        if (!cur) continue;
        cur.allocated += b.allocated + b.carriedForward;
        cur.used += b.used;
        cur.pending += b.pending;
        cur.available += b.available;
      }
    }
    return map;
  }, [employees, allTypes]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (allTypes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No leave types configured.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {allTypes.map((t) => {
        const v = totals.get(t.id)!;
        const usedPct = v.allocated > 0 ? (v.used / v.allocated) * 100 : 0;
        return (
          <Card key={t.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {v.used.toFixed(1)}
                <span className="text-sm font-normal text-muted-foreground">
                  {' '}
                  / {v.allocated.toFixed(0)} days used
                </span>
              </div>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, usedPct)}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-2 flex justify-between">
                <span>Pending: {v.pending.toFixed(1)}</span>
                <span>Available: {v.available.toFixed(1)}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk allocate dialog
// ─────────────────────────────────────────────────────────────────────────────

function BulkAllocateDialog({
  open,
  onOpenChange,
  leaveTypes,
  year,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leaveTypes: { id: string; name: string }[];
  year: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [amount, setAmount] = useState('12');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setLeaveTypeId(leaveTypes[0]?.id ?? '');
  }, [open, leaveTypes]);

  const submit = async () => {
    const a = Number(amount);
    if (!leaveTypeId || !Number.isFinite(a)) {
      toast({ title: 'Pick type and amount', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/leaves/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leaveTypeId, year, amount: a, reason: reason || 'BULK_GRANT', bulk: true }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast({
        title: 'Bulk allocation done',
        description: `Applied to ${j.applied} of ${j.total} employees.`,
      });
      onDone();
    } catch (e: any) {
      toast({ title: 'Bulk allocate failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk allocate leaves</DialogTitle>
          <DialogDescription>
            Add (or subtract) the same amount for every active employee in {year}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Leave Type</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Amount (use a negative number to subtract)</Label>
            <Input
              type="number"
              step="0.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Note (audit trail)</Label>
            <Input
              placeholder="e.g. Annual reset 2026"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            Apply to all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
