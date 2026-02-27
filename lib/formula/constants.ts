// ═══════════════════════════════════════════════════════════════════════════════
// Formula Engine – Constants (Functions, Operators, Options)
// ═══════════════════════════════════════════════════════════════════════════════

export interface FormulaFunction {
  name: string;
  category: string;
  description: string;
  example?: string;
  args?: string[];
}

export interface FormulaOperator {
  symbol: string;
  category: string;
  description: string;
}

// ── Built-in Functions ──────────────────────────────────────────────────────

export const FORMULA_FUNCTIONS: FormulaFunction[] = [
  // Numeric
  { name: "ABS", category: "Numeric", description: "Absolute value or difference between two numbers", example: "ABS({Field1} - {Field2})" },
  { name: "ROUND", category: "Numeric", description: "Round a number to N decimal places", example: "ROUND({Price}, 2)" },
  { name: "SQRT", category: "Numeric", description: "Square root of a number", example: "SQRT({Area})" },
  { name: "POWER", category: "Numeric", description: "Raise base to an exponent", example: "POWER({Base}, 2)" },
  { name: "SUM", category: "Numeric", description: "Sum of multiple values", example: "SUM({A}, {B}, {C})" },
  { name: "MIN", category: "Numeric", description: "Minimum of multiple values", example: "MIN({A}, {B})" },
  { name: "MAX", category: "Numeric", description: "Maximum of multiple values", example: "MAX({A}, {B})" },
  { name: "AVG", category: "Numeric", description: "Average of multiple values", example: "AVG({A}, {B}, {C})" },
  { name: "MOD", category: "Numeric", description: "Modulo (remainder)", example: "MOD({Total}, 3)" },
  { name: "CEIL", category: "Numeric", description: "Round up to nearest integer", example: "CEIL({Price})" },
  { name: "FLOOR", category: "Numeric", description: "Round down to nearest integer", example: "FLOOR({Price})" },

  // Text
  { name: "CONCAT", category: "Text", description: "Concatenate text values", example: 'CONCAT({First}, " ", {Last})' },
  { name: "LEN", category: "Text", description: "Length of a text string", example: "LEN({Name})" },
  { name: "UPPER", category: "Text", description: "Convert text to uppercase", example: "UPPER({Name})" },
  { name: "LOWER", category: "Text", description: "Convert text to lowercase", example: "LOWER({Email})" },
  { name: "TRIM", category: "Text", description: "Remove leading/trailing whitespace", example: "TRIM({Input})" },
  { name: "SUBSTRING", category: "Text", description: "Extract part of a text string", example: "SUBSTRING({Text}, 0, 5)" },
  { name: "LEFT", category: "Text", description: "Get leftmost N characters", example: "LEFT({Code}, 3)" },
  { name: "RIGHT", category: "Text", description: "Get rightmost N characters", example: "RIGHT({Code}, 4)" },
  { name: "REPLACE", category: "Text", description: "Replace occurrences of a substring", example: 'REPLACE({Text}, "old", "new")' },
  { name: "CONTAINS", category: "Text", description: "Check if text contains a substring", example: 'CONTAINS({Email}, "@")' },

  // Logical
  { name: "IF", category: "Logical", description: "Conditional: IF(condition, trueValue, falseValue)", example: 'IF({Score} > 50, "Pass", "Fail")' },
  { name: "AND", category: "Logical", description: "Logical AND of multiple conditions", example: "AND({A} > 0, {B} > 0)" },
  { name: "OR", category: "Logical", description: "Logical OR of multiple conditions", example: "OR({A} > 0, {B} > 0)" },
  { name: "NOT", category: "Logical", description: "Logical NOT", example: "NOT({Active})" },
  { name: "ISBLANK", category: "Logical", description: "Check if a value is blank/null/empty", example: "ISBLANK({Field})" },
  { name: "ISNUMBER", category: "Logical", description: "Check if a value is a number", example: "ISNUMBER({Value})" },
  { name: "COALESCE", category: "Logical", description: "Return first non-blank value", example: "COALESCE({Primary}, {Backup}, 0)" },
  { name: "SWITCH", category: "Logical", description: "Match expression to value pairs, with optional default", example: 'SWITCH({Status}, "A", "Active", "I", "Inactive", "Unknown")' },

  // Date / Time
  { name: "TODAY", category: "Date/Time", description: "Current date (YYYY-MM-DD)", example: "TODAY()" },
  { name: "NOW", category: "Date/Time", description: "Current date and time (ISO)", example: "NOW()" },
  { name: "YEAR", category: "Date/Time", description: "Extract year from a date", example: "YEAR({BirthDate})" },
  { name: "MONTH", category: "Date/Time", description: "Extract month (1-12) from a date", example: "MONTH({JoinDate})" },
  { name: "DAY", category: "Date/Time", description: "Extract day of month from a date", example: "DAY({Created})" },
  { name: "DATEADD", category: "Date/Time", description: "Add days/months/years to a date", example: 'DATEADD({Start}, 30, "days")' },
  { name: "DATEDIFF", category: "Date/Time", description: "Difference in days between two dates", example: "DATEDIFF({End}, {Start})" },
  { name: "WORKING_HOURS", category: "Date/Time", description: "Hours between two time values", example: "WORKING_HOURS({EndTime}, {StartTime})" },
];

// ── Operators ───────────────────────────────────────────────────────────────

export const FORMULA_OPERATORS: FormulaOperator[] = [
  // Arithmetic
  { symbol: "+", category: "Arithmetic", description: "Addition" },
  { symbol: "-", category: "Arithmetic", description: "Subtraction" },
  { symbol: "*", category: "Arithmetic", description: "Multiplication" },
  { symbol: "/", category: "Arithmetic", description: "Division" },
  { symbol: "%", category: "Arithmetic", description: "Modulo / Percent" },

  // Comparison
  { symbol: "==", category: "Comparison", description: "Equal to" },
  { symbol: "!=", category: "Comparison", description: "Not equal to" },
  { symbol: ">", category: "Comparison", description: "Greater than" },
  { symbol: "<", category: "Comparison", description: "Less than" },
  { symbol: ">=", category: "Comparison", description: "Greater than or equal" },
  { symbol: "<=", category: "Comparison", description: "Less than or equal" },

  // Logical
  { symbol: "&&", category: "Logical", description: "Logical AND" },
  { symbol: "||", category: "Logical", description: "Logical OR" },
  { symbol: "!", category: "Logical", description: "Logical NOT" },

  // Grouping
  { symbol: "(", category: "Grouping", description: "Open parenthesis" },
  { symbol: ")", category: "Grouping", description: "Close parenthesis" },

  // String
  { symbol: "&", category: "Text", description: "String concatenation (alternative to +)" },
];

// ── Decimal Places Options ──────────────────────────────────────────────────

export const DECIMAL_PLACES_OPTIONS = [
  { value: 0, label: "0 (Integer)" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
];

// ── Blank Preference Options ────────────────────────────────────────────────

export const BLANK_PREFERENCE_OPTIONS = [
  { value: "Empty", label: "Treat as Empty" },
  { value: "Zero", label: "Treat as Zero" },
];
