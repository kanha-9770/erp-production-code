import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import { Module, Form } from "./types"

interface PermittedModulesResponse {
  modules: Module[]
}

interface ModuleResponse {
  success: boolean
  data: Module
  error?: string
}

interface PublishFormRequest {
  isPublished: boolean
}

interface PublishFormResponse {
  success: boolean
  data?: Form
  error?: string
}

export const modulesApi = createApi({
  reducerPath: "modulesApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    credentials: "include",
  }),
  tagTypes: ["Module", "Form", "Records"],
  endpoints: (builder) => ({
    getPermittedModules: builder.query<PermittedModulesResponse, void>({
      query: () => "/user/permitted-modules",
      providesTags: ["Module"],
      keepUnusedDataFor: 300,
    }),

    getModuleById: builder.query<ModuleResponse, string>({
      query: (moduleId) => `/modules/${moduleId}`,
      providesTags: (result, error, moduleId) => [{ type: "Module", id: moduleId }],
      keepUnusedDataFor: 300,
    }),

    publishForm: builder.mutation<PublishFormResponse, { formId: string; isPublished: boolean }>({
      query: ({ formId, isPublished }) => ({
        url: `/forms/${formId}/publish`,
        method: "POST",
        body: { isPublished },
      }),
      invalidatesTags: (result, error, { formId }) => [{ type: "Form", id: formId }, "Module"],
    }),
  }),
})

export const { useGetPermittedModulesQuery, useGetModuleByIdQuery, usePublishFormMutation } = modulesApi
