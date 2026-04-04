import { baseApi } from "./baseApi"
import { FormRecord } from "./types"

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecordsResponse {
  success: boolean
  total: number
  page: number
  limit: number
  totalPages: number
  form: { id: string; name: string }
  formFieldsWithSections: any[]
  records: FormRecord[]
  error?: string
}

interface UpdateRecordRequest {
  recordData: Record<string, any>
  submittedBy: string
  status: "pending" | "approved" | "rejected" | "submitted"
}

interface UpdateRecordResponse {
  success: boolean
  data?: FormRecord
  error?: string
}

interface BatchUpdateRecordsRequest {
  updates: Array<{
    recordId: string
    recordData: Record<string, any>
  }>
}

interface BatchUpdateRecordsResponse {
  success: boolean
  data: FormRecord[]
  error?: string
}

interface DeleteRecordResponse {
  success: boolean
  error?: string
}

// ─── Inject record endpoints ─────────────────────────────────────────────────

export const recordsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getFormRecords: builder.query<RecordsResponse, string>({
      query: (formId) => `/forms/${formId}/records`,
      providesTags: (result, error, formId) => [
        { type: "Records", id: formId },
      ],
      keepUnusedDataFor: 30,
    }),

    getModuleRecords: builder.query<
      { records: FormRecord[]; formFieldsMap: Record<string, any[]> },
      string[]
    >({
      queryFn: async (formIds, _queryApi, _options, baseQuery) => {
        try {
          const allRecords: FormRecord[] = []
          const formFieldsMap: Record<string, any[]> = {}
          for (const formId of formIds) {
            const result = await baseQuery(`/forms/${formId}/records?limit=200`)
            if (result.error) {
              return { error: result.error }
            }
            const data = result.data as RecordsResponse
            const records = data.records || []
            allRecords.push(...records.map((record) => ({ ...record, formId, formName: data.form?.name })))
            if (data.formFieldsWithSections) {
              formFieldsMap[formId] = data.formFieldsWithSections
            }
          }
          return { data: { records: allRecords, formFieldsMap } }
        } catch (error) {
          return { error: { status: "CUSTOM_ERROR", error: String(error) } as any }
        }
      },
      providesTags: (result) =>
        result?.records
          ? [
              ...result.records.map((record) => ({
                type: "Record" as const,
                id: record.id,
              })),
              "Records",
            ]
          : ["Records"],
      keepUnusedDataFor: 30,
    }),

    updateRecord: builder.mutation<
      UpdateRecordResponse,
      { formId: string; recordId: string; body: UpdateRecordRequest }
    >({
      query: ({ formId, recordId, body }) => ({
        url: `/forms/${formId}/records/${recordId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { formId, recordId }) => [
        { type: "Record", id: recordId },
        { type: "Records", id: formId },
      ],
    }),

    batchUpdateRecords: builder.mutation<
      BatchUpdateRecordsResponse,
      { formId: string; body: BatchUpdateRecordsRequest }
    >({
      query: ({ formId, body }) => ({
        url: `/forms/${formId}/records/batch-update`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { formId }) => [
        { type: "Records", id: formId },
        "Records",
      ],
    }),

    deleteRecord: builder.mutation<
      DeleteRecordResponse,
      { formId: string; recordId: string }
    >({
      query: ({ formId, recordId }) => ({
        url: `/forms/${formId}/records/${recordId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { formId, recordId }) => [
        { type: "Record", id: recordId },
        { type: "Records", id: formId },
        "Records",
      ],
    }),

    // Update dynamic record (module-records-table)
    updateDynamicRecord: builder.mutation<any, { recordId: string; body: Record<string, any> }>({
      query: ({ recordId, body }) => ({
        url: `/dynamic-records/${recordId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Records"],
    }),

    // Delete dynamic record
    deleteDynamicRecord: builder.mutation<any, string>({
      query: (recordId) => ({
        url: `/dynamic-records/${recordId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Records"],
    }),

    // Get records with pagination/filter params
    getFormRecordsWithParams: builder.query<any, { formId: string; params: Record<string, string> }>({
      query: ({ formId, params }) => `/forms/${formId}/records?${new URLSearchParams(params).toString()}`,
      providesTags: (result, error, { formId }) => [{ type: "Records", id: formId }],
    }),

    // Create a new record
    createRecord: builder.mutation<any, { formId: string; body: Record<string, any> }>({
      query: ({ formId, body }) => ({
        url: `/forms/${formId}/records`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, { formId }) => [{ type: "Records", id: formId }, "Records"],
    }),
  }),
})

export const {
  useGetFormRecordsQuery,
  useLazyGetFormRecordsQuery,
  useGetModuleRecordsQuery,
  useUpdateRecordMutation,
  useBatchUpdateRecordsMutation,
  useDeleteRecordMutation,
  useUpdateDynamicRecordMutation,
  useDeleteDynamicRecordMutation,
  useGetFormRecordsWithParamsQuery,
  useLazyGetFormRecordsWithParamsQuery,
  useCreateRecordMutation,
} = recordsApi
