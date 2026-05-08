'use client';

/**
 * Holiday calendar — admin-only CRUD with a real calendar UI.
 *
 *   • Click an empty day → opens "Add holiday" dialog with the date pre-filled.
 *   • Click an existing holiday → opens the same dialog in edit mode.
 *   • Side-by-side list with quick delete.
 *
 * Read by attendance (skip-punch on holiday) and payroll (paid days).
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import PageBackLink from '@/components/shared/page-back-link';
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
  CalendarHeart,
  Plus,
  Trash2,
  RefreshCw,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  LeaveCalendar,
  LeaveCalendarLegend,
  type CalendarHoliday,
  dateToYmd,
} from '@/components/leave/leave-calendar';

interface Holiday {
  id: string;
  date: string;
  name: string;
  isOptional: boolean;
}

const currentYear = new Date().getFullYear();

export default function HolidaysPage() {
  const { toast } = useToast();
  const [year, setYear] = useState(currentYear);
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([0]);

  // Calendar view state — month being shown.
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  // Add/edit dialog state.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [optional, setOptional] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [hRes, cRes] = await Promise.all([
        fetch(`/api/holidays?year=${year}`, { cache: 'no-store', credentials: 'include' }),
        fetch('/api/attendance-config', { cache: 'no-store', credentials: 'include' }),
      ]);
      if (hRes.status === 401) {
        setForbidden(true);
      }
      const hJson = await hRes.json();
      const cJson = await cRes.json();
      if (hJson.success) setHolidays(hJson.holidays ?? []);
      if (cJson.success && Array.isArray(cJson.config?.weeklyOffDays)) {
        setWeeklyOffDays(cJson.config.weeklyOffDays);
      }
    } catch {
      toast({ title: 'Failed to load holidays', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keep the visible month inside the selected year so jumping years scrolls.
  useEffect(() => {
    if (calendarMonth.getFullYear() !== year) {
      const newMonth = new Date(year, 0, 1);
      setCalendarMonth(newMonth);
    }
  }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  const calendarHolidays = useMemo<CalendarHoliday[]>(
    () => (holidays ?? []).map((h) => ({ date: h.date, name: h.name, isOptional: h.isOptional })),
    [holidays],
  );

  const openCreate = (preset?: string) => {
    setEditingHoliday(null);
    setDate(preset ?? '');
    setName('');
    setOptional(false);
    setDialogOpen(true);
  };

  const openEdit = (h: Holiday) => {
    setEditingHoliday(h);
    setDate(h.date);
    setName(h.name);
    setOptional(h.isOptional);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!date || !name.trim()) {
      toast({ title: 'Date and name are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST', // upsert via unique [orgId, date]
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date, name: name.trim(), isOptional: optional }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Save failed');
      toast({ title: editingHoliday ? 'Holiday updated' : 'Holiday saved' });
      setDialogOpen(false);
      refresh();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this holiday?')) return;
    try {
      const res = await fetch(`/api/holidays/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Delete failed');
      setHolidays((prev) => (prev ?? []).filter((h) => h.id !== id));
      toast({ title: 'Holiday removed' });
    } catch (e: any) {
      toast({ title: 'Could not delete', description: e?.message, variant: 'destructive' });
    }
  };

  // Click handler from the calendar — if the clicked day already has a
  // holiday, open the edit dialog; otherwise open create with the date.
  const onDayClick = (selected: Date | undefined) => {
    if (!selected) return;
    const ymd = dateToYmd(selected);
    const existing = (holidays ?? []).find((h) => h.date === ymd);
    if (existing) openEdit(existing);
    else openCreate(ymd);
  };

  const monthHolidays = useMemo(() => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    return (holidays ?? [])
      .filter((h) => {
        const [hy, hm] = h.date.split('-').map(Number);
        return hy === y && hm - 1 === m;
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [holidays, calendarMonth]);

  if (forbidden) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium">Sign in required</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const monthLabel = calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1.5">
          <PageBackLink href="/settings" label="Settings" />
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <CalendarHeart className="h-8 w-8 text-primary" />
            Holiday Calendar
          </h1>
          <p className="text-muted-foreground mt-1">
            Holidays count as paid days in payroll and skip the punch requirement on the
            attendance widget. Click any day to add or edit.
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
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4 mr-2" />
            Add holiday
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">{monthLabel}</CardTitle>
            <div className="flex items-center gap-2">
              <LeaveCalendarLegend showLeaves={false} />
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
                  selectionMode="single"
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  holidays={calendarHolidays}
                  weeklyOffDays={weeklyOffDays}
                  onSelect={onDayClick}
                  numberOfMonths={1}
                />
                <p className="text-xs text-muted-foreground mt-2 max-w-[260px]">
                  Click a date to add a holiday. Click an existing holiday to edit it.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Holidays in {monthLabel}</div>
                {monthHolidays.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No holidays this month.</p>
                ) : (
                  <ul className="divide-y border rounded-md">
                    {monthHolidays.map((h) => {
                      const d = new Date(h.date);
                      const dayName = d.toLocaleDateString(undefined, { weekday: 'long' });
                      return (
                        <li
                          key={h.id}
                          className="flex items-center justify-between p-3 hover:bg-muted/30"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex flex-col items-center justify-center h-12 w-12 rounded-md bg-muted shrink-0">
                              <span className="text-[10px] uppercase text-muted-foreground">
                                {d.toLocaleDateString(undefined, { month: 'short' })}
                              </span>
                              <span className="text-lg font-bold leading-none">
                                {String(d.getDate()).padStart(2, '0')}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{h.name}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <span>{dayName}</span>
                                {h.isOptional ? (
                                  <Badge variant="outline" className="text-[10px] px-1.5">
                                    Optional
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px] px-1.5">
                                    Mandatory
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(h)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => remove(h.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingHoliday ? 'Edit holiday' : 'Add holiday'}</DialogTitle>
            <DialogDescription>
              {editingHoliday
                ? 'Save to update the name or optional flag for this date.'
                : 'Pick a date and give the holiday a name.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={!!editingHoliday /* date is the unique key */}
              />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Republic Day"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={optional} onCheckedChange={setOptional} id="optional-holiday" />
              <Label htmlFor="optional-holiday" className="cursor-pointer">
                Optional holiday
              </Label>
              <span className="text-xs text-muted-foreground">
                — informational, doesn't change payroll/attendance.
              </span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            {editingHoliday && (
              <Button
                variant="destructive"
                onClick={async () => {
                  await remove(editingHoliday.id);
                  setDialogOpen(false);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
            <Button onClick={save} disabled={saving}>
              {saving && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
