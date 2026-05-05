"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Save,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  RefreshCcw,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Slot = "employee" | "checkIn" | "checkOut" | "leave" | "holiday";

interface Bindings {
  employee: string | null;
  checkIn: string | null;
  checkOut: string | null;
  leave: string | null;
  holiday: string | null;
}

interface FormSummary {
  id: string;
  name: string;
  moduleId: string | null;
  moduleName: string | null;
  isPublished: boolean;
}

interface Diagnostics {
  month: string;
  holidaysThisMonth: number;
  leavesThisMonth: number;
  hasPayrollConfig: boolean;
}

interface IntegrationResponse {
  success: boolean;
  bindings: Bindings;
  suggestions: Bindings;
  broken: Bindings;
  forms: FormSummary[];
  diagnostics: Diagnostics;
  autoConfigured?: boolean;
  error?: string;
}

const SLOT_META: Record<
  Slot,
  { label: string; help: string; primary: boolean }
> = {
  holiday: {
    label: "Holiday list",
    help: "Records on this form mark days as company holidays — the widget shows a Holiday banner and payroll counts the day as paid.",
    primary: true,
  },
  leave: {
    label: "Leave management",
    help: "Approved leaves on this form drive the On-leave banner in the widget and the Leave breakdown in payroll.",
    primary: true,
  },
  employee: {
    label: "Employee profiles",
    help: "Source of base salary, designation, department, joining date used by payroll.",
    primary: false,
  },
  checkIn: {
    label: "Check-In form (optional)",
    help: "Form-based check-ins still feed payroll alongside the native widget. Leave empty if all check-ins go through the widget.",
    primary: false,
  },
  checkOut: {
    label: "Check-Out form (optional)",
    help: "Same as Check-In, for the matching outbound form.",
    primary: false,
  },
};

const SLOT_ORDER: Slot[] = ["holiday", "leave", "employee", "checkIn", "checkOut"];
const NONE = "__none__";

function bindingsEqual(a: Bindings, b: Bindings) {
  return (
    a.employee === b.employee &&
    a.checkIn === b.checkIn &&
    a.checkOut === b.checkOut &&
    a.leave === b.leave &&
    a.holiday === b.holiday
  );
}

