import { baseApi } from "./baseApi"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string
  email: string
  username: string | null
  first_name: string | null
  last_name: string | null
  fullName: string
  avatar: string | null
  status: string
  department: string | null
  phone: string | null
  mobile: string | null
  location: string | null
  joinDate: string | null
  createdAt: string
  employeeEngagementTeamName?: string | null
  unitsAndRoles: Array<{ unit: { id?: string; name: string }; role: { id?: string; name: string; isAdmin?: boolean } }>
  unitAssignments?: Array<{
    unit: { id?: string; name: string } | null
    role: { id?: string; name: string; isAdmin?: boolean } | null
  }>
  permissions?: Array<{ id: string; name: string; category: string }>
}

interface AdminUsersResponse {
  success: boolean
  data: AdminUser[]
  meta?: { count: number; organizationId: string }
}

// ─── Inject user management endpoints ────────────────────────────────────────

export const usersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAdminUsers: builder.query<AdminUsersResponse, void>({
      query: () => "/admin/users",
      providesTags: ["AdminUsers"],
      keepUnusedDataFor: 60,
    }),

    getUsers: builder.query<any, { page?: number; pageSize?: number; search?: string } | void>({
      query: (params) => {
        if (!params) return "/users";
        const sp = new URLSearchParams();
        if (params.page !== undefined) sp.append("page", String(params.page));
        if (params.pageSize !== undefined) sp.append("pageSize", String(params.pageSize));
        if (params.search !== undefined) sp.append("search", params.search);
        const queryStr = sp.toString();
        return queryStr ? `/users?${queryStr}` : "/users";
      },
      providesTags: ["AdminUsers"],
    }),

    deleteUser: builder.mutation<{ success: boolean }, string>({
      query: (userId) => ({
        url: `/users/${userId}`,
        method: "DELETE",
      }),
      // A user account, its linked employee record, and the logged-in user's
      // own profile are one identity. Refresh them together so a change made
      // from User Management reflects in Employee Master + the header/profile.
      // The bare "Employee" tag (no id) also invalidates every cached employee
      // DETAIL/preview query, so an open Employee Master preview pane refreshes
      // too — not just the list.
      invalidatesTags: ["AdminUsers", "Employee", { type: "Employees", id: "LIST" }, "User"],
    }),

    getUserPermissionsList: builder.query<{ success: boolean; data: any[] }, { userId: string }>({
      query: ({ userId }) => `/users/permissions?userId=${userId}`,
    }),

    getUserPermissionsWithHeaders: builder.query<{ success: boolean; user: any }, { userId: string; userEmail: string }>({
      query: ({ userId, userEmail }) => ({
        url: "/users/permissions",
        headers: {
          "x-user-id": userId,
          "x-user-email": userEmail,
        },
      }),
    }),

    getEmployeeRecords: builder.query<{ success: boolean; data: any[] }, void>({
      query: () => "/employee-records",
    }),

    createUserFromEmployee: builder.mutation<{ success: boolean; data: any }, Record<string, any>>({
      query: (body) => ({
        url: "/create-user-from-employee",
        method: "POST",
        body,
      }),
      // Links a user to an employee → the employee row's "has account" state
      // changes, so refresh Employee Master too. The bare "Employee" tag also
      // refreshes any open employee DETAIL/preview pane, not just the list.
      invalidatesTags: ["AdminUsers", "Employee", { type: "Employees", id: "LIST" }, "User"],
    }),

    // Create user
    createUser: builder.mutation<{ success: boolean; data: any }, Record<string, any>>({
      query: (body) => ({
        url: "/users",
        method: "POST",
        body,
      }),
      invalidatesTags: ["AdminUsers", { type: "Employees", id: "LIST" }],
    }),

    // Update user
    updateUser: builder.mutation<{ success: boolean; data: any }, { userId: string; body: Record<string, any> }>({
      query: ({ userId, body }) => ({
        url: `/users/${userId}`,
        method: "PUT",
        body,
      }),
      // Edits sync to the linked employee (reverse of updateEmployee) and may
      // be the logged-in user themselves — refresh all three faces. The bare
      // "Employee" tag (no id) invalidates every cached employee DETAIL/preview
      // query too, so an open Employee Master preview pane reflects the edit
      // immediately — symmetric with updateEmployee's invalidation set.
      invalidatesTags: ["AdminUsers", "Employee", { type: "Employees", id: "LIST" }, "User"],
    }),
  }),
})

export const {
  useGetAdminUsersQuery,
  useGetUsersQuery,
  useDeleteUserMutation,
  useGetUserPermissionsListQuery,
  useGetEmployeeRecordsQuery,
  useLazyGetEmployeeRecordsQuery,
  useGetUserPermissionsWithHeadersQuery,
  useLazyGetUserPermissionsWithHeadersQuery,
  useCreateUserFromEmployeeMutation,
  useCreateUserMutation,
  useUpdateUserMutation,
} = usersApi
