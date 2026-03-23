import { baseApi } from "./baseApi"
import { Form, FormField, FormSection, FormFieldWithMeta } from "./types"

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Inject form endpoints ───────────────────────────────────────────────────

export const formsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ─── Queries ───────────────────────────────────────────────

    getFormDetail: builder.query<FormDetailResponse, string>({
      query: (formId) => `/forms/${formId}`,
      providesTags: (result, error, formId) => [{ type: "FormDetail", id: formId }],
      keepUnusedDataFor: 600,
    }),

    getFormFieldsWithSections: builder.query<FormFieldWithMeta[], string>({
      queryFn: async (formId, _queryApi, _options, baseQuery) => {
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
      invalidatesTags: () => [],
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

    // ─── Form submission ──────────────────────────────────────────

    submitForm: builder.mutation<ApiResponse, { formId: string; body: Record<string, any> }>({
      query: ({ formId, body }) => ({
        url: `/forms/${formId}/submit`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { formId }) => [{ type: "Records", id: formId }],
    }),

    trackFormEvent: builder.mutation<ApiResponse, { formId: string; body: Record<string, any> }>({
      query: ({ formId, body }) => ({
        url: `/forms/${formId}/events`,
        method: "POST",
        body,
      }),
    }),

    getPublishedForm: builder.query<ApiResponse, string>({
      query: (formId) => `/forms/${formId}?published=true`,
      providesTags: (result, error, formId) => [{ type: "FormDetail", id: formId }],
    }),

    exportFormRecords: builder.query<any, { formId: string; format: string; fields?: string }>({
      query: ({ formId, format, fields }) => {
        const params = new URLSearchParams({ format })
        if (fields) params.set("fields", fields)
        return `/forms/${formId}/export?${params.toString()}`
      },
    }),

    getFormLookupSources: builder.query<ApiResponse, string>({
      query: (formId) => `/forms/${formId}/lookup-sources`,
    }),

    getFormLinkedRecords: builder.query<ApiResponse, string>({
      query: (formId) => `/forms/${formId}/linked-records`,
    }),

    getFormFields: builder.query<ApiResponse, string>({
      query: (formId) => `/forms/${formId}/fields`,
    }),

    getFormFull: builder.query<ApiResponse, string>({
      query: (formId) => `/forms/${formId}/full`,
      providesTags: (result, error, formId) => [{ type: "FormDetail", id: formId }],
    }),

    getFormTotal: builder.mutation<ApiResponse, { formId: string; body: Record<string, any> }>({
      query: ({ formId, body }) => ({
        url: `/forms/${formId}/total`,
        method: "POST",
        body,
      }),
    }),

    lookupFormData: builder.query<ApiResponse, Record<string, string>>({
      query: (params) => `/forms/lookup?${new URLSearchParams(params).toString()}`,
    }),

    // ─── Attendance ──────────────────────────────────────────────

    getAttendanceStatus: builder.query<ApiResponse, { formId: string; employeeId: string; date: string }>({
      query: ({ formId, employeeId, date }) =>
        `/forms/${formId}/attendance/status?employeeId=${employeeId}&date=${date}&t=${Date.now()}`,
    }),

    submitAttendanceCheckin: builder.mutation<ApiResponse, { formId: string; body: Record<string, any> }>({
      query: ({ formId, body }) => ({
        url: `/forms/${formId}/attendance/checkin`,
        method: "POST",
        body,
      }),
    }),

    submitAttendanceCheckout: builder.mutation<ApiResponse, { formId: string; body: Record<string, any> }>({
      query: ({ formId, body }) => ({
        url: `/forms/${formId}/attendance/checkout`,
        method: "POST",
        body,
      }),
    }),

    // ─── Builder: Sections ────────────────────────────────────────

    createSection: builder.mutation<ApiResponse, Record<string, any>>({
      query: (body) => ({ url: "/sections", method: "POST", body }),
    }),

    deleteSection: builder.mutation<ApiResponse, string>({
      query: (sectionId) => ({ url: `/sections/${sectionId}`, method: "DELETE" }),
    }),

    // ─── Builder: Fields ──────────────────────────────────────────

    deleteField: builder.mutation<ApiResponse, string>({
      query: (fieldId) => ({ url: `/fields/${fieldId}`, method: "DELETE" }),
    }),

    // ─── Builder: Subforms ────────────────────────────────────────

    updateSubform: builder.mutation<ApiResponse, { subformId: string; body: Record<string, any> }>({
      query: ({ subformId, body }) => ({ url: `/subforms/${subformId}`, method: "PUT", body }),
    }),

    deleteSubform: builder.mutation<ApiResponse, string>({
      query: (subformId) => ({ url: `/subforms/${subformId}`, method: "DELETE" }),
    }),

    // ─── Publish ──────────────────────────────────────────────────

    publishFormDirect: builder.mutation<ApiResponse, { formId: string; body: Record<string, any> }>({
      query: ({ formId, body }) => ({
        url: `/forms/${formId}/publish`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { formId }) => [{ type: "Form", id: formId }, { type: "Module" }, "OrgModules"],
    }),

    // ─── Field/Section permissions ────────────────────────────────

    getFieldPermission: builder.query<ApiResponse, string>({
      query: (fieldId) => `/permissions/field/${fieldId}`,
    }),

    updateFieldPermission: builder.mutation<ApiResponse, { fieldId: string; body: Record<string, any> }>({
      query: ({ fieldId, body }) => ({ url: `/permissions/field/${fieldId}`, method: "PUT", body }),
    }),

    getSectionPermissions: builder.query<ApiResponse, string>({
      query: (sectionId) => `/permissions/sections/${sectionId}`,
    }),

    // Attendance status check (generic /api/attendance)
    checkAttendance: builder.mutation<ApiResponse, Record<string, any>>({
      query: (body) => ({
        url: "/attendance",
        method: "POST",
        body,
      }),
    }),

    // Testing endpoint
    getTestingData: builder.query<ApiResponse, void>({
      query: () => "/testing",
    }),

    // Forms testing endpoint (employee-manager)
    getFormsTestingData: builder.query<ApiResponse, void>({
      query: () => "/forms/testing",
    }),

    // Export with blob response
    exportFormRecordsBlob: builder.query<Blob, { formId: string; format: string }>({
      query: ({ formId, format }) => ({
        url: `/forms/${formId}/export?format=${format}`,
        responseHandler: (response: Response) => response.blob(),
      }),
    }),

    // Section permission (singular route used by resource-permission-dialog)
    getSectionPermissionDetail: builder.query<ApiResponse, string>({
      query: (sectionId) => `/permissions/section/${sectionId}`,
    }),

    updateSectionPermission: builder.mutation<ApiResponse, { sectionId: string; body: Record<string, any> }>({
      query: ({ sectionId, body }) => ({
        url: `/permissions/section/${sectionId}`,
        method: "POST",
        body,
      }),
    }),
  }),
})

export const {
  useGetFormDetailQuery,
  useLazyGetFormDetailQuery,
  useGetFormFieldsWithSectionsQuery,
  useCreateFieldMutation,
  useUpdateFieldMutation,
  useCreateSubformMutation,
  useSaveFormMutation,
  useUpdateSectionMutation,
  useCreateImportJobMutation,
  useAddImportMappingMutation,
  useProcessImportMutation,
  useSubmitFormMutation,
  useTrackFormEventMutation,
  useGetPublishedFormQuery,
  useExportFormRecordsQuery,
  useLazyExportFormRecordsQuery,
  useGetFormLookupSourcesQuery,
  useGetFormLinkedRecordsQuery,
  useGetFormFieldsQuery,
  useLazyGetFormFieldsQuery,
  useGetFormFullQuery,
  useLazyGetFormFullQuery,
  useGetFormTotalMutation,
  useLookupFormDataQuery,
  useLazyLookupFormDataQuery,
  useGetAttendanceStatusQuery,
  useLazyGetAttendanceStatusQuery,
  useSubmitAttendanceCheckinMutation,
  useSubmitAttendanceCheckoutMutation,
  useCreateSectionMutation,
  useDeleteSectionMutation,
  useDeleteFieldMutation,
  useUpdateSubformMutation,
  useDeleteSubformMutation,
  usePublishFormDirectMutation,
  useGetFieldPermissionQuery,
  useLazyGetFieldPermissionQuery,
  useUpdateFieldPermissionMutation,
  useGetSectionPermissionsQuery,
  useLazyGetSectionPermissionsQuery,
  useGetSectionPermissionDetailQuery,
  useLazyGetSectionPermissionDetailQuery,
  useUpdateSectionPermissionMutation,
  useCheckAttendanceMutation,
  useGetTestingDataQuery,
  useLazyGetTestingDataQuery,
  useGetFormsTestingDataQuery,
  useLazyGetFormsTestingDataQuery,
  useExportFormRecordsBlobQuery,
  useLazyExportFormRecordsBlobQuery,
} = formsApi
