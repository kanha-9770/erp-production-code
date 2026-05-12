"use client";

/**
 * Module settings admin (REBM). Covers RERA enforcement toggle, plan engine
 * selection and general config (hold period, company residual, area unit).
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  useGetRebmSettingsQuery,
  useUpdateRebmSettingsMutation,
} from "@/lib/api/real-estate/settings";
import { useGetPlansQuery } from "@/lib/api/real-estate/plans";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Settings,
  ShieldCheck,
  Layers,
  Save,
  ExternalLink,
} from "lucide-react";

type PlanEngine = "LEGACY" | "SLAB";
type AreaUnit = "SQYD" | "SQFT" | "SQM";

interface FormState {
  planEngine: PlanEngine;
  holdPeriodDays: string;
  companyResidualPercent: string;
  areaUnit: AreaUnit;
}

export default function RebmSettingsPage() {
  const { toast } = useToast();
  const { data: settingsData, isLoading: loadingSettings } = useGetRebmSettingsQuery();
  const { data: plansData } = useGetPlansQuery({ status: "ACTIVE" });
  const [updateSettings] = useUpdateRebmSettingsMutation();

  const settings = settingsData?.data;
  const activePlans = plansData?.data ?? [];
  const activePlan = activePlans[0] ?? null;

  // RERA toggle is saved immediately on change.
  const [reraRequired, setReraRequired] = useState(false);
  const [togglingRera, setTogglingRera] = useState(false);

  // General config is saved via the Save button.
  const [form, setForm] = useState<FormState>({
    planEngine: "LEGACY",
    holdPeriodDays: "7",
    companyResidualPercent: "0",
    areaUnit: "SQYD",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setReraRequired(settings.isReraRequired);
    setForm({
      planEngine: (settings.planEngine as PlanEngine) ?? "LEGACY",
      holdPeriodDays: String(settings.holdPeriodDays ?? 7),
      companyResidualPercent: String(settings.companyResidualPercent ?? 0),
      areaUnit: (settings.areaUnit as AreaUnit) ?? "SQYD",
    });
  }, [settings]);

  const handleReraToggle = async (checked: boolean) => {
    setReraRequired(checked);
    setTogglingRera(true);
    try {
      await updateSettings({ isReraRequired: checked }).unwrap();
      toast({
        title: checked
          ? "RERA verification is now mandatory"
          : "RERA verification is now optional",
      });
    } catch (err: any) {
      setReraRequired(!checked); // revert
      toast({
        title: "Could not update RERA setting",
        description: err?.data?.error || err?.message,
        variant: "destructive",
      });
    } finally {
      setTogglingRera(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const holdDays = parseInt(form.holdPeriodDays, 10);
    const residual = parseFloat(form.companyResidualPercent);
    if (isNaN(holdDays) || holdDays < 0) {
      toast({ title: "Hold period must be a non-negative number", variant: "destructive" });
      return;
    }
    if (isNaN(residual) || residual < 0 || residual > 100) {
      toast({ title: "Company residual must be between 0 and 100", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateSettings({
        planEngine: form.planEngine,
        holdPeriodDays: holdDays,
        companyResidualPercent: residual,
        areaUnit: form.areaUnit,
      }).unwrap();
      toast({ title: "Settings saved" });
    } catch (err: any) {
      toast({
        title: "Could not save settings",
        description: err?.data?.error || err?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loadingSettings) {
    return (
      <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-3xl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-3xl">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/real-estate" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Settings className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            Module settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure RERA requirements, the commission plan engine and other
            organisation-wide defaults.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* ── RERA Settings ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              RERA settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="rera-toggle" className="text-sm font-medium">
                  RERA verification mandatory
                </Label>
                <p className="text-xs text-muted-foreground max-w-sm">
                  When enabled, agents must have verified RERA registration
                  before a transaction can be closed.
                </p>
              </div>
              <Switch
                id="rera-toggle"
                checked={reraRequired}
                onCheckedChange={handleReraToggle}
                disabled={togglingRera}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Plan Engine ───────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Plan engine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={form.planEngine}
              onValueChange={(v) =>
                setForm((s) => ({ ...s, planEngine: v as PlanEngine }))
              }
              className="space-y-2"
            >
              <div className="flex items-start gap-3 rounded-md border p-3 cursor-pointer has-[[data-state=checked]]:border-primary">
                <RadioGroupItem value="LEGACY" id="plan-legacy" className="mt-0.5" />
                <Label htmlFor="plan-legacy" className="cursor-pointer space-y-0.5">
                  <div className="font-medium">Legacy (% of sale price)</div>
                  <div className="text-xs text-muted-foreground font-normal">
                    Commission is calculated as a simple percentage of the
                    transaction sale price.
                  </div>
                </Label>
              </div>
              <div className="flex items-start gap-3 rounded-md border p-3 cursor-pointer has-[[data-state=checked]]:border-primary">
                <RadioGroupItem value="SLAB" id="plan-slab" className="mt-0.5" />
                <Label htmlFor="plan-slab" className="cursor-pointer space-y-0.5">
                  <div className="font-medium">Slab (₹/sq.yd plan)</div>
                  <div className="text-xs text-muted-foreground font-normal">
                    Commission uses a per-area slab rate defined in the active
                    comp plan.
                  </div>
                </Label>
              </div>
            </RadioGroup>

            {form.planEngine === "SLAB" && (
              <div className="rounded-md border bg-muted/30 p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">
                    Active plan
                  </div>
                  {activePlan ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{activePlan.name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        v{activePlan.version}
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No active plan — create one first.
                    </span>
                  )}
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/real-estate/admin/plan-designer">
                    Manage plans
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Other config ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Other configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <SettingsField
                label="Hold period (days)"
                hint="Days before a commission entry is released from hold"
              >
                <Input
                  type="number"
                  min={0}
                  value={form.holdPeriodDays}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, holdPeriodDays: e.target.value }))
                  }
                />
              </SettingsField>

              <SettingsField
                label="Company residual %"
                hint="Percentage retained by the company from each deal"
              >
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={form.companyResidualPercent}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      companyResidualPercent: e.target.value,
                    }))
                  }
                />
              </SettingsField>

              <SettingsField
                label="Area unit"
                hint="Default unit used throughout the module"
              >
                <Select
                  value={form.areaUnit}
                  onValueChange={(v) =>
                    setForm((s) => ({ ...s, areaUnit: v as AreaUnit }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SQYD">SQYD — Square yards</SelectItem>
                    <SelectItem value="SQFT">SQFT — Square feet</SelectItem>
                    <SelectItem value="SQM">SQM — Square metres</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsField>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function SettingsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
