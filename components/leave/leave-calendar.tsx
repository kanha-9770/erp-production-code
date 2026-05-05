'use client';

/**
 * LeaveCalendar — shared month-view calendar for the leave module.
 *
 * Renders a react-day-picker calendar with rich modifiers showing
 * holidays, weekly-offs, and existing leaves overlaid by status.
 * Reusable across:
 *   • the apply form (range picker)
 *   • the My Leaves "Calendar" tab
 *   • the Approver "Calendar" view
 *   • the Holidays admin page
 *
 * Designed to be presentational — fetching is the parent's job. This keeps
 * caching strategies flexible (SWR / RTK Query / vanilla fetch all work).
 */

import * as React from 'react';
import { DayPicker, type DayPickerProps, type Matcher } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type LeaveDuration = 'FULL_DAY' | 'HALF_DAY_FIRST' | 'HALF_DAY_SECOND';

export interface CalendarHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  isOptional?: boolean;
}

export interface CalendarLeave {
  id: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
  status: LeaveStatus;
  duration?: LeaveDuration;
  leaveType?: string | null;
  // Optional applicant info — used by the Approver calendar tooltip.
  user?: {
    id?: string;
    email?: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

export interface LeaveCalendarProps
  extends Omit<DayPickerProps, 'mode' | 'selected' | 'onSelect' | 'modifiers' | 'modifiersClassNames'> {
  holidays?: CalendarHoliday[];
  weeklyOffDays?: number[]; // 0 = Sun … 6 = Sat
  leaves?: CalendarLeave[];

  /**
   * - 'none'   → display-only, clicks ignored
   * - 'single' → onSelect emits a single Date | undefined
   * - 'range'  → onSelect emits { from?: Date; to?: Date }
   */
  selectionMode?: 'none' | 'single' | 'range';

  /** controlled selection */
  selected?: Date | { from?: Date; to?: Date } | undefined;
  onSelect?: (selection: any) => void;

  /** Disable past dates (today is allowed). */
  disablePast?: boolean;
  /** Extra date matchers to disable on top of past + weekly-off. */
  disabled?: Matcher | Matcher[];
  /** Show holiday/leave overlays even when disabled. Defaults to true. */
  highlightDisabled?: boolean;
}

export function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ymdToDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns the inclusive set of YMD strings between start and end.
 * Caller must guarantee start <= end.
 */
function expandRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = ymdToDate(start);
  const last = ymdToDate(end);
  while (cur <= last) {
    out.push(dateToYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function LeaveCalendar({
  holidays = [],
  weeklyOffDays = [],
  leaves = [],
  selectionMode = 'none',
  selected,
  onSelect,
  disablePast = false,
  disabled,
  className,
  numberOfMonths = 1,
  ...rest
}: LeaveCalendarProps) {
  // Build per-day metadata maps once per render. Keyed by YMD for O(1) lookup
  // inside DayPicker's matcher functions which are called per visible day.
  const holidayByYmd = React.useMemo(() => {
    const m = new Map<string, CalendarHoliday>();
    for (const h of holidays) m.set(h.date, h);
    return m;
  }, [holidays]);

  const leavesByYmd = React.useMemo(() => {
    const m = new Map<string, CalendarLeave[]>();
    for (const l of leaves) {
      if (l.startDate > l.endDate) continue; // defensive
      for (const d of expandRange(l.startDate, l.endDate)) {
        const list = m.get(d) ?? [];
        list.push(l);
        m.set(d, list);
      }
    }
    return m;
  }, [leaves]);

  const weeklyOffSet = React.useMemo(() => new Set(weeklyOffDays), [weeklyOffDays]);

  // Modifiers — DayPicker accepts a function that returns boolean per day.
  const modifiers: Record<string, (d: Date) => boolean> = {
    weeklyOff: (d) => weeklyOffSet.has(d.getDay()),
    holiday: (d) => {
      const h = holidayByYmd.get(dateToYmd(d));
      return !!h && !h.isOptional;
    },
    holidayOptional: (d) => {
      const h = holidayByYmd.get(dateToYmd(d));
      return !!h && !!h.isOptional;
    },
    leaveApproved: (d) =>
      (leavesByYmd.get(dateToYmd(d)) ?? []).some((l) => l.status === 'APPROVED'),
    leavePending: (d) =>
      (leavesByYmd.get(dateToYmd(d)) ?? []).some((l) => l.status === 'PENDING'),
    leaveCancelledOrRejected: (d) =>
      (leavesByYmd.get(dateToYmd(d)) ?? []).every(
        (l) => l.status === 'CANCELLED' || l.status === 'REJECTED',
      ) && (leavesByYmd.get(dateToYmd(d)) ?? []).length > 0,
  };

  const modifiersClassNames: Record<string, string> = {
    weeklyOff: 'rdp-weekly-off',
    holiday: 'rdp-holiday',
    holidayOptional: 'rdp-holiday-optional',
    leaveApproved: 'rdp-leave-approved',
    leavePending: 'rdp-leave-pending',
    leaveCancelledOrRejected: 'rdp-leave-rejected',
  };

  // Build the disabled matcher: stack past + caller-provided.
  const allDisabled = React.useMemo<Matcher | Matcher[]>(() => {
    const arr: Matcher[] = [];
    if (disablePast) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      arr.push({ before: today });
    }
    if (Array.isArray(disabled)) arr.push(...disabled);
    else if (disabled) arr.push(disabled);
    return arr.length === 1 ? arr[0] : arr.length > 0 ? arr : false;
  }, [disablePast, disabled]);

  // Day-tooltip helper. We don't render a custom day component (keeps
  // accessibility intact) — instead we set `title` on each day cell via the
  // built-in `formatters.formatDay` extension is heavy, so we attach the
  // title via a wrapper around DayPicker's day content.
  const formatDay = React.useCallback(
    (date: Date) => {
      const ymd = dateToYmd(date);
      const h = holidayByYmd.get(ymd);
      const ls = leavesByYmd.get(ymd) ?? [];
      const tooltipParts: string[] = [];
      if (h) tooltipParts.push(`${h.isOptional ? 'Optional holiday' : 'Holiday'}: ${h.name}`);
      if (weeklyOffSet.has(date.getDay())) tooltipParts.push('Weekly off');
      for (const l of ls) {
        const who =
          l.user?.firstName || l.user?.lastName
            ? `${l.user?.firstName ?? ''} ${l.user?.lastName ?? ''}`.trim()
            : l.user?.email ?? '';
        const halfTag =
          l.duration === 'HALF_DAY_FIRST'
            ? ' (½ AM)'
            : l.duration === 'HALF_DAY_SECOND'
              ? ' (½ PM)'
              : '';
        tooltipParts.push(
          `${l.status} • ${l.leaveType ?? 'Leave'}${halfTag}${who ? ` — ${who}` : ''}`,
        );
      }
      return (
        <span title={tooltipParts.join('\n')} className="block">
          {date.getDate()}
        </span>
      );
    },
    [holidayByYmd, leavesByYmd, weeklyOffSet],
  );

  // Compose props by selectionMode without `any` so TS can verify the union.
  const baseProps = {
    className: cn('p-3', className),
    showOutsideDays: false,
    numberOfMonths,
    modifiers,
    modifiersClassNames,
    disabled: allDisabled,
    classNames: {
      months: 'flex flex-col sm:flex-row gap-4',
      month: 'space-y-3',
      caption: 'flex justify-center pt-1 relative items-center',
      caption_label: 'text-sm font-semibold',
      nav: 'space-x-1 flex items-center',
      nav_button: cn(
        buttonVariants({ variant: 'outline' }),
        'h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100',
      ),
      nav_button_previous: 'absolute left-1',
      nav_button_next: 'absolute right-1',
      table: 'w-full border-collapse',
      head_row: 'flex',
      head_cell: 'text-muted-foreground rounded-md w-10 font-medium text-[0.7rem] uppercase tracking-wider',
      row: 'flex w-full mt-1',
      cell: 'h-10 w-10 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
      day: cn(
        buttonVariants({ variant: 'ghost' }),
        'h-10 w-10 p-0 font-normal aria-selected:opacity-100 rounded-md',
      ),
      day_range_end: 'day-range-end',
      day_selected:
        'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
      day_today: 'ring-2 ring-primary/40 ring-inset',
      day_outside: 'text-muted-foreground/50',
      day_disabled: 'text-muted-foreground/50 cursor-not-allowed',
      day_range_middle: 'aria-selected:bg-primary/15 aria-selected:text-foreground rounded-none',
    },
    components: {
      IconLeft: () => <ChevronLeft className="h-4 w-4" />,
      IconRight: () => <ChevronRight className="h-4 w-4" />,
      DayContent: ({ date }: { date: Date }) => formatDay(date),
    } as any,
    ...rest,
  };

  return (
    <>
      <CalendarStyles />
      {selectionMode === 'range' ? (
        <DayPicker
          {...(baseProps as any)}
          mode="range"
          selected={selected as any}
          onSelect={onSelect as any}
        />
      ) : selectionMode === 'single' ? (
        <DayPicker
          {...(baseProps as any)}
          mode="single"
          selected={selected as any}
          onSelect={onSelect as any}
        />
      ) : (
        <DayPicker {...(baseProps as any)} mode="single" selected={undefined} />
      )}
    </>
  );
}

/**
 * Per-modifier styling. Kept inline so the calendar component is self-
 * contained — drop-in usable from any page without touching globals.css.
 *
 * Color scheme:
 *   • Holiday   → red dot underline + faint red bg
 *   • Weekly-off→ slate background, slightly muted text
 *   • Approved  → green underline bar
 *   • Pending   → amber underline bar
 *   • Rejected  → diagonal strikethrough
 */
function CalendarStyles() {
  return (
    <style jsx global>{`
      .rdp-holiday {
        background-color: rgb(254 226 226 / 0.6);
        color: rgb(153 27 27);
        font-weight: 600;
      }
      .dark .rdp-holiday {
        background-color: rgb(127 29 29 / 0.4);
        color: rgb(254 202 202);
      }
      .rdp-holiday-optional {
        background-color: rgb(254 226 226 / 0.3);
        color: rgb(153 27 27);
      }
      .rdp-weekly-off {
        background-color: rgb(241 245 249);
        color: rgb(100 116 139);
      }
      .dark .rdp-weekly-off {
        background-color: rgb(30 41 59 / 0.6);
        color: rgb(148 163 184);
      }
      .rdp-leave-approved {
        position: relative;
      }
      .rdp-leave-approved::after {
        content: '';
        position: absolute;
        left: 18%;
        right: 18%;
        bottom: 4px;
        height: 3px;
        background: rgb(34 197 94);
        border-radius: 2px;
      }
      .rdp-leave-pending {
        position: relative;
      }
      .rdp-leave-pending::after {
        content: '';
        position: absolute;
        left: 18%;
        right: 18%;
        bottom: 4px;
        height: 3px;
        background: rgb(245 158 11);
        border-radius: 2px;
      }
      .rdp-leave-rejected {
        text-decoration: line-through;
        opacity: 0.55;
      }
    `}</style>
  );
}

/**
 * Compact legend — drop in next to a calendar so users learn the colors
 * without a tooltip hunt. Keeps the calendar component itself uncluttered.
 */
export function LeaveCalendarLegend({
  className,
  showLeaves = true,
  showHolidays = true,
}: {
  className?: string;
  showLeaves?: boolean;
  showHolidays?: boolean;
}) {
  return (
    <div className={cn('flex flex-wrap gap-3 text-xs', className)}>
      {showHolidays && (
        <>
          <LegendSwatch className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200">
            Holiday
          </LegendSwatch>
          <LegendSwatch className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Weekly off
          </LegendSwatch>
        </>
      )}
      {showLeaves && (
        <>
          <LegendBar color="bg-green-500">Approved</LegendBar>
          <LegendBar color="bg-amber-500">Pending</LegendBar>
        </>
      )}
    </div>
  );
}

function LegendSwatch({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-block h-3 w-5 rounded', className)} />
      <span className="text-muted-foreground">{children}</span>
    </span>
  );
}

function LegendBar({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-block h-3 w-5 rounded bg-muted">
        <span className={cn('absolute bottom-0.5 left-1/4 right-1/4 h-1 rounded', color)} />
      </span>
      <span className="text-muted-foreground">{children}</span>
    </span>
  );
}
