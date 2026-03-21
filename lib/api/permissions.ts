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
      invalidatesTags: ["RolePermissions"],
    }),

    // Batch update user permissions
    updateUserPermissions: builder.mutation<{ success: boolean }, object[]>({
      query: (body) => ({
        url: "/user-permissions",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      invalidatesTags: ["UserPermissions"],
    }),

    // Admin permissions (for module page slug)
    getAdminPermissions: builder.query<{ success: boolean; data: any }, { formId?: string }>({
      query: ({ formId }) => {
        const params = formId ? `?formId=${formId}` : ""
        return `/admin/permissions${params}`
      },
      providesTags: ["Permissions"],
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
} = permissionsApi
