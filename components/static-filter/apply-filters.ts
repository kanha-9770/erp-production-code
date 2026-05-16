/**
 * Generic filter evaluator for typed list pages. Mirrors the operator
 * semantics used by the dynamic-form records browser
 * (`components/modules/AdvancedFilterSidebar.tsx`) so users see the same
 * behaviour everywhere — `is`, `contains`, `between`, `is one of`, etc.
 *
 * The static lists (StaffingPlan, JobOpening, …) don't have a
 * `processedData[]` array; each row is a typed object. Callers pass a
 * `StaticFilterField<T>` config that maps each filter id to an accessor
 * function, and `applyStaticFilters` does the rest.
 */
import type { FieldFilter } from "./types";
import type { StaticFilterField } from "./types";

const isEmpty = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

function normStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).toLowerCase().trim();
}

function normNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function normDate(v: unknown): number | null {
  if (!v) return null;
  const t = new Date(v as any).getTime();
  return Number.isFinite(t) ? t : null;
}

function splitMulti(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchesFilter<T>(
  record: T,
  field: StaticFilterField<T>,
  filter: FieldFilter,
): boolean {
  const raw = field.accessor(record);
  const op = filter.operator;

  // Boolean / empty operators are uniform across types.
  if (op === "is empty") return isEmpty(raw);
  if (op === "is not empty") return !isEmpty(raw);
  if (op === "is true") return raw === true;
  if (op === "is false") return raw === false || raw === null || raw === undefined;

  // Date operators.
  if (field.type === "date") {
    const recordTs = normDate(raw);
    const filterTs = normDate(filter.value);
    const filter2Ts = normDate(filter.value2);
    if (recordTs === null) return false;
    switch (op) {
      case "is":
        return filterTs !== null && sameDay(recordTs, filterTs);
      case "isn't":
        return filterTs !== null && !sameDay(recordTs, filterTs);
      case "after":
        return filterTs !== null && recordTs > filterTs;
      case "before":
        return filterTs !== null && recordTs < filterTs;
      case "between":
        return (
          filterTs !== null &&
          filter2Ts !== null &&
          recordTs >= Math.min(filterTs, filter2Ts) &&
          recordTs <= Math.max(filterTs, filter2Ts)
        );
      default:
        return true;
    }
  }

  // Number operators.
  if (field.type === "number") {
    const recordN = normNum(raw);
    const filterN = normNum(filter.value);
    const filter2N = normNum(filter.value2);
    if (recordN === null) return false;
    switch (op) {
      case "is":
        return filterN !== null && recordN === filterN;
      case "isn't":
        return filterN !== null && recordN !== filterN;
      case "greater than":
        return filterN !== null && recordN > filterN;
      case "less than":
        return filterN !== null && recordN < filterN;
      case "between":
        return (
          filterN !== null &&
          filter2N !== null &&
          recordN >= Math.min(filterN, filter2N) &&
          recordN <= Math.max(filterN, filter2N)
        );
      case "is one of": {
        const set = new Set(splitMulti(filter.value).map((s) => parseFloat(s)));
        return set.has(recordN);
      }
      default:
        return true;
    }
  }

  // Text / select / fallback operators.
  const recordStr = normStr(raw);
  const filterStr = normStr(filter.value);
  switch (op) {
    case "is":
      return recordStr === filterStr;
    case "isn't":
      return recordStr !== filterStr;
    case "contains":
      return recordStr.includes(filterStr);
    case "doesn't contain":
      return !recordStr.includes(filterStr);
    case "starts with":
      return recordStr.startsWith(filterStr);
    case "ends with":
      return recordStr.endsWith(filterStr);
    case "is one of": {
      const set = new Set(splitMulti(filter.value).map((s) => s.toLowerCase()));
      return set.has(recordStr);
    }
    default:
      return true;
  }
}

function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function applyStaticFilters<T>(
  records: T[],
  fields: StaticFilterField<T>[],
  filters: FieldFilter[],
): T[] {
  if (filters.length === 0) return records;
  const fieldsById = new Map(fields.map((f) => [f.id, f]));

  return records.filter((r) =>
    filters.every((flt) => {
      const field = fieldsById.get(flt.fieldId);
      if (!field) return true; // unknown field id — don't reject the row
      // Operators that don't need a value still need to be evaluated; others
      // with an empty value act as a no-op (let everything through) so the
      // table doesn't blank out while the user is typing.
      const needsValue =
        flt.operator !== "is empty" &&
        flt.operator !== "is not empty" &&
        flt.operator !== "is true" &&
        flt.operator !== "is false";
      if (needsValue && isEmpty(flt.value)) return true;
      return matchesFilter(r, field, flt);
    }),
  );
}
