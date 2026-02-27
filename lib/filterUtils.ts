import type { FieldFilter } from "@/types/filters"

/**
 * Matches a value against a filter criteria
 * Handles all field types and operators
 */
export const matchesFilter = (value: any, filter: FieldFilter): boolean => {
  try {
    // Handle empty/not empty for null/undefined values
    if (value === null || value === undefined || value === "") {
      if (filter.operator === "is empty") return true
      if (filter.operator === "is not empty") return false
      return false
    }

    // If operator is empty/not empty and value exists
    if (filter.operator === "is empty") return false
    if (filter.operator === "is not empty") return true

    const valStr = String(value).toLowerCase().trim()
    const fVal = filter.value ? String(filter.value).toLowerCase().trim() : ""
    const fVal2 = filter.value2 ? String(filter.value2).toLowerCase().trim() : ""

    switch (filter.fieldType) {
      case "text":
      case "textarea":
      case "email":
      case "url":
        return matchStringFilter(valStr, fVal, filter.operator)

      case "number":
        return matchNumberFilter(value, filter.value, filter.value2, filter.operator)

      case "date":
      case "datetime":
        return matchDateFilter(value, filter.value, filter.value2, filter.operator)

      case "checkbox":
      case "switch":
        return matchBooleanFilter(value, filter.operator)

      case "select":
      case "radio":
      case "lookup":
        return matchSelectFilter(valStr, fVal, filter.operator)

      default:
        return matchStringFilter(valStr, fVal, filter.operator)
    }
  } catch (error) {
    console.error("[v0] Filter matching error:", error)
    return false
  }
}

/**
 * String filter matching
 */
function matchStringFilter(value: string, filterValue: string, operator: string): boolean {
  switch (operator) {
    case "is":
      return value === filterValue
    case "isn't":
      return value !== filterValue
    case "contains":
      return value.includes(filterValue)
    case "doesn't contain":
      return !value.includes(filterValue)
    case "starts with":
      return value.startsWith(filterValue)
    case "ends with":
      return value.endsWith(filterValue)
    default:
      return false
  }
}

/**
 * Number filter matching
 */
function matchNumberFilter(
  value: any,
  filterValue: any,
  filterValue2: any,
  operator: string
): boolean {
  const numVal = Number(value)
  const numF = Number(filterValue)
  const numF2 = Number(filterValue2)

  if (isNaN(numVal) || isNaN(numF)) return false

  switch (operator) {
    case "is":
      return numVal === numF
    case "isn't":
      return numVal !== numF
    case "greater than":
      return numVal > numF
    case "less than":
      return numVal < numF
    case "between":
      return numVal >= numF && numVal <= numF2
    default:
      return false
  }
}

/**
 * Date filter matching
 */
function matchDateFilter(
  value: any,
  filterValue: any,
  filterValue2: any,
  operator: string
): boolean {
  const dateVal = new Date(value)
  const dateF = new Date(filterValue)
  const dateF2 = filterValue2 ? new Date(filterValue2) : new Date()

  if (isNaN(dateVal.getTime()) || isNaN(dateF.getTime())) return false

  switch (operator) {
    case "is":
      return dateVal.toDateString() === dateF.toDateString()
    case "isn't":
      return dateVal.toDateString() !== dateF.toDateString()
    case "after":
      return dateVal > dateF
    case "before":
      return dateVal < dateF
    case "between":
      return dateVal >= dateF && dateVal <= dateF2
    default:
      return false
  }
}

/**
 * Boolean filter matching
 */
function matchBooleanFilter(value: any, operator: string): boolean {
  const boolVal = value === true || value === "true" || value === 1 || value === "1"
  switch (operator) {
    case "is true":
      return boolVal
    case "is false":
      return !boolVal
    default:
      return false
  }
}

/**
 * Select/Radio/Lookup filter matching
 */
function matchSelectFilter(value: string, filterValue: string, operator: string): boolean {
  switch (operator) {
    case "is":
      return value === filterValue
    case "isn't":
      return value !== filterValue
    case "is one of":
      return filterValue
        .split(",")
        .map((s: string) => s.trim().toLowerCase())
        .includes(value)
    default:
      return false
  }
}

/**
 * Generate unique filter ID
 */
export const generateFilterId = (): string => {
  return `filter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Validate filter
 */
export const isValidFilter = (filter: FieldFilter): boolean => {
  if (!filter.fieldId || !filter.fieldType || !filter.operator) {
    return false
  }

  const requiresValue = ![
    "is empty",
    "is not empty",
    "is true",
    "is false",
  ].includes(filter.operator)

  const requiresSecondValue = ["between"].includes(filter.operator)

  if (requiresValue && !filter.value) {
    return false
  }

  if (requiresSecondValue && !filter.value2) {
    return false
  }

  return true
}

/**
 * Get required input type for a field type and operator
 */
export const getInputType = (
  fieldType: string,
  operator: string
): "text" | "number" | "date" | "datetime-local" | "none" => {
  if (["is empty", "is not empty", "is true", "is false"].includes(operator)) {
    return "none"
  }

  switch (fieldType) {
    case "number":
      return "number"
    case "date":
      return "date"
    case "datetime":
      return "datetime-local"
    default:
      return "text"
  }
}

/**
 * Check if operator requires two values
 */
export const requiresSecondValue = (operator: string): boolean => {
  return ["between"].includes(operator)
}

/**
 * Check if operator requires a value
 */
export const requiresValue = (operator: string): boolean => {
  return ![
    "is empty",
    "is not empty",
    "is true",
    "is false",
  ].includes(operator)
}
