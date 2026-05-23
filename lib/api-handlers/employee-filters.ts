/**
 * Server-side translation of the Employee Master page's filters + advanced
 * conditions + sort into a Prisma `where` / `orderBy` for the Employee model.
 *
 * The Employee Master page used to fetch every row and filter/search/sort in
 * the browser. To support true server-side pagination (fetch only the page
 * the user is viewing) those operations must run in the database instead.
 * This module is the single place that knows how to map the UI's filter
 * vocabulary onto Prisma — keeping the handler thin and the mapping testable.
 *
 * Security: only whitelisted field IDs are honoured (see ALLOWED_FIELDS).
 * An unknown field in an advanced condition is ignored rather than blindly
 * interpolated, so a stale saved-view or a hand-crafted request can't reach
 * columns the UI never exposed.
 */

export interface AdvancedCondition {
  fieldId: string;
  operator: string;
  value?: string;
  value2?: string;
}

export interface EmployeeFilterParams {
  search?: string;
  status?: string;
  gender?: string;
  department?: string;
  minSalary?: string;
  maxSalary?: string;
  conditions?: AdvancedCondition[];
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

type FieldType = "text" | "number" | "date" | "select" | "boolean";

// Whitelist: advanced-filter field id → { column, type }. The column is the
// real Prisma field name on Employee. Mirrors the `filterFields` array in
// app/employee-master/page.tsx.
const ALLOWED_FIELDS: Record<string, { column: string; type: FieldType }> = {
  employeeName: { column: "employeeName", type: "text" },
  department: { column: "department", type: "text" },
  designation: { column: "designation", type: "text" },
  status: { column: "status", type: "select" },
  gender: { column: "gender", type: "select" },
  totalSalary: { column: "totalSalary", type: "number" },
  emailAddress1: { column: "emailAddress1", type: "text" },
  personalContact: { column: "personalContact", type: "text" },
  dateOfJoining: { column: "dateOfJoining", type: "date" },
};

// Sort keys the table exposes (sortKey on its ColumnDefs). Whitelisted so an
// arbitrary orderBy column can't be injected.
const ALLOWED_SORT: Record<string, string> = {
  employeeName: "employeeName",
  status: "status",
  totalSalary: "totalSalary",
  dateOfJoining: "dateOfJoining",
  department: "department",
  designation: "designation",
};

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[,₹$]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function date(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Build the Prisma clause for a single advanced condition. Returns null when
 *  the condition is half-typed / unmappable so the caller can skip it. */
function conditionToClause(c: AdvancedCondition): Record<string, any> | null {
  const meta = ALLOWED_FIELDS[c.fieldId];
  if (!meta) return null;
  const { column, type } = meta;
  const op = c.operator;

  // No-value operators first — valid on any type.
  if (op === "empty") return { OR: [{ [column]: null }, { [column]: "" }] };
  if (op === "not_empty")
    return { AND: [{ [column]: { not: null } }, { [column]: { not: "" } }] };

  if (type === "boolean") {
    if (op === "is_true") return { [column]: true };
    if (op === "is_false") return { [column]: false };
    return null;
  }

  if (type === "number") {
    if (op === "between") {
      const a = num(c.value);
      const b = num(c.value2);
      if (a === null || b === null) return null;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return { [column]: { gte: lo, lte: hi } };
    }
    const n = num(c.value);
    if (n === null) return null;
    switch (op) {
      case "equals": return { [column]: n };
      case "not_equals": return { [column]: { not: n } };
      case "gt": return { [column]: { gt: n } };
      case "lt": return { [column]: { lt: n } };
      case "gte": return { [column]: { gte: n } };
      case "lte": return { [column]: { lte: n } };
      default: return null;
    }
  }

  if (type === "date") {
    if (op === "between") {
      const a = date(c.value);
      const b = date(c.value2);
      if (!a || !b) return null;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return { [column]: { gte: lo, lte: hi } };
    }
    const d = date(c.value);
    if (!d) return null;
    if (op === "equals") {
      // Match the whole calendar day.
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      return { [column]: { gte: start, lte: end } };
    }
    if (op === "before") return { [column]: { lt: d } };
    if (op === "after") return { [column]: { gt: d } };
    return null;
  }

  if (type === "select") {
    const v = c.value;
    if (v === undefined || v === "") return null;
    // status / gender are enums — match exactly (uppercased to match the
    // enum spelling the form persists).
    const val = column === "status" || column === "gender" ? v.toUpperCase() : v;
    if (op === "equals") return { [column]: val };
    if (op === "not_equals") return { [column]: { not: val } };
    return null;
  }

  // text
  const v = c.value;
  if (v === undefined || v === "") return null;
  const ci = { mode: "insensitive" as const };
  switch (op) {
    case "contains": return { [column]: { contains: v, ...ci } };
    case "not_contains": return { NOT: { [column]: { contains: v, ...ci } } };
    case "equals": return { [column]: { equals: v, ...ci } };
    case "not_equals": return { NOT: { [column]: { equals: v, ...ci } } };
    case "starts_with": return { [column]: { startsWith: v, ...ci } };
    case "ends_with": return { [column]: { endsWith: v, ...ci } };
    default: return null;
  }
}

/**
 * Build the AND-list of Prisma filter clauses from the page's basic filters
 * and advanced conditions. The caller combines this with the visibility
 * `where` (admin / hierarchy) under a top-level AND.
 */
export function buildEmployeeFilterClauses(
  params: EmployeeFilterParams,
): Record<string, any>[] {
  const clauses: Record<string, any>[] = [];

  // Quick search — name OR email OR department, case-insensitive.
  const search = params.search?.trim();
  if (search) {
    const ci = { mode: "insensitive" as const };
    clauses.push({
      OR: [
        { employeeName: { contains: search, ...ci } },
        { emailAddress1: { contains: search, ...ci } },
        { department: { contains: search, ...ci } },
      ],
    });
  }

  if (params.status) clauses.push({ status: params.status.toUpperCase() });
  if (params.gender) clauses.push({ gender: params.gender.toUpperCase() });
  if (params.department) clauses.push({ department: params.department });

  const min = num(params.minSalary);
  const max = num(params.maxSalary);
  if (min !== null) clauses.push({ totalSalary: { gte: min } });
  if (max !== null) clauses.push({ totalSalary: { lte: max } });

  for (const c of params.conditions ?? []) {
    const clause = conditionToClause(c);
    if (clause) clauses.push(clause);
  }

  return clauses;
}

/** Resolve the orderBy. Defaults to employeeName asc (the previous behaviour). */
export function buildEmployeeOrderBy(
  params: EmployeeFilterParams,
): Record<string, "asc" | "desc"> {
  const col = params.sortBy ? ALLOWED_SORT[params.sortBy] : null;
  if (!col) return { employeeName: "asc" };
  return { [col]: params.sortDir === "desc" ? "desc" : "asc" };
}