export function IntegrationsCard() {
  const { toast } = useToast();
  const [data, setData] = useState<IntegrationResponse | null>(null);
  const [draft, setDraft] = useState<Bindings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Collapse the whole card once both primary forms are linked. Admins
  // rarely need to revisit this section after the initial setup, so we
  // hide the bulk and show a compact one-liner. Click the header to
  // expand again.
  const [isExpanded, setIsExpanded] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/attendance/integrations", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as IntegrationResponse;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to load integrations");
      }
      setData(json);
      setDraft(json.bindings);
      // Default open the advanced section if there's something configured
      // there already, so admins don't have to hunt for it.
      setShowAdvanced(
        !!(json.bindings.employee || json.bindings.checkIn || json.bindings.checkOut),
      );
      // Auto-collapse the whole card once both primary bindings are set —
      // unless the admin explicitly toggled it during this session.
      setIsExpanded((prev) => {
        if (prev !== null) return prev;
        const bothLinked = !!json.bindings.holiday && !!json.bindings.leave;
        return !bothLinked;
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isDirty = useMemo(() => {
    if (!data || !draft) return false;
    return !bindingsEqual(draft, data.bindings);
  }, [data, draft]);

  const setSlot = useCallback((slot: Slot, value: string | null) => {
    setDraft((prev) => (prev ? { ...prev, [slot]: value } : prev));
  }, []);

  const acceptSuggestions = useCallback(() => {
    if (!data) return;
    // Only fill slots that are currently empty — never overwrite a manual
    // pick with a suggestion.
    setDraft((prev) => {
      if (!prev) return prev;
      const next: Bindings = { ...prev };
      for (const slot of SLOT_ORDER) {
        if (!next[slot] && data.suggestions[slot]) {
          next[slot] = data.suggestions[slot];
        }
      }
      return next;
    });
  }, [data]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/attendance/integrations", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeFormId: draft.employee,
          checkInFormId: draft.checkIn,
          checkOutFormId: draft.checkOut,
          leaveFormId: draft.leave,
          holidayFormId: draft.holiday,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to save");
      }
      toast({
        title: "Linked forms saved",
        description: "Both attendance widget and payroll engine now read from these forms.",
      });
      // Reload so diagnostics + suggestions reflect the new bindings.
      await load();
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message ?? "Try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [draft, load, toast]);

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 justify-center text-xs text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading linked forms…
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="p-3.5 flex items-start gap-2 text-xs text-red-800">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>
            <div className="font-semibold">Could not load linked forms</div>
            <div className="mt-1">{error}</div>
            <Button size="sm" variant="outline" className="mt-3" onClick={load}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (!data || !draft) return null;

  const renderPicker = (slot: Slot) => {
    const meta = SLOT_META[slot];
    const value = draft[slot];
    const suggestion = data.suggestions[slot];
    const isSuggested = !value && !!suggestion;
    const broken = !!data.broken[slot];

    return (
      <div key={slot} className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium text-gray-700">
            {meta.label}
          </Label>
          <div className="flex items-center gap-1.5">
            {value && (
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]"
              >
                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                Linked
              </Badge>
            )}
            {isSuggested && (
              <Badge
                variant="outline"
                className="bg-blue-50 text-blue-800 border-blue-200 text-[10px]"
              >
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                Suggested
              </Badge>
            )}
            {broken && (
              <Badge
                variant="outline"
                className="bg-red-50 text-red-700 border-red-200 text-[10px]"
              >
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                Form missing
              </Badge>
            )}
          </div>
        </div>
        <Select
          value={value ?? NONE}
          onValueChange={(v: string) => setSlot(slot, v === NONE ? null : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick a form" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={NONE}>— Not linked —</SelectItem>
            {data.forms.map((f) => {
              const isRecommended = suggestion === f.id;
              return (
                <SelectItem key={f.id} value={f.id}>
                  <div className="flex flex-col">
                    <div className="text-sm flex items-center gap-1.5">
                      {f.name}
                      {isRecommended && (
                        <Sparkles className="h-3 w-3 text-blue-500" />
                      )}
                      {!f.isPublished && (
                        <span className="text-[10px] uppercase text-gray-400">
                          draft
                        </span>
                      )}
                    </div>
                    {f.moduleName && (
                      <div className="text-[11px] text-gray-500">
                        {f.moduleName}
                      </div>
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">{meta.help}</p>
      </div>
    );
  };

  const hasAnySuggestion = SLOT_ORDER.some(
    (s) => !draft[s] && !!data.suggestions[s],
  );

  return (
    <Card className="rounded-lg border-gray-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={!!isExpanded}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
          isExpanded
            ? "bg-gray-50/70 border-b border-gray-200/80"
            : "hover:bg-gray-50/70",
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
        )}
        <LinkIcon className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
        <span className="text-[11px] uppercase tracking-[0.04em] font-semibold text-gray-700 flex-1 truncate">
          Linked forms{" "}
          <span className="hidden sm:inline text-gray-400 font-normal normal-case tracking-normal">
            (Attendance ↔ Payroll)
          </span>
        </span>
        {!isExpanded && (
          <CompactStatus draft={draft} diagnostics={data.diagnostics} />
        )}
      </button>
      {!isExpanded ? null : (
      <CardContent className="p-3 space-y-2.5">
        {data.autoConfigured && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-start gap-1.5">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Auto-configured.</strong> We detected forms with familiar
              names and linked them automatically — payroll, attendance, and
              leave management are now reading from the same forms. Adjust below if
              we picked the wrong one.
            </span>
          </div>
        )}

        {/* Diagnostic strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <DiagnosticTile
            label="Holidays this month"
            value={String(data.diagnostics.holidaysThisMonth)}
            ok={data.diagnostics.holidaysThisMonth > 0 || !draft.holiday}
            note={
              draft.holiday
                ? data.diagnostics.holidaysThisMonth === 0
                  ? "Holiday form linked but no rows for this month."
                  : "Reading from linked form."
                : "Not linked yet."
            }
          />
          <DiagnosticTile
            label="Active leaves this month"
            value={String(data.diagnostics.leavesThisMonth)}
            ok={data.diagnostics.leavesThisMonth >= 0}
            note={
              draft.leave
                ? "Reading from linked form."
                : "Not linked yet."
            }
          />
          <DiagnosticTile
            label="Payroll config"
            value={data.diagnostics.hasPayrollConfig ? "Present" : "Missing"}
            ok={data.diagnostics.hasPayrollConfig}
            note={
              data.diagnostics.hasPayrollConfig
                ? "Saving here updates the same row payroll reads."
                : "Saving will create one for both systems."
            }
          />
        </div>

        {hasAnySuggestion && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
            <div className="flex items-start gap-1.5 text-blue-900">
              <Sparkles className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                We found forms whose names match common holiday / leave
                conventions. Apply the suggestions or pick manually below.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={acceptSuggestions}
              className="self-start sm:self-auto whitespace-nowrap"
            >
              Apply suggestions
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {renderPicker("holiday")}
          {renderPicker("leave")}
        </div>

        <div>
          <button
            type="button"
            className="text-[11px] text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide" : "Show"} payroll-only bindings (employee /
            check-in / check-out forms)
          </button>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1.5 border-t border-gray-100">
            {renderPicker("employee")}
            {renderPicker("checkIn")}
            {renderPicker("checkOut")}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-1.5 sm:gap-2 pt-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading || saving}
          >
            <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={!isDirty || saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            {saving ? "Saving…" : "Save linked forms"}
          </Button>
        </div>
      </CardContent>
      )}
    </Card>
  );
}

// Compact status pill shown when the card is collapsed. Tells the admin at
// a glance whether the integration is configured + the live counts, so they
// don't need to expand the card just to confirm it's working.
function CompactStatus({
  draft,
  diagnostics,
}: {
  draft: Bindings;
  diagnostics: Diagnostics;
}) {
  const both = !!draft.holiday && !!draft.leave;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        both
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      <CheckCircle2 className="h-2.5 w-2.5" />
      {both ? "Linked" : "Setup needed"}
      <span className="text-gray-500 font-normal">
        · {diagnostics.holidaysThisMonth}h · {diagnostics.leavesThisMonth}l
      </span>
    </span>
  );
}

function DiagnosticTile({
  label,
  value,
  ok,
  note,
}: {
  label: string;
  value: string;
  ok: boolean;
  note: string;
}) {
  return (
    <div
      className={[
        "rounded-md border px-2.5 py-1.5",
        ok ? "border-gray-200 bg-white" : "border-amber-200 bg-amber-50",
      ].join(" ")}
    >
      <div className="text-base font-semibold tabular-nums leading-tight">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-gray-500 mt-0.5">
        {label}
      </div>
      <div className="text-[10px] text-gray-600 mt-0.5 leading-snug">{note}</div>
    </div>
  );
}
