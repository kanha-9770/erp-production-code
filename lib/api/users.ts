import { baseApi } from "./baseApi"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string
  email: string
  username: string
  first_name: string | null
  last_name: string | null
  fullName: string
  avatar: string | null
  status: string
  department: string | null
  joinDate: string | null
  createdAt: string
  unitsAndRoles: Array<{ unit: { name: string }; role: { name: string; isAdmin?: boolean } }>
  permissions: Array<{ id: string; name: string; category: string }>
}

interface AdminUsersResponse {
  success: boolean
  data: AdminUser[]
  count: number
}

// ─── Inject user management endpoints ────────────────────────────────────────

export const usersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAdminUsers: builder.query<AdminUsersResponse, void>({
      query: () => "/api-test",
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
} = usersApi
