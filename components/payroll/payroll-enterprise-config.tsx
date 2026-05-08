'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { IndianRupee, Shield, Clock, Calculator, Info } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
export interface SalaryStructureConfig {
  basicPercent: number;
  hraPercent: number;
  daPercent: number;
  specialAllowanceMode: 'auto' | 'manual';
  specialAllowanceAmount: number;
  conveyanceAllowance: number;
  medicalAllowance: number;
  lta: number;
  ltaMonthly: boolean;
}

export interface StatutoryConfig {
  pfEnabled: boolean;
  pfPercent: number;
  pfCapEnabled: boolean;
  pfCapAmount: number;
  employerPfPercent: number;
  esiEnabled: boolean;
  esiEmployeePercent: number;
  esiEmployerPercent: number;
  esiThreshold: number;
  ptEnabled: boolean;
  ptAmount: number;
  ptThreshold: number;
  tdsEnabled: boolean;
  tdsMode: 'flat' | 'slab';
  tdsFlatPercent: number;
}

export interface OvertimeConfig {
  enabled: boolean;
  rateMultiplier: number;
  weekdayThresholdHours: number;
  weekendMultiplier: number;
  holidayMultiplier: number;
  maxOvertimeHoursPerMonth: number;
}

export const DEFAULT_SALARY_STRUCTURE: SalaryStructureConfig = {
  basicPercent: 50,
  hraPercent: 50,
  daPercent: 0,
  specialAllowanceMode: 'auto',
  specialAllowanceAmount: 0,
  conveyanceAllowance: 1600,
  medicalAllowance: 1250,
  lta: 0,
  ltaMonthly: true,
};

export const DEFAULT_STATUTORY: StatutoryConfig = {
  pfEnabled: true,
  pfPercent: 12,
  pfCapEnabled: true,
  pfCapAmount: 15000,
  employerPfPercent: 12,
  esiEnabled: false,
  esiEmployeePercent: 0.75,
  esiEmployerPercent: 3.25,
  esiThreshold: 21000,
  ptEnabled: true,
  ptAmount: 200,
  ptThreshold: 15000,
  tdsEnabled: true,
  tdsMode: 'flat',
  tdsFlatPercent: 5,
};

