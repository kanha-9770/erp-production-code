import type { FormulaFunction } from "./types"

export const FORMULA_FUNCTIONS: FormulaFunction[] = [
  // Numeric
  { name: "ABS", category: "Numeric", description: "Returns absolute value", syntax: "ABS(number)", examples: ["ABS(-5) = 5"], parameters: [{ name: "number", type: "number", description: "The number" }], returnType: "Number" },
  { name: "ROUND", category: "Numeric", description: "Rounds to decimal places", syntax: "ROUND(number, decimals)", examples: ["ROUND(3.456, 2) = 3.46"], parameters: [{ name: "number", type: "number", description: "The number" }, { name: "decimals", type: "number", description: "Decimal places", optional: true }], returnType: "Number" },
  { name: "CEIL", category: "Numeric", description: "Rounds up to nearest integer", syntax: "CEIL(number)", examples: ["CEIL(3.2) = 4"], parameters: [{ name: "number", type: "number", description: "The number" }], returnType: "Number" },
  { name: "FLOOR", category: "Numeric", description: "Rounds down to nearest integer", syntax: "FLOOR(number)", examples: ["FLOOR(3.8) = 3"], parameters: [{ name: "number", type: "number", description: "The number" }], returnType: "Number" },
  { name: "SQRT", category: "Numeric", description: "Returns square root", syntax: "SQRT(number)", examples: ["SQRT(16) = 4"], parameters: [{ name: "number", type: "number", description: "The number" }], returnType: "Number" },
  { name: "POWER", category: "Numeric", description: "Returns base raised to power", syntax: "POWER(base, exp)", examples: ["POWER(2, 3) = 8"], parameters: [{ name: "base", type: "number", description: "Base" }, { name: "exp", type: "number", description: "Exponent" }], returnType: "Number" },
  { name: "MIN", category: "Numeric", description: "Returns minimum value", syntax: "MIN(a, b, ...)", examples: ["MIN(1, 2, 3) = 1"], parameters: [{ name: "values", type: "number[]", description: "Numbers to compare" }], returnType: "Number" },
  { name: "MAX", category: "Numeric", description: "Returns maximum value", syntax: "MAX(a, b, ...)", examples: ["MAX(1, 2, 3) = 3"], parameters: [{ name: "values", type: "number[]", description: "Numbers to compare" }], returnType: "Number" },
  { name: "SUM", category: "Numeric", description: "Returns sum of all values", syntax: "SUM(a, b, ...)", examples: ["SUM(1, 2, 3) = 6"], parameters: [{ name: "values", type: "number[]", description: "Numbers to sum" }], returnType: "Number" },
  { name: "AVG", category: "Numeric", description: "Returns average of values", syntax: "AVG(a, b, ...)", examples: ["AVG(2, 4, 6) = 4"], parameters: [{ name: "values", type: "number[]", description: "Numbers to average" }], returnType: "Number" },
  { name: "MOD", category: "Numeric", description: "Returns remainder of division", syntax: "MOD(a, b)", examples: ["MOD(10, 3) = 1"], parameters: [{ name: "a", type: "number", description: "Dividend" }, { name: "b", type: "number", description: "Divisor" }], returnType: "Number" },
  // Text
  { name: "CONCAT", category: "Text", description: "Joins text strings", syntax: "CONCAT(a, b, ...)", examples: ['CONCAT("Hello", " ", "World") = "Hello World"'], parameters: [{ name: "values", type: "string[]", description: "Strings to join" }], returnType: "Text" },
  { name: "LEN", category: "Text", description: "Returns length of text", syntax: "LEN(text)", examples: ['LEN("Hello") = 5'], parameters: [{ name: "text", type: "string", description: "The text" }], returnType: "Number" },
  { name: "UPPER", category: "Text", description: "Converts to uppercase", syntax: "UPPER(text)", examples: ['UPPER("hello") = "HELLO"'], parameters: [{ name: "text", type: "string", description: "The text" }], returnType: "Text" },
  { name: "LOWER", category: "Text", description: "Converts to lowercase", syntax: "LOWER(text)", examples: ['LOWER("HELLO") = "hello"'], parameters: [{ name: "text", type: "string", description: "The text" }], returnType: "Text" },
  { name: "TRIM", category: "Text", description: "Removes leading/trailing whitespace", syntax: "TRIM(text)", examples: ['TRIM("  Hello  ") = "Hello"'], parameters: [{ name: "text", type: "string", description: "The text" }], returnType: "Text" },
  { name: "SUBSTRING", category: "Text", description: "Extracts part of text", syntax: "SUBSTRING(text, start, length)", examples: ['SUBSTRING("Hello", 0, 3) = "Hel"'], parameters: [{ name: "text", type: "string", description: "The text" }, { name: "start", type: "number", description: "Start index" }, { name: "length", type: "number", description: "Length", optional: true }], returnType: "Text" },
  { name: "LEFT", category: "Text", description: "Returns leftmost characters", syntax: "LEFT(text, count)", examples: ['LEFT("Hello", 3) = "Hel"'], parameters: [{ name: "text", type: "string", description: "The text" }, { name: "count", type: "number", description: "Number of chars" }], returnType: "Text" },
  { name: "RIGHT", category: "Text", description: "Returns rightmost characters", syntax: "RIGHT(text, count)", examples: ['RIGHT("Hello", 3) = "llo"'], parameters: [{ name: "text", type: "string", description: "The text" }, { name: "count", type: "number", description: "Number of chars" }], returnType: "Text" },
  { name: "REPLACE", category: "Text", description: "Replaces occurrences in text", syntax: "REPLACE(text, old, new)", examples: ['REPLACE("Hello World", "World", "Earth")'], parameters: [{ name: "text", type: "string", description: "The text" }, { name: "old", type: "string", description: "Text to find" }, { name: "new", type: "string", description: "Replacement" }], returnType: "Text" },
  { name: "CONTAINS", category: "Text", description: "Checks if text contains substring", syntax: "CONTAINS(text, search)", examples: ['CONTAINS("Hello", "ell") = true'], parameters: [{ name: "text", type: "string", description: "The text" }, { name: "search", type: "string", description: "Search term" }], returnType: "Boolean" },
  // Logical
  { name: "IF", category: "Logical", description: "Returns value based on condition", syntax: "IF(condition, trueValue, falseValue)", examples: ["IF(10 > 5, 'Yes', 'No') = 'Yes'"], parameters: [{ name: "condition", type: "boolean", description: "Condition" }, { name: "trueValue", type: "any", description: "If true" }, { name: "falseValue", type: "any", description: "If false" }], returnType: "Text" },
  { name: "AND", category: "Logical", description: "Returns true if all are true", syntax: "AND(a, b, ...)", examples: ["AND(true, true) = true"], parameters: [{ name: "values", type: "boolean[]", description: "Conditions" }], returnType: "Boolean" },
  { name: "OR", category: "Logical", description: "Returns true if any is true", syntax: "OR(a, b, ...)", examples: ["OR(true, false) = true"], parameters: [{ name: "values", type: "boolean[]", description: "Conditions" }], returnType: "Boolean" },
  { name: "NOT", category: "Logical", description: "Negates a boolean", syntax: "NOT(value)", examples: ["NOT(true) = false"], parameters: [{ name: "value", type: "boolean", description: "Value to negate" }], returnType: "Boolean" },
  { name: "ISBLANK", category: "Logical", description: "Checks if value is blank/empty", syntax: "ISBLANK(value)", examples: ['ISBLANK("") = true'], parameters: [{ name: "value", type: "any", description: "Value to check" }], returnType: "Boolean" },
  { name: "ISNUMBER", category: "Logical", description: "Checks if value is a number", syntax: "ISNUMBER(value)", examples: ["ISNUMBER(42) = true"], parameters: [{ name: "value", type: "any", description: "Value to check" }], returnType: "Boolean" },
  { name: "COALESCE", category: "Logical", description: "Returns first non-blank value", syntax: "COALESCE(a, b, ...)", examples: ['COALESCE(null, "", "hello") = "hello"'], parameters: [{ name: "values", type: "any[]", description: "Values to check" }], returnType: "Text" },
  { name: "SWITCH", category: "Logical", description: "Matches expression to cases", syntax: "SWITCH(expr, val1, result1, ..., default)", examples: ['SWITCH("A", "A", 1, "B", 2, 0) = 1'], parameters: [{ name: "expression", type: "any", description: "Expression to match" }, { name: "cases", type: "any[]", description: "Value-result pairs" }], returnType: "Text" },
  // Date
  { name: "TODAY", category: "Date", description: "Returns current date", syntax: "TODAY()", examples: ["TODAY() = 2026-02-11"], parameters: [], returnType: "Date" },
  { name: "NOW", category: "Date", description: "Returns current date and time", syntax: "NOW()", examples: ["NOW() = 2026-02-11T12:00:00Z"], parameters: [], returnType: "DateTime" },
  { name: "YEAR", category: "Date", description: "Extracts year from date", syntax: "YEAR(date)", examples: ["YEAR('2026-01-15') = 2026"], parameters: [{ name: "date", type: "date", description: "The date" }], returnType: "Number" },
  { name: "MONTH", category: "Date", description: "Extracts month from date (1-12)", syntax: "MONTH(date)", examples: ["MONTH('2026-03-15') = 3"], parameters: [{ name: "date", type: "date", description: "The date" }], returnType: "Number" },
  { name: "DAY", category: "Date", description: "Extracts day from date", syntax: "DAY(date)", examples: ["DAY('2026-03-15') = 15"], parameters: [{ name: "date", type: "date", description: "The date" }], returnType: "Number" },
  { name: "DATEDIFF", category: "Date", description: "Returns days between two dates", syntax: "DATEDIFF(end_date, start_date)", examples: ["DATEDIFF('2026-01-10', '2026-01-01') = 9"], parameters: [{ name: "end_date", type: "date", description: "End date" }, { name: "start_date", type: "date", description: "Start date" }], returnType: "Number" },
  { name: "DATEADD", category: "Date", description: "Adds days/months/years to date", syntax: "DATEADD(date, amount, unit)", examples: ["DATEADD('2026-01-01', 10, 'days')"], parameters: [{ name: "date", type: "date", description: "The date" }, { name: "amount", type: "number", description: "Amount to add" }, { name: "unit", type: "string", description: "days/months/years", optional: true }], returnType: "Date" },
  // Advanced
  { name: "WORKING_HOURS", category: "Advanced", description: "Returns hours between two times", syntax: "WORKING_HOURS(start_time, end_time)", examples: ["WORKING_HOURS('09:00', '17:30') = 8.5"], parameters: [{ name: "start_time", type: "time", description: "Start time" }, { name: "end_time", type: "time", description: "End time" }], returnType: "Number" },
]

