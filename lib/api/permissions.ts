import { baseApi } from "./baseApi"
import type {
  PermissionRole,
  PermissionUser,
  Permission,
  RolePermission,
  UserPermission,
} from "@/types/permissions"

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiListResponse<T> {
  success: boolean
  data: T[]
  error?: string
}

interface RolePermissionsQuery {
  roleId?: string
  formId?: string
}

// ─── Inject permission endpoints ─────────────────────────────────────────────

export const permissionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Fetch all roles
    getRoles: builder.query<ApiListResponse<PermissionRole>, void>({
      query: () => "/role",
      providesTags: ["Roles"],
      keepUnusedDataFor: 300,
    }),

    // Fetch all permissions definitions
    getPermissions: builder.query<ApiListResponse<Permission>, void>({
      query: () => "/permissions",
      providesTags: ["Permissions"],
      keepUnusedDataFor: 600,
    }),

    // Fetch role permissions (optionally by roleId or formId)
    getRolePermissions: builder.query<ApiListResponse<RolePermission>, RolePermissionsQuery>({
      query: ({ roleId, formId }) => {
        const params = new URLSearchParams()
        if (roleId) params.set("roleId", roleId)
        if (formId) params.set("formId", formId)
        return `/role-permissions?${params.toString()}`
      },
      providesTags: (result, error, arg) => [
        { type: "RolePermissions", id: arg.roleId || arg.formId || "LIST" },
      ],
      keepUnusedDataFor: 120,
    }),

    // Fetch user permissions
    getUserPermissions: builder.query<ApiListResponse<UserPermission>, void>({
      query: () => "/user-permissions",
      providesTags: ["UserPermissions"],
      keepUnusedDataFor: 120,
    }),

    // Batch update role permissions
    updateRolePermissions: builder.mutation<{ success: boolean }, object[]>({
      query: (body) => ({
        url: "/role-permissions",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      // Also invalidate Permissions so the dynamic module page (which reads
      // /api/admin/permissions via the "Permissions" tag) refetches and
      // picks up the new role grants without a hard reload.
      invalidatesTags: ["RolePermissions", "Permissions"],
    }),

    // Batch update user permissions
    updateUserPermissions: builder.mutation<{ success: boolean }, object[]>({
      query: (body) => ({
        url: "/user-permissions",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      // Same reason as above — admin/permissions composes role + user data.
      invalidatesTags: ["UserPermissions", "Permissions"],
    }),

    // Admin permissions (for module page slug)
    getAdminPermissions: builder.query<{ success: boolean; data: any }, { formId?: string }>({
      query: ({ formId }) => {
        const params = formId ? `?formId=${formId}` : ""
        return `/admin/permissions${params}`
      },
      providesTags: ["Permissions"],
    }),

    // Fetch sections for a form
    getFormSections: builder.query<ApiListResponse<{ id: string; title: string; order: number; description?: string }>, string>({
      query: (formId) => `/forms/${formId}/sections`,
      providesTags: (result, error, formId) => [{ type: "FormSections", id: formId }],
      keepUnusedDataFor: 300,
    }),

    // Fetch section-level role permissions
    getSectionRolePermissions: builder.query<ApiListResponse<RolePermission>, { sectionId: string }>({
      query: ({ sectionId }) => `/section-role-permissions?sectionId=${sectionId}`,
      providesTags: (result, error, arg) => [
        { type: "SectionRolePermissions", id: arg.sectionId },
      ],
      keepUnusedDataFor: 120,
    }),

    // Batch update section role permissions
    updateSectionRolePermissions: builder.mutation<{ success: boolean }, object[]>({
      query: (body) => ({
        url: "/section-role-permissions",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      invalidatesTags: ["SectionRolePermissions"],
    }),

    // Fetch sections of a form with their fields nested (for field permission matrix)
    getFormSectionFields: builder.query<
      ApiListResponse<{
        id: string
        title: string
        order: number
        description?: string
        fields: Array<{ id: string; label: string; type: string; order: number }>
      }>,
      string
    >({
      query: (formId) => `/forms/${formId}/section-fields`,
      providesTags: (result, error, formId) => [{ type: "FormSectionFields", id: formId }],
      keepUnusedDataFor: 300,
    }),

    // Fetch field-level role permissions for a specific field
    getFieldRolePermissions: builder.query<ApiListResponse<RolePermission>, { fieldId: string }>({
      query: ({ fieldId }) => `/field-role-permissions?fieldId=${fieldId}`,
      providesTags: (result, error, arg) => [
        { type: "FieldRolePermissions", id: arg.fieldId },
      ],
      keepUnusedDataFor: 120,
    }),

    // Batch update field role permissions
    updateFieldRolePermissions: builder.mutation<{ success: boolean }, object[]>({
      query: (body) => ({
        url: "/field-role-permissions",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      invalidatesTags: ["FieldRolePermissions"],
    }),

    // Section-level user permission overrides
    getSectionUserPermissions: builder.query<ApiListResponse<UserPermission>, { sectionId: string }>({
      query: ({ sectionId }) => `/section-user-permissions?sectionId=${sectionId}`,
      providesTags: (result, error, arg) => [
        { type: "SectionUserPermissions", id: arg.sectionId },
      ],
      keepUnusedDataFor: 120,
    }),

    updateSectionUserPermissions: builder.mutation<{ success: boolean }, object[]>({
      query: (body) => ({
        url: "/section-user-permissions",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      invalidatesTags: ["SectionUserPermissions"],
    }),

    // Field-level user permission overrides
    getFieldUserPermissions: builder.query<ApiListResponse<UserPermission>, { fieldId: string }>({
      query: ({ fieldId }) => `/field-user-permissions?fieldId=${fieldId}`,
      providesTags: (result, error, arg) => [
        { type: "FieldUserPermissions", id: arg.fieldId },
      ],
      keepUnusedDataFor: 120,
    }),

    updateFieldUserPermissions: builder.mutation<{ success: boolean }, object[]>({
      query: (body) => ({
        url: "/field-user-permissions",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      invalidatesTags: ["FieldUserPermissions"],
    }),

    // ── Action / functionality permissions (Approvals & Permissions page) ──
    // Catalog of per-module privileged actions + current role/user grants.
    getActionPermissions: builder.query<
      {
        success: boolean
        data: {
          catalog: Array<{
            module: string
            label: string
            description: string
            functionalities: Array<{ name: string; label: string; description: string; enforced: boolean }>
          }>
          roleGrants: Record<string, string[]>
          userGrants: Record<string, string[]>
        }
      },
      void
    >({
      query: () => "/action-permissions",
      providesTags: ["Permissions"],
      keepUnusedDataFor: 60,
    }),

    // Batch grant/revoke named action permissions to roles and users.
    updateActionPermissions: builder.mutation<
      { success: boolean; updatedCount: number },
      { changes: Array<{ kind: "role" | "user"; id: string; name: string; granted: boolean }> }
    >({
      query: (body) => ({
        url: "/action-permissions",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      invalidatesTags: ["Permissions"],
    }),

    // Fetch a role's current grants (labelled) so the copy flow can preview +
    // deselect before applying.
    getRoleGrants: builder.query<
      {
        success: boolean
        routes: Array<{ value: string; label: string }>
        actions: Array<{ value: string; label: string }>
      },
      string // roleId
    >({
      query: (roleId) => `/role-templates/role-grants?roleId=${roleId}`,
      keepUnusedDataFor: 30,
    }),

    // Apply an explicit, user-edited bundle of grants to a target role.
    // Merges across the route + action engines in one call.
    applyRoleGrants: builder.mutation<
      {
        success: boolean
        routesGranted: number
        actionsGranted: number
        routesRequested: number
        actionsRequested: number
        error?: string
      },
      { targetRoleId: string; routes: string[]; actions: string[] }
    >({
      query: (body) => ({
        url: "/role-templates/apply",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      invalidatesTags: ["Permissions", "Roles"],
    }),
  }),
})

export const {
  useGetRolesQuery,
  useGetPermissionsQuery,
  useGetRolePermissionsQuery,
  useGetUserPermissionsQuery,
  useUpdateRolePermissionsMutation,
  useUpdateUserPermissionsMutation,
  useGetAdminPermissionsQuery,
  useLazyGetAdminPermissionsQuery,
  useGetFormSectionsQuery,
  useGetSectionRolePermissionsQuery,
  useUpdateSectionRolePermissionsMutation,
  useGetFormSectionFieldsQuery,
  useGetFieldRolePermissionsQuery,
  useUpdateFieldRolePermissionsMutation,
  useGetSectionUserPermissionsQuery,
  useUpdateSectionUserPermissionsMutation,
  useGetFieldUserPermissionsQuery,
  useUpdateFieldUserPermissionsMutation,
  useGetActionPermissionsQuery,
  useUpdateActionPermissionsMutation,
  useApplyRoleGrantsMutation,
  useLazyGetRoleGrantsQuery,
} = permissionsApi
