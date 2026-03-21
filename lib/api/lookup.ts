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
} = lookupApi
