"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save, AlertTriangle, Info, RotateCcw, Circle } from "lucide-react";
// Card components no longer used — replaced by the local Section helper
// at the bottom of this file. Kept commented as an intentional removal
// signal for anyone tempted to re-add card chrome.
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type GeofenceMode = "OFF" | "CAPTURE" | "ENFORCE";
type PayableBasis = "monthDays" | "fixed26" | "fixed30";
type FaceCaptureMode = "OFF" | "OPTIONAL" | "REQUIRED";
type FaceVerifyMode = "OFF" | "WARN" | "ENFORCE";
type FaceLivenessMode = "OFF" | "PERMISSIVE" | "STRICT";

interface AttendanceConfig {
  id: string | null;
  organizationId: string | null;
  defaultShiftStart: string;
  defaultShiftEnd: string;
  graceMinutes: number;
  halfDayMinHours: number;
  fullDayMinHours: number;
  overtimeAfterHours: number;
  breakMinutes: number;
  weeklyOffDays: number[];
  autoCheckoutAt: string | null;
  geofenceMode: GeofenceMode;
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadiusM: number | null;
  ipWhitelist: string[];
  payableBasis: PayableBasis;
  workflowModuleName: string | null;
  enforceEmployeeActive: boolean;
  minPunchGapSeconds: number;
  faceCaptureMode: FaceCaptureMode;
  facePhotoMaxKb: number;
  faceVerifyMode: FaceVerifyMode;
  faceMatchThreshold: number;
  faceLivenessMode: FaceLivenessMode;
  attendanceModuleId: string | null;
  notifyOnPunch: boolean;
  attendanceApproverRoleIds: string[];
  isActive: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AttendanceConfigForm() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AttendanceConfig | null>(null);

  // Local form state mirrors the typed config but accepts string inputs from
  // the controls. We coerce on submit so the API receives the right shapes.
  const [form, setForm] = useState<{
    defaultShiftStart: string;
    defaultShiftEnd: string;
    graceMinutes: string;
    halfDayMinHours: string;
    fullDayMinHours: string;
    overtimeAfterHours: string;
    breakMinutes: string;
    weeklyOffDays: number[];
    autoCheckoutEnabled: boolean;
    autoCheckoutAt: string;
    geofenceMode: GeofenceMode;
    geofenceLat: string;
    geofenceLng: string;
    geofenceRadiusM: string;
    ipWhitelistRaw: string;
    payableBasis: PayableBasis;
    workflowModuleName: string;
    enforceEmployeeActive: boolean;
    minPunchGapSeconds: string;
    faceCaptureMode: FaceCaptureMode;
    facePhotoMaxKb: string;
    faceVerifyMode: FaceVerifyMode;
    faceMatchThreshold: string;
    faceLivenessMode: FaceLivenessMode;
    attendanceModuleId: string;
    notifyOnPunch: boolean;
    attendanceApproverRoleIds: string[];
  } | null>(null);

