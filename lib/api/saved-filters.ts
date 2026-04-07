import { baseApi } from "./baseApi"

interface ApiResponse<T = any> {
  success: boolean
  data: T
  error?: string
}

export interface SavedFilterData {
  id: string
  name: string
  moduleId: string
  filters: Array<{
    fieldId: string
    fieldLabel: string
    fieldType: string
    operator: string
    value: string
    value2?: string
  }>
  createdAt: string
  createdBy?: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string
  }
}

export const savedFiltersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSavedFilters: builder.query<ApiResponse<SavedFilterData[]>, string>({
      query: (moduleId) => `/saved-filters?moduleId=${moduleId}`,
      providesTags: ["SavedFilters"],
    }),

    createSavedFilter: builder.mutation<
      ApiResponse<SavedFilterData>,
      { name: string; moduleId: string; filters: any[] }
    >({
      query: (body) => ({
        url: "/saved-filters",
        method: "POST",
        body,
      }),
      invalidatesTags: ["SavedFilters"],
    }),

    updateSavedFilter: builder.mutation<
      ApiResponse<SavedFilterData>,
      { id: string; name?: string; filters?: any[] }
    >({
      query: (body) => ({
        url: "/saved-filters",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["SavedFilters"],
    }),

    deleteSavedFilter: builder.mutation<ApiResponse, string>({
      query: (id) => ({
        url: `/saved-filters?id=${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["SavedFilters"],
    }),
  }),
})

export const {
  useGetSavedFiltersQuery,
  useLazyGetSavedFiltersQuery,
  useCreateSavedFilterMutation,
  useUpdateSavedFilterMutation,
  useDeleteSavedFilterMutation,
} = savedFiltersApi
