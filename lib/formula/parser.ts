// ═══════════════════════════════════════════════════════════════════════════════
// Formula Engine – Expression Parser & Utilities
// ═══════════════════════════════════════════════════════════════════════════════

import { getFieldReturnType } from "./types";
import type { FormFieldInfo, FormulaReturnType } from "./types";

function stripQuotes(s: string): string {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Extract every `{fieldRef}` from an expression string.
 * The returned strings are the raw content inside the braces (could be ID or label).
 */
export function extractFieldReferences(expression: string): string[] {
  const fieldPattern = /\{([^}]+)\}/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = fieldPattern.exec(expression)) !== null) {
    const ref = stripQuotes(match[1].trim());
    if (ref && !matches.includes(ref)) {
      matches.push(ref);
    }
  }

  return matches;
}

/**
 * Replace field references with safe JS variable names for evaluation.
 * Uses split+join instead of regex exec+replace to avoid lastIndex corruption
 * when the replacement string has a different length than the original match.
 */
export function replaceFieldReferences(
  expression: string,
  variables: Map<string, any>
): string {
  return expression.replace(/\{([^}]+)\}/g, (_match, rawRef: string) => {
    const fieldName = stripQuotes(rawRef.trim());
    return `_field_${fieldName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  });
}

/**
 * Extract function calls (e.g. SUM, IF, DATEDIFF) from an expression.
 */
export function extractFunctionCalls(expression: string): string[] {
  const functionPattern = /([A-Z_]+)\s*\(/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = functionPattern.exec(expression)) !== null) {
    matches.push(match[1]);
  }

  return [...new Set(matches)];
}

/**
 * Basic syntax validation (parentheses, braces).
 */
export function validateFormulaSyntax(expression: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  let parenCount = 0;
  for (const char of expression) {
    if (char === "(") parenCount++;
    if (char === ")") parenCount--;
    if (parenCount < 0) {
      errors.push("Unbalanced parentheses: too many closing parentheses");
      break;
    }
  }
  if (parenCount > 0) {
    errors.push("Unbalanced parentheses: too many opening parentheses");
  }

  let braceCount = 0;
  for (const char of expression) {
    if (char === "{") braceCount++;
    if (char === "}") braceCount--;
    if (braceCount < 0) {
      errors.push("Unbalanced braces: too many closing braces");
      break;
    }
  }
  if (braceCount > 0) {
    errors.push("Unbalanced braces: too many opening braces");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a safe JS variable name from a field name.
 */
export function createSafeVarName(fieldName: string): string {
  return `_field_${fieldName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/**
 * Build a variable context map from record data + field definitions.
 */
export function buildVariableContext(
  recordData: Record<string, any>,
  fields: Array<{ id: string; label: string; type: string; databaseName?: string }>
): Map<string, { value: any; returnType: FormulaReturnType }> {
  const variables = new Map<string, { value: any; returnType: FormulaReturnType }>();

  fields.forEach((field) => {
    const value =
      recordData[field.label] ??
      recordData[field.databaseName || field.label] ??
      null;
    const returnType = getFieldReturnType(field.type);
    variables.set(createSafeVarName(field.label), { value, returnType });
  });

  return variables;
}

/**
 * Extract field references together with their type information.
 */
export function extractFieldReferencesWithTypes(
  expression: string,
  fields: FormFieldInfo[]
): Array<{ ref: string; fieldType: string; returnType: FormulaReturnType }> {
  const fieldPattern = /\{([^}]+)\}/g;
  const matches: Array<{ ref: string; fieldType: string; returnType: FormulaReturnType }> = [];
  let match: RegExpExecArray | null;

  while ((match = fieldPattern.exec(expression)) !== null) {
    const rawRef = match[1].trim();
    const ref = stripQuotes(rawRef);
    const field = fields.find(
      (f) => f.label === ref || f.databaseName === ref || f.id === ref
    );
    if (field) {
      const returnType = getFieldReturnType(field.type);
      matches.push({ ref, fieldType: field.type, returnType });
    } else {
      matches.push({ ref, fieldType: "text", returnType: "Text" });
    }
  }

  return matches;
}
