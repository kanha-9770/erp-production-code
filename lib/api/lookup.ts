import { baseApi } from "./baseApi"

interface ApiResponse<T = any> {
  success: boolean
  data: T
  error?: string
}

export const lookupApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLookupSources: builder.query<ApiResponse, void>({
      query: () => "/lookup/sources",
    }),

    getLookupFields: builder.query<ApiResponse, string>({
      query: (sourceId) => `/lookup/fields?sourceId=${sourceId}`,
    }),

    getLookupData: builder.query<ApiResponse, Record<string, string>>({
      query: (params) => `/lookup/data?${new URLSearchParams(params).toString()}`,
    }),

    getLookupSections: builder.query<ApiResponse, string>({
      query: (formId) => `/lookup/sections?formId=${formId}`,
    }),

    getLookupFieldsWithSection: builder.query<ApiResponse, { sourceId: string; sectionId: string }>({
      query: ({ sourceId, sectionId }) => `/lookup/fields?sourceId=${sourceId}&sectionId=${sectionId}`,
    }),

    // ─── Lookup Templates ──────────────────────────────────────
    getLookupTemplates: builder.query<ApiResponse, void>({
      query: () => "/lookup/templates",
      providesTags: ["LookupTemplates"],
    }),

    saveLookupTemplate: builder.mutation<ApiResponse, {
      name: string
      description?: string
      config: any
      selectedFields: any
      dependencies?: any
      sourceInfo: any
    }>({
      query: (body) => ({
        url: "/lookup/templates",
        method: "POST",
        body,
      }),
      invalidatesTags: ["LookupTemplates"],
    }),

    deleteLookupTemplate: builder.mutation<ApiResponse, string>({
      query: (id) => ({
        url: `/lookup/templates?id=${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["LookupTemplates"],
    }),
  }),
})

export const {
  useGetLookupSourcesQuery,
  useLazyGetLookupSourcesQuery,
  useGetLookupFieldsQuery,
  useLazyGetLookupFieldsQuery,
  useGetLookupDataQuery,
  useLazyGetLookupDataQuery,
  useGetLookupSectionsQuery,
  useLazyGetLookupSectionsQuery,
  useGetLookupFieldsWithSectionQuery,
  useLazyGetLookupFieldsWithSectionQuery,
  useGetLookupTemplatesQuery,
  useLazyGetLookupTemplatesQuery,
  useSaveLookupTemplateMutation,
  useDeleteLookupTemplateMutation,
} = lookupApi
