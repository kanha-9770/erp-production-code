import { extractFieldReferences } from "./parser";
import type {
  FormulaReturnType,
  BlankPreference,
  FormFieldInfo,
  FormulaEvaluationResult,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────
const NUMERIC_TYPES = new Set([
  "number", "currency", "percent", "decimal", "long-integer", "integer",
  "rollup", "auto-number", "rating", "prediction", "slider",
]);
const DATE_TYPES = new Set(["date", "datetime"]);
const TIME_TYPES = new Set(["time"]);
const BOOLEAN_TYPES = new Set(["checkbox", "decision", "boolean", "switch", "toggle"]);
const STRING_TYPES = new Set([
  "text", "textarea", "email", "url", "phone", "rich-text",
  "radio", "select", "picklist", "lookup", "user", "multi-select",
  "single-line", "multi-line", "paragraph",
]);

function normaliseType(raw: string): string {
  return (raw || "text").toLowerCase().trim();
}

function isNumeric(t: string) { return NUMERIC_TYPES.has(normaliseType(t)); }
function isDate(t: string) { return DATE_TYPES.has(normaliseType(t)); }
function isTime(t: string) { return TIME_TYPES.has(normaliseType(t)); }
function isBoolean(t: string) { return BOOLEAN_TYPES.has(normaliseType(t)); }
function isString(t: string) { return STRING_TYPES.has(normaliseType(t)); }

function stripQuotes(s: string): string {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
export class FormulaEvaluator {
  private functions: Map<string, Function> = new Map();

  constructor() {
    this.registerBuiltInFunctions();
  }

  private parseDate(d: any): Date | null {
    if (!d || typeof d !== "string") return null;
    let str = stripQuotes(d.trim());
    const parts = str.split(/[-\/]/); // Support - or / separators
    if (parts.length !== 3) {
      const date = new Date(str);
      return isNaN(date.getTime()) ? null : date;
    }
    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);
    const p2 = parseInt(parts[2], 10);
    if (isNaN(p0) || isNaN(p1) || isNaN(p2)) {
      const date = new Date(str);
      return isNaN(date.getTime()) ? null : date;
    }

    let year, month, day;
    const isYMD = parts[0].length === 4 || p0 > 31;
    if (isYMD) {
      year = p0;
      month = p1;
      day = p2;
    } else {
      year = p2;
      month = p1;
      day = p0;
    }

    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }

    // Basic validation: month 1-12, day 1-31 (rough, ignores month lengths)
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      const date = new Date(str);
      return isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(year, month - 1, day);

    // Extra check: ensure parsed matches input (catches gross misparses)
    if (
      date.getFullYear() !== year ||
      date.getMonth() + 1 !== month ||
      date.getDate() !== day
    ) {
      return null; // Overflow or invalid, discard
    }

    return isNaN(date.getTime()) ? null : date;
  }

  // ── Built-in functions ────────────────────────────────────────────────────
  private registerBuiltInFunctions() {
    // --- Numeric ---
    this.functions.set("ABS", (...args: any[]) => {
      const flat = args.flat().map((n) => Number(n) || 0);
      if (flat.length === 2) return Math.abs(flat[0] - flat[1]);
      return Math.abs(flat[0] || 0);
    });
    this.functions.set("ROUND", (n: any, d: any = 0) => {
      const num = Number(n) || 0;
      const dec = Number(d) || 0;
      return Number(Math.round(Number(num + "e" + dec)) + "e-" + dec);
    });
    this.functions.set("SQRT", (n: any) => {
      const num = Number(n) || 0;
      return num < 0 ? 0 : Math.sqrt(num);
    });
    this.functions.set("POWER", (base: any, exp: any) =>
      Math.pow(Number(base) || 0, Number(exp) || 0)
    );
    this.functions.set("SUM", (...args: any[]) =>
      args.flat(Infinity).reduce((a: number, b: any) => a + (Number(b) || 0), 0)
    );
    this.functions.set("MIN", (...args: any[]) =>
      Math.min(...args.flat(Infinity).map((n: any) => Number(n) || 0))
    );
    this.functions.set("MAX", (...args: any[]) =>
      Math.max(...args.flat(Infinity).map((n: any) => Number(n) || 0))
    );
    this.functions.set("AVG", (...args: any[]) => {
      const flat = args.flat(Infinity).map((n: any) => Number(n) || 0);
      return flat.length > 0 ? flat.reduce((a: number, b: number) => a + b, 0) / flat.length : 0;
    });
    this.functions.set("MOD", (a: any, b: any) => (Number(a) || 0) % (Number(b) || 1));
    this.functions.set("CEIL", (n: any) => Math.ceil(Number(n) || 0));
    this.functions.set("FLOOR", (n: any) => Math.floor(Number(n) || 0));

    // --- Text ---
    this.functions.set("CONCAT", (...args: any[]) =>
      args.flat(Infinity).map((s: any) => String(s ?? "")).join("")
    );
    this.functions.set("LEN", (t: any) => String(t ?? "").length);
    this.functions.set("UPPER", (t: any) => String(t ?? "").toUpperCase());
    this.functions.set("LOWER", (t: any) => String(t ?? "").toLowerCase());
    this.functions.set("TRIM", (t: any) => String(t ?? "").trim());
    this.functions.set("SUBSTRING", (t: any, s: any, l?: any) => {
      const str = String(t ?? "");
      const start = Number(s) || 0;
      const len = l !== undefined ? Number(l) : str.length - start;
      return str.substring(start, start + len);
    });
    this.functions.set("LEFT", (t: any, c: any) => String(t ?? "").substring(0, Number(c) || 0));
    this.functions.set("RIGHT", (t: any, c: any) => {
      const str = String(t ?? "");
      return str.substring(str.length - (Number(c) || 0));
    });
    this.functions.set("REPLACE", (t: any, o: any, n: any) =>
      String(t ?? "").replaceAll(String(o ?? ""), String(n ?? ""))
    );
    this.functions.set("CONTAINS", (t: any, s: any) =>
      String(t ?? "").toLowerCase().includes(String(s ?? "").toLowerCase())
    );

    // --- Logical ---
    this.functions.set("IF", (c: any, t: any, f: any) => (c ? t : f));
    this.functions.set("AND", (...args: any[]) => args.flat(Infinity).every(Boolean));
    this.functions.set("OR", (...args: any[]) => args.flat(Infinity).some(Boolean));
    this.functions.set("NOT", (a: any) => !a);
    this.functions.set("ISBLANK", (v: any) => v === null || v === undefined || v === "");
    this.functions.set("ISNUMBER", (v: any) => !isNaN(parseFloat(v)) && isFinite(Number(v)));
    this.functions.set("COALESCE", (...args: any[]) => {
      for (const arg of args.flat(Infinity)) {
        if (arg !== null && arg !== undefined && arg !== "") return arg;
      }
      return null;
    });
    this.functions.set("SWITCH", (expression: any, ...cases: any[]) => {
      const flat = cases.flat(Infinity);
      if (flat.length === 0) return expression;
      for (let i = 0; i < flat.length - 1; i += 2) {
        if (String(flat[i]) === String(expression)) return flat[i + 1];
      }
      return flat.length % 2 === 1 ? flat[flat.length - 1] : null;
    });

    // --- Date / Time ---
    this.functions.set("TODAY", () => new Date().toISOString().split("T")[0]);
    this.functions.set("NOW", () => new Date().toISOString());
    this.functions.set("YEAR", (d: any) => {
      if (!d) return 0;
      const dt = this.parseDate(d);
      return dt ? dt.getFullYear() : 0;
    });
    this.functions.set("MONTH", (d: any) => {
      if (!d) return 0;
      const dt = this.parseDate(d);
      return dt ? dt.getMonth() + 1 : 0;
    });
    this.functions.set("DAY", (d: any) => {
      if (!d) return 0;
      const dt = this.parseDate(d);
      return dt ? dt.getDate() : 0;
    });
    this.functions.set("DATEADD", (date: any, num: any, unit: string = "days") => {
      if (!date) return null;
      const d = this.parseDate(date);
      if (!d) return date;
      const n = parseFloat(String(num)) || 0;
      const res = new Date(d);
      const u = String(unit).toLowerCase().replace(/['"]/g, "");
      if (u === "months" || u === "month") res.setMonth(res.getMonth() + n);
      else if (u === "years" || u === "year") res.setFullYear(res.getFullYear() + n);
      else res.setDate(res.getDate() + n); // default: days
      return res.toISOString().split("T")[0];
    });
    this.functions.set("DATEDIFF", (end: any, start: any) => {
      if (!end || !start) return 0;
      const d1 = this.parseDate(end);
      const d2 = this.parseDate(start);
      if (!d1 || !d2) {
        console.warn('Invalid date in DATEDIFF:', end, start);
        return 0;
      }
      return Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
    });
    this.functions.set("WORKING_HOURS", (timeEnd: any, timeStart: any) => {
      const parseToMins = (t: string) => {
        if (!t || typeof t !== "string") return 0;
        const parts = t.split(":");
        return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
      };
      const diffMins = parseToMins(String(timeEnd)) - parseToMins(String(timeStart));
      return parseFloat((diffMins / 60).toFixed(2));
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN evaluate() METHOD
  // ══════════════════════════════════════════════════════════════════════════
  evaluate(
    expression: string,
    variables: Record<string, any>,
    returnType: FormulaReturnType,
    blankPreference: BlankPreference = "Empty",
    fields?: FormFieldInfo[],
    decimalPlaces: number = 2
  ): FormulaEvaluationResult {
    let expr = expression.trim();
    if (!expr) return { success: true, value: null, dependencies: [] };

    try {
      // ────────────────────────────────────────────────────────────────────
      // STEP 0: Build a unified type-map
      // ────────────────────────────────────────────────────────────────────
      const typeMap = new Map<string, string>();
      if (fields) {
        for (const f of fields) {
          const t = normaliseType(f.type || "text");
          if (f.id) typeMap.set(f.id, t);
          if (f.label) typeMap.set(f.label, t);
          if (f.databaseName) typeMap.set(f.databaseName, t);
        }
      }
      console.log('Step 0: typeMap built', Array.from(typeMap.entries()));

      const resolveType = (key: string): string => {
        const clean = stripQuotes(key.replace(/[\{\}]/g, "").trim());
        return typeMap.get(clean) || "text";
      };

      const returnTypeNorm = normaliseType(returnType);

      // ────────────────────────────────────────────────────────────────────
      // STEP 1: Operator transforms (WHILE braces are still present)
      // ────────────────────────────────────────────────────────────────────
      // 1a. {date/time} - {date/time} → DATEDIFF / WORKING_HOURS only if returnType numeric
      expr = expr.replace(
        /\{([^}]+)\}\s*-\s*\{([^}]+)\}/g,
        (_match, left: string, right: string) => {
          left = stripQuotes(left.trim());
          right = stripQuotes(right.trim());
          const lType = resolveType(left);
          const rType = resolveType(right);
          if ((isDate(lType) || isString(lType)) && (isDate(rType) || isString(rType)) && isNumeric(returnTypeNorm)) {
            return `DATEDIFF({${left}}, {${right}})`;
          } else if ((isTime(lType) || isString(lType)) && (isTime(rType) || isString(rType)) && isNumeric(returnTypeNorm)) {
            return `WORKING_HOURS({${left}}, {${right}})`;
          }
          return _match;
        }
      );

      // 1b. TODAY()/NOW()/{dateField} ± number → DATEADD(...) only if returnType date
      const dateSources = [
        "TODAY\\(\\)",
        "NOW\\(\\)",
        "\\{[^}]+\\}",
      ];
      // Forward: date ± number
      for (const src of dateSources) {
        const re = new RegExp(
          `(${src})\\s*([+-])\\s*([^\\s\\+\\-\\*\\/\\,\\)]+)`,
          "gi"
        );
        expr = expr.replace(re, (_match, part: string, op: string, amount: string) => {
          part = stripQuotes(part.trim());
          amount = stripQuotes(amount.trim());
          const pType = resolveType(part);
          const aType = resolveType(amount);
          const partIsDate =
            isDate(pType) || isString(pType) ||
            /TODAY\s*\(/i.test(part) ||
            /NOW\s*\(/i.test(part);
          if (partIsDate && !isDate(aType) && isDate(returnTypeNorm)) {
            const val = op === "-" ? `-${amount}` : amount;
            return `DATEADD(${part}, ${val})`;
          }
          return _match;
        });
      }
      // Reverse: number ± date → DATEADD(date, ±number) only for +, and if returnType date
      for (const src of dateSources) {
        const re = new RegExp(
          `([^\\s\\+\\-\\*\\/\\,\\(]+)\\s*([+-])\\s*(${src})`,
          "gi"
        );
        expr = expr.replace(re, (_match, amount: string, op: string, part: string) => {
          amount = stripQuotes(amount.trim());
          part = stripQuotes(part.trim());
          const aType = resolveType(amount);
          const pType = resolveType(part);
          const partIsDate =
            isDate(pType) || isString(pType) ||
            /TODAY\s*\(/i.test(part) ||
            /NOW\s*\(/i.test(part);
          if (partIsDate && !isDate(aType) && isDate(returnTypeNorm)) {
            if (op === "-") {
              return _match; // Do not transform number - date
            }
            const val = amount;
            return `DATEADD(${part}, ${val})`;
          }
          return _match;
        });
      }
      console.log('Step 1: After operator transforms', expr);

      // ────────────────────────────────────────────────────────────────────
      // STEP 3: Smart return-type inference
      // ────────────────────────────────────────────────────────────────────
      let effectiveReturnType: FormulaReturnType = returnType;
      const upper = expr.toUpperCase();
      if (upper.includes("DATEADD")) {
        effectiveReturnType = "Date";
      } else if (upper.includes("DATEDIFF") || upper.includes("WORKING_HOURS")) {
        effectiveReturnType = "Number";
      } else if (upper.includes("TODAY") || upper.includes("NOW")) {
        if (/^\s*(TODAY|NOW)\s*\(\s*\)\s*$/i.test(expr)) {
          effectiveReturnType = "Date";
        }
      }
      console.log('Step 3: Effective return type', effectiveReturnType);

      // ────────────────────────────────────────────────────────────────────
      // STEP 2: Variable injection (type-aware coercion)
      // ────────────────────────────────────────────────────────────────────
      const refs = extractFieldReferences(expr);
      console.log('Step 2: Extracted refs', refs);
      for (const ref of refs) {
        let val = variables[ref];
        if (val === undefined) {
          val = variables[ref.replace(/[\{\}]/g, "")];
        }
        const fieldType = resolveType(ref);
        let codeValue: string;
        const isBlank = val == null || (typeof val === "string" && val.trim() === "");
        if (isBlank) {
          if (blankPreference === "Zero") {
            codeValue = isNumeric(fieldType) ? "0" : isBoolean(fieldType) ? "false" : '""';
          } else {
            codeValue = isNumeric(fieldType) ? "0" :
              isDate(fieldType) ? "null" :
              isTime(fieldType) ? "null" :
              isBoolean(fieldType) ? "false" :
              '""';
          }
        } else {
          const looksNumeric = this.functions.get("ISNUMBER")!(val);
          const effectiveFieldType = isNumeric(returnTypeNorm) && looksNumeric ? "number" : fieldType;
          if (isNumeric(effectiveFieldType)) {
            const n = Number(val);
            codeValue = isNaN(n) ? "0" : String(n);
          } else if (isBoolean(effectiveFieldType)) {
            let boolVal = Boolean(val);
            if (typeof val === "string") {
              const lower = val.toLowerCase().trim();
              boolVal = ["true", "yes", "1", "on"].includes(lower);
            } else if (typeof val === "number") {
              boolVal = val !== 0;
            }
            codeValue = boolVal ? "true" : "false";
          } else if (isDate(effectiveFieldType)) {
            const d = new Date(val);
            if (!isNaN(d.getTime())) {
              if (effectiveFieldType === "datetime") {
                codeValue = JSON.stringify(d.toISOString());
              } else {
                codeValue = JSON.stringify(d.toISOString().split("T")[0]);
              }
            } else {
              codeValue = JSON.stringify(String(val));
            }
          } else if (isTime(effectiveFieldType)) {
            codeValue = JSON.stringify(String(val));
          } else {
            codeValue = JSON.stringify(String(val));
          }
        }
        console.log('Step 2: Injected value for', ref, '->', codeValue);
        expr = expr.split(`{${ref}}`).join(codeValue);
      }
      console.log('Step 2: Fully injected expr', expr);

      // ────────────────────────────────────────────────────────────────────
      // STEP 4: Execute via sandboxed Function constructor
      // ────────────────────────────────────────────────────────────────────
      const funcNames = Array.from(this.functions.keys());
      const funcValues = Array.from(this.functions.values());
      let rawResult: any;
      try {
        const runner = new Function(...funcNames, `"use strict"; return (${expr})`);
        rawResult = runner(...funcValues);
      } catch (execError: any) {
        // Safe fallback: try eval (e.g. for simple string concatenation expressions)
        try {
          // eslint-disable-next-line no-eval
          rawResult = eval(expr);
        } catch {
          return {
            success: false,
            error: `Expression error: ${execError?.message}`,
          };
        }
      }
      console.log('Step 4: Raw result from execution', rawResult);

      // ────────────────────────────────────────────────────────────────────
      // STEP 5: Format result according to effective return type
      // ────────────────────────────────────────────────────────────────────
      let finalValue = this.formatResult(rawResult, effectiveReturnType);
      if (
        typeof finalValue === "number" &&
        (effectiveReturnType === "Number" ||
          effectiveReturnType === "Currency" ||
          effectiveReturnType === "Percent")
      ) {
        finalValue = Number(finalValue.toFixed(decimalPlaces));
      }
      console.log('Step 5: Final formatted value', finalValue);
      return { success: true, value: finalValue, dependencies: refs };
    } catch (e: any) {
      console.log('Error in evaluate:', e.message);
      return {
        success: false,
        error: e?.message || String(e),
      };
    }
  }

  private formatResult(val: any, type: FormulaReturnType): any {
    if (val === null || val === undefined) return null;
    switch (type) {
      case "Number":
      case "Currency":
      case "Percent": {
        if (typeof val === "number") return val;
        const n = parseFloat(String(val));
        return isNaN(n) ? 0 : n;
      }
      case "Date": {
        if (typeof val === "number") return val;
        const s = String(val);
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
        return s;
      }
      case "DateTime": {
        if (typeof val === "number") return val;
        const s = String(val);
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString();
        return s;
      }
      case "Time": {
        return String(val);
      }
      case "Boolean": {
        if (typeof val === "string") {
          const lower = val.toLowerCase().trim();
          if (lower === "false" || lower === "0" || lower === "") return false;
        }
        return Boolean(val);
      }
      case "Text":
      case "Picklist":
      default:
        if (typeof val === "number" || typeof val === "boolean") return String(val);
        return val;
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────
let evaluatorInstance: FormulaEvaluator | null = null;
export function getFormulaEvaluator(): FormulaEvaluator {
  if (!evaluatorInstance) evaluatorInstance = new FormulaEvaluator();
  return evaluatorInstance;
}