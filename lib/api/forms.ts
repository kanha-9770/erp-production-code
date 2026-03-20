import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import { Form, FormField, FormSection, FormFieldWithMeta } from "./types"

interface FormDetailResponse {
  success: boolean
  data: Form
  error?: string
}

interface ApiResponse<T = any> {
  success: boolean
  data: T
  error?: string
}

// --- Mutation arg types ---

interface CreateFieldArgs {
  sectionId?: string | null
  subformId?: string | null
  type: string
  label: string
  placeholder?: string
  description?: string
  defaultValue?: string
  options?: any[]
  validation?: Record<string, any>
  visible?: boolean
  readonly?: boolean
  width?: string
  order?: number
  lookup?: any
  formula?: any
  rollup?: any
}

interface UpdateFieldArgs {
  fieldId: string
  body: Record<string, any>
}

interface CreateSubformArgs {
  formId: string
  parentSubformId?: string
  name: string
  order: number
  columns: number
  visible: boolean
  collapsible: boolean
  collapsed?: boolean
  fields?: any[]
  childSubforms?: any[]
  level: number
}

interface SaveFormArgs {
  formId: string
  body: Record<string, any>
}

interface UpdateSectionArgs {
  sectionId: string
  body: Record<string, any>
}

export const formsApi = createApi({
  reducerPath: "formsApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    credentials: "include",
  }),
  tagTypes: ["Form", "FormDetail", "Records"],
  endpoints: (builder) => ({
    // ─── Queries ───────────────────────────────────────────────

    getFormDetail: builder.query<FormDetailResponse, string>({
      query: (formId) => `/forms/${formId}`,
      providesTags: (result, error, formId) => [{ type: "FormDetail", id: formId }],
      keepUnusedDataFor: 600,
    }),

    getFormFieldsWithSections: builder.query<FormFieldWithMeta[], string>({
      queryFn: async (formId, { extra, getState }, options, baseQuery) => {
        const result = await baseQuery(`/forms/${formId}`)

        if (result.error) {
          return { error: result.error }
        }

        const formData = (result.data as FormDetailResponse).data
        const fieldsWithMeta: FormFieldWithMeta[] = []

        if (formData.sections) {
          formData.sections.forEach((section: FormSection) => {
            if (section.fields) {
              section.fields.forEach((field: FormField) => {
                fieldsWithMeta.push({
                  ...field,
                  sectionId: section.id,
                  sectionTitle: section.title,
                  formId: formId,
                  formName: formData.name,
                })
              })
            }
          })
        }

        return { data: fieldsWithMeta }
      },
      providesTags: (result, error, formId) => [{ type: "FormDetail", id: formId }],
      keepUnusedDataFor: 600,
    }),

    // ─── Mutations ─────────────────────────────────────────────

    createField: builder.mutation<ApiResponse, CreateFieldArgs>({
      query: (fieldData) => ({
        url: "/fields",
        method: "POST",
        body: fieldData,
      }),
      invalidatesTags: (result, error, arg) => {
        // Don't invalidate cache — form builder manages its own optimistic state
        return []
      },
    }),

    updateField: builder.mutation<ApiResponse, UpdateFieldArgs>({
      query: ({ fieldId, body }) => ({
        url: `/fields/${fieldId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: () => [],
    }),

    createSubform: builder.mutation<ApiResponse, CreateSubformArgs>({
      query: (subformData) => ({
        url: "/subforms",
        method: "POST",
        body: subformData,
      }),
      invalidatesTags: () => [],
    }),

    saveForm: builder.mutation<ApiResponse, SaveFormArgs>({
      query: ({ formId, body }) => ({
        url: `/forms/${formId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { formId }) => [
        { type: "FormDetail", id: formId },
      ],
    }),

    updateSection: builder.mutation<ApiResponse, UpdateSectionArgs>({
      query: ({ sectionId, body }) => ({
        url: `/sections/${sectionId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: () => [],
    }),

    // ─── Import/Export ──────────────────────────────────────────

    createImportJob: builder.mutation<ApiResponse, { moduleId: string; formId: string; fileName: string; fileSize: number; duplicateHandling?: string }>({
      query: (body) => ({
        url: "/import/create-job",
        method: "POST",
        body,
      }),
    }),

    addImportMapping: builder.mutation<ApiResponse, { importJobId: string; mappings: { sourceColumn: string; targetFieldId: string }[] }>({
      query: (body) => ({
        url: "/import/add-mapping",
        method: "POST",
        body,
      }),
    }),

    processImport: builder.mutation<ApiResponse, { importJobId: string; rows: Record<string, any>[] }>({
      query: (body) => ({
        url: "/import/process",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Records"],
    }),
  }),
})

export const {
  useGetFormDetailQuery,
  useGetFormFieldsWithSectionsQuery,
  useCreateFieldMutation,
  useUpdateFieldMutation,
  useCreateSubformMutation,
  useSaveFormMutation,
  useUpdateSectionMutation,
  useCreateImportJobMutation,
  useAddImportMappingMutation,
  useProcessImportMutation,
} = formsApi