  // Flattened module list for the anchor picker. Loaded once on mount;
  // fresh enough since admins rarely add modules mid-session.
  const [modules, setModules] = useState<{ id: string; name: string; depth: number }[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string; isAdmin: boolean }[]>([]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/attendance-config", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to load configuration");
      }
      const c = json.config as AttendanceConfig;
      setConfig(c);
      setForm({
        defaultShiftStart: c.defaultShiftStart,
        defaultShiftEnd: c.defaultShiftEnd,
        graceMinutes: String(c.graceMinutes),
        halfDayMinHours: String(c.halfDayMinHours),
        fullDayMinHours: String(c.fullDayMinHours),
        overtimeAfterHours: String(c.overtimeAfterHours),
        breakMinutes: String(c.breakMinutes),
        weeklyOffDays: c.weeklyOffDays ?? [],
        autoCheckoutEnabled: !!c.autoCheckoutAt,
        autoCheckoutAt: c.autoCheckoutAt ?? "23:00",
        geofenceMode: c.geofenceMode,
        geofenceLat: c.geofenceLat == null ? "" : String(c.geofenceLat),
        geofenceLng: c.geofenceLng == null ? "" : String(c.geofenceLng),
        geofenceRadiusM:
          c.geofenceRadiusM == null ? "" : String(c.geofenceRadiusM),
        ipWhitelistRaw: (c.ipWhitelist ?? []).join("\n"),
        payableBasis: c.payableBasis,
        workflowModuleName: c.workflowModuleName ?? "",
        enforceEmployeeActive: !!c.enforceEmployeeActive,
        minPunchGapSeconds: String(c.minPunchGapSeconds ?? 5),
        faceCaptureMode: c.faceCaptureMode ?? "OFF",
        facePhotoMaxKb: String(c.facePhotoMaxKb ?? 800),
        faceVerifyMode: c.faceVerifyMode ?? "OFF",
        faceMatchThreshold: String(c.faceMatchThreshold ?? 0.55),
        faceLivenessMode: c.faceLivenessMode ?? "OFF",
        attendanceModuleId: c.attendanceModuleId ?? "",
        notifyOnPunch: c.notifyOnPunch ?? true,
        attendanceApproverRoleIds: Array.isArray(c.attendanceApproverRoleIds)
          ? [...c.attendanceApproverRoleIds]
          : [],
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Load modules for the anchor picker. Flattens a (possibly nested) tree
  // into `{id, name, depth}` so the dropdown can render with simple
  // indentation without us shipping a full tree component just for this.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/modules", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.success || !Array.isArray(j.data)) return;
        const out: { id: string; name: string; depth: number }[] = [];
        const walk = (nodes: any[], depth: number) => {
          for (const n of nodes) {
            if (!n?.id || typeof n.name !== "string") continue;
            out.push({ id: n.id, name: n.name, depth });
            if (Array.isArray(n.children) && n.children.length > 0) {
              walk(n.children, depth + 1);
            }
          }
        };
        walk(j.data, 0);
        setModules(out);
      })
      .catch(() => {
        // Picker stays empty; admin can paste an id by hand if needed.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Roles list for the approver picker. /api/role returns the roles in
  // the user's org with member counts; we keep just id+name+isAdmin.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/role", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.success || !Array.isArray(j.data)) return;
        setRoles(
          (j.data as any[])
            .map((r) => ({
              id: String(r.id),
              name: String(r.name ?? "(unnamed)"),
              isAdmin: !!r.isAdmin,
            }))
            .filter((r) => r.id && r.name),
        );
      })
      .catch(() => {
        // Roles list stays empty; admin can still save without picking.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = useMemo(() => {
    if (!config || !form) return false;
    return (
      form.defaultShiftStart !== config.defaultShiftStart ||
      form.defaultShiftEnd !== config.defaultShiftEnd ||
      Number(form.graceMinutes) !== config.graceMinutes ||
      Number(form.halfDayMinHours) !== config.halfDayMinHours ||
      Number(form.fullDayMinHours) !== config.fullDayMinHours ||
      Number(form.overtimeAfterHours) !== config.overtimeAfterHours ||
      Number(form.breakMinutes) !== config.breakMinutes ||
      JSON.stringify([...form.weeklyOffDays].sort()) !==
        JSON.stringify([...(config.weeklyOffDays ?? [])].sort()) ||
      form.autoCheckoutEnabled !== !!config.autoCheckoutAt ||
      (form.autoCheckoutEnabled
        ? form.autoCheckoutAt !== (config.autoCheckoutAt ?? "")
        : false) ||
      form.geofenceMode !== config.geofenceMode ||
      form.geofenceLat !== (config.geofenceLat == null ? "" : String(config.geofenceLat)) ||
      form.geofenceLng !== (config.geofenceLng == null ? "" : String(config.geofenceLng)) ||
      form.geofenceRadiusM !==
        (config.geofenceRadiusM == null ? "" : String(config.geofenceRadiusM)) ||
      form.ipWhitelistRaw !== (config.ipWhitelist ?? []).join("\n") ||
      form.payableBasis !== config.payableBasis ||
      form.workflowModuleName !== (config.workflowModuleName ?? "") ||
      form.enforceEmployeeActive !== !!config.enforceEmployeeActive ||
      Number(form.minPunchGapSeconds) !== config.minPunchGapSeconds ||
      form.faceCaptureMode !== config.faceCaptureMode ||
      Number(form.facePhotoMaxKb) !== config.facePhotoMaxKb ||
      form.faceVerifyMode !== config.faceVerifyMode ||
      Number(form.faceMatchThreshold) !== config.faceMatchThreshold ||
      form.faceLivenessMode !== config.faceLivenessMode ||
      form.attendanceModuleId !== (config.attendanceModuleId ?? "") ||
      form.notifyOnPunch !== !!config.notifyOnPunch ||
      JSON.stringify([...form.attendanceApproverRoleIds].sort()) !==
        JSON.stringify([...(config.attendanceApproverRoleIds ?? [])].sort())
    );
  }, [config, form]);

  const updateForm = useCallback(
    <K extends keyof NonNullable<typeof form>>(key: K, value: NonNullable<typeof form>[K]) => {
      setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  const toggleWeeklyOff = useCallback((day: number) => {
    setForm((prev) => {
      if (!prev) return prev;
      const set = new Set(prev.weeklyOffDays);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return { ...prev, weeklyOffDays: Array.from(set).sort() };
    });
  }, []);

  const toggleApproverRole = useCallback((roleId: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const set = new Set(prev.attendanceApproverRoleIds);
      if (set.has(roleId)) set.delete(roleId);
      else set.add(roleId);
      return { ...prev, attendanceApproverRoleIds: Array.from(set) };
    });
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form) return;

      // Coerce + validate before sending.
      const graceMinutes = Number(form.graceMinutes);
      const halfDayMinHours = Number(form.halfDayMinHours);
      const fullDayMinHours = Number(form.fullDayMinHours);
      const overtimeAfterHours = Number(form.overtimeAfterHours);
      const breakMinutes = Number(form.breakMinutes);

      if (!Number.isFinite(graceMinutes) || graceMinutes < 0) {
        toast({ title: "Grace must be a non-negative number", variant: "destructive" });
        return;
      }
      if (halfDayMinHours <= 0 || fullDayMinHours <= 0 || halfDayMinHours >= fullDayMinHours) {
        toast({
          title: "Half-day must be positive and below full-day",
          variant: "destructive",
        });
        return;
      }

      // Geofence: in ENFORCE mode the centre + radius are required. In CAPTURE
      // they are optional but we still warn rather than silently store half-info.
      if (
        form.geofenceMode !== "OFF" &&
        (!form.geofenceLat || !form.geofenceLng || !form.geofenceRadiusM)
      ) {
        const enforce = form.geofenceMode === "ENFORCE";
        toast({
          title: enforce
            ? "Geofence ENFORCE needs lat, lng and radius"
            : "Set geofence centre or switch to OFF",
          variant: "destructive",
        });
        if (enforce) return;
      }

      const ipWhitelist = form.ipWhitelistRaw
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const minPunchGapSeconds = Math.max(0, Math.floor(Number(form.minPunchGapSeconds) || 0));
      const trimmedWorkflowModule = form.workflowModuleName.trim();
      const facePhotoMaxKb = Math.max(50, Math.min(10_000, Math.floor(Number(form.facePhotoMaxKb) || 800)));
      const faceMatchThreshold = Math.max(
        0.3,
        Math.min(1.0, Number(form.faceMatchThreshold) || 0.55),
      );

      const payload = {
        defaultShiftStart: form.defaultShiftStart,
        defaultShiftEnd: form.defaultShiftEnd,
        graceMinutes,
        halfDayMinHours,
        fullDayMinHours,
        overtimeAfterHours,
        breakMinutes,
        weeklyOffDays: form.weeklyOffDays,
        autoCheckoutAt: form.autoCheckoutEnabled ? form.autoCheckoutAt : null,
        geofenceMode: form.geofenceMode,
        geofenceLat: form.geofenceLat ? Number(form.geofenceLat) : null,
        geofenceLng: form.geofenceLng ? Number(form.geofenceLng) : null,
        geofenceRadiusM: form.geofenceRadiusM
          ? Math.round(Number(form.geofenceRadiusM))
          : null,
        ipWhitelist,
        payableBasis: form.payableBasis,
        workflowModuleName: trimmedWorkflowModule.length > 0 ? trimmedWorkflowModule : null,
        enforceEmployeeActive: form.enforceEmployeeActive,
        minPunchGapSeconds,
        faceCaptureMode: form.faceCaptureMode,
        facePhotoMaxKb,
        faceVerifyMode: form.faceVerifyMode,
        faceMatchThreshold,
        faceLivenessMode: form.faceLivenessMode,
        attendanceModuleId: form.attendanceModuleId.trim() || null,
        notifyOnPunch: form.notifyOnPunch,
        attendanceApproverRoleIds: form.attendanceApproverRoleIds,
      };

      setSaving(true);
      try {
        const res = await fetch("/api/attendance-config", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          throw new Error(json?.error ?? "Failed to save configuration");
        }
        setConfig(json.config as AttendanceConfig);
        toast({
          title: "Configuration saved",
          description: "Widget and payroll will pick up the change immediately.",
        });
      } catch (e: any) {
        toast({
          title: "Save failed",
          description: e?.message ?? "Try again in a moment",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    },
    [form, toast],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading configuration…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5" />
        <div>
          <div className="font-semibold">Could not load configuration</div>
          <div className="text-red-700 mt-1">{error}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadConfig}
            className="mt-3"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!form) return null;

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col"
    >
      <Tabs
        defaultValue="shift"
        className="flex flex-col w-full"
      >
        {/* Tab bar — pill-segmented look on a soft gray track. Horizontal
            scroll on narrow viewports keeps all four tabs reachable. */}
        <div>
          <TabsList className="h-auto p-1 gap-0.5 justify-start overflow-x-auto w-full max-w-full bg-gray-100/70 rounded-lg">
            <TabsTrigger
              value="shift"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm data-[state=active]:border-gray-200 border border-transparent text-gray-600 hover:text-gray-900 hover:bg-white/60 px-3 py-1 text-xs font-medium whitespace-nowrap rounded-md h-7 transition-all"
            >
              Shift &amp; policy
            </TabsTrigger>
            <TabsTrigger
              value="capture"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm data-[state=active]:border-gray-200 border border-transparent text-gray-600 hover:text-gray-900 hover:bg-white/60 px-3 py-1 text-xs font-medium whitespace-nowrap rounded-md h-7 transition-all"
            >
              Capture &amp; security
            </TabsTrigger>
            <TabsTrigger
              value="approval"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm data-[state=active]:border-gray-200 border border-transparent text-gray-600 hover:text-gray-900 hover:bg-white/60 px-3 py-1 text-xs font-medium whitespace-nowrap rounded-md h-7 transition-all"
            >
              Approvals
            </TabsTrigger>
            <TabsTrigger
              value="placement"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm data-[state=active]:border-gray-200 border border-transparent text-gray-600 hover:text-gray-900 hover:bg-white/60 px-3 py-1 text-xs font-medium whitespace-nowrap rounded-md h-7 transition-all"
            >
              Module &amp; workflow
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ──────────────────────  Shift & policy  ────────────────────── */}
        <TabsContent value="shift" className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mt-2 focus-visible:outline-none">
          <Section
            title="Shift"
            hint="Late, overtime and half-day are measured against these"
            className="lg:col-span-2"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Field label="Shift start" htmlFor="defaultShiftStart">
                <Input
                  id="defaultShiftStart"
                  type="time"
                  value={form.defaultShiftStart}
                  onChange={(e) => updateForm("defaultShiftStart", e.target.value)}
                />
              </Field>
              <Field label="Shift end" htmlFor="defaultShiftEnd">
                <Input
                  id="defaultShiftEnd"
                  type="time"
                  value={form.defaultShiftEnd}
                  onChange={(e) => updateForm("defaultShiftEnd", e.target.value)}
                />
              </Field>
              <Field
                label="Grace minutes"
                htmlFor="graceMinutes"
                hint="Late starts after shift + grace"
              >
                <Input
                  id="graceMinutes"
                  type="number"
                  min={0}
                  step={1}
                  value={form.graceMinutes}
                  onChange={(e) => updateForm("graceMinutes", e.target.value)}
                />
              </Field>
              <Field
                label="Break minutes"
                htmlFor="breakMinutes"
                hint="Subtracted from worked time"
              >
                <Input
                  id="breakMinutes"
                  type="number"
                  min={0}
                  step={5}
                  value={form.breakMinutes}
                  onChange={(e) => updateForm("breakMinutes", e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Day classification"
            hint="How the engine decides half / full / overtime"
            className="lg:col-span-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <Field label="Half-day above (hours)" htmlFor="halfDayMinHours">
                <Input
                  id="halfDayMinHours"
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={form.halfDayMinHours}
                  onChange={(e) => updateForm("halfDayMinHours", e.target.value)}
                />
              </Field>
              <Field label="Full-day above (hours)" htmlFor="fullDayMinHours">
                <Input
                  id="fullDayMinHours"
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={form.fullDayMinHours}
                  onChange={(e) => updateForm("fullDayMinHours", e.target.value)}
                />
              </Field>
              <Field label="Overtime after (hours)" htmlFor="overtimeAfterHours">
                <Input
                  id="overtimeAfterHours"
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={form.overtimeAfterHours}
                  onChange={(e) =>
                    updateForm("overtimeAfterHours", e.target.value)
                  }
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Working week"
            hint="Marked days are weekly-offs (paid by default)"
            className="lg:col-span-2"
          >
            <div>
              <div className="flex flex-wrap gap-1.5">
                {DAY_LABELS.map((label, idx) => {
                  const active = form.weeklyOffDays.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleWeeklyOff(idx)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs transition-colors min-w-[40px] font-medium",
                        active
                          ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                      )}
                      aria-pressed={active}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Currently off:{" "}
                {form.weeklyOffDays.length === 0
                  ? "none"
                  : form.weeklyOffDays.map((d) => DAY_LABELS[d]).join(", ")}
              </p>
            </div>
          </Section>

          <Section
            title="Auto-checkout"
            hint="Auto-close stale check-ins"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="autoCheckoutEnabled"
                  checked={form.autoCheckoutEnabled}
                  onCheckedChange={(v: boolean) =>
                    updateForm("autoCheckoutEnabled", v)
                  }
                />
                <Label
                  htmlFor="autoCheckoutEnabled"
                  className="cursor-pointer text-xs"
                >
                  Enable auto-checkout
                </Label>
              </div>
              {form.autoCheckoutEnabled && (
                <Field label="Auto-checkout time" htmlFor="autoCheckoutAt">
                  <Input
                    id="autoCheckoutAt"
                    type="time"
                    value={form.autoCheckoutAt}
                    onChange={(e) =>
                      updateForm("autoCheckoutAt", e.target.value)
                    }
                    className="w-full max-w-[200px]"
                  />
                </Field>
              )}
            </div>
          </Section>

          <Section
            title="Payable basis"
            hint="Per-day rate denominator"
          >
            <Select
              value={form.payableBasis}
              onValueChange={(v: string) =>
                updateForm("payableBasis", v as PayableBasis)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthDays">
                  Calendar days in month
                </SelectItem>
                <SelectItem value="fixed26">Fixed 26 days</SelectItem>
                <SelectItem value="fixed30">Fixed 30 days</SelectItem>
              </SelectContent>
            </Select>
          </Section>
        </TabsContent>

        {/* ──────────────────────  Capture & security  ────────────────────── */}
        <TabsContent value="capture" className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mt-2 focus-visible:outline-none">
          <Section
            title="Face capture"
            hint="Photo proof per punch"
          >
            <div className="space-y-2">
              <Field label="Mode" htmlFor="faceCaptureMode">
                <Select
                  value={form.faceCaptureMode}
                  onValueChange={(v: string) =>
                    updateForm("faceCaptureMode", v as FaceCaptureMode)
                  }
                >
                  <SelectTrigger id="faceCaptureMode" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OFF">Off — no camera prompt</SelectItem>
                    <SelectItem value="OPTIONAL">
                      Optional — user can skip
                    </SelectItem>
                    <SelectItem value="REQUIRED">
                      Required — must capture to punch
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.faceCaptureMode !== "OFF" && (
                <Field
                  label="Max photo size (KB)"
                  htmlFor="facePhotoMaxKb"
                  hint="Browser downscales already; 800 KB is generous."
                >
                  <Input
                    id="facePhotoMaxKb"
                    type="number"
                    min={50}
                    max={10000}
                    step={50}
                    value={form.facePhotoMaxKb}
                    onChange={(e) =>
                      updateForm("facePhotoMaxKb", e.target.value)
                    }
                    className="w-full sm:w-40"
                  />
                </Field>
              )}

              {/* Face verification — runs identity check against the
                  user's stored enrollment. Requires faceCaptureMode to
                  be on (no photo → nothing to verify). */}
              {form.faceCaptureMode !== "OFF" && (
                <>
                  <Field
                    label="Verification"
                    htmlFor="faceVerifyMode"
                    hint="Off / Warn (log only) / Enforce (block mismatches)."
                  >
                    <Select
                      value={form.faceVerifyMode}
                      onValueChange={(v: string) =>
                        updateForm("faceVerifyMode", v as FaceVerifyMode)
                      }
                    >
                      <SelectTrigger id="faceVerifyMode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OFF">
                          Off — no identity check
                        </SelectItem>
                        <SelectItem value="WARN">
                          Warn — verify, log scores, never block
                        </SelectItem>
                        <SelectItem value="ENFORCE">
                          Enforce — reject punch on mismatch
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {form.faceVerifyMode !== "OFF" && (
                    <Field
                      label="Match threshold"
                      htmlFor="faceMatchThreshold"
                      hint="Lower = stricter. 0.55 is a balanced default; tune after observing WARN-mode scores."
                    >
                      <Input
                        id="faceMatchThreshold"
                        type="number"
                        min={0.3}
                        max={1.0}
                        step={0.01}
                        value={form.faceMatchThreshold}
                        onChange={(e) =>
                          updateForm("faceMatchThreshold", e.target.value)
                        }
                        className="w-full sm:w-40"
                      />
                    </Field>
                  )}
                </>
              )}

              {/* Anti-spoofing motion check. Captures 3 frames and
                  requires intra-face landmark motion — defeats the
                  "hold up a printed photo or phone screen" attack.
                  Adds ~1.5s to every punch. */}
              {form.faceCaptureMode !== "OFF" && (
                <Field
                  label="Liveness check"
                  htmlFor="faceLivenessMode"
                  hint="Captures 3 frames and requires natural face motion. Stops held-up photos / phone screens."
                >
                  <Select
                    value={form.faceLivenessMode}
                    onValueChange={(v: string) =>
                      updateForm("faceLivenessMode", v as FaceLivenessMode)
                    }
                  >
                    <SelectTrigger id="faceLivenessMode" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OFF">Off — no liveness check</SelectItem>
                      <SelectItem value="PERMISSIVE">
                        Permissive — block static photos, allow on detector errors
                      </SelectItem>
                      <SelectItem value="STRICT">
                        Strict — block static photos AND detector errors
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
          </Section>

          <Section
            title="Geofence"
            hint="OFF / CAPTURE / ENFORCE"
            className="lg:col-span-2"
          >
            <div className="space-y-2">
              <Field label="Mode" htmlFor="geofenceMode">
                <Select
                  value={form.geofenceMode}
                  onValueChange={(v: string) =>
                    updateForm("geofenceMode", v as GeofenceMode)
                  }
                >
                  <SelectTrigger id="geofenceMode" className="w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OFF">Off</SelectItem>
                    <SelectItem value="CAPTURE">Capture only</SelectItem>
                    <SelectItem value="ENFORCE">Enforce</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.geofenceMode !== "OFF" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Field label="Latitude" htmlFor="geofenceLat">
                    <Input
                      id="geofenceLat"
                      type="number"
                      step="0.0000001"
                      placeholder="e.g. 28.6139"
                      value={form.geofenceLat}
                      onChange={(e) =>
                        updateForm("geofenceLat", e.target.value)
                      }
                    />
                  </Field>
                  <Field label="Longitude" htmlFor="geofenceLng">
                    <Input
                      id="geofenceLng"
                      type="number"
                      step="0.0000001"
                      placeholder="e.g. 77.2090"
                      value={form.geofenceLng}
                      onChange={(e) =>
                        updateForm("geofenceLng", e.target.value)
                      }
                    />
                  </Field>
                  <Field label="Radius (metres)" htmlFor="geofenceRadiusM">
                    <Input
                      id="geofenceRadiusM"
                      type="number"
                      min={1}
                      step={10}
                      placeholder="e.g. 200"
                      value={form.geofenceRadiusM}
                      onChange={(e) =>
                        updateForm("geofenceRadiusM", e.target.value)
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
          </Section>

          <Section
            title="IP allowlist"
            hint="One IP per line. Empty = allow any."
            className="lg:col-span-2"
          >
            <Textarea
              rows={3}
              placeholder={"203.0.113.42\n203.0.113.43"}
              value={form.ipWhitelistRaw}
              onChange={(e) => updateForm("ipWhitelistRaw", e.target.value)}
              className="font-mono text-xs"
            />
          </Section>

          <Section
            title="Safety"
            hint="Pre-flight guards"
          >
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Switch
                  id="enforceEmployeeActive"
                  checked={form.enforceEmployeeActive}
                  onCheckedChange={(v: boolean) =>
                    updateForm("enforceEmployeeActive", v)
                  }
                />
                <Label
                  htmlFor="enforceEmployeeActive"
                  className="cursor-pointer leading-snug flex-1 min-w-0"
                >
                  <span className="block text-xs font-medium">
                    Block inactive employees
                  </span>
                  <span className="block text-[10px] text-gray-500 leading-snug">
                    Refuses if Employee.status is not ACTIVE.
                  </span>
                </Label>
              </div>
              <Field
                label="Min seconds between punches"
                htmlFor="minPunchGapSeconds"
                hint="0 disables. Idempotent retries bypass."
              >
                <Input
                  id="minPunchGapSeconds"
                  type="number"
                  min={0}
                  step={1}
                  value={form.minPunchGapSeconds}
                  onChange={(e) =>
                    updateForm("minPunchGapSeconds", e.target.value)
                  }
                  className="w-full sm:w-32"
                />
              </Field>
            </div>
          </Section>
        </TabsContent>

        {/* ──────────────────────  Approvals  ────────────────────── */}
        <TabsContent value="approval" className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mt-2 focus-visible:outline-none">
          <Section
            title="Approval roles"
            hint="Admins always approve. Add more roles to delegate."
            className="lg:col-span-2"
          >
            {roles.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
                No roles found. Create roles under Settings → Profiles.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {roles.map((role) => {
                  const checked =
                    form.attendanceApproverRoleIds.includes(role.id);
                  return (
                    <label
                      key={role.id}
                      className={cn(
                        "flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer transition-colors",
                        checked
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-gray-200 bg-white hover:bg-gray-50",
                        role.isAdmin && "opacity-70 cursor-not-allowed",
                      )}
                    >
                      <Checkbox
                        checked={checked || role.isAdmin}
                        onCheckedChange={() => toggleApproverRole(role.id)}
                        disabled={role.isAdmin}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 truncate">
                          {role.name}
                          {role.isAdmin && (
                            <span className="ml-1 text-[10px] text-emerald-700 font-normal">
                              (admin)
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </Section>

          <Section
            title="Notifications"
            className="lg:col-span-2"
          >
            <div className="flex items-start gap-2">
              <Switch
                id="notifyOnPunch"
                checked={form.notifyOnPunch}
                onCheckedChange={(v: boolean) =>
                  updateForm("notifyOnPunch", v)
                }
              />
              <Label
                htmlFor="notifyOnPunch"
                className="cursor-pointer leading-snug flex-1 min-w-0"
              >
                <span className="block text-xs font-medium">
                  Notify the employee on every punch
                </span>
                <span className="block text-[10px] text-gray-500 leading-snug">
                  Posts a row to the bell with late / overtime breakdown.
                </span>
              </Label>
            </div>
          </Section>
        </TabsContent>

        {/* ──────────────────────  Module & workflow  ────────────────────── */}
        <TabsContent value="placement" className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mt-2 focus-visible:outline-none">
          <Section
            title="Sidebar placement"
            hint="Where Attendance appears in the sidebar"
          >
            <Field label="Anchor module" htmlFor="attendanceModuleId">
              <Select
                value={form.attendanceModuleId || "__none__"}
                onValueChange={(v: string) =>
                  updateForm("attendanceModuleId", v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger
                  id="attendanceModuleId"
                  className="w-full"
                >
                  <SelectValue placeholder="Pick a module" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__">— No sidebar link —</SelectItem>
                  {modules.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span style={{ paddingLeft: `${m.depth * 12}px` }}>
                        {m.depth > 0 && (
                          <span className="text-gray-400 mr-1">↳</span>
                        )}
                        {m.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </Section>

          <Section
            title="Workflow integration"
            hint="Module name for workflow rules"
          >
            <Field
              label="Module name"
              htmlFor="workflowModuleName"
              hint="Must match an existing FormModule. Empty = disabled."
            >
              <Input
                id="workflowModuleName"
                type="text"
                placeholder="Attendance"
                value={form.workflowModuleName}
                onChange={(e) =>
                  updateForm("workflowModuleName", e.target.value)
                }
              />
            </Field>
          </Section>
        </TabsContent>
      </Tabs>

      {/* ---------------- Submit save bar ---------------- */}
      {/* Fixed-height footer of the form. Subtly elevated background and a
          full-width status indicator on the left when there are unsaved
          changes — clearer signal than a tiny pill. */}
      <div
        className={cn(
          "mt-2.5 -mx-px px-3 py-2 rounded-lg border bg-white/95",
          "flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3",
          isDirty
            ? "border-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]"
            : "border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        )}
      >
        {/* Status indicator on the left — visible on every viewport so
            mobile users still get the unsaved-changes signal. */}
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs",
            isDirty ? "text-amber-700" : "text-gray-400",
          )}
        >
          <Circle
            className={cn(
              "h-2 w-2",
              isDirty
                ? "fill-amber-500 text-amber-500"
                : "fill-gray-300 text-gray-300",
            )}
          />
          {isDirty ? "Unsaved changes" : "All saved"}
        </span>
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadConfig}
            disabled={saving || loading || !isDirty}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!isDirty || saving}
            className="min-w-[8rem]"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-gray-700">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-gray-500 leading-snug">{hint}</p>}
    </div>
  );
}

// Card-shaped section with refined visual treatment: white surface, soft
// border, gray-50 header strip with the title + optional inline hint.
// Compact internal padding so it doesn't waste space, but enough chrome to
// look like a proper settings panel. Use `lg:col-span-2` etc. from the
// parent grid to control width.
function Section({
  title,
  hint,
  className,
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden",
        className,
      )}
    >
      <header className="flex items-baseline justify-between gap-2 px-3 py-1.5 bg-gray-50/70 border-b border-gray-200/80">
        <h3 className="text-[11px] uppercase tracking-[0.04em] font-semibold text-gray-700">
          {title}
        </h3>
        {hint && (
          <span className="text-[10px] text-gray-500 truncate min-w-0 hidden sm:inline">
            {hint}
          </span>
        )}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}
