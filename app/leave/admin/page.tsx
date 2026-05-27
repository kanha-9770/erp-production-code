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
  UserCircle,
  Search,
  X as XIcon,
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
  leaveType: {
    id: string;
    name: string;
    code: string;
    category: string;
    color: string | null;
  };
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
  const [search, setSearch] = useState('');

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

  // Hourly leave is hidden from the employee-facing Apply Leave form, so we
  // hide it from the admin Allocations/Usage tables and Bulk Allocate dropdown
  // as well — keeps the two surfaces in sync. The data model + existing rows
  // are unchanged.
  const allTypes =
    employees?.[0]?.balances
      .filter(
        (b) =>
          b.leaveType.category !== 'HOURLY' &&
          b.leaveType.code !== 'HOURLY_LEAVE',
      )
      .map((b) => b.leaveType) ?? [];

  const filteredEmployees = useMemo(() => {
    const list = employees ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => {
      const name = `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim().toLowerCase();
      return (
        name.includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.department ?? '').toLowerCase().includes(q)
      );
    });
  }, [employees, search]);

  return (
    <div className="container mx-auto p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div className="space-y-2.5">
        <PageBackLink href="/leave" label="Leave" />
        {/* Title block — name + count on its own row so the toolbar below
            never crowds it on mobile. */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">
              Leave Administration
            </h1>
            {employees && (
              <div className="text-xs text-muted-foreground truncate">
                {employees.length} employee{employees.length === 1 ? '' : 's'} · year {year}
              </div>
            )}
          </div>
        </div>

        {/* Toolbar — search grows to fill, year/refresh/bulk anchor right.
            Wraps cleanly under 380px without overflowing. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative flex-1 min-w-[160px] order-1">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, email, department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-7 h-8 text-xs w-full"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[90px] h-8 text-xs shrink-0">
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
          <Button
            size="sm"
            onClick={() => setBulkOpen(true)}
            className="h-8 px-2 sm:px-3 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Bulk Allocate</span>
            <span className="sm:hidden">Bulk</span>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="allocations">
        {/* Equal-width grid so labels don't truncate on mobile. */}
        <TabsList className="grid w-full grid-cols-3 h-8">
          <TabsTrigger value="allocations" className="text-xs gap-1 px-1.5">
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Allocations</span>
              <span className="sm:hidden">Alloc.</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="text-xs gap-1 px-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline">Org Calendar</span>
              <span className="sm:hidden">Calendar</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="usage" className="text-xs gap-1 px-1.5">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Usage</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="allocations">
          <AllocationsGrid
            loading={loading}
            employees={filteredEmployees}
            totalEmployees={employees?.length ?? 0}
            searchActive={search.trim().length > 0}
            allTypes={allTypes}
            savingCell={savingCell}
            onAdjust={adjust}
          />
        </TabsContent>

        <TabsContent value="calendar">
          <OrgLeaveCalendar year={year} />
        </TabsContent>

        <TabsContent value="usage">
          <UsageSummary employees={filteredEmployees} allTypes={allTypes} loading={loading} />
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
  totalEmployees,
  searchActive,
  allTypes,
  savingCell,
  onAdjust,
}: {
  loading: boolean;
  employees: EmployeeRow[];
  totalEmployees: number;
  searchActive: boolean;
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
  if (totalEmployees === 0) {
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
  if (employees.length === 0 && searchActive) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
          No employees match your search.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        {/* Spreadsheet-style table — # gutter, avatar, Employee, then
            one cell per leave type. Nothing is sticky: the whole table
            shifts horizontally on scroll so the row is read as a single
            unit (employee + their balances move together). */}
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="text-[10px] uppercase text-muted-foreground bg-muted tracking-wider">
            <tr>
              <th className="text-center px-1.5 py-2 w-9 bg-muted font-semibold border-b border-r">
                #
              </th>
              <th className="text-left px-1.5 py-2 w-12 bg-muted font-semibold border-b border-r">
                {/* avatar column — no label */}
              </th>
              <th className="text-left px-2 py-2 bg-muted font-semibold border-b border-r min-w-[160px] max-w-[220px]">
                Employee
              </th>
              {allTypes.map((t) => (
                <th
                  key={t.id}
                  className="text-left px-3 py-2 min-w-[150px] font-semibold border-b whitespace-nowrap"
                >
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((e, idx) => (
              <tr key={e.id} className="hover:bg-muted/20 group">
                <td className="px-1.5 py-1.5 w-9 text-center text-[10px] tabular-nums text-muted-foreground border-b border-r align-middle">
                  {idx + 1}
                </td>
                <td className="px-1.5 py-1.5 w-12 border-b border-r align-middle">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <UserCircle className="h-4 w-4 text-primary/60" />
                  </div>
                </td>
                <td className="px-2 py-1.5 border-b border-r min-w-[160px] max-w-[220px] align-middle">
                  <div className="text-xs font-medium leading-tight truncate uppercase">
                    {e.firstName || e.lastName
                      ? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim()
                      : e.email}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate leading-tight">
                    {e.email}
                    {e.department ? ` · ${e.department}` : ''}
                  </div>
                </td>
                {allTypes.map((t) => {
                  const b = e.balances.find((bb) => bb.leaveType.id === t.id);
                  const cellId = `${e.id}:${t.id}`;
                  return (
                    <td key={t.id} className="px-3 py-1.5 border-b align-middle">
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
      <div className="text-xs font-medium tabular-nums leading-tight whitespace-nowrap">
        {available.toFixed(1)}
        <span className="text-muted-foreground font-normal"> / {allocated.toFixed(0)}</span>
      </div>
      <div className="text-[10px] text-muted-foreground tabular-nums leading-tight mt-0.5 whitespace-nowrap">
        used {used.toFixed(1)} · pend {pending.toFixed(1)}
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
        <CardContent className="p-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (allTypes.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No leave types configured.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-2 sm:gap-3 md:grid-cols-2 lg:grid-cols-3">
      {allTypes.map((t) => {
        const v = totals.get(t.id)!;
        const usedPct = v.allocated > 0 ? (v.used / v.allocated) * 100 : 0;
        return (
          <Card key={t.id}>
            <CardContent className="p-3 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                  {t.name}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  {v.allocated.toFixed(0)} allocated
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold tabular-nums leading-none">
                  {v.used.toFixed(1)}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  used
                </span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, usedPct)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground flex justify-between tabular-nums leading-tight">
                <span>Pending {v.pending.toFixed(1)}</span>
                <span>Available {v.available.toFixed(1)}</span>
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
