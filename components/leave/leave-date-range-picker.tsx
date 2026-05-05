'use client';

/**
 * LeaveDateRangePicker — popover wrapper around LeaveCalendar with:
 *   • holiday / weekly-off / existing-leave overlays
 *   • configurable "from" date (notice-period enforcement)
 *   • overlap detection against the user's own active leaves
 *   • live working-day count (excludes holidays + weekly-offs)
 *
 * Pure-controlled: the parent owns `value` and reacts to `onChange`. Returns
 * dates as YYYY-MM-DD strings to match the rest of the leave module.
 */

import * as React from 'react';
import { format, addDays, startOfDay, differenceInCalendarDays } from 'date-fns';
import { CalendarIcon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  LeaveCalendar,
  LeaveCalendarLegend,
  type CalendarHoliday,
  type CalendarLeave,
  dateToYmd,
  ymdToDate,
} from './leave-calendar';

export interface LeaveDateRangeValue {
  startDate: string | null;
  endDate: string | null;
}

export interface LeaveDateRangePickerProps {
  value: LeaveDateRangeValue;
  onChange: (next: LeaveDateRangeValue) => void;

  holidays?: CalendarHoliday[];
  weeklyOffDays?: number[];
  /** The applicant's existing leaves — used for overlap detection. */
  existingLeaves?: CalendarLeave[];

  /** Min days of notice required (from LeaveRule.minNoticeDays). */
  minNoticeDays?: number;
  /** Force half-day mode → end date locks to start. */
  singleDateOnly?: boolean;

  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function LeaveDateRangePicker({
  value,
  onChange,
  holidays = [],
  weeklyOffDays = [],
  existingLeaves = [],
  minNoticeDays = 0,
  singleDateOnly = false,
  placeholder = 'Pick dates',
  disabled = false,
  className,
}: LeaveDateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const fromDate = React.useMemo(() => {
    const today = startOfDay(new Date());
    return minNoticeDays > 0 ? addDays(today, minNoticeDays) : today;
  }, [minNoticeDays]);

  const selectedRange = React.useMemo(
    () => ({
      from: value.startDate ? ymdToDate(value.startDate) : undefined,
      to: value.endDate ? ymdToDate(value.endDate) : undefined,
    }),
    [value],
  );

  const onSelect = React.useCallback(
    (sel: { from?: Date; to?: Date } | undefined) => {
      if (!sel?.from) {
        onChange({ startDate: null, endDate: null });
        return;
      }
      if (singleDateOnly) {
        const ymd = dateToYmd(sel.from);
        onChange({ startDate: ymd, endDate: ymd });
        return;
      }
      onChange({
        startDate: dateToYmd(sel.from),
        endDate: sel.to ? dateToYmd(sel.to) : dateToYmd(sel.from),
      });
    },
    [onChange, singleDateOnly],
  );

  // Working-day count excluding weekly-offs and (mandatory) holidays.
  const summary = React.useMemo(() => {
    if (!value.startDate || !value.endDate) {
      return { totalCalendar: 0, working: 0, weeklyOffs: 0, holidayCount: 0 };
    }
    const start = ymdToDate(value.startDate);
    const end = ymdToDate(value.endDate);
    const totalCalendar = differenceInCalendarDays(end, start) + 1;
    const offSet = new Set(weeklyOffDays);
    const holidaySet = new Set(
      holidays.filter((h) => !h.isOptional).map((h) => h.date),
    );
    let working = 0;
    let weeklyOffs = 0;
    let holidayCount = 0;
    const cur = new Date(start);
    for (let i = 0; i < totalCalendar; i++) {
      const ymd = dateToYmd(cur);
      const isOff = offSet.has(cur.getDay());
      const isHol = holidaySet.has(ymd);
      if (isHol) holidayCount++;
      else if (isOff) weeklyOffs++;
      else working++;
      cur.setDate(cur.getDate() + 1);
    }
    return { totalCalendar, working, weeklyOffs, holidayCount };
  }, [value, holidays, weeklyOffDays]);

  // Overlap check — does the selected range collide with an existing
  // PENDING / APPROVED leave? Cancelled and rejected don't count.
  const overlap = React.useMemo(() => {
    if (!value.startDate || !value.endDate) return null;
    const collide = existingLeaves.find(
      (l) =>
        (l.status === 'PENDING' || l.status === 'APPROVED') &&
        l.startDate <= value.endDate! &&
        l.endDate >= value.startDate!,
    );
    return collide ?? null;
  }, [value, existingLeaves]);

  // Trigger label: "Mar 5" or "Mar 5 → Mar 7" or placeholder.
  const triggerLabel = React.useMemo(() => {
    if (!value.startDate) return placeholder;
    const start = ymdToDate(value.startDate);
    if (!value.endDate || value.startDate === value.endDate) {
      return format(start, 'MMM d, yyyy');
    }
    const end = ymdToDate(value.endDate);
    return `${format(start, 'MMM d')} → ${format(end, 'MMM d, yyyy')}`;
  }, [value, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start font-normal',
            !value.startDate && 'text-muted-foreground',
            overlap && 'border-destructive/60',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3 border-b">
          <LeaveCalendarLegend />
        </div>
        <LeaveCalendar
          selectionMode="range"
          selected={selectedRange}
          onSelect={onSelect}
          holidays={holidays}
          weeklyOffDays={weeklyOffDays}
          leaves={existingLeaves}
          fromDate={fromDate}
          numberOfMonths={2}
        />
        <div className="border-t p-3 space-y-2">
          {value.startDate && value.endDate ? (
            <div className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Working days</span>
                <span className="font-semibold">
                  {singleDateOnly ? 0.5 : summary.working}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {summary.totalCalendar} calendar day{summary.totalCalendar === 1 ? '' : 's'} ·{' '}
                {summary.holidayCount > 0 && `${summary.holidayCount} holiday${summary.holidayCount === 1 ? '' : 's'} · `}
                {summary.weeklyOffs > 0 && `${summary.weeklyOffs} weekend day${summary.weeklyOffs === 1 ? '' : 's'}`}
                {summary.holidayCount === 0 && summary.weeklyOffs === 0 && 'no skipped days'}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {singleDateOnly ? 'Pick a date.' : 'Pick a start date, then an end date.'}
            </div>
          )}

          {overlap && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 rounded px-2 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Overlaps with an existing {overlap.status.toLowerCase()} leave (
                {overlap.startDate}
                {overlap.startDate !== overlap.endDate ? ` → ${overlap.endDate}` : ''}
                ).
              </span>
            </div>
          )}

          {!overlap && value.startDate && value.endDate && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>No conflicts.</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
