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

    getUsers: builder.query<{ success: boolean; data: any[] }, void>({
      query: () => "/users",
      providesTags: ["AdminUsers"],
    }),

    deleteUser: builder.mutation<{ success: boolean }, string>({
      query: (userId) => ({
        url: `/users/${userId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["AdminUsers"],
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
      invalidatesTags: ["AdminUsers"],
    }),

    // Create user
    createUser: builder.mutation<{ success: boolean; data: any }, Record<string, any>>({
      query: (body) => ({
        url: "/users",
        method: "POST",
        body,
      }),
      invalidatesTags: ["AdminUsers"],
    }),

    // Update user
    updateUser: builder.mutation<{ success: boolean; data: any }, { userId: string; body: Record<string, any> }>({
      query: ({ userId, body }) => ({
        url: `/users/${userId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["AdminUsers"],
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
