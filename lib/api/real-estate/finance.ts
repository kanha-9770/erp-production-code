import { baseApi } from "../baseApi";
import type {
  BankAccount,
  LedgerEntry,
  PaginatedResponse,
  SingleResponse,
  Wallet,
  WithdrawalRequest,
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

export interface LedgerListParams {
  status?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface AdminLedgerListParams extends LedgerListParams {
  userId?: string;
  from?: string;
  to?: string;
}

export interface AdminLedgerEntry extends LedgerEntry {
  beneficiary: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar: string | null;
  } | null;
}

export const financeApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ─── Wallet ────────────────────────────────────────────────────────────
    getMyWallet: builder.query<SingleResponse<Wallet>, void>({
      query: () => "/real-estate/wallet",
      providesTags: [{ type: "MyWallet", id: "ME" }],
    }),

    getMyLedger: builder.query<PaginatedResponse<LedgerEntry>, LedgerListParams | void>({
      query: (params) => `/real-estate/wallet/ledger${toQuery(params ?? {})}`,
      providesTags: [{ type: "MyLedger", id: "ME" }],
    }),

    getAllWallets: builder.query<{ success: boolean; data: Wallet[] }, void>({
      query: () => "/real-estate/wallets",
      providesTags: [{ type: "Wallets", id: "LIST" }],
    }),

    getAdminLedger: builder.query<
      PaginatedResponse<AdminLedgerEntry>,
      AdminLedgerListParams | void
    >({
      query: (params) => `/real-estate/admin/ledger${toQuery(params ?? {})}`,
      providesTags: [{ type: "MyLedger", id: "ALL" }],
    }),

    adjustWallet: builder.mutation<
      { success: boolean; data: { entry: LedgerEntry; wallet: Wallet } },
      {
        userId: string;
        type: "CREDIT" | "DEBIT";
        amount: number;
        reason: string;
        secondApproverId: string;
      }
    >({
      query: (body) => ({
        url: "/real-estate/wallet/adjust",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "Wallets", id: "LIST" },
        { type: "MyWallet", id: "ME" },
        { type: "MyLedger", id: "ME" },
      ],
    }),

    releaseDueCommissions: builder.mutation<{ success: boolean; released: number }, void>({
      query: () => ({
        url: "/real-estate/commissions/release-due",
        method: "POST",
      }),
      invalidatesTags: [
        { type: "Wallets", id: "LIST" },
        { type: "MyWallet", id: "ME" },
        { type: "MyLedger", id: "ME" },
      ],
    }),

    // ─── Bank accounts ─────────────────────────────────────────────────────
    getMyBankAccounts: builder.query<{ success: boolean; data: BankAccount[] }, void>({
      query: () => "/real-estate/bank-accounts",
      providesTags: [{ type: "BankAccounts", id: "LIST" }],
    }),

    createBankAccount: builder.mutation<
      SingleResponse<BankAccount>,
      {
        bankName: string;
        accountHolderName: string;
        accountNumber: string;
        ifscOrSwift: string;
        label?: string;
        branch?: string;
        country?: string;
        isPrimary?: boolean;
      }
    >({
      query: (body) => ({
        url: "/real-estate/bank-accounts",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "BankAccounts", id: "LIST" }],
    }),

    updateBankAccount: builder.mutation<
      SingleResponse<BankAccount>,
      { id: string; body: Partial<BankAccount> & { accountNumber?: string } }
    >({
      query: ({ id, body }) => ({
        url: `/real-estate/bank-accounts/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: [{ type: "BankAccounts", id: "LIST" }],
    }),

    deleteBankAccount: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/real-estate/bank-accounts/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "BankAccounts", id: "LIST" }],
    }),

    revealBankAccount: builder.mutation<
      { success: boolean; accountNumber: string },
      string
    >({
      query: (id) => ({
        url: `/real-estate/bank-accounts/${id}/reveal`,
        method: "POST",
      }),
    }),

    // ─── Withdrawals ───────────────────────────────────────────────────────
    getWithdrawals: builder.query<
      { success: boolean; data: WithdrawalRequest[] },
      { scope?: "mine" | "all"; status?: string } | void
    >({
      query: (params) => `/real-estate/withdrawals${toQuery(params ?? {})}`,
      providesTags: [{ type: "Withdrawals", id: "LIST" }],
    }),

    requestWithdrawal: builder.mutation<
      SingleResponse<WithdrawalRequest>,
      { amount: number; bankAccountId: string; notes?: string }
    >({
      query: (body) => ({
        url: "/real-estate/withdrawals",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "Withdrawals", id: "LIST" },
        { type: "MyWallet", id: "ME" },
        { type: "MyLedger", id: "ME" },
      ],
    }),

    approveWithdrawal: builder.mutation<SingleResponse<WithdrawalRequest>, string>({
      query: (id) => ({
        url: `/real-estate/withdrawals/${id}/approve`,
        method: "POST",
      }),
      invalidatesTags: [{ type: "Withdrawals", id: "LIST" }],
    }),

    rejectWithdrawal: builder.mutation<
      SingleResponse<WithdrawalRequest>,
      { id: string; reason: string }
    >({
      query: ({ id, reason }) => ({
        url: `/real-estate/withdrawals/${id}/reject`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: [
        { type: "Withdrawals", id: "LIST" },
        { type: "MyWallet", id: "ME" },
        { type: "MyLedger", id: "ME" },
      ],
    }),

    markWithdrawalPaid: builder.mutation<
      SingleResponse<WithdrawalRequest>,
      { id: string; reference?: string }
    >({
      query: ({ id, reference }) => ({
        url: `/real-estate/withdrawals/${id}/mark-paid`,
        method: "POST",
        body: { reference },
      }),
      invalidatesTags: [{ type: "Withdrawals", id: "LIST" }],
    }),

    cancelWithdrawal: builder.mutation<SingleResponse<WithdrawalRequest>, string>({
      query: (id) => ({
        url: `/real-estate/withdrawals/${id}/cancel`,
        method: "POST",
      }),
      invalidatesTags: [
        { type: "Withdrawals", id: "LIST" },
        { type: "MyWallet", id: "ME" },
        { type: "MyLedger", id: "ME" },
      ],
    }),
  }),
});

export const {
  useGetMyWalletQuery,
  useGetMyLedgerQuery,
  useGetAllWalletsQuery,
  useGetAdminLedgerQuery,
  useAdjustWalletMutation,
  useReleaseDueCommissionsMutation,
  useGetMyBankAccountsQuery,
  useCreateBankAccountMutation,
  useUpdateBankAccountMutation,
  useDeleteBankAccountMutation,
  useRevealBankAccountMutation,
  useGetWithdrawalsQuery,
  useRequestWithdrawalMutation,
  useApproveWithdrawalMutation,
  useRejectWithdrawalMutation,
  useMarkWithdrawalPaidMutation,
  useCancelWithdrawalMutation,
} = financeApi;
