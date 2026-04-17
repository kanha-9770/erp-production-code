import { baseApi } from "./baseApi"

interface ApiResponse<T = any> {
  success: boolean
  data: T
  error?: string
}

export interface FunctionData {
  id: string
  name: string
  displayName: string
  category: string
  language: string
  description: string | null
  associated: boolean
  restApi: boolean
  script: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateFunctionBody {
  name: string
  displayName: string
  category: string
  language: string
  description?: string
}

export const functionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getFunctions: builder.query<ApiResponse<FunctionData[]>, void>({
      query: () => "/functions",
      providesTags: ["Functions"],
    }),

    createFunction: builder.mutation<ApiResponse<FunctionData>, CreateFunctionBody>({
      query: (body) => ({
        url: "/functions",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Functions"],
    }),

    updateFunction: builder.mutation<
      ApiResponse<FunctionData>,
      { id: string } & Partial<CreateFunctionBody> & { associated?: boolean; restApi?: boolean; script?: string }
    >({
      query: (body) => ({
        url: "/functions",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Functions"],
    }),

    deleteFunction: builder.mutation<ApiResponse, string>({
      query: (id) => ({
        url: `/functions?id=${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Functions"],
    }),
  }),
})

export const {
  useGetFunctionsQuery,
  useCreateFunctionMutation,
  useUpdateFunctionMutation,
  useDeleteFunctionMutation,
} = functionsApi
