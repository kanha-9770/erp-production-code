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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  /** When set (e.g. "2.5h"), the summary shows this fixed short-leave window
   *  instead of a "Working days 0.5" count — short leaves are a fixed hourly
   *  window, not a fraction of a day. Implies single-date selection. */
  shortLeaveDurationLabel?: string | null;

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
  shortLeaveDurationLabel = null,
  placeholder = 'Pick dates',
  disabled = false,
  className,
}: LeaveDateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Match a 2-month layout to viewport width so the calendar isn't cramped on
  // phones. Defaults to 1 month during SSR/initial render — react-day-picker
  // re-lays out cleanly when the value flips.
  const [isWide, setIsWide] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => setIsWide(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

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
      // Leave endDate null until the user actually picks a 2nd date — otherwise
      // react-day-picker would see a complete range after click #1 and reset on
      // click #2, blocking multi-day selection.
      onChange({
        startDate: dateToYmd(sel.from),
        endDate: sel.to ? dateToYmd(sel.to) : null,
      });
    },
    [onChange, singleDateOnly],
  );

  // Working-day count excluding weekly-offs and (mandatory) holidays.
  const summary = React.useMemo(() => {
    if (!value.startDate) {
      return { totalCalendar: 0, working: 0, weeklyOffs: 0, holidayCount: 0 };
    }
    const effectiveEnd = value.endDate ?? value.startDate;
    const start = ymdToDate(value.startDate);
    const end = ymdToDate(effectiveEnd);
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
    if (!value.startDate) return null;
    const effectiveEnd = value.endDate ?? value.startDate;
    const collide = existingLeaves.find(
      (l) =>
        (l.status === 'PENDING' || l.status === 'APPROVED') &&
        l.startDate <= effectiveEnd &&
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start font-normal h-11 px-3',
            !value.startDate && 'text-muted-foreground',
            overlap && 'border-destructive/60',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{triggerLabel}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          // Reset DialogContent's default p-6 gap-4 — we manage our own sections.
          'p-0 gap-0 overflow-hidden',
          // Mobile: nearly full-screen centered card; desktop: snug to content.
          'w-[calc(100vw-1.5rem)] max-h-[90vh] sm:max-w-[640px]',
          'flex flex-col',
        )}
      >
        <DialogHeader className="px-4 py-3 border-b shrink-0 space-y-1 text-left">
          <DialogTitle className="text-base flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            {singleDateOnly ? 'Select a date' : 'Select date range'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {singleDateOnly
              ? shortLeaveDurationLabel
                ? 'Pick a single date for this short leave.'
                : 'Pick a single date for this half-day leave.'
              : 'Click a start date, then an end date. Or click Done after one date for a single-day leave.'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-2 border-b flex items-center justify-between gap-2 shrink-0 bg-muted/30">
          <LeaveCalendarLegend className="gap-x-3" />
          {minNoticeDays > 0 && (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              Min notice: {minNoticeDays}d
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto flex justify-center py-1">
          <LeaveCalendar
            selectionMode="range"
            selected={selectedRange}
            onSelect={onSelect}
            holidays={holidays}
            weeklyOffDays={weeklyOffDays}
            leaves={existingLeaves}
            fromDate={fromDate}
            numberOfMonths={isWide ? 2 : 1}
          />
        </div>

        <div className="border-t px-4 py-3 space-y-2 shrink-0 bg-background">
          {value.startDate ? (
            <div className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {shortLeaveDurationLabel ? 'Short leave' : 'Working days'}
                </span>
                <span className="font-semibold tabular-nums">
                  {shortLeaveDurationLabel
                    ? shortLeaveDurationLabel
                    : singleDateOnly
                      ? 0.5
                      : summary.working}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {!value.endDate && !singleDateOnly ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    Pick an end date — or click Done for a single-day leave.
                  </span>
                ) : (
                  <>
                    {summary.totalCalendar} calendar day
                    {summary.totalCalendar === 1 ? '' : 's'}
                    {summary.holidayCount > 0 &&
                      ` · ${summary.holidayCount} holiday${summary.holidayCount === 1 ? '' : 's'}`}
                    {summary.weeklyOffs > 0 &&
                      ` · ${summary.weeklyOffs} weekend day${summary.weeklyOffs === 1 ? '' : 's'}`}
                    {summary.holidayCount === 0 && summary.weeklyOffs === 0 && ' · no skipped'}
                  </>
                )}
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

          {!overlap && value.startDate && (value.endDate || singleDateOnly) && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>No conflicts.</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ startDate: null, endDate: null })}
              disabled={!value.startDate}
              className="h-9"
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={() => setOpen(false)}
              disabled={!value.startDate}
              className="h-9 px-5"
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
