"use client";

/**
 * Organization Policy — org-wide working-time & calendar defaults, stored in
 * the `policy` setup section. Working days are toggle chips; the rest are
 * selects. Owner-only edit with a sticky save bar.
 */

import { useMemo, useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useOrgSetupSection } from "../use-org-setup";
import { SetupSaveBar } from "../setup-save-bar";
import { ReadOnlyBanner } from "../read-only-banner";
import { WEEKDAYS, MONTHS, DATE_FORMATS, COMMON_TIMEZONES } from "../constants";

interface Policy {
  workingDays: string[];
  weekStart: string;
  leaveYearStartMonth: string;
  fiscalYearStartMonth: string;
  timezone: string;
  dateFormat: string;
}

const DEFAULT_POLICY: Policy = {
  workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  weekStart: "Monday",
  leaveYearStartMonth: "January",
  fiscalYearStartMonth: "April",
  timezone: "Asia/Kolkata",
  dateFormat: "DD/MM/YYYY",
};

function normalize(p: Partial<Policy> | undefined): Policy {
  return {
    workingDays: Array.isArray(p?.workingDays)
      ? p!.workingDays
      : DEFAULT_POLICY.workingDays,
    weekStart: p?.weekStart || DEFAULT_POLICY.weekStart,
    leaveYearStartMonth:
      p?.leaveYearStartMonth || DEFAULT_POLICY.leaveYearStartMonth,
    fiscalYearStartMonth:
      p?.fiscalYearStartMonth || DEFAULT_POLICY.fiscalYearStartMonth,
    timezone: p?.timezone || DEFAULT_POLICY.timezone,
    dateFormat: p?.dateFormat || DEFAULT_POLICY.dateFormat,
  };
}

export function OrgPolicySection() {
  // Stored shape may use a workingDays array — the setup API stores list-style
  // values too, but policy is an "object" section, so arrays inside it are kept
  // as a comma string. We serialize workingDays to a string for transport and
  // parse on read to stay within the object-section scalar contract.
  const { saved, isOwner, loading, saving, save } = useOrgSetupSection<
    Record<string, string>
  >("policy", {});

  const savedPolicy = useMemo<Policy>(() => {
    const raw = saved ?? {};
    return normalize({
      ...raw,
      workingDays:
        typeof raw.workingDays === "string" && raw.workingDays.length > 0
          ? raw.workingDays.split(",")
          : undefined,
    } as Partial<Policy>);
  }, [saved]);

  const [draft, setDraft] = useState<Policy>(DEFAULT_POLICY);
  useEffect(() => {
    if (!loading) setDraft(savedPolicy);
  }, [loading, savedPolicy]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedPolicy);

  const toggleDay = (day: string) => {
    if (!isOwner) return;
    setDraft((d) => ({
      ...d,
      workingDays: d.workingDays.includes(day)
        ? d.workingDays.filter((x) => x !== day)
        : [...WEEKDAYS].filter((w) => d.workingDays.includes(w) || w === day),
    }));
  };

  const onSave = () => {
    // Flatten workingDays to a comma string for the object-section contract.
    save({
      workingDays: draft.workingDays.join(","),
      weekStart: draft.weekStart,
      leaveYearStartMonth: draft.leaveYearStartMonth,
      fiscalYearStartMonth: draft.fiscalYearStartMonth,
      timezone: draft.timezone,
      dateFormat: draft.dateFormat,
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: string[],
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={!isOwner || saving}
      >
        <SelectTrigger>
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="pb-28">
      <div className="mb-5 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-foreground">
          Organization Policy
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Working-time and calendar defaults applied across the organization.
        </p>
      </div>

      {!isOwner && <ReadOnlyBanner what="organization policy" />}

      <div className="space-y-6">
        {/* Working days */}
        <div className="rounded-xl border bg-card shadow-sm p-4 sm:p-5">
          <Label className="text-sm font-medium">Working days</Label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            Days counted as working days for attendance and leave.
          </p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const active = draft.workingDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  disabled={!isOwner || saving}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-60",
                    active
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-input bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {day.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Calendar settings */}
        <div className="rounded-xl border bg-card shadow-sm p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field(
              "Week starts on",
              draft.weekStart,
              (v) => setDraft((d) => ({ ...d, weekStart: v })),
              WEEKDAYS,
            )}
            {field(
              "Default timezone",
              draft.timezone,
              (v) => setDraft((d) => ({ ...d, timezone: v })),
              COMMON_TIMEZONES,
            )}
            {field(
              "Leave year starts in",
              draft.leaveYearStartMonth,
              (v) => setDraft((d) => ({ ...d, leaveYearStartMonth: v })),
              MONTHS,
            )}
            {field(
              "Fiscal year starts in",
              draft.fiscalYearStartMonth,
              (v) => setDraft((d) => ({ ...d, fiscalYearStartMonth: v })),
              MONTHS,
            )}
            {field(
              "Date format",
              draft.dateFormat,
              (v) => setDraft((d) => ({ ...d, dateFormat: v })),
              DATE_FORMATS,
            )}
          </div>
        </div>
      </div>

      {isOwner && (
        <SetupSaveBar
          dirty={dirty}
          saving={saving}
          onSave={onSave}
          onDiscard={() => setDraft(savedPolicy)}
        />
      )}
    </div>
  );
}
