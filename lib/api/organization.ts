import { baseApi } from "./baseApi"
import type { Role, OrganizationUnit } from "@/types/role"

// ─── Inject organization endpoints ──────────────────────────────────────────

export const organizationApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Ensure organization exists (idempotent)
    ensureOrganization: builder.mutation<{ success: boolean }, { id: string; name: string }>({
      query: (body) => ({
        url: "/organizations/ensure",
        method: "POST",
        body,
      }),
    }),

    // Fetch roles for an organization
    getOrgRoles: builder.query<Role[], string>({
      query: (organizationId) => `/organizations/${organizationId}/roles`,
      providesTags: ["OrgRoles"],
      keepUnusedDataFor: 120,
    }),

    // Create organization
    createOrganization: builder.mutation<{ success: boolean; data: any }, Record<string, any>>({
      query: (body) => ({
        url: "/organizations/create",
        method: "POST",
        body,
      }),
    }),

    // Fetch organization units
    getOrgUnits: builder.query<OrganizationUnit[], string>({
      query: (organizationId) => `/organizations/${organizationId}/units`,
      providesTags: ["OrgUnits"],
      keepUnusedDataFor: 120,
    }),

    // Create organization unit
    createOrgUnit: builder.mutation<{ success: boolean; data: any }, { organizationId: string; body: Record<string, any> }>({
      query: ({ organizationId, body }) => ({
        url: `/organizations/${organizationId}/units`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["OrgUnits"],
    }),

    // Update organization unit
    updateOrgUnit: builder.mutation<{ success: boolean; data: any }, { unitId: string; body: Record<string, any> }>({
      query: ({ unitId, body }) => ({
        url: `/units/${unitId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["OrgUnits"],
    }),

    // Delete organization unit
    deleteOrgUnit: builder.mutation<{ success: boolean }, { organizationId: string; unitId: string }>({
      query: ({ organizationId, unitId }) => ({
        url: `/organizations/${organizationId}/units/${unitId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["OrgUnits"],
    }),

    // Create organization role
    createOrgRole: builder.mutation<{ success: boolean; data: any }, { organizationId: string; body: Record<string, any> }>({
      query: ({ organizationId, body }) => ({
        url: `/organizations/${organizationId}/roles`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["OrgRoles"],
    }),

    // Insert a new role between an existing parent and one of its children.
    // Atomic on the server — child + descendants are re-parented in the same
    // transaction that creates the new role.
    insertRoleBetween: builder.mutation<
      { success: boolean; data: Role },
      { organizationId: string; body: { childRoleId: string; name: string; description?: string; shareDataWithPeers?: boolean; isAdmin?: boolean } }
    >({
      query: ({ organizationId, body }) => ({
        url: `/organizations/${organizationId}/roles/insert-between`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["OrgRoles"],
    }),

    // Insert a new role beneath a parent, adopting ALL of that parent's current
    // children. Atomic on the server — the new role is created and every child
    // (plus its subtree) is re-parented one level down in a single transaction.
    insertRoleAboveChildren: builder.mutation<
      { success: boolean; data: Role },
      { organizationId: string; body: { parentRoleId: string; name: string; description?: string; shareDataWithPeers?: boolean; isAdmin?: boolean } }
    >({
      query: ({ organizationId, body }) => ({
        url: `/organizations/${organizationId}/roles/insert-above-children`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["OrgRoles"],
    }),

    // Update role
    updateRole: builder.mutation<{ success: boolean; data: any }, { roleId: string; body: Record<string, any> }>({
      query: ({ roleId, body }) => ({
        url: `/roles/${roleId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["OrgRoles"],
    }),

    // Get organization units (flat list)
    getOrganizationUnits: builder.query<{ success: boolean; data: any[] }, void>({
      query: () => "/organization-units",
      providesTags: ["OrgUnits"],
    }),

    // Delete role (and its entire subtree → recycle bin)
    deleteRole: builder.mutation<{ success: boolean }, string>({
      query: (roleId) => ({
        url: `/roles/${roleId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["OrgRoles"],
    }),

    // Delete a role but PROMOTE its children — the role goes to the recycle
    // bin and its direct sub-roles (with their subtrees) are lifted up to the
    // deleted role's parent, one level higher. Same endpoint as deleteRole,
    // distinguished by the ?promoteChildren=true flag.
    deleteRolePromoteChildren: builder.mutation<{ success: boolean }, string>({
      query: (roleId) => ({
        url: `/roles/${roleId}?promoteChildren=true`,
        method: "DELETE",
      }),
      invalidatesTags: ["OrgRoles"],
    }),

    // User assignment to unit
    assignUserToUnit: builder.mutation<{ success: boolean }, { userId: string; body: Record<string, any> }>({
      query: ({ userId, body }) => ({
        url: `/users/${userId}/assignments`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["OrgUnits", "AdminUsers"],
    }),

    // Remove user assignment
    removeUserAssignment: builder.mutation<{ success: boolean }, { userId: string; unitId: string }>({
      query: ({ userId, unitId }) => ({
        url: `/users/${userId}/assignments?unitId=${unitId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["OrgUnits", "AdminUsers"],
    }),
  }),
})

export const {
  useEnsureOrganizationMutation,
  useGetOrgRolesQuery,
  useGetOrgUnitsQuery,
  useCreateOrganizationMutation,
  useCreateOrgUnitMutation,
  useUpdateOrgUnitMutation,
  useDeleteOrgUnitMutation,
  useCreateOrgRoleMutation,
  useInsertRoleBetweenMutation,
  useInsertRoleAboveChildrenMutation,
  useUpdateRoleMutation,
  useGetOrganizationUnitsQuery,
  useLazyGetOrganizationUnitsQuery,
  useDeleteRoleMutation,
  useDeleteRolePromoteChildrenMutation,
  useAssignUserToUnitMutation,
  useRemoveUserAssignmentMutation,
} = organizationApi