export const FORMULA_OPERATORS = [
  // Arithmetic
  { symbol: "+", category: "Arithmetic", description: "Addition" },
  { symbol: "-", category: "Arithmetic", description: "Subtraction" },
  { symbol: "*", category: "Arithmetic", description: "Multiplication" },
  { symbol: "/", category: "Arithmetic", description: "Division" },
  { symbol: "%", category: "Arithmetic", description: "Modulo" },
  // Comparison
  { symbol: "==", category: "Comparison", description: "Equal to" },
  { symbol: "!=", category: "Comparison", description: "Not equal to" },
  { symbol: "<", category: "Comparison", description: "Less than" },
  { symbol: ">", category: "Comparison", description: "Greater than" },
  { symbol: "<=", category: "Comparison", description: "Less than or equal" },
  { symbol: ">=", category: "Comparison", description: "Greater than or equal" },
  // Logical
  { symbol: "&&", category: "Logical", description: "Logical AND" },
  { symbol: "||", category: "Logical", description: "Logical OR" },
  { symbol: "!", category: "Logical", description: "Logical NOT" },
  // String
  { symbol: "&", category: "String", description: "String concatenation (use CONCAT)" },
]

export const DECIMAL_PLACES_OPTIONS = [
  { value: 0, label: "0 (Integer)" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
]

export const BLANK_PREFERENCE_OPTIONS = [
  { value: "Empty", label: "Treat as empty (null)" },
  { value: "Zero", label: "Treat as zero" },
  { value: "EmptyString", label: "Treat as empty string" },
  { value: "Exclude", label: "Exclude (fail if blank)" },
]
