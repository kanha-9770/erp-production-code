/**
 * Approval criteria evaluation — pure, no prisma / no schema imports.
 *
 * Decides whether a record's (already-canonicalised) data satisfies a process's
 * criteria. Fail-closed: a malformed rule or bad type makes that rule false, it
 * never throws. Empty `rules` ⇒ matches everything (a catch-all process). A
 * missing field is treated as empty.
 */

import type { Criteria, CriteriaOp, CriteriaRule, FieldTypeMap } from "./types";

const NUMERIC_RE = /^-?[0-9]+(\.[0-9]+)?$/;

/** Stable display string for any value (used by string ops + equality). */
function asDisplayString(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(asDisplayString).join(", ");
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }
  return String(v);
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Coerce to a finite number, or null when not numeric (mirrors the SQL numeric guard). */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").trim();
  if (!NUMERIC_RE.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function evalRule(rule: CriteriaRule, data: Record<string, unknown>): boolean {
  const raw = data[rule.field];
  const ruleVal = (rule.value ?? "").toString();

  switch (rule.op) {
    case "is_empty":
      return isEmpty(raw);
    case "is_not_empty":
      return !isEmpty(raw);
    case "equals":
      // Case-insensitive across the board (status enums + free text).
      return asDisplayString(raw).trim().toLowerCase() === ruleVal.trim().toLowerCase();
    case "not_equals":
      return asDisplayString(raw).trim().toLowerCase() !== ruleVal.trim().toLowerCase();
    case "contains":
      return asDisplayString(raw).toLowerCase().includes(ruleVal.toLowerCase());
    case "starts_with":
      return asDisplayString(raw).toLowerCase().startsWith(ruleVal.toLowerCase());
    case "gt": {
      const a = toNumber(raw);
      const b = toNumber(ruleVal);
      return a != null && b != null && a > b;
    }
    case "lt": {
      const a = toNumber(raw);
      const b = toNumber(ruleVal);
      return a != null && b != null && a < b;
    }
    default:
      return false;
  }
}

/**
 * True when `data` satisfies `criteria`. `fieldTypes` is accepted for forward
 * compatibility (e.g. future per-type coercion) but the operators already coerce
 * defensively, so it is not required.
 */
export function evaluateCriteria(
  criteria: Criteria | null | undefined,
  data: Record<string, unknown>,
  _fieldTypes?: FieldTypeMap,
): boolean {
  const rules = criteria?.rules ?? [];
  if (rules.length === 0) return true; // catch-all: process applies to every record
  const mode = criteria?.matchMode === "ANY" ? "ANY" : "ALL";
  return mode === "ANY"
    ? rules.some((r) => evalRule(r, data))
    : rules.every((r) => evalRule(r, data));
}

/** Operator metadata for the criteria builder UI (label + whether a value is needed). */
export const CRITERIA_OPERATORS: ReadonlyArray<{
  op: CriteriaOp;
  label: string;
  needsValue: boolean;
}> = [
  { op: "equals", label: "is", needsValue: true },
  { op: "not_equals", label: "is not", needsValue: true },
  { op: "contains", label: "contains", needsValue: true },
  { op: "starts_with", label: "starts with", needsValue: true },
  { op: "gt", label: "greater than", needsValue: true },
  { op: "lt", label: "less than", needsValue: true },
  { op: "is_empty", label: "is empty", needsValue: false },
  { op: "is_not_empty", label: "is not empty", needsValue: false },
];
