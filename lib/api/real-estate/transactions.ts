import { baseApi } from "../baseApi";
import type {
  CommissionPreview,
  CommissionRule,
  PaginatedResponse,
  SingleResponse,
  Transaction,
  TransactionDetail,
  TransactionDocument,
} from "./types";

function toQuery(params: Record<string, any>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

export interface TransactionListParams {
  status?: string;
  propertyId?: string;
  agentId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const transactionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getTransactions: builder.query<PaginatedResponse<Transaction>, TransactionListParams | void>({
      query: (params) => `/real-estate/transactions${toQuery(params ?? {})}`,
      providesTags: (result) =>
        result
          ? [
              ...result.data.map((t) => ({ type: "Transaction" as const, id: t.id })),
              { type: "Transactions" as const, id: "LIST" },
            ]
          : [{ type: "Transactions" as const, id: "LIST" }],
    }),

    getTransaction: builder.query<SingleResponse<TransactionDetail>, string>({
      query: (id) => `/real-estate/transactions/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Transaction", id }],
    }),

    createTransaction: builder.mutation<SingleResponse<Transaction>, Partial<Transaction>>({
      query: (body) => ({ url: "/real-estate/transactions", method: "POST", body }),
      invalidatesTags: [
        { type: "Transactions", id: "LIST" },
        { type: "Properties", id: "LIST" },
      ],
    }),

    updateTransaction: builder.mutation<
      SingleResponse<Transaction>,
      { id: string; body: Partial<Transaction> }
    >({
      query: ({ id, body }) => ({
        url: `/real-estate/transactions/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Transaction", id },
        { type: "Transactions", id: "LIST" },
      ],
    }),

    closeTransaction: builder.mutation<SingleResponse<CommissionPreview>, string>({
      query: (id) => ({
        url: `/real-estate/transactions/${id}/close`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "Transaction", id },
        { type: "Transactions", id: "LIST" },
        { type: "Properties", id: "LIST" },
        { type: "MyWallet", id: "ME" },
        { type: "MyLedger", id: "ME" },
        { type: "Wallets", id: "LIST" },
      ],
    }),

    cancelTransaction: builder.mutation<
      { success: boolean; reversed: boolean },
      { id: string; reason: string }
    >({
      query: ({ id, reason }) => ({
        url: `/real-estate/transactions/${id}/cancel`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Transaction", id },
        { type: "Transactions", id: "LIST" },
        { type: "Properties", id: "LIST" },
        { type: "MyWallet", id: "ME" },
        { type: "MyLedger", id: "ME" },
        { type: "Wallets", id: "LIST" },
      ],
    }),

    previewCommission: builder.mutation<SingleResponse<CommissionPreview>, string>({
      query: (id) => ({
        url: `/real-estate/transactions/${id}/preview-commission`,
        method: "POST",
      }),
    }),

    addTransactionDocument: builder.mutation<
      SingleResponse<TransactionDocument>,
      { id: string; type: string; name: string; url: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/real-estate/transactions/${id}/documents`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Transaction", id }],
    }),

    removeTransactionDocument: builder.mutation<
      { success: boolean },
      { id: string; documentId: string }
    >({
      query: ({ id, documentId }) => ({
        url: `/real-estate/transactions/${id}/documents?documentId=${documentId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Transaction", id }],
    }),

    // ─── Commission rules ──────────────────────────────────────────────────
    getCommissionRules: builder.query<{ success: boolean; data: CommissionRule[] }, { includeInactive?: boolean } | void>({
      query: (params) =>
        `/real-estate/commission-rules${toQuery(params ?? {})}`,
      providesTags: [{ type: "CommissionRules", id: "LIST" }],
    }),

    createCommissionRule: builder.mutation<
      SingleResponse<CommissionRule>,
      Partial<CommissionRule>
    >({
      query: (body) => ({
        url: "/real-estate/commission-rules",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "CommissionRules", id: "LIST" }],
    }),

    updateCommissionRule: builder.mutation<
      SingleResponse<CommissionRule>,
      { id: string; body: Partial<CommissionRule> }
    >({
      query: ({ id, body }) => ({
        url: `/real-estate/commission-rules/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: [{ type: "CommissionRules", id: "LIST" }],
    }),

    deleteCommissionRule: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/real-estate/commission-rules/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "CommissionRules", id: "LIST" }],
    }),
  }),
});

export const {
  useGetTransactionsQuery,
  useGetTransactionQuery,
  useCreateTransactionMutation,
  useUpdateTransactionMutation,
  useCloseTransactionMutation,
  useCancelTransactionMutation,
  usePreviewCommissionMutation,
  useAddTransactionDocumentMutation,
  useRemoveTransactionDocumentMutation,
  useGetCommissionRulesQuery,
  useCreateCommissionRuleMutation,
  useUpdateCommissionRuleMutation,
  useDeleteCommissionRuleMutation,
} = transactionsApi;
