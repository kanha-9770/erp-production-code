import { baseApi } from "../baseApi";
import type {
  CommissionRegisterReport,
  ComplianceStatusReport,
  LeaderboardReport,
  LeadConversionReport,
  PayoutRegisterReport,
  PropertyAgingReport,
  SalesRegisterReport,
  TaxStatementReport,
} from "./types";

export interface DateRangeParams {
  from?: string;
  to?: string;
}

function toQuery(params: Record<string, any>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

interface Wrapped<T> {
  success: boolean;
}

export const reportsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSalesRegister: builder.query<
      Wrapped<SalesRegisterReport> & SalesRegisterReport,
      DateRangeParams | void
    >({
      query: (params) =>
        `/real-estate/reports/sales-register${toQuery(params ?? {})}`,
      providesTags: [{ type: "ReportSales", id: "ROOT" }],
    }),

    getCommissionRegister: builder.query<
      Wrapped<CommissionRegisterReport> & CommissionRegisterReport,
      (DateRangeParams & { agentId?: string; status?: string }) | void
    >({
      query: (params) =>
        `/real-estate/reports/commission-register${toQuery(params ?? {})}`,
      providesTags: [{ type: "ReportCommission", id: "ROOT" }],
    }),

    getPayoutRegister: builder.query<
      Wrapped<PayoutRegisterReport> & PayoutRegisterReport,
      (DateRangeParams & { status?: string }) | void
    >({
      query: (params) =>
        `/real-estate/reports/payout-register${toQuery(params ?? {})}`,
      providesTags: [{ type: "ReportPayout", id: "ROOT" }],
    }),

    getLeadConversion: builder.query<
      Wrapped<LeadConversionReport> & LeadConversionReport,
      DateRangeParams | void
    >({
      query: (params) =>
        `/real-estate/reports/lead-conversion${toQuery(params ?? {})}`,
      providesTags: [{ type: "ReportLeadConv", id: "ROOT" }],
    }),

    getLeaderboard: builder.query<
      Wrapped<LeaderboardReport> & LeaderboardReport,
      (DateRangeParams & { topN?: number }) | void
    >({
      query: (params) =>
        `/real-estate/reports/leaderboard${toQuery(params ?? {})}`,
      providesTags: [{ type: "ReportLeaderboard", id: "ROOT" }],
    }),

    getPropertyAging: builder.query<
      Wrapped<PropertyAgingReport> & PropertyAgingReport,
      void
    >({
      query: () => "/real-estate/reports/property-aging",
      providesTags: [{ type: "ReportPropertyAging", id: "ROOT" }],
    }),

    getComplianceStatusReport: builder.query<
      Wrapped<ComplianceStatusReport> & ComplianceStatusReport,
      void
    >({
      query: () => "/real-estate/reports/compliance-status",
      providesTags: [{ type: "ReportComplianceStatus", id: "ROOT" }],
    }),

    getTaxStatement: builder.query<
      Wrapped<TaxStatementReport> & TaxStatementReport,
      { userId?: string; fy?: number } | void
    >({
      query: (params) =>
        `/real-estate/reports/tax-statement${toQuery(params ?? {})}`,
      providesTags: (_r, _e, params) => [
        { type: "ReportTax", id: `${params?.userId ?? "ME"}-${params?.fy ?? "CY"}` },
      ],
    }),
  }),
});

export const {
  useGetSalesRegisterQuery,
  useGetCommissionRegisterQuery,
  useGetPayoutRegisterQuery,
  useGetLeadConversionQuery,
  useGetLeaderboardQuery,
  useGetPropertyAgingQuery,
  useGetComplianceStatusReportQuery,
  useGetTaxStatementQuery,
} = reportsApi;
