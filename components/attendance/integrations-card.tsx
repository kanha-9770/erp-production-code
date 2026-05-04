"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
        <CardContent className="flex items-center gap-2 py-12 justify-center text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading linked forms…
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-6 flex items-start gap-2 text-sm text-red-800">
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
      <div key={slot} className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-medium text-gray-700">
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-emerald-600" />
          Linked forms (Attendance ↔ Payroll)
        </CardTitle>
        <CardDescription>
          Pick the forms that already hold your holiday list and leave
          applications. The same selections feed both the attendance widget
          (Holiday / On-leave banner) and the payroll engine (paid days,
          deductions). One source of truth — change here, both update.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
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
          <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
            <div className="flex items-start gap-1.5 text-blue-900">
              <Sparkles className="h-3.5 w-3.5 mt-0.5" />
              <span>
                We found forms whose names match common holiday / leave
                conventions. Apply the suggestions or pick manually below.
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={acceptSuggestions}>
              Apply suggestions
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {renderPicker("holiday")}
          {renderPicker("leave")}
        </div>

        <div>
          <button
            type="button"
            className="text-xs text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide" : "Show"} payroll-only bindings (employee /
            check-in / check-out forms)
          </button>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-100">
            {renderPicker("employee")}
            {renderPicker("checkIn")}
            {renderPicker("checkOut")}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={load}
            disabled={loading || saving}
          >
            <RefreshCcw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={!isDirty || saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Save linked forms
          </Button>
        </div>
      </CardContent>
    </Card>
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
        "rounded-md border px-3 py-2",
        ok ? "border-gray-200 bg-white" : "border-amber-200 bg-amber-50",
      ].join(" ")}
    >
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-[11px] text-gray-600 mt-1">{note}</div>
    </div>
  );
}