export const DEFAULT_OVERTIME: OvertimeConfig = {
  enabled: false,
  rateMultiplier: 1.5,
  weekdayThresholdHours: 8,
  weekendMultiplier: 2,
  holidayMultiplier: 2,
  maxOvertimeHoursPerMonth: 50,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function NumericRow({
  label, description, value, onChange, suffix, min, max, step,
}: {
  label: string; description?: string; value: number;
  onChange: (v: number) => void; suffix?: string;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min ?? 0}
          max={max}
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="h-9 w-32 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function ToggleRow({
  label, description, checked, onChange,
}: {
  label: string; description?: string; checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function FormulaChip({ formula }: { formula: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
      <Calculator className="h-3 w-3" /> {formula}
    </span>
  );
}

// ── Salary Preview ─────────────────────────────────────────────────────────

function SalaryPreview({
  ctc, salary, statutory,
}: {
  ctc: number; salary: SalaryStructureConfig; statutory: StatutoryConfig;
}) {
  if (ctc <= 0) return null;
  const basic = Math.round(ctc * salary.basicPercent / 100);
  const hra = Math.round(basic * salary.hraPercent / 100);
  const da = Math.round(basic * salary.daPercent / 100);
  const conv = salary.conveyanceAllowance;
  const med = salary.medicalAllowance;
  const ltaM = salary.ltaMonthly ? Math.round(salary.lta / 12) : 0;
  const fixed = basic + hra + da + conv + med + ltaM;
  const special = salary.specialAllowanceMode === 'auto'
    ? Math.max(0, ctc - fixed)
    : salary.specialAllowanceAmount;
  const gross = fixed + special;
  const pfBase = statutory.pfCapEnabled ? Math.min(basic, statutory.pfCapAmount) : basic;
  const pf = statutory.pfEnabled ? Math.round(pfBase * statutory.pfPercent / 100) : 0;
  const esi = statutory.esiEnabled && gross <= statutory.esiThreshold
    ? Math.round(gross * statutory.esiEmployeePercent / 100)
    : 0;
  const pt = statutory.ptEnabled && gross >= statutory.ptThreshold ? statutory.ptAmount : 0;
  const tds = statutory.tdsEnabled
    ? (statutory.tdsMode === 'flat' ? Math.round(gross * statutory.tdsFlatPercent / 100) : 0)
    : 0;
  const totalDed = pf + esi + pt + tds;
  const net = gross - totalDed;
  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

  const rows: [string, number, string?][] = [
    ['Basic Pay', basic],
    ['HRA', hra],
    ...(da > 0 ? [['DA', da] as [string, number]] : []),
    ...(conv > 0 ? [['Conveyance', conv] as [string, number]] : []),
    ...(med > 0 ? [['Medical', med] as [string, number]] : []),
    ...(ltaM > 0 ? [['LTA (monthly)', ltaM] as [string, number]] : []),
    ['Special Allowance', special],
  ];

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">
          Live Preview — CTC ₹{fmt(ctc)}/month
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <p className="font-medium text-muted-foreground uppercase text-[10px] tracking-wider col-span-2 pb-1 border-b border-border">
          Earnings
        </p>
        {rows.map(([label, val]) => (
          <div key={label} className="contents">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right tabular-nums text-foreground">₹{fmt(val)}</span>
          </div>
        ))}
        <div className="contents font-semibold border-t border-border pt-1">
          <span>Gross Salary</span>
          <span className="text-right tabular-nums">₹{fmt(gross)}</span>
        </div>
        <p className="font-medium text-muted-foreground uppercase text-[10px] tracking-wider col-span-2 pb-1 pt-2 border-b border-border">
          Deductions
        </p>
        {pf > 0 && <><span className="text-muted-foreground">PF (Employee)</span><span className="text-right tabular-nums text-red-600">−₹{fmt(pf)}</span></>}
        {esi > 0 && <><span className="text-muted-foreground">ESI (Employee)</span><span className="text-right tabular-nums text-red-600">−₹{fmt(esi)}</span></>}
        {pt > 0 && <><span className="text-muted-foreground">Professional Tax</span><span className="text-right tabular-nums text-red-600">−₹{fmt(pt)}</span></>}
        {tds > 0 && <><span className="text-muted-foreground">TDS</span><span className="text-right tabular-nums text-red-600">−₹{fmt(tds)}</span></>}
        <div className="contents font-semibold border-t border-border pt-1">
          <span>Total Deductions</span>
          <span className="text-right tabular-nums text-red-600">−₹{fmt(totalDed)}</span>
        </div>
        <div className="contents font-bold text-base border-t-2 border-primary/30 pt-2">
          <span className="text-primary">Net Salary</span>
          <span className="text-right tabular-nums text-primary">₹{fmt(net)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Section 6: Salary Structure ────────────────────────────────────────────

export function SalaryStructureSection({
  config, onChange, defaultCTC,
  statutory,
}: {
  config: SalaryStructureConfig;
  onChange: (c: SalaryStructureConfig) => void;
  defaultCTC: number | null;
  statutory: StatutoryConfig;
}) {
  const u = (patch: Partial<SalaryStructureConfig>) => onChange({ ...config, ...patch });
  const ctc = defaultCTC ?? 30000;

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IndianRupee className="h-5 w-5 text-primary" />
          6. Salary Structure
        </CardTitle>
        <CardDescription>
          Define how CTC is split into components. The formulas below are applied to
          every employee's mapped salary during payroll generation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Component Percentages
          </p>

          <NumericRow
            label="Basic Pay"
            description="% of CTC"
            value={config.basicPercent}
            onChange={(v) => u({ basicPercent: Math.min(100, Math.max(0, v)) })}
            suffix="% of CTC"
            min={0} max={100}
          />
          <div className="pl-2"><FormulaChip formula={`Basic = CTC × ${config.basicPercent}%`} /></div>

          <NumericRow
            label="HRA"
            description="% of Basic (50% metro / 40% non-metro)"
            value={config.hraPercent}
            onChange={(v) => u({ hraPercent: Math.min(100, Math.max(0, v)) })}
            suffix="% of Basic"
            min={0} max={100}
          />
          <div className="pl-2"><FormulaChip formula={`HRA = Basic × ${config.hraPercent}%`} /></div>

          <NumericRow
            label="DA (Dearness Allowance)"
            description="% of Basic — set to 0 if not applicable"
            value={config.daPercent}
            onChange={(v) => u({ daPercent: Math.min(100, Math.max(0, v)) })}
            suffix="% of Basic"
            min={0} max={100}
          />

          <div className="border-t border-border pt-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fixed Allowances (₹/month)
            </p>
            <NumericRow label="Conveyance Allowance" value={config.conveyanceAllowance} onChange={(v) => u({ conveyanceAllowance: v })} suffix="₹/month" />
            <NumericRow label="Medical Allowance" value={config.medicalAllowance} onChange={(v) => u({ medicalAllowance: v })} suffix="₹/month" />
            <NumericRow label="LTA (per year)" value={config.lta} onChange={(v) => u({ lta: v })} suffix="₹/year" />
            <ToggleRow label="Divide LTA monthly" description="Spread yearly LTA across 12 months" checked={config.ltaMonthly} onChange={(v) => u({ ltaMonthly: v })} />
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Special Allowance
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
              <div>
                <p className="text-sm font-medium text-foreground">Calculation Mode</p>
                <p className="text-xs text-muted-foreground">Auto = CTC minus all other components</p>
              </div>
              <Select value={config.specialAllowanceMode} onValueChange={(v: 'auto' | 'manual') => u({ specialAllowanceMode: v })}>
                <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (balancing figure)</SelectItem>
                  <SelectItem value="manual">Manual (fixed amount)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.specialAllowanceMode === 'auto' && (
              <div className="pl-2"><FormulaChip formula="Special = CTC − (Basic + HRA + DA + Fixed)" /></div>
            )}
            {config.specialAllowanceMode === 'manual' && (
              <NumericRow label="Special Allowance Amount" value={config.specialAllowanceAmount} onChange={(v) => u({ specialAllowanceAmount: v })} suffix="₹/month" />
            )}
          </div>
        </div>

        <SalaryPreview ctc={ctc} salary={config} statutory={statutory} />
      </CardContent>
    </Card>
  );
}

// ── Section 7: Statutory Compliance ────────────────────────────────────────

export function StatutoryComplianceSection({
  config, onChange,
}: {
  config: StatutoryConfig;
  onChange: (c: StatutoryConfig) => void;
}) {
  const u = (patch: Partial<StatutoryConfig>) => onChange({ ...config, ...patch });

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          7. Statutory Compliance
        </CardTitle>
        <CardDescription>
          Configure mandatory government deductions. These are applied automatically
          during payroll generation based on each employee's salary components.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* PF */}
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">EPF</Badge>
              <p className="text-sm font-semibold text-foreground">Provident Fund</p>
            </div>
            <Switch checked={config.pfEnabled} onCheckedChange={(v) => u({ pfEnabled: v })} />
          </div>
          {config.pfEnabled && (
            <div className="space-y-3 pl-1">
              <NumericRow label="Employee PF %" description="Deducted from employee's Basic" value={config.pfPercent} onChange={(v) => u({ pfPercent: v })} suffix="% of Basic" step={0.5} />
              <NumericRow label="Employer PF %" description="Company's contribution" value={config.employerPfPercent} onChange={(v) => u({ employerPfPercent: v })} suffix="% of Basic" step={0.5} />
              <ToggleRow label="Apply PF ceiling" description="Cap the Basic amount on which PF is calculated" checked={config.pfCapEnabled} onChange={(v) => u({ pfCapEnabled: v })} />
              {config.pfCapEnabled && (
                <NumericRow label="PF ceiling amount" description="PF calculated on min(Basic, this cap)" value={config.pfCapAmount} onChange={(v) => u({ pfCapAmount: v })} suffix="₹" />
              )}
              <div className="pl-2"><FormulaChip formula={`PF = min(Basic, ${config.pfCapEnabled ? `₹${config.pfCapAmount}` : 'Basic'}) × ${config.pfPercent}%`} /></div>
            </div>
          )}
        </div>

        {/* ESI */}
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">ESIC</Badge>
              <p className="text-sm font-semibold text-foreground">Employee State Insurance</p>
            </div>
            <Switch checked={config.esiEnabled} onCheckedChange={(v) => u({ esiEnabled: v })} />
          </div>
          {config.esiEnabled && (
            <div className="space-y-3 pl-1">
              <NumericRow label="ESI threshold" description="ESI applies only if gross ≤ this" value={config.esiThreshold} onChange={(v) => u({ esiThreshold: v })} suffix="₹" />
              <NumericRow label="Employee ESI %" value={config.esiEmployeePercent} onChange={(v) => u({ esiEmployeePercent: v })} suffix="% of Gross" step={0.25} />
              <NumericRow label="Employer ESI %" value={config.esiEmployerPercent} onChange={(v) => u({ esiEmployerPercent: v })} suffix="% of Gross" step={0.25} />
              <div className="pl-2"><FormulaChip formula={`ESI = Gross × ${config.esiEmployeePercent}% (if Gross ≤ ₹${config.esiThreshold})`} /></div>
            </div>
          )}
        </div>

        {/* Professional Tax */}
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">PT</Badge>
              <p className="text-sm font-semibold text-foreground">Professional Tax</p>
            </div>
            <Switch checked={config.ptEnabled} onCheckedChange={(v) => u({ ptEnabled: v })} />
          </div>
          {config.ptEnabled && (
            <div className="space-y-3 pl-1">
              <NumericRow label="PT amount" description="Fixed monthly deduction" value={config.ptAmount} onChange={(v) => u({ ptAmount: v })} suffix="₹/month" />
              <NumericRow label="PT threshold" description="PT applies only if gross ≥ this" value={config.ptThreshold} onChange={(v) => u({ ptThreshold: v })} suffix="₹" />
              <div className="pl-2"><FormulaChip formula={`PT = ₹${config.ptAmount} (if Gross ≥ ₹${config.ptThreshold})`} /></div>
            </div>
          )}
        </div>

        {/* TDS */}
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">TDS</Badge>
              <p className="text-sm font-semibold text-foreground">Tax Deducted at Source</p>
            </div>
            <Switch checked={config.tdsEnabled} onCheckedChange={(v) => u({ tdsEnabled: v })} />
          </div>
          {config.tdsEnabled && (
            <div className="space-y-3 pl-1">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
                <div>
                  <p className="text-sm font-medium text-foreground">TDS Mode</p>
                  <p className="text-xs text-muted-foreground">Flat % or income tax slabs</p>
                </div>
                <Select value={config.tdsMode} onValueChange={(v: 'flat' | 'slab') => u({ tdsMode: v })}>
                  <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat percentage</SelectItem>
                    <SelectItem value="slab">Slab-based (New Regime)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {config.tdsMode === 'flat' && (
                <>
                  <NumericRow label="TDS flat rate" value={config.tdsFlatPercent} onChange={(v) => u({ tdsFlatPercent: v })} suffix="% of Gross" step={0.5} />
                  <div className="pl-2"><FormulaChip formula={`TDS = Gross × ${config.tdsFlatPercent}%`} /></div>
                </>
              )}
              {config.tdsMode === 'slab' && (
                <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <p className="font-medium">New Tax Regime (FY 2025–26)</p>
                  <p>0–₹4L: Nil · ₹4–8L: 5% · ₹8–12L: 10% · ₹12–16L: 15% · ₹16–20L: 20% · ₹20–24L: 25% · &gt;₹24L: 30%</p>
                  <p className="mt-1 text-[10px]">Monthly TDS is auto-computed as annual projected tax ÷ 12</p>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section 8: Overtime Policy ─────────────────────────────────────────────

export function OvertimePolicySection({
  config, onChange,
}: {
  config: OvertimeConfig;
  onChange: (c: OvertimeConfig) => void;
}) {
  const u = (patch: Partial<OvertimeConfig>) => onChange({ ...config, ...patch });

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          8. Overtime Policy{' '}
          <Badge variant="outline" className="ml-2 text-xs">Optional</Badge>
        </CardTitle>
        <CardDescription>
          Configure overtime calculation rules. When enabled, hours worked beyond the
          daily threshold are paid at the configured multiplier of the hourly rate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <ToggleRow label="Enable Overtime" description="Calculate and pay overtime in payroll" checked={config.enabled} onChange={(v) => u({ enabled: v })} />

          {config.enabled && (
            <div className="space-y-3 border-t border-border pt-3">
              <NumericRow label="Weekday threshold" description="OT starts after this many hours/day" value={config.weekdayThresholdHours} onChange={(v) => u({ weekdayThresholdHours: v })} suffix="hours/day" />
              <NumericRow label="Weekday OT rate" description="Multiplier of hourly rate" value={config.rateMultiplier} onChange={(v) => u({ rateMultiplier: v })} suffix="× hourly rate" step={0.25} />
              <NumericRow label="Weekend OT rate" value={config.weekendMultiplier} onChange={(v) => u({ weekendMultiplier: v })} suffix="× hourly rate" step={0.25} />
              <NumericRow label="Holiday OT rate" value={config.holidayMultiplier} onChange={(v) => u({ holidayMultiplier: v })} suffix="× hourly rate" step={0.25} />
              <NumericRow label="Monthly OT cap" description="Maximum overtime hours per month" value={config.maxOvertimeHoursPerMonth} onChange={(v) => u({ maxOvertimeHoursPerMonth: v })} suffix="hours" />
              <div className="pl-2 space-y-1">
                <FormulaChip formula={`OT Pay = OT_Hours × (Basic / (Days × ${config.weekdayThresholdHours})) × ${config.rateMultiplier}×`} />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
