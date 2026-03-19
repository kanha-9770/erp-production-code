import type { Role, OrganizationUnit } from "@/types/role"

/** Flatten a nested role tree into a flat array. */
export function flattenRoles(roles: Role[]): Role[] {
  const result: Role[] = []
  roles.forEach((role) => {
    result.push(role)
    result.push(...flattenRoles(role.children || []))
  })
  return result
}

/** Flatten a nested org-unit tree into a flat array. */
export function flattenUnits(units: OrganizationUnit[]): OrganizationUnit[] {
  const result: OrganizationUnit[] = []
  units.forEach((unit) => {
    result.push(unit)
    result.push(...flattenUnits(unit.children || []))
  })
  return result
}

/** Return "First Last" or fall back to email. */
export function getUserDisplayName(user: {
  first_name?: string
  last_name?: string
  email: string
}): string {
  return user.first_name && user.last_name
    ? `${user.first_name} ${user.last_name}`
    : user.email
}

/** Return two-letter initials or first letter of email. */
export function getUserInitials(user: {
  first_name?: string
  last_name?: string
  email: string
}): string {
  if (user.first_name && user.last_name) {
    return `${user.first_name[0]}${user.last_name[0]}`
  }
  return user.email[0].toUpperCase()
}
