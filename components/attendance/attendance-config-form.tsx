"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save, AlertTriangle, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type GeofenceMode = "OFF" | "CAPTURE" | "ENFORCE";
type PayableBasis = "monthDays" | "fixed26" | "fixed30";
type FaceCaptureMode = "OFF" | "OPTIONAL" | "REQUIRED";

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
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ---------------- Shift defaults ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Shift</CardTitle>
          <CardDescription>
            Default working hours for the org. Late, overtime and half-day are
            measured against these.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <Field label="Grace minutes" htmlFor="graceMinutes" hint="Late starts after shift + grace">
            <Input
              id="graceMinutes"
              type="number"
              min={0}
              step={1}
              value={form.graceMinutes}
              onChange={(e) => updateForm("graceMinutes", e.target.value)}
            />
          </Field>
          <Field label="Break minutes" htmlFor="breakMinutes" hint="Subtracted from worked time">
            <Input
              id="breakMinutes"
              type="number"
              min={0}
              step={5}
              value={form.breakMinutes}
              onChange={(e) => updateForm("breakMinutes", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* ---------------- Day classification ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Day classification</CardTitle>
          <CardDescription>
            How the engine decides if a day counts as half, full, or overtime.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              onChange={(e) => updateForm("overtimeAfterHours", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* ---------------- Working week ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Working week</CardTitle>
          <CardDescription>
            Days marked here are weekly-offs. Payroll counts them as paid by default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, idx) => {
              const active = form.weeklyOffDays.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleWeeklyOff(idx)}
                  className={[
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Currently off: {form.weeklyOffDays.length === 0
              ? "none"
              : form.weeklyOffDays.map((d) => DAY_LABELS[d]).join(", ")}
          </p>
        </CardContent>
      </Card>

      {/* ---------------- Auto-checkout ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-checkout</CardTitle>
          <CardDescription>
            Anyone still checked in after this wall-clock time is auto-checked-out
            on the next status read. Stopgap for orgs without a worker — converts
            cleanly to a scheduled job later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="autoCheckoutEnabled"
              checked={form.autoCheckoutEnabled}
              onCheckedChange={(v: boolean) => updateForm("autoCheckoutEnabled", v)}
            />
            <Label htmlFor="autoCheckoutEnabled" className="cursor-pointer">
              Enable auto-checkout
            </Label>
          </div>
          {form.autoCheckoutEnabled && (
            <Field label="Auto-checkout time" htmlFor="autoCheckoutAt">
              <Input
                id="autoCheckoutAt"
                type="time"
                value={form.autoCheckoutAt}
                onChange={(e) => updateForm("autoCheckoutAt", e.target.value)}
              />
            </Field>
          )}
        </CardContent>
      </Card>

      {/* ---------------- Geofence ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Geofence</CardTitle>
          <CardDescription>
            OFF — capture nothing. CAPTURE — record location, allow anywhere.
            ENFORCE — reject punches outside the fence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Mode" htmlFor="geofenceMode">
            <Select
              value={form.geofenceMode}
              onValueChange={(v: string) => updateForm("geofenceMode", v as GeofenceMode)}
            >
              <SelectTrigger id="geofenceMode" className="w-56">
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Latitude" htmlFor="geofenceLat">
                <Input
                  id="geofenceLat"
                  type="number"
                  step="0.0000001"
                  placeholder="e.g. 28.6139"
                  value={form.geofenceLat}
                  onChange={(e) => updateForm("geofenceLat", e.target.value)}
                />
              </Field>
              <Field label="Longitude" htmlFor="geofenceLng">
                <Input
                  id="geofenceLng"
                  type="number"
                  step="0.0000001"
                  placeholder="e.g. 77.2090"
                  value={form.geofenceLng}
                  onChange={(e) => updateForm("geofenceLng", e.target.value)}
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
                  onChange={(e) => updateForm("geofenceRadiusM", e.target.value)}
                />
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------- IP allowlist ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>IP allowlist</CardTitle>
          <CardDescription>
            Empty list means any IP is allowed. Otherwise punches from outside
            are rejected. One IP per line (CIDR support coming later).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            placeholder={"203.0.113.42\n203.0.113.43"}
            value={form.ipWhitelistRaw}
            onChange={(e) => updateForm("ipWhitelistRaw", e.target.value)}
            className="font-mono text-xs"
          />
        </CardContent>
      </Card>

      {/* ---------------- Payable basis ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Payable basis</CardTitle>
          <CardDescription>
            How payroll divides the monthly base salary into a per-day rate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={form.payableBasis}
            onValueChange={(v: string) => updateForm("payableBasis", v as PayableBasis)}
          >
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthDays">Calendar days in month</SelectItem>
              <SelectItem value="fixed26">Fixed 26 days</SelectItem>
              <SelectItem value="fixed30">Fixed 30 days</SelectItem>
            </SelectContent>
          </Select>
          <p className="flex items-start gap-2 text-xs text-gray-500">
            <Info className="h-3.5 w-3.5 mt-0.5" />
            Stored in AttendanceConfiguration; payroll-store reads it as a
            fallback when there's no explicit setup-wizard policy.
          </p>
        </CardContent>
      </Card>

      {/* ---------------- Workflow integration ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow integration</CardTitle>
          <CardDescription>
            Every successful check-in / check-out fires the existing workflow
            engine under this module name. Rules with action "Create" run on
            check-in, rules with "Edit" run on check-out, "Create or Edit"
            runs for both. Leave empty to disable workflow firing for
            attendance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field
            label="Module name (must match an existing FormModule)"
            htmlFor="workflowModuleName"
            hint="Default 'Attendance'. Use the exact name of the module under which your workflow rules are defined."
          >
            <Input
              id="workflowModuleName"
              type="text"
              placeholder="Attendance"
              value={form.workflowModuleName}
              onChange={(e) => updateForm("workflowModuleName", e.target.value)}
            />
          </Field>
          <p className="flex items-start gap-2 text-xs text-gray-500">
            <Info className="h-3.5 w-3.5 mt-0.5" />
            Field-Update actions on punches are skipped (the Attendance table
            isn't a form record). System Notification, Email Notification, and
            Function actions all fire normally with full punch context.
          </p>
        </CardContent>
      </Card>

      {/* ---------------- Safety ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Safety</CardTitle>
          <CardDescription>
            Guards that run before any check-in / check-out is recorded.
            Rejected attempts are still logged to the audit log so you can
            see who tried what.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <Switch
              id="enforceEmployeeActive"
              checked={form.enforceEmployeeActive}
              onCheckedChange={(v: boolean) => updateForm("enforceEmployeeActive", v)}
            />
            <Label htmlFor="enforceEmployeeActive" className="cursor-pointer leading-snug">
              <span className="block font-medium">Block punches from inactive employees</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Refuses check-in / check-out for any user whose linked Employee
                row is INACTIVE / RESIGNED / TERMINATED. Off by default so
                fresh tenants without Employee rows aren't locked out.
              </span>
            </Label>
          </div>
          <Field
            label="Minimum seconds between consecutive punches"
            htmlFor="minPunchGapSeconds"
            hint="Catches accidental double-tap and casual scripted abuse. 0 disables. Idempotent retries (same key) bypass."
          >
            <Input
              id="minPunchGapSeconds"
              type="number"
              min={0}
              step={1}
              value={form.minPunchGapSeconds}
              onChange={(e) => updateForm("minPunchGapSeconds", e.target.value)}
              className="w-32"
            />
          </Field>
        </CardContent>
      </Card>

      {/* ---------------- Approval roles ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Approval roles</CardTitle>
          <CardDescription>
            Pick the roles allowed to approve regularization requests and
            file manual entries on behalf of others. Org admins can always
            approve regardless of this list — selections here just extend
            the privilege to non-admin roles (e.g. Manager, HR Lead).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {roles.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-500">
              No roles found in your organization yet. Create roles first
              under Settings → Profiles.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {roles.map((role) => {
                const checked = form.attendanceApproverRoleIds.includes(role.id);
                return (
                  <label
                    key={role.id}
                    className={[
                      "flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors",
                      checked
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-gray-200 bg-white hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleApproverRole(role.id)}
                      disabled={role.isAdmin}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {role.name}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {role.isAdmin
                          ? "Always approves (admin role)"
                          : "Click to grant approval rights"}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <p className="flex items-start gap-2 text-xs text-gray-500 pt-2">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            Approvers also see "Pending review" in the Regularizations tab,
            can manual-entry attendance for any user, and can submit
            regularizations on behalf of others.
          </p>
        </CardContent>
      </Card>

      {/* ---------------- Sidebar placement ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Sidebar placement</CardTitle>
          <CardDescription>
            Choose which module the sidebar nests the Attendance link
            under. Pick your HR (or equivalent) module so users see
            Attendance live next to their HR forms. Empty = no sidebar
            link, but the page is still reachable from Settings or the
            widget popover.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Anchor module" htmlFor="attendanceModuleId">
            <Select
              value={form.attendanceModuleId || "__none__"}
              onValueChange={(v: string) =>
                updateForm("attendanceModuleId", v === "__none__" ? "" : v)
              }
            >
              <SelectTrigger id="attendanceModuleId" className="w-full max-w-md">
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
        </CardContent>
      </Card>

      {/* ---------------- Notifications ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Drives the in-app bell. The workflow engine handles broader
            notifications (admin alerts, emails) — this toggle is just for
            the user-facing daily trail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <Switch
              id="notifyOnPunch"
              checked={form.notifyOnPunch}
              onCheckedChange={(v: boolean) => updateForm("notifyOnPunch", v)}
            />
            <Label htmlFor="notifyOnPunch" className="cursor-pointer leading-snug">
              <span className="block font-medium">
                Notify the employee on every punch
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Posts a row to the bell with the late / overtime breakdown.
                Goes only to the user who punched — admins still get
                whatever the workflow rules send.
              </span>
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Face capture ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Face capture</CardTitle>
          <CardDescription>
            Capture a photo of the user at every punch as proof of attendance.
            Photos are uploaded via the existing image-upload pipeline and
            attached to the Attendance row (visible in the My / Team
            attendance pages and the audit log).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Mode" htmlFor="faceCaptureMode">
            <Select
              value={form.faceCaptureMode}
              onValueChange={(v: string) =>
                updateForm("faceCaptureMode", v as FaceCaptureMode)
              }
            >
              <SelectTrigger id="faceCaptureMode" className="w-72">
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
              hint="Server-side cap. Browser already downscales; 800 KB is generous."
            >
              <Input
                id="facePhotoMaxKb"
                type="number"
                min={50}
                max={10000}
                step={50}
                value={form.facePhotoMaxKb}
                onChange={(e) => updateForm("facePhotoMaxKb", e.target.value)}
                className="w-40"
              />
            </Field>
          )}
          <p className="flex items-start gap-2 text-xs text-gray-500">
            <Info className="h-3.5 w-3.5 mt-0.5" />
            REQUIRED rejects punches without a photo with code
            <code className="mx-1">FACE_PHOTO_REQUIRED</code>; OPTIONAL captures
            when the device has a camera and the user grants permission.
          </p>
        </CardContent>
      </Card>

      {/* ---------------- Submit ---------------- */}
      <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-white/80 backdrop-blur-sm border-t border-gray-200 -mx-4 px-4 py-3 sm:-mx-6 sm:px-6">
        {isDirty && (
          <span className="text-xs text-amber-700">Unsaved changes</span>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={loadConfig}
          disabled={saving || loading}
        >
          Reset
        </Button>
        <Button type="submit" disabled={!isDirty || saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save configuration
        </Button>
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
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-gray-700">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
