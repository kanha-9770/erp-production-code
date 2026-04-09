import { baseApi } from "./baseApi"
import { Module, Form } from "./types"
import type { PermissionModule } from "@/types/permissions"

// ─── Response types ──────────────────────────────────────────────────────────

interface PermittedModulesResponse {
  modules: Module[]
}

interface ModuleResponse {
  success: boolean
  data: Module
  error?: string
}

interface PublishFormResponse {
  success: boolean
  data?: Form
  error?: string
}

interface OrgModulesResponse {
  success: boolean
  data: OrgModule[]
  error?: string
}

interface OrgModule {
  id: string
  name: string
  parentId: string | null
  children?: OrgModule[]
  forms?: OrgModuleForm[]
}

interface OrgModuleForm {
  id: string
  name: string
  isPublished: boolean
}

interface PermissionModulesResponse {
  success: boolean
  data: PermissionModule[]
  error?: string
}

interface ApiResponse<T = any> {
  success: boolean
  data: T
  error?: string
}

// ─── Inject module endpoints ─────────────────────────────────────────────────

export const modulesApi = baseApi.injectEndpoints({
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

    // Modules by organization (used by useOptimisticModules)
    getOrgModules: builder.query<OrgModulesResponse, string>({
      query: (organizationId) => `/modules?organizationId=${organizationId}`,
      providesTags: ["OrgModules"],
      keepUnusedDataFor: 120,
    }),

    // Permission modules tree (used by use-modules hook)
    getPermissionModules: builder.query<PermissionModulesResponse, void>({
      query: () => "/modules-permission",
      providesTags: ["PermissionModules"],
      keepUnusedDataFor: 300,
    }),

    
    // publishForm: builder.mutation<PublishFormResponse, { formId: string; isPublished: boolean }>({
    //   query: ({ formId, isPublished }) => ({
    //     url: `/forms/${formId}/publish`,
    //     method: "POST",
    //     body: { isPublished },
    //   }),
    //   invalidatesTags: (result, error, { formId }) => [
    //     { type: "Form", id: formId },
    //     { type: "Module" },
    //     "OrgModules",
    //   ],
    // }),
    publishForm: builder.mutation<
      PublishFormResponse,
      { formId: string; body?: { unpublish?: boolean }; moduleId: string }
    >({
      query: ({ formId, body }) => ({
        url: `/forms/${formId}/publish`,
        method: "POST",
        body: body || {},
      }),
      
      async onQueryStarted({ formId, body, moduleId }, { dispatch, queryFulfilled }) {
        const isUnpublish = body?.unpublish === true

        // 🔥 update ModuleById cache immediately
        const patchModule = dispatch(
          baseApi.util.updateQueryData("getModuleById", moduleId, (draft: any) => {
            if (!draft?.data?.forms) return
            const form = draft.data.forms.find((f: any) => f.id === formId)
            if (form) {
              form.isPublished = !isUnpublish
            }
          })
        )

        // 🔥 update OrgModules cache immediately
        const patchOrg = dispatch(
          baseApi.util.updateQueryData("getOrgModules", undefined, (draft: any) => {
            if (!draft?.data) return
            for (const mod of draft.data) {
              const form = mod.forms?.find((f: any) => f.id === formId)
              if (form) {
                form.isPublished = !isUnpublish
                break
              }
            }
          })
        )

        try {
          await queryFulfilled
        } catch {
          patchModule.undo()
          patchOrg.undo()
        }
      },

      invalidatesTags: (result, error, { formId }) => [
        { type: "Form", id: formId },
        { type: "Module" },
        // { type: "Module", id: "LIST" },
        "OrgModules",
      ],
    }),


    // Create module
    createModule: builder.mutation<ApiResponse, {
      name: string
      description: string
      parentId: string | null
      organizationId: string
    }>({
      query: (body) => ({
        url: "/modules",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Module" }, "OrgModules"],
    }),

    // Update module
    updateModule: builder.mutation<ApiResponse, { moduleId: string; body: Record<string, any> }>({
      query: ({ moduleId, body }) => ({
        url: `/modules/${moduleId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { moduleId }) => [
        { type: "Module", id: moduleId },
        "OrgModules",
      ],
    }),

    // Move module (change parent)
    moveModule: builder.mutation<ApiResponse, { moduleId: string; parentId: string | null }>({
      query: ({ moduleId, parentId }) => ({
        url: `/modules/${moduleId}`,
        method: "PUT",
        body: { parentId },
      }),
      invalidatesTags: [{ type: "Module" }, "OrgModules"],
    }),

    // Reorder module: atomically re-parents (if needed) AND reindexes siblings
    reorderModule: builder.mutation<
      ApiResponse,
      {
        moduleId: string;
        newParentId: string | null;
        orderedSiblingIds: string[];
      }
    >({
      query: ({ moduleId, newParentId, orderedSiblingIds }) => ({
        url: `/modules/${moduleId}/reorder`,
        method: "PATCH",
        body: { newParentId, orderedSiblingIds },
      }),
      // Don't invalidate — the optimistic patch in the hook owns the cache
      // until the request settles. Refetch is triggered manually on success.
    }),

    // Delete module
    deleteModule: builder.mutation<ApiResponse, string>({
      query: (moduleId) => ({
        url: `/modules/${moduleId}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Module" }, "OrgModules"],
    }),

    // Get submodule data
    getSubmoduleData: builder.query<ApiResponse, { moduleId: string; submoduleId: string }>({
      query: ({ moduleId, submoduleId }) => `/modules/${moduleId}/submodules/${submoduleId}/data`,
    }),

    // Get module records with params
    getModuleRecordsList: builder.query<ApiResponse, { moduleId: string; params?: Record<string, string> }>({
      query: ({ moduleId, params }) => {
        const searchParams = params ? new URLSearchParams(params).toString() : ""
        return `/modules/${moduleId}/records${searchParams ? `?${searchParams}` : ""}`
      },
      providesTags: ["Records"],
    }),

    // Submit data to submodule
    submitSubmoduleData: builder.mutation<ApiResponse, { moduleId: string; submoduleId: string; body: Record<string, any> }>({
      query: ({ moduleId, submoduleId, body }) => ({
        url: `/modules/${moduleId}/submodules/${submoduleId}/data`,
        method: "POST",
        body,
      }),
    }),

    // Create form under a module
    createModuleForm: builder.mutation<ApiResponse, { moduleId: string; body: { name: string; description: string } }>({
      query: ({ moduleId, body }) => ({
        url: `/modules/${moduleId}/forms`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { moduleId }) => [
        { type: "Module", id: moduleId },
        "OrgModules",
      ],
    }),

    // Move form to different module
    moveForm: builder.mutation<ApiResponse, { formId: string; newModuleId: string | null }>({
      query: ({ formId, newModuleId }) => ({
        url: `/forms/${formId}/move`,
        method: "PATCH",
        body: { newModuleId },
      }),
      invalidatesTags: [{ type: "Module" }, "OrgModules"],
    }),

    // Delete form
    deleteForm: builder.mutation<ApiResponse, string>({
      query: (formId) => ({
        url: `/forms/${formId}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Module" }, "OrgModules", "Form"],
    }),

    // Update form (name/description)
    updateFormMeta: builder.mutation<ApiResponse, { formId: string; body: { name: string; description: string } }>({
      query: ({ formId, body }) => ({
        url: `/forms/${formId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { formId }) => [
        { type: "Form", id: formId },
        { type: "FormDetail", id: formId },
        { type: "Module" },
        "OrgModules",
      ],
    }),
  }),
})

export const {
  useGetPermittedModulesQuery,
  useGetModuleByIdQuery,
  useLazyGetModuleByIdQuery,
  useGetOrgModulesQuery,
  useGetPermissionModulesQuery,
  usePublishFormMutation,
  useCreateModuleMutation,
  useUpdateModuleMutation,
  useMoveModuleMutation,
  useReorderModuleMutation,
  useDeleteModuleMutation,
  useCreateModuleFormMutation,
  useMoveFormMutation,
  useDeleteFormMutation,
  useUpdateFormMetaMutation,
  useGetSubmoduleDataQuery,
  useLazyGetSubmoduleDataQuery,
  useGetModuleRecordsListQuery,
  useLazyGetModuleRecordsListQuery,
  useSubmitSubmoduleDataMutation,
} = modulesApi
