"use client";

/**
 * Departments — the Role Hierarchy chart (ADMIN → Sub Admin → HR → …), the
 * same canvas as the role page, via the reusable <RoleHierarchy />. Add roots
 * with "New Role", hover a node to add a child / insert above / delete, and
 * use the gear to edit. Fully wired to the existing roles system.
 */

import { RoleHierarchy } from "@/components/organization/role-hierarchy";

export function DepartmentsSection() {
  return <RoleHierarchy title="Role Hierarchy" addLabel="New Role" />;
}
