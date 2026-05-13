'use client';

import { useState } from 'react';
import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { IndianRupee, Shield, Clock, Info, Gift } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
//
// Every optional component carries its own `*Enabled` boolean so admins can
// hide line items their org doesn't use. Disabled allowances contribute zero
// to gross even if the amount is non-zero — that way you can pre-stage a value
// and flip it on later without re-entering it.
export interface SalaryStructureConfig {
  // Core split — always on. Amounts are %-of-CTC (basic) or %-of-basic (HRA).
  basicPercent: number;
  hraPercent: number;

  // Dearness Allowance — common in PSU/manufacturing, rare in IT/services.
  daEnabled: boolean;
  daPercent: number;

  // Special allowance is the auto-balancing component, so "disabling" it
  // means switching to manual mode at zero. Kept here for symmetry.
  specialAllowanceMode: 'auto' | 'manual';
  specialAllowanceAmount: number;

  // Standard fixed allowances ─────────────────────────────────────────────
  conveyanceEnabled: boolean;
  conveyanceAllowance: number;

  medicalEnabled: boolean;
  medicalAllowance: number;

  ltaEnabled: boolean;
  lta: number;
  ltaMonthly: boolean;

  // Allowances commonly found at top Indian companies ─────────────────────
  // Each carries an enable toggle so an org that doesn't use it can hide
  // the row from payslips entirely.

  // Meal / food cards (Sodexo / Zeta / Paytm Food Wallet). Tax-exempt up
  // to ₹50/meal x 2 meals/day x 22 days ≈ ₹2,200/mo.
  foodEnabled: boolean;
  foodAllowance: number;

  // Telephone / internet / mobile reimbursement. Common post-COVID; tax-
  // exempt when used wholly for official purposes (with bills).
  telephoneEnabled: boolean;
  telephoneAllowance: number;

  // Children's Education Allowance — tax-exempt ₹100/child/mo up to 2
  // children + ₹300/child/mo hostel allowance.
  educationEnabled: boolean;
  educationAllowance: number;

  // Fuel / driver / car allowance. Often a fixed component for senior
  // employees in lieu of a company car.
  fuelEnabled: boolean;
  fuelAllowance: number;

  // Books & Periodicals — tax-exempt for "knowledge upgrade" (no formal
  // cap, but most companies set ₹2-5k/mo with bill).
  booksEnabled: boolean;
  booksAllowance: number;

  // Uniform / dress allowance — relevant for retail, hospitality, manufacturing.
  uniformEnabled: boolean;
  uniformAllowance: number;
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
  ptState?: string;
  tdsEnabled: boolean;
  tdsMode: 'flat' | 'slab';
  tdsFlatPercent: number;
  taxRegime: 'old' | 'new';
  lwfEnabled: boolean;
  lwfAmount: number;
  npsEnabled: boolean;
  npsEmployeePercent: number;
  // Gratuity — Payment of Gratuity Act, 1972. Statutory accrual at 4.81% of
  // Basic+DA (15/26 days × 12 months). Paid out only on exit after ≥5 years;
  // shown here as a monthly CTC component for transparency.
  gratuityEnabled: boolean;
  gratuityPercent: number;
}

// ── Bonus & Variable Pay ───────────────────────────────────────────────────
// Bonus types that show up in nearly every Indian payroll engine. Each block
// has its own enable toggle so an org can opt in to just the ones they pay.
// Monthly accruals are folded into the live preview; lump-sum payouts (joining
// bonus, festival bonus) show as an annualized "/year" line.
export interface BonusConfig {
  // Statutory Bonus — Payment of Bonus Act, 1965. Mandatory for employees
  // earning ≤ ₹21,000/mo (basic + DA). Min 8.33%, max 20% of (basic+DA),
  // calculated on a ceiling of ₹7,000/mo.
  statutoryBonusEnabled: boolean;
  statutoryBonusPercent: number;       // 8.33 – 20
  statutoryBonusSalaryCeiling: number; // ₹21,000 default
  statutoryBonusCalcCeiling: number;   // ₹7,000 default (cap on salary used in the math)

  // Performance bonus — annual variable pay, typically a % of fixed CTC.
  // Accrued monthly for cost visibility; paid out per the frequency below.
  performanceBonusEnabled: boolean;
  performanceBonusPercent: number;
  performanceBonusFrequency: 'annual' | 'half-yearly' | 'quarterly';

  // Festival bonus — flat amount paid once a year (Diwali/Onam/Pongal).
  festivalBonusEnabled: boolean;
  festivalBonusAmount: number;

  // Joining bonus — one-time, paid in the first payslip (or in tranches).
  // Often clawback-able if the employee leaves within X months.
  joiningBonusEnabled: boolean;
  joiningBonusAmount: number;
  joiningBonusClawbackMonths: number;

  // Retention bonus — periodic payout to keep critical talent (rare in
  // mass-market roles, common in senior/specialist tracks).
  retentionBonusEnabled: boolean;
  retentionBonusAmount: number;
  retentionBonusFrequency: 'annual' | 'half-yearly' | 'one-time';
}

