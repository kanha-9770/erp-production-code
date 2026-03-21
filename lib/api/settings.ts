import { baseApi } from "./baseApi"

interface ApiResponse<T = any> {
  success: boolean
  data: T
  error?: string
}

export const settingsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAuditLog: builder.query<ApiResponse, void>({
      query: () => "/audit-log",
    }),

    getLoginHistory: builder.query<ApiResponse, void>({
      query: () => "/login-history",
    }),

    getMasterData: builder.query<ApiResponse, void>({
      query: () => "/master-data",
      providesTags: ["MasterData"],
    }),

    createMasterData: builder.mutation<ApiResponse, Record<string, any>>({
      query: (body) => ({
        url: "/master-data",
        method: "POST",
        body,
      }),
      invalidatesTags: ["MasterData"],
    }),

    deleteMasterData: builder.mutation<ApiResponse, string>({
      query: (id) => ({
        url: `/master-data?id=${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["MasterData"],
    }),

    getMasterDataByModule: builder.query<ApiResponse, string>({
      query: (moduleId) => `/master-data?moduleId=${moduleId}`,
    }),
  }),
})

export const {
  useGetAuditLogQuery,
  useGetLoginHistoryQuery,
  useGetMasterDataQuery,
  useLazyGetMasterDataQuery,
  useCreateMasterDataMutation,
  useDeleteMasterDataMutation,
  useGetMasterDataByModuleQuery,
  useLazyGetMasterDataByModuleQuery,
} = settingsApi
