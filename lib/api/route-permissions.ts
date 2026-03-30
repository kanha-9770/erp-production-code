import { baseApi } from "./baseApi"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RouteRule {
  id: string
  pattern: string
  description: string | null
  redirectTo: string | null
  roleAccess: Array<{ roleId: string; granted: boolean }>
  userAccess: Array<{ userId: string; granted: boolean }>
  createdAt: string
}

interface RouteAccessData {
  roleAccess: Array<{ id: string; roleId: string; granted: boolean }>
  userAccess: Array<{ id: string; userId: string; granted: boolean }>
}

interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}

interface SyncResponse {
  success: boolean
  data: RouteRule[]
  meta: { created: number; total: number }
}

interface AccessUpdatePayload {
  routeId: string
  roleUpdates?: Array<{ roleId: string; granted: boolean }>
  userUpdates?: Array<{ userId: string; granted: boolean }>
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const routePermissionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getRoutePermissions: builder.query<ApiResponse<RouteRule[]>, void>({
      query: () => "/route-permissions",
      providesTags: ["RoutePermissions"],
      keepUnusedDataFor: 120,
    }),

    discoverRoutes: builder.query<ApiResponse<string[]>, void>({
      query: () => "/route-permissions/discover",
      keepUnusedDataFor: 600,
    }),

    syncRoutePermissions: builder.mutation<SyncResponse, string[]>({
      query: (routes) => ({
        url: "/route-permissions/sync",
        method: "POST",
        body: { routes },
      }),
      invalidatesTags: ["RoutePermissions"],
    }),

    createRoutePermission: builder.mutation<
      ApiResponse<RouteRule>,
      { pattern: string; description?: string; redirectTo?: string }
    >({
      query: (body) => ({
        url: "/route-permissions",
        method: "POST",
        body,
      }),
      invalidatesTags: ["RoutePermissions"],
    }),

    updateRoutePermission: builder.mutation<
      ApiResponse<RouteRule>,
      { id: string; pattern?: string; description?: string; redirectTo?: string }
    >({
      query: (body) => ({
        url: "/route-permissions",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["RoutePermissions"],
    }),

    deleteRoutePermission: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/route-permissions?id=${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["RoutePermissions"],
    }),

    getRouteAccess: builder.query<ApiResponse<RouteAccessData>, string>({
      query: (routeId) => `/route-permissions/access?routeId=${routeId}`,
      providesTags: (result, error, routeId) => [
        { type: "RouteAccess", id: routeId },
      ],
      keepUnusedDataFor: 120,
    }),

    updateRouteAccess: builder.mutation<{ success: boolean }, AccessUpdatePayload>({
      query: (body) => ({
        url: "/route-permissions/access",
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, arg) => [
        { type: "RouteAccess", id: arg.routeId },
        "RoutePermissions",
      ],
    }),
  }),
})

export const {
  useGetRoutePermissionsQuery,
  useDiscoverRoutesQuery,
  useSyncRoutePermissionsMutation,
  useCreateRoutePermissionMutation,
  useUpdateRoutePermissionMutation,
  useDeleteRoutePermissionMutation,
  useGetRouteAccessQuery,
  useUpdateRouteAccessMutation,
} = routePermissionsApi