// Per-state PT presets. PT is governed by individual State Profession Tax
// Acts so the amount and threshold differ by state. Values reflect the most
// common monthly slab; HR teams should treat these as defaults and adjust if
// they have a precise gross-band schedule for their state.
export const PT_STATE_PRESETS: Record<string, { amount: number; threshold: number; label: string }> = {
  maharashtra: { amount: 200, threshold: 10000, label: 'Maharashtra (₹200/mo over ₹10k)' },
  karnataka:   { amount: 200, threshold: 25000, label: 'Karnataka (₹200/mo over ₹25k)' },
  westBengal:  { amount: 110, threshold: 10000, label: 'West Bengal (₹110/mo over ₹10k)' },
  tamilNadu:   { amount: 208, threshold: 21001, label: 'Tamil Nadu (₹208/mo over ₹21k)' },
  delhi:       { amount: 0,   threshold: 0,     label: 'Delhi (no PT)' },
  telangana:   { amount: 200, threshold: 20000, label: 'Telangana (₹200/mo over ₹20k)' },
  gujarat:     { amount: 200, threshold: 12000, label: 'Gujarat (₹200/mo over ₹12k)' },
  custom:      { amount: 200, threshold: 15000, label: 'Custom' },
};

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

  daEnabled: false,
  daPercent: 0,

  specialAllowanceMode: 'auto',
  specialAllowanceAmount: 0,

  conveyanceEnabled: true,
  conveyanceAllowance: 1600,

  medicalEnabled: true,
  medicalAllowance: 1250,

  ltaEnabled: false,
  lta: 0,
  ltaMonthly: true,

  foodEnabled: false,
  foodAllowance: 2200,

  telephoneEnabled: false,
  telephoneAllowance: 1500,

  educationEnabled: false,
  educationAllowance: 200,

  fuelEnabled: false,
  fuelAllowance: 0,

  booksEnabled: false,
  booksAllowance: 0,

  uniformEnabled: false,
  uniformAllowance: 0,
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
  ptThreshold: 10000,
  ptState: 'maharashtra',
  tdsEnabled: true,
  tdsMode: 'flat',
  tdsFlatPercent: 5,
  taxRegime: 'new',
  lwfEnabled: false,
  lwfAmount: 25,
  npsEnabled: false,
  npsEmployeePercent: 10,
  gratuityEnabled: false,
  gratuityPercent: 4.81,
};

