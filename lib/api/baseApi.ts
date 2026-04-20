import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

/**
 * Single base API instance for the entire application.
 * All endpoint slices inject into this using baseApi.injectEndpoints().
 *
 * Benefits:
 * - One reducer + one middleware in the store
 * - Shared cache across all endpoints
 * - Cross-domain tag invalidation (e.g. auth invalidates permissions)
 */
export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    credentials: "include",
  }),
  tagTypes: [
    // Auth
    "User",
    "Auth",
    // Modules
    "Module",
    "OrgModules",
    "PermissionModules",
    // Forms
    "Form",
    "FormDetail",
    "EmployeeFormCheck",
    // Records
    "Records",
    "Record",
    // Permissions
    "Roles",
    "Permissions",
    "RolePermissions",
    "UserPermissions",
    "SectionRolePermissions",
    "SectionUserPermissions",
    "FieldRolePermissions",
    "FieldUserPermissions",
    "FormSections",
    "FormSectionFields",
    // Organization
    "OrgRoles",
    "OrgUnits",
    // Admin
    "AdminUsers",
    // Settings
    "MasterData",
    // Route Permissions
    "RoutePermissions",
    "RouteAccess",
    // Chat
    "Conversations",
    // Lookup Templates
    "LookupTemplates",
    // Saved Filters
    "SavedFilters",
    // Workflow Rules
    "WorkflowRules",
    // Functions
    "Functions",
    "FunctionBindings",
  ],
  endpoints: () => ({}),
})
