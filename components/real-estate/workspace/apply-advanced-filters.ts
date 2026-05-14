"use client";

/**
 * Client-side evaluator for {@link FilterCondition}[] produced by the
 * AdvancedFilter popover.
 *
 * Designed to be cheap (O(rows × conditions)) — it runs on the already-
 * paginated slice returned by the RTK Query hooks, so a "page" is at most
 * a few hundred rows. Half-typed conditions are skipped (mirrors the
 * `validConditions` guard in advanced-filter.tsx) so the table doesn't
 * blank out while the user is composing.
 *
 * ── Why "use client" here ────────────────────────────────────────────────
 * The function itself is pure and would run fine on the server. But it's
 * re-exported alongside Client Components (AdvancedFilter, ManageColumns
 * etc.) from the workspace barrel. When a barrel mixes server-able and
 * `"use client"` modules, Next.js's App Router bundler will sometimes
 * drop one of the exports on a stale HMR build — surfacing as
 * `applyAdvancedFilters is not a function` at runtime. Marking the
 * module as a client boundary keeps the barrel uniform and the export
 * stable across rebuilds.
 */

import {
  FilterCondition,
  FilterField,
  isNoValueOp,
  isRangeOp,
  validConditions,
} from "./advanced-filter";

/** Pull the comparable value off a row using the field's accessor. */
function readValue(row: any, field: FilterField): unknown {
  if (field.getValue) return field.getValue(row);
  if (row == null) return undefined;
  return row[field.id];
}

function toComparableString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  try {
    return String(v);
  } catch {
    return "";
  }
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerce a date-ish value to epoch ms, or null if uncoercible. */
function toDateMs(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** True iff `row` satisfies the single condition `c`. */
function matchOne(row: any, c: FilterCondition, field: FilterField): boolean {
  const op = c.operator;
  const rowVal = readValue(row, field);

  // Empty / not-empty work the same on every type.
  if (op === "empty") return isEmpty(rowVal);
  if (op === "not_empty") return !isEmpty(rowVal);

  // Booleans
  if (field.type === "boolean") {
    if (op === "is_true") return rowVal === true || rowVal === "true";
    if (op === "is_false") return rowVal === false || rowVal === "false";
    return true;
  }

  // Numbers
  if (field.type === "number") {
    const a = toNumber(rowVal);
    const b = toNumber(c.value);
    if (op === "between") {
      const b2 = toNumber(c.value2);
      if (a == null || b == null || b2 == null) return false;
      const [lo, hi] = b <= b2 ? [b, b2] : [b2, b];
      return a >= lo && a <= hi;
    }
    if (a == null || b == null) return false;
    switch (op) {
      case "equals": return a === b;
      case "not_equals": return a !== b;
      case "gt": return a > b;
      case "lt": return a < b;
      case "gte": return a >= b;
      case "lte": return a <= b;
      default: return true;
    }
  }

  // Dates
  if (field.type === "date") {
    const a = toDateMs(rowVal);
    const b = toDateMs(c.value);
    if (op === "between") {
      const b2 = toDateMs(c.value2);
      if (a == null || b == null || b2 == null) return false;
      const [lo, hi] = b <= b2 ? [b, b2] : [b2, b];
      return a >= lo && a <= hi;
    }
    if (a == null || b == null) return false;
    // Compare by calendar day for `equals` so timestamps don't make the
    // "on this date" operator a near-impossible match.
    if (op === "equals") {
      const dayA = Math.floor(a / 86400000);
      const dayB = Math.floor(b / 86400000);
      return dayA === dayB;
    }
    switch (op) {
      case "before": return a < b;
      case "after": return a > b;
      default: return true;
    }
  }

  // Selects / radios — case-insensitive equality on stringified values
  if (field.type === "select") {
    const a = toComparableString(rowVal).toLowerCase();
    const b = toComparableString(c.value).toLowerCase();
    switch (op) {
      case "equals": return a === b;
      case "not_equals": return a !== b;
      default: return true;
    }
  }

  // Text / fallback — case-insensitive comparisons
  const a = toComparableString(rowVal).toLowerCase();
  const b = toComparableString(c.value).toLowerCase();
  switch (op) {
    case "contains": return a.includes(b);
    case "not_contains": return !a.includes(b);
    case "equals": return a === b;
    case "not_equals": return a !== b;
    case "starts_with": return a.startsWith(b);
    case "ends_with": return a.endsWith(b);
    default: return true;
  }
}

/**
 * Returns the subset of `rows` that satisfies every (valid) condition.
 *
 * - Conditions are AND-ed together (matches the popover's "Match rows
 *   where all conditions are true" copy).
 * - Half-typed conditions (no value where one's required) are skipped,
 *   not treated as failing. This keeps the table populated while the
 *   user is composing.
 * - Unknown `fieldId`s (e.g. a saved filter referring to a column the
 *   page no longer exposes) are skipped silently.
 */
export function applyAdvancedFilters<T>(
  rows: T[],
  conditions: FilterCondition[],
  fields: FilterField[],
): T[] {
  if (!conditions.length) return rows;
  const active = validConditions(conditions);
  if (!active.length) return rows;

  const fieldsById = new Map<string, FilterField>();
  for (const f of fields) fieldsById.set(f.id, f);

  return rows.filter((row) => {
    for (const c of active) {
      const field = fieldsById.get(c.fieldId);
      if (!field) continue; // unknown field — ignore rather than reject
      if (!matchOne(row, c, field)) return false;
    }
    return true;
  });
}

/**
 * Pretty summary of a condition for chip rendering. Useful for showing
 * "active filters" inline above the table.
 */
export function describeCondition(
  c: FilterCondition,
  fields: FilterField[],
): string {
  const field = fields.find((f) => f.id === c.fieldId);
  if (!field) return "";
  const opLabel = (() => {
    // mirror the labels from advanced-filter.tsx's OPERATORS_BY_TYPE
    const map: Record<string, string> = {
      contains: "contains",
      not_contains: "doesn't contain",
      equals: field.type === "number" ? "=" : "is",
      not_equals: field.type === "number" ? "≠" : "isn't",
      starts_with: "starts with",
      ends_with: "ends with",
      empty: "is empty",
      not_empty: "is not empty",
      gt: ">",
      lt: "<",
      gte: "≥",
      lte: "≤",
      between: "between",
      before: "before",
      after: "after",
      on: "on",
      is_true: "is true",
      is_false: "is false",
    };
    return map[c.operator] ?? c.operator;
  })();

  if (isNoValueOp(c.operator)) return `${field.label} ${opLabel}`;

  const valueLabel = (raw: string) => {
    if (field.type === "select") {
      return field.options?.find((o) => o.value === raw)?.label ?? raw;
    }
    return raw;
  };

  if (isRangeOp(c.operator)) {
    return `${field.label} ${opLabel} ${valueLabel(c.value)}–${valueLabel(c.value2 ?? "")}`;
  }

  return `${field.label} ${opLabel} ${valueLabel(c.value)}`;
}
