/** Presentation helpers for the Accounts System. */

import type { FieldDef, StatusOption, StatusVariant } from "./types";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatMoney(value: unknown): string {
  const n = Number(value);
  if (value == null || value === "" || !Number.isFinite(n)) return "—";
  try {
    return inr.format(n);
  } catch {
    return `₹ ${n.toLocaleString("en-IN")}`;
  }
}

export function formatNumber(value: unknown): string {
  const n = Number(value);
  if (value == null || value === "" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN");
}

export function formatDate(value: unknown): string {
  if (!value) return "—";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}

/** Resolve a status value to its label + colour using the field's pipeline. */
export function resolveStatus(
  field: FieldDef,
  value: unknown,
): { label: string; variant: StatusVariant } {
  const opts: StatusOption[] = field.statusOptions ?? [];
  const found = opts.find((o) => o.value === value);
  if (found) return { label: found.label, variant: found.variant };
  return { label: value ? String(value) : "—", variant: "secondary" };
}
