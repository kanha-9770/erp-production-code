import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { FormRecord } from "./types";

interface RecordsResponse {
  success: boolean;
  records: FormRecord[];
  error?: string;
}

interface UpdateRecordRequest {
  recordData: Record<string, any>;
  submittedBy: string;
  status: "pending" | "approved" | "rejected" | "submitted";
}

interface UpdateRecordResponse {
  success: boolean;
  data?: FormRecord;
  error?: string;
}

interface BatchUpdateRecordsRequest {
  updates: Array<{
    recordId: string;
    recordData: Record<string, any>;
  }>;
}

interface BatchUpdateRecordsResponse {
  success: boolean;
  data: FormRecord[];
  error?: string;
}

interface DeleteRecordResponse {
  success: boolean;
  error?: string;
}

export const recordsApi = createApi({
  reducerPath: "recordsApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api/forms",
    credentials: "include",
  }),
  tagTypes: ["Records", "Record"],
  endpoints: (builder) => ({
    getFormRecords: builder.query<RecordsResponse, string>({
      query: (formId) => `/${formId}/records`,
      providesTags: (result, error, formId) => [
        { type: "Records", id: formId },
      ],
      keepUnusedDataFor: 30,
    }),

    getModuleRecords: builder.query<FormRecord[], string[]>({
      queryFn: async (formIds, { extra, getState }, options, baseQuery) => {
        try {
          const allRecords: FormRecord[] = [];
          for (const formId of formIds) {
            const result = await baseQuery(`/${formId}/records`);
            if (result.error) {
              return { error: result.error };
            }
            const data = (result.data as RecordsResponse).records || [];
            allRecords.push(...data.map((record) => ({ ...record, formId })));
          }
          return { data: allRecords };
        } catch (error) {
          return { error };
        }
      },
      providesTags: (result) =>
        result
          ? [
            ...result.map((record) => ({
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
        url: `/${formId}/records/${recordId}`,
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
        url: `/${formId}/records/batch-update`,
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
        url: `/${formId}/records/${recordId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { formId, recordId }) => [
        { type: "Record", id: recordId },
        { type: "Records", id: formId },
        "Records",
      ],
    }),
  }),
});

export const {
  useGetFormRecordsQuery,
  useGetModuleRecordsQuery,
  useUpdateRecordMutation,
  useBatchUpdateRecordsMutation,
  useDeleteRecordMutation,
} = recordsApi;