export const DEFAULT_BONUS: BonusConfig = {
  statutoryBonusEnabled: false,
  statutoryBonusPercent: 8.33,
  statutoryBonusSalaryCeiling: 21000,
  statutoryBonusCalcCeiling: 7000,

  performanceBonusEnabled: false,
  performanceBonusPercent: 10,
  performanceBonusFrequency: 'annual',

  festivalBonusEnabled: false,
  festivalBonusAmount: 0,

  joiningBonusEnabled: false,
  joiningBonusAmount: 0,
  joiningBonusClawbackMonths: 12,

  retentionBonusEnabled: false,
  retentionBonusAmount: 0,
  retentionBonusFrequency: 'annual',
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
          className="h-9 w-full sm:w-32 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {suffix && <span className="text-xs text-muted-foreground whitespace-nowrap">{suffix}</span>}
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

// ── Salary Preview ─────────────────────────────────────────────────────────

export function SalaryPreview({
  ctc, salary, statutory, bonus,
}: {
  ctc: number;
  salary: SalaryStructureConfig;
  statutory: StatutoryConfig;
  bonus?: BonusConfig;
}) {
  if (ctc <= 0) return null;
  const basic = Math.round(ctc * salary.basicPercent / 100);
  const hra = Math.round(basic * salary.hraPercent / 100);
  // Disabled allowances zero out — keep stored amounts so admins can pre-stage
  // a value and flip the toggle later without re-entering it.
  const da = salary.daEnabled ? Math.round(basic * salary.daPercent / 100) : 0;
  const conv = salary.conveyanceEnabled ? salary.conveyanceAllowance : 0;
  const med = salary.medicalEnabled ? salary.medicalAllowance : 0;
  const ltaM = salary.ltaEnabled && salary.ltaMonthly
    ? Math.round(salary.lta / 12)
    : 0;
  const food = salary.foodEnabled ? salary.foodAllowance : 0;
  const phone = salary.telephoneEnabled ? salary.telephoneAllowance : 0;
  const edu = salary.educationEnabled ? salary.educationAllowance : 0;
  const fuel = salary.fuelEnabled ? salary.fuelAllowance : 0;
  const books = salary.booksEnabled ? salary.booksAllowance : 0;
  const uniform = salary.uniformEnabled ? salary.uniformAllowance : 0;

  const fixed =
    basic + hra + da + conv + med + ltaM +
    food + phone + edu + fuel + books + uniform;
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
  const applySurchargeAndCess = (annualGross: number, tax: number) => {
    let surcharge = 0;
    if (annualGross > 20000000) surcharge = tax * 0.25;
    else if (annualGross > 10000000) surcharge = tax * 0.15;
    else if (annualGross > 5000000) surcharge = tax * 0.10;
    return (tax + surcharge) * 1.04;
  };
  const calculateTdsSlabNew = (annualGross: number) => {
    let taxable = Math.max(0, annualGross - 75000); // Standard deduction
    if (taxable <= 1200000) return 0; // 87A rebate (FY 2025-26 New Regime)
    let tax = 0;
    if (taxable > 2400000) { tax += (taxable - 2400000) * 0.30; taxable = 2400000; }
    if (taxable > 2000000) { tax += (taxable - 2000000) * 0.25; taxable = 2000000; }
    if (taxable > 1600000) { tax += (taxable - 1600000) * 0.20; taxable = 1600000; }
    if (taxable > 1200000) { tax += (taxable - 1200000) * 0.15; taxable = 1200000; }
    if (taxable > 800000)  { tax += (taxable - 800000)  * 0.10; taxable = 800000; }
    if (taxable > 400000)  { tax += (taxable - 400000)  * 0.05; }
    return applySurchargeAndCess(annualGross, tax);
  };
  const calculateTdsSlabOld = (annualGross: number) => {
    let taxable = Math.max(0, annualGross - 50000);
    if (taxable <= 500000) return 0;
    let tax = 0;
    if (taxable > 1000000) { tax += (taxable - 1000000) * 0.30; taxable = 1000000; }
    if (taxable > 500000)  { tax += (taxable - 500000)  * 0.20; taxable = 500000; }
    if (taxable > 250000)  { tax += (taxable - 250000)  * 0.05; }
    return applySurchargeAndCess(annualGross, tax);
  };
  const tds = statutory.tdsEnabled
    ? (statutory.tdsMode === 'flat'
         ? Math.round(gross * statutory.tdsFlatPercent * 1.04 / 100)
         : Math.round(
             (statutory.taxRegime === 'old'
               ? calculateTdsSlabOld(gross * 12)
               : calculateTdsSlabNew(gross * 12)) / 12,
           ))
    : 0;
  const lwf = statutory.lwfEnabled ? statutory.lwfAmount : 0;
  const nps = statutory.npsEnabled ? Math.round(basic * statutory.npsEmployeePercent / 100) : 0;
  // Gratuity is an employer-side accrual, not an employee deduction. Shown
  // separately in CTC accounting blocks below.
  const gratuityAccrual = statutory.gratuityEnabled
    ? Math.round((basic + da) * statutory.gratuityPercent / 100)
    : 0;
  const totalDed = pf + esi + pt + tds + lwf + nps;
  const net = gross - totalDed;
  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

  // Monthly bonus accrual: statutory bonus is mandatory below the ceiling,
  // performance bonus is a smoothed monthly accrual, festival/joining/retention
  // bonuses are annualized for the CTC view. Lump-sum payouts hit the actual
  // payslip on their respective months — the preview shows the steady-state
  // monthly cost so admins understand the true CTC impact.
  let statutoryBonusM = 0;
  let perfBonusM = 0;
  let festivalBonusM = 0;
  let joiningBonusM = 0;
  let retentionBonusM = 0;
  if (bonus) {
    if (
      bonus.statutoryBonusEnabled &&
      basic + da <= bonus.statutoryBonusSalaryCeiling
    ) {
      const base = Math.min(basic + da, bonus.statutoryBonusCalcCeiling);
      statutoryBonusM = Math.round(base * bonus.statutoryBonusPercent / 100);
    }
    if (bonus.performanceBonusEnabled) {
      const annual = Math.round(ctc * 12 * bonus.performanceBonusPercent / 100);
      perfBonusM = Math.round(annual / 12);
    }
    if (bonus.festivalBonusEnabled) {
      festivalBonusM = Math.round(bonus.festivalBonusAmount / 12);
    }
    if (bonus.joiningBonusEnabled && bonus.joiningBonusClawbackMonths > 0) {
      // Amortise the joining bonus over the clawback period — that's the
      // honest monthly cost until the clawback expires.
      joiningBonusM = Math.round(
        bonus.joiningBonusAmount / bonus.joiningBonusClawbackMonths,
      );
    }
    if (bonus.retentionBonusEnabled) {
      const months =
        bonus.retentionBonusFrequency === 'half-yearly'
          ? 6
          : bonus.retentionBonusFrequency === 'annual'
            ? 12
            : 24; // one-time: smooth over 2 years for CTC math
      retentionBonusM = Math.round(bonus.retentionBonusAmount / months);
    }
  }
  const totalBonusM =
    statutoryBonusM + perfBonusM + festivalBonusM + joiningBonusM + retentionBonusM;

  const rows: [string, number, string?][] = [
    ['Basic Pay', basic],
    ['HRA', hra],
    ...(da > 0 ? [['DA', da] as [string, number]] : []),
    ...(conv > 0 ? [['Conveyance', conv] as [string, number]] : []),
    ...(med > 0 ? [['Medical', med] as [string, number]] : []),
    ...(ltaM > 0 ? [['LTA (monthly)', ltaM] as [string, number]] : []),
    ...(food > 0 ? [['Food / meal', food] as [string, number]] : []),
    ...(phone > 0 ? [['Telephone / internet', phone] as [string, number]] : []),
    ...(edu > 0 ? [['Children’s education', edu] as [string, number]] : []),
    ...(fuel > 0 ? [['Fuel / car', fuel] as [string, number]] : []),
    ...(books > 0 ? [['Books & periodicals', books] as [string, number]] : []),
    ...(uniform > 0 ? [['Uniform', uniform] as [string, number]] : []),
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
        {lwf > 0 && <><span className="text-muted-foreground">LWF</span><span className="text-right tabular-nums text-red-600">−₹{fmt(lwf)}</span></>}
        {nps > 0 && <><span className="text-muted-foreground">NPS</span><span className="text-right tabular-nums text-red-600">−₹{fmt(nps)}</span></>}
        <div className="contents font-semibold border-t border-border pt-1">
          <span>Total Deductions</span>
          <span className="text-right tabular-nums text-red-600">−₹{fmt(totalDed)}</span>
        </div>
        <div className="contents font-bold text-base border-t-2 border-primary/30 pt-2">
          <span className="text-primary">Net Salary</span>
          <span className="text-right tabular-nums text-primary">₹{fmt(net)}</span>
        </div>

        {(totalBonusM > 0 || gratuityAccrual > 0) && (
          <>
            <p className="font-medium text-muted-foreground uppercase text-[10px] tracking-wider col-span-2 pb-1 pt-3 border-b border-border">
              Employer cost (above Net) — accruals
            </p>
            {statutoryBonusM > 0 && (
              <>
                <span className="text-muted-foreground">
                  Statutory bonus
                  <span className="text-[10px] ml-1 opacity-70">(monthly accrual)</span>
                </span>
                <span className="text-right tabular-nums text-emerald-700">
                  +₹{fmt(statutoryBonusM)}
                </span>
              </>
            )}
            {perfBonusM > 0 && (
              <>
                <span className="text-muted-foreground">
                  Performance bonus
                  <span className="text-[10px] ml-1 opacity-70">(monthly accrual)</span>
                </span>
                <span className="text-right tabular-nums text-emerald-700">
                  +₹{fmt(perfBonusM)}
                </span>
              </>
            )}
            {festivalBonusM > 0 && (
              <>
                <span className="text-muted-foreground">
                  Festival bonus
                  <span className="text-[10px] ml-1 opacity-70">(annualised)</span>
                </span>
                <span className="text-right tabular-nums text-emerald-700">
                  +₹{fmt(festivalBonusM)}
                </span>
              </>
            )}
            {joiningBonusM > 0 && (
              <>
                <span className="text-muted-foreground">
                  Joining bonus
                  <span className="text-[10px] ml-1 opacity-70">(amortised)</span>
                </span>
                <span className="text-right tabular-nums text-emerald-700">
                  +₹{fmt(joiningBonusM)}
                </span>
              </>
            )}
            {retentionBonusM > 0 && (
              <>
                <span className="text-muted-foreground">
                  Retention bonus
                  <span className="text-[10px] ml-1 opacity-70">(smoothed)</span>
                </span>
                <span className="text-right tabular-nums text-emerald-700">
                  +₹{fmt(retentionBonusM)}
                </span>
              </>
            )}
            {gratuityAccrual > 0 && (
              <>
                <span className="text-muted-foreground">
                  Gratuity accrual
                  <span className="text-[10px] ml-1 opacity-70">(4.81% of Basic+DA)</span>
                </span>
                <span className="text-right tabular-nums text-emerald-700">
                  +₹{fmt(gratuityAccrual)}
                </span>
              </>
            )}
            <div className="contents font-semibold text-xs border-t border-border pt-1">
              <span className="text-muted-foreground">Total employer cost / month</span>
              <span className="text-right tabular-nums">
                ₹{fmt(net + totalDed + totalBonusM + gratuityAccrual)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Section 6: Salary Structure ────────────────────────────────────────────

// Generic "allowance card": header row with title + on/off Switch, followed
// by the amount input only when the toggle is on. Used for every optional
// allowance so the look is consistent and adding a new allowance is one call.
function AllowanceCard({
  label, description, enabled, onToggle, children,
}: {
  label: string;
  description?: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && (
        <div className="pt-1 border-t border-border/60 space-y-2">{children}</div>
      )}
    </div>
  );
}

export function SalaryStructureSection({
  config, onChange, defaultCTC,
  statutory, bonus,
}: {
  config: SalaryStructureConfig;
  onChange: (c: SalaryStructureConfig) => void;
  defaultCTC: number | null;
  statutory: StatutoryConfig;
  bonus?: BonusConfig;
}) {
  const u = (patch: Partial<SalaryStructureConfig>) => onChange({ ...config, ...patch });
  // Live preview now lives at the page level (see `LiveSalaryPreview`) so the
  // breakdown stays visible regardless of which section the admin is editing.
  // `defaultCTC`, `statutory`, and `bonus` are kept on the props for backward
  // compatibility with existing callers, though this component no longer
  // reads them. They flow into LiveSalaryPreview directly.
  void defaultCTC; void statutory; void bonus;

  return (
    <AccordionItem value="salary-structure" className="border rounded-lg bg-card overflow-hidden">
      <AccordionTrigger className="px-5 hover:no-underline hover:bg-muted/50 data-[state=open]:bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-primary/10 p-1.5">
            <IndianRupee className="h-5 w-5 text-primary" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-base">Salary Structure</div>
            <div className="text-xs text-muted-foreground font-normal">Define how CTC is split into base, HRA, and allowances.</div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-5 pb-5 pt-2">
        <div className="space-y-5">
          {/* Core (always on) ─────────────────────────────────────────── */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4 mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Core components
              <span className="text-[10px] normal-case ml-2 opacity-70">(always on)</span>
            </p>
            <NumericRow
              label="Basic Pay"
              description="Percentage of total CTC"
              value={config.basicPercent}
              onChange={(v) => u({ basicPercent: Math.min(100, Math.max(0, v)) })}
              suffix="% of CTC"
              min={0} max={100}
            />
            <NumericRow
              label="HRA"
              description="Percentage of Basic (50% metro / 40% non-metro)"
              value={config.hraPercent}
              onChange={(v) => u({ hraPercent: Math.min(100, Math.max(0, v)) })}
              suffix="% of Basic"
              min={0} max={100}
            />
          </div>

          {/* Optional allowances ──────────────────────────────────────── */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Optional allowances
              <span className="text-[10px] normal-case ml-2 opacity-70">
                (flip a toggle to enable an item for everyone)
              </span>
            </p>

            <AllowanceCard
              label="DA (Dearness Allowance)"
              description="Common in PSU / manufacturing; rare in IT"
              enabled={config.daEnabled}
              onToggle={(v) => u({ daEnabled: v })}
            >
              <NumericRow
                label="DA %"
                description="Percentage of Basic"
                value={config.daPercent}
                onChange={(v) => u({ daPercent: Math.min(100, Math.max(0, v)) })}
                suffix="% of Basic"
                min={0} max={100}
              />
            </AllowanceCard>

            <AllowanceCard
              label="Conveyance Allowance"
              description="Transport-to-work component"
              enabled={config.conveyanceEnabled}
              onToggle={(v) => u({ conveyanceEnabled: v })}
            >
              <NumericRow
                label="Amount"
                value={config.conveyanceAllowance}
                onChange={(v) => u({ conveyanceAllowance: v })}
                suffix="₹ / month"
              />
            </AllowanceCard>

            <AllowanceCard
              label="Medical Allowance"
              description="Medical reimbursement (with bills)"
              enabled={config.medicalEnabled}
              onToggle={(v) => u({ medicalEnabled: v })}
            >
              <NumericRow
                label="Amount"
                value={config.medicalAllowance}
                onChange={(v) => u({ medicalAllowance: v })}
                suffix="₹ / month"
              />
            </AllowanceCard>

            <AllowanceCard
              label="Leave Travel Allowance (LTA)"
              description="Tax-exempt twice in a 4-year block"
              enabled={config.ltaEnabled}
              onToggle={(v) => u({ ltaEnabled: v })}
            >
              <NumericRow
                label="Amount"
                value={config.lta}
                onChange={(v) => u({ lta: v })}
                suffix="₹ / year"
              />
              <ToggleRow
                label="Divide LTA monthly"
                description="Spread yearly LTA across 12 months"
                checked={config.ltaMonthly}
                onChange={(v) => u({ ltaMonthly: v })}
              />
            </AllowanceCard>

            <AllowanceCard
              label="Food / meal allowance"
              description="Sodexo / Zeta / meal cards — tax-exempt up to ₹2,200/mo"
              enabled={config.foodEnabled}
              onToggle={(v) => u({ foodEnabled: v })}
            >
              <NumericRow
                label="Amount"
                value={config.foodAllowance}
                onChange={(v) => u({ foodAllowance: v })}
                suffix="₹ / month"
              />
            </AllowanceCard>

            <AllowanceCard
              label="Telephone / internet"
              description="Phone & broadband reimbursement (tax-exempt with bills)"
              enabled={config.telephoneEnabled}
              onToggle={(v) => u({ telephoneEnabled: v })}
            >
              <NumericRow
                label="Amount"
                value={config.telephoneAllowance}
                onChange={(v) => u({ telephoneAllowance: v })}
                suffix="₹ / month"
              />
            </AllowanceCard>

            <AllowanceCard
              label="Children’s education"
              description="Tax-exempt ₹100/child/mo up to 2 children"
              enabled={config.educationEnabled}
              onToggle={(v) => u({ educationEnabled: v })}
            >
              <NumericRow
                label="Amount"
                value={config.educationAllowance}
                onChange={(v) => u({ educationAllowance: v })}
                suffix="₹ / month"
              />
            </AllowanceCard>

            <AllowanceCard
              label="Fuel / car / driver"
              description="Vehicle running expenses for senior roles"
              enabled={config.fuelEnabled}
              onToggle={(v) => u({ fuelEnabled: v })}
            >
              <NumericRow
                label="Amount"
                value={config.fuelAllowance}
                onChange={(v) => u({ fuelAllowance: v })}
                suffix="₹ / month"
              />
            </AllowanceCard>

            <AllowanceCard
              label="Books & periodicals"
              description="Knowledge-upgrade reimbursement (with bills)"
              enabled={config.booksEnabled}
              onToggle={(v) => u({ booksEnabled: v })}
            >
              <NumericRow
                label="Amount"
                value={config.booksAllowance}
                onChange={(v) => u({ booksAllowance: v })}
                suffix="₹ / month"
              />
            </AllowanceCard>

            <AllowanceCard
              label="Uniform allowance"
              description="Retail / hospitality / manufacturing roles"
              enabled={config.uniformEnabled}
              onToggle={(v) => u({ uniformEnabled: v })}
            >
              <NumericRow
                label="Amount"
                value={config.uniformAllowance}
                onChange={(v) => u({ uniformAllowance: v })}
                suffix="₹ / month"
              />
            </AllowanceCard>
          </div>

          {/* Special Allowance ───────────────────────────────────────── */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Special allowance
              <span className="text-[10px] normal-case ml-2 opacity-70">
                (the balancing figure — fills the gap between fixed components and CTC)
              </span>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
              <div>
                <p className="text-sm font-medium text-foreground">Calculation Mode</p>
                <p className="text-xs text-muted-foreground">How special allowance is computed</p>
              </div>
              <Select value={config.specialAllowanceMode} onValueChange={(v: 'auto' | 'manual') => u({ specialAllowanceMode: v })}>
                <SelectTrigger className="h-9 w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (Balancing figure)</SelectItem>
                  <SelectItem value="manual">Manual (Fixed amount)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.specialAllowanceMode === 'manual' && (
              <NumericRow label="Special Allowance Amount" value={config.specialAllowanceAmount} onChange={(v) => u({ specialAllowanceAmount: v })} suffix="₹ / month" />
            )}
          </div>

          {/*
           * The Preview CTC stress-test input + live SalaryPreview output
           * used to live here. They've been hoisted to a page-level
           * `LiveSalaryPreview` component (rendered at the bottom of the
           * configure page) so the breakdown stays visible regardless of
           * which accordion section the admin is editing.
           */}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ── LiveSalaryPreview — page-level wrapper ─────────────────────────────────
// Owns the Preview CTC stress-test input + the SalaryPreview output as a
// single block, so the configure page can render it at the bottom (sticky-
// adjacent) and the admin always sees the breakdown update as they tweak any
// section above.
export function LiveSalaryPreview({
  salary, statutory, bonus, defaultCTC,
}: {
  salary: SalaryStructureConfig;
  statutory: StatutoryConfig;
  bonus?: BonusConfig;
  defaultCTC: number | null;
}) {
  const [previewCtc, setPreviewCtc] = useState<number>(defaultCTC ?? 30000);

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-muted/20">
        <div className="rounded-md bg-primary/10 p-1.5">
          <Info className="h-5 w-5 text-primary" />
        </div>
        <div className="text-left">
          <div className="font-semibold text-base">Live Salary Preview</div>
          <div className="text-xs text-muted-foreground font-normal">
            Stress-test the structure above at any monthly CTC. Updates as you
            edit every section — no save required.
          </div>
        </div>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div className="rounded-lg border border-dashed border-border bg-muted/5 p-4">
          <NumericRow
            label="Preview CTC"
            description="Monthly CTC used for the breakdown below"
            value={previewCtc}
            onChange={(v) => setPreviewCtc(Math.max(0, v))}
            suffix="₹ / month"
            step={1000}
          />
        </div>
        <SalaryPreview
          ctc={previewCtc}
          salary={salary}
          statutory={statutory}
          bonus={bonus}
        />
      </div>
    </div>
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
    <AccordionItem value="statutory-compliance" className="border rounded-lg bg-card overflow-hidden">
      <AccordionTrigger className="px-5 hover:no-underline hover:bg-muted/50 data-[state=open]:bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-primary/10 p-1.5">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-base">Statutory Compliance</div>
            <div className="text-xs text-muted-foreground font-normal">Configure PF, ESI, Professional Tax, and TDS.</div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-5 pb-5 pt-2">
        <div className="space-y-4 mt-2">
          {/* PF */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">EPF</Badge>
                <p className="text-sm font-semibold text-foreground">Provident Fund</p>
              </div>
              <Switch checked={config.pfEnabled} onCheckedChange={(v) => u({ pfEnabled: v })} />
            </div>
            {config.pfEnabled && (
              <div className="space-y-3 pl-1 pt-2 border-t border-border/50">
                <NumericRow label="Employee PF %" description="Deducted from employee's Basic" value={config.pfPercent} onChange={(v) => u({ pfPercent: v })} suffix="% of Basic" step={0.5} />
                <NumericRow label="Employer PF %" description="Company's contribution" value={config.employerPfPercent} onChange={(v) => u({ employerPfPercent: v })} suffix="% of Basic" step={0.5} />
                <ToggleRow label="Apply PF ceiling" description="Cap the Basic amount on which PF is calculated" checked={config.pfCapEnabled} onChange={(v) => u({ pfCapEnabled: v })} />
                {config.pfCapEnabled && (
                  <NumericRow label="PF ceiling amount" description="Maximum Basic pay subject to PF" value={config.pfCapAmount} onChange={(v) => u({ pfCapAmount: v })} suffix="₹" />
                )}
              </div>
            )}
          </div>

          {/* ESI */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">ESIC</Badge>
                <p className="text-sm font-semibold text-foreground">Employee State Insurance</p>
              </div>
              <Switch checked={config.esiEnabled} onCheckedChange={(v) => u({ esiEnabled: v })} />
            </div>
            {config.esiEnabled && (
              <div className="space-y-3 pl-1 pt-2 border-t border-border/50">
                <NumericRow label="ESI threshold" description="ESI applies only if gross ≤ this" value={config.esiThreshold} onChange={(v) => u({ esiThreshold: v })} suffix="₹" />
                <NumericRow label="Employee ESI %" value={config.esiEmployeePercent} onChange={(v) => u({ esiEmployeePercent: v })} suffix="% of Gross" step={0.25} />
                <NumericRow label="Employer ESI %" value={config.esiEmployerPercent} onChange={(v) => u({ esiEmployerPercent: v })} suffix="% of Gross" step={0.25} />
              </div>
            )}
          </div>

          {/* Professional Tax */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">PT</Badge>
                <p className="text-sm font-semibold text-foreground">Professional Tax</p>
              </div>
              <Switch checked={config.ptEnabled} onCheckedChange={(v) => u({ ptEnabled: v })} />
            </div>
            {config.ptEnabled && (
              <div className="space-y-3 pl-1 pt-2 border-t border-border/50">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
                  <div>
                    <p className="text-sm font-medium text-foreground">State preset</p>
                    <p className="text-xs text-muted-foreground">Auto-fills the state's slab</p>
                  </div>
                  <Select
                    value={config.ptState ?? 'custom'}
                    onValueChange={(v) => {
                      const preset = PT_STATE_PRESETS[v];
                      if (preset && v !== 'custom') {
                        u({ ptState: v, ptAmount: preset.amount, ptThreshold: preset.threshold });
                      } else {
                        u({ ptState: v });
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 w-full sm:w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PT_STATE_PRESETS).map(([k, p]) => (
                        <SelectItem key={k} value={k}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <NumericRow label="PT amount" description="Fixed monthly deduction" value={config.ptAmount} onChange={(v) => u({ ptAmount: v, ptState: 'custom' })} suffix="₹ / month" />
                <NumericRow label="PT threshold" description="PT applies only if gross ≥ this" value={config.ptThreshold} onChange={(v) => u({ ptThreshold: v, ptState: 'custom' })} suffix="₹" />
              </div>
            )}
          </div>

          {/* LWF */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">LWF</Badge>
                <p className="text-sm font-semibold text-foreground">Labour Welfare Fund</p>
              </div>
              <Switch checked={config.lwfEnabled} onCheckedChange={(v) => u({ lwfEnabled: v })} />
            </div>
            {config.lwfEnabled && (
              <div className="space-y-3 pl-1 pt-2 border-t border-border/50">
                <NumericRow label="LWF amount" description="Flat monthly amount (state-wise; Maharashtra: ₹25, Karnataka: ₹20)" value={config.lwfAmount} onChange={(v) => u({ lwfAmount: v })} suffix="₹ / month" />
              </div>
            )}
          </div>

          {/* NPS */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-cyan-50 text-cyan-700 border-cyan-200">NPS</Badge>
                <p className="text-sm font-semibold text-foreground">National Pension Scheme</p>
              </div>
              <Switch checked={config.npsEnabled} onCheckedChange={(v) => u({ npsEnabled: v })} />
            </div>
            {config.npsEnabled && (
              <div className="space-y-3 pl-1 pt-2 border-t border-border/50">
                <NumericRow label="Employee NPS %" description="Percentage of Basic (typical 5–10%, deductible u/s 80CCD(1B))" value={config.npsEmployeePercent} onChange={(v) => u({ npsEmployeePercent: v })} suffix="% of Basic" step={0.5} />
              </div>
            )}
          </div>

          {/* Gratuity */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">Gratuity</Badge>
                <p className="text-sm font-semibold text-foreground">Gratuity (Payment of Gratuity Act, 1972)</p>
              </div>
              <Switch checked={config.gratuityEnabled} onCheckedChange={(v) => u({ gratuityEnabled: v })} />
            </div>
            {config.gratuityEnabled && (
              <div className="space-y-3 pl-1 pt-2 border-t border-border/50">
                <NumericRow
                  label="Gratuity accrual %"
                  description="Percentage of Basic + DA (4.81% = standard 15/26 days × 12)"
                  value={config.gratuityPercent}
                  onChange={(v) => u({ gratuityPercent: v })}
                  suffix="% of Basic+DA"
                  step={0.01}
                />
                <p className="text-[11px] text-muted-foreground pl-1">
                  Employer-side accrual only — shows in CTC and the preview, but
                  isn't deducted from the employee's net. Paid on exit after ≥5 years.
                </p>
              </div>
            )}
          </div>

          {/* TDS */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">TDS</Badge>
                <p className="text-sm font-semibold text-foreground">Tax Deducted at Source</p>
              </div>
              <Switch checked={config.tdsEnabled} onCheckedChange={(v) => u({ tdsEnabled: v })} />
            </div>
            {config.tdsEnabled && (
              <div className="space-y-3 pl-1 pt-2 border-t border-border/50">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
                  <div>
                    <p className="text-sm font-medium text-foreground">TDS Mode</p>
                    <p className="text-xs text-muted-foreground">Flat % or income tax slabs</p>
                  </div>
                  <Select value={config.tdsMode} onValueChange={(v: 'flat' | 'slab') => u({ tdsMode: v })}>
                    <SelectTrigger className="h-9 w-full sm:w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">Flat percentage</SelectItem>
                      <SelectItem value="slab">Slab-based</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {config.tdsMode === 'flat' && (
                  <>
                    <NumericRow label="TDS flat rate" value={config.tdsFlatPercent} onChange={(v) => u({ tdsFlatPercent: v })} suffix="% of Gross" step={0.5} />
                    <p className="text-xs text-muted-foreground pl-1">+ 4% Health &amp; Education Cess applied automatically.</p>
                  </>
                )}
                {config.tdsMode === 'slab' && (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
                      <div>
                        <p className="text-sm font-medium text-foreground">Tax Regime</p>
                        <p className="text-xs text-muted-foreground">Old (with 80C/HRA) or New (lower slabs, no exemptions)</p>
                      </div>
                      <Select value={config.taxRegime} onValueChange={(v: 'old' | 'new') => u({ taxRegime: v })}>
                        <SelectTrigger className="h-9 w-full sm:w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New Regime (default)</SelectItem>
                          <SelectItem value="old">Old Regime</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {config.taxRegime === 'new' && (
                      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground mt-2">
                        <p className="font-medium text-foreground">New Tax Regime (FY 2025–26)</p>
                        <p className="mt-1 leading-relaxed">0–₹4L: Nil · ₹4–8L: 5% · ₹8–12L: 10% · ₹12–16L: 15% · ₹16–20L: 20% · ₹20–24L: 25% · &gt;₹24L: 30%</p>
                        <p className="mt-1 leading-relaxed">Std deduction ₹75k · 87A rebate ≤ ₹12L · + 4% cess · Surcharge 10%/15%/25% over ₹50L/₹1Cr/₹2Cr.</p>
                        <p className="mt-1 text-[10px] opacity-80">Monthly TDS = annual projected tax ÷ 12</p>
                      </div>
                    )}
                    {config.taxRegime === 'old' && (
                      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground mt-2">
                        <p className="font-medium text-foreground">Old Tax Regime (FY 2025–26)</p>
                        <p className="mt-1 leading-relaxed">0–₹2.5L: Nil · ₹2.5–5L: 5% · ₹5–10L: 20% · &gt;₹10L: 30%</p>
                        <p className="mt-1 leading-relaxed">Std deduction ₹50k · 87A rebate ≤ ₹5L · + 4% cess · Surcharge brackets.</p>
                        <p className="mt-1 text-[10px] opacity-80">Engine does NOT yet model 80C/80D/HRA exemptions — TDS will overstate until per-employee IT declarations are wired.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
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
    <AccordionItem value="overtime-policy" className="border rounded-lg bg-card overflow-hidden">
      <AccordionTrigger className="px-5 hover:no-underline hover:bg-muted/50 data-[state=open]:bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-primary/10 p-1.5">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-base">Overtime Policy <Badge variant="secondary" className="ml-2 font-normal text-[10px]">Optional</Badge></div>
            <div className="text-xs text-muted-foreground font-normal">Configure multipliers and limits for overtime pay.</div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-5 pb-5 pt-2">
        <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4 mt-2">
          <ToggleRow label="Enable Overtime" description="Calculate and pay overtime in payroll" checked={config.enabled} onChange={(v) => u({ enabled: v })} />

          {config.enabled && (
            <div className="space-y-3 border-t border-border pt-4">
              <NumericRow label="Weekday threshold" description="OT starts after this many hours/day" value={config.weekdayThresholdHours} onChange={(v) => u({ weekdayThresholdHours: v })} suffix="hours / day" />
              <NumericRow label="Weekday OT rate" description="Multiplier of hourly rate" value={config.rateMultiplier} onChange={(v) => u({ rateMultiplier: v })} suffix="× hourly rate" step={0.25} />
              <NumericRow label="Weekend OT rate" value={config.weekendMultiplier} onChange={(v) => u({ weekendMultiplier: v })} suffix="× hourly rate" step={0.25} />
              <NumericRow label="Holiday OT rate" value={config.holidayMultiplier} onChange={(v) => u({ holidayMultiplier: v })} suffix="× hourly rate" step={0.25} />
              <NumericRow label="Monthly OT cap" description="Maximum overtime hours per month" value={config.maxOvertimeHoursPerMonth} onChange={(v) => u({ maxOvertimeHoursPerMonth: v })} suffix="hours" />
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ── Section: Bonus & Variable Pay ──────────────────────────────────────────
//
// Every common Indian bonus type, each independently toggleable. The Salary
// Structure preview reads from this same config to fold monthly accruals into
// the total employer-cost line, so admins see the true CTC impact before
// committing.
export function BonusSection({
  config, onChange,
}: {
  config: BonusConfig;
  onChange: (c: BonusConfig) => void;
}) {
  const u = (patch: Partial<BonusConfig>) => onChange({ ...config, ...patch });

  return (
    <AccordionItem value="bonus" className="border rounded-lg bg-card overflow-hidden">
      <AccordionTrigger className="px-5 hover:no-underline hover:bg-muted/50 data-[state=open]:bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-primary/10 p-1.5">
            <Gift className="h-5 w-5 text-primary" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-base">
              Bonus & Variable Pay
              <Badge variant="secondary" className="ml-2 font-normal text-[10px]">Optional</Badge>
            </div>
            <div className="text-xs text-muted-foreground font-normal">
              Statutory, performance, festival, joining, and retention bonuses — each independently toggleable.
            </div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-5 pb-5 pt-2">
        <div className="space-y-4 mt-2">

          {/* Statutory Bonus (Payment of Bonus Act, 1965) */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">Bonus Act</Badge>
                <p className="text-sm font-semibold text-foreground">Statutory Bonus</p>
              </div>
              <Switch checked={config.statutoryBonusEnabled} onCheckedChange={(v) => u({ statutoryBonusEnabled: v })} />
            </div>
            {config.statutoryBonusEnabled && (
              <div className="space-y-3 pl-1 pt-2 border-t border-border/50">
                <NumericRow
                  label="Bonus %"
                  description="8.33% minimum, 20% maximum (of capped Basic+DA)"
                  value={config.statutoryBonusPercent}
                  onChange={(v) => u({ statutoryBonusPercent: Math.min(20, Math.max(8.33, v)) })}
                  suffix="% of (Basic+DA)"
                  step={0.01}
                />
                <NumericRow
                  label="Eligibility ceiling"
                  description="Only employees with Basic+DA ≤ this amount qualify"
                  value={config.statutoryBonusSalaryCeiling}
                  onChange={(v) => u({ statutoryBonusSalaryCeiling: v })}
                  suffix="₹ / month"
                />
                <NumericRow
                  label="Calculation ceiling"
                  description="Salary cap used in the bonus math (statutory: ₹7,000)"
                  value={config.statutoryBonusCalcCeiling}
                  onChange={(v) => u({ statutoryBonusCalcCeiling: v })}
                  suffix="₹ / month"
                />
                <p className="text-[11px] text-muted-foreground pl-1">
                  Mandatory under the Payment of Bonus Act, 1965 for employees earning
                  Basic+DA at or below the eligibility ceiling.
                </p>
              </div>
            )}
          </div>

          {/* Performance Bonus */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Performance</Badge>
                <p className="text-sm font-semibold text-foreground">Performance Bonus</p>
              </div>
              <Switch checked={config.performanceBonusEnabled} onCheckedChange={(v) => u({ performanceBonusEnabled: v })} />
            </div>
            {config.performanceBonusEnabled && (
              <div className="space-y-3 pl-1 pt-2 border-t border-border/50">
                <NumericRow
                  label="Bonus %"
                  description="Percentage of annual CTC paid as performance bonus"
                  value={config.performanceBonusPercent}
                  onChange={(v) => u({ performanceBonusPercent: Math.max(0, v) })}
                  suffix="% of annual CTC"
                  step={0.5}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
                  <div>
                    <p className="text-sm font-medium text-foreground">Payout frequency</p>
                    <p className="text-xs text-muted-foreground">When the bonus actually hits the payslip</p>
                  </div>
                  <Select
                    value={config.performanceBonusFrequency}
                    onValueChange={(v: BonusConfig['performanceBonusFrequency']) => u({ performanceBonusFrequency: v })}
                  >
                    <SelectTrigger className="h-9 w-full sm:w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="half-yearly">Half-yearly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Festival Bonus */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-pink-50 text-pink-700 border-pink-200">Festival</Badge>
                <p className="text-sm font-semibold text-foreground">Festival Bonus</p>
              </div>
              <Switch checked={config.festivalBonusEnabled} onCheckedChange={(v) => u({ festivalBonusEnabled: v })} />
            </div>
            {config.festivalBonusEnabled && (
              <div className="space-y-3 pl-1 pt-2 border-t border-border/50">
                <NumericRow
                  label="Amount"
                  description="Flat amount paid once a year (Diwali / Onam / Pongal)"
                  value={config.festivalBonusAmount}
                  onChange={(v) => u({ festivalBonusAmount: Math.max(0, v) })}
                  suffix="₹ / year"
                />
              </div>
            )}
          </div>

          {/* Joining Bonus */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">Joining</Badge>
                <p className="text-sm font-semibold text-foreground">Joining / Sign-on Bonus</p>
              </div>
              <Switch checked={config.joiningBonusEnabled} onCheckedChange={(v) => u({ joiningBonusEnabled: v })} />
            </div>
            {config.joiningBonusEnabled && (
              <div className="space-y-3 pl-1 pt-2 border-t border-border/50">
                <NumericRow
                  label="Amount"
                  description="One-time payment in the first payslip (or in tranches)"
                  value={config.joiningBonusAmount}
                  onChange={(v) => u({ joiningBonusAmount: Math.max(0, v) })}
                  suffix="₹"
                />
                <NumericRow
                  label="Clawback period"
                  description="Months the bonus is recoverable if the employee leaves early"
                  value={config.joiningBonusClawbackMonths}
                  onChange={(v) => u({ joiningBonusClawbackMonths: Math.max(0, v) })}
                  suffix="months"
                />
              </div>
            )}
          </div>

          {/* Retention Bonus */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-teal-50 text-teal-700 border-teal-200">Retention</Badge>
                <p className="text-sm font-semibold text-foreground">Retention Bonus</p>
              </div>
              <Switch checked={config.retentionBonusEnabled} onCheckedChange={(v) => u({ retentionBonusEnabled: v })} />
            </div>
            {config.retentionBonusEnabled && (
              <div className="space-y-3 pl-1 pt-2 border-t border-border/50">
                <NumericRow
                  label="Amount"
                  value={config.retentionBonusAmount}
                  onChange={(v) => u({ retentionBonusAmount: Math.max(0, v) })}
                  suffix="₹"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
                  <div>
                    <p className="text-sm font-medium text-foreground">Payout frequency</p>
                  </div>
                  <Select
                    value={config.retentionBonusFrequency}
                    onValueChange={(v: BonusConfig['retentionBonusFrequency']) => u({ retentionBonusFrequency: v })}
                  >
                    <SelectTrigger className="h-9 w-full sm:w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="half-yearly">Half-yearly</SelectItem>
                      <SelectItem value="one-time">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
