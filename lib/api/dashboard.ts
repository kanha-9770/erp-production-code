import { baseApi } from "./baseApi";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  success: boolean;
  user: {
    name: string;
    email: string;
    department: string;
    designation: string;
    status: string;
    dateOfJoining: string;
    roles: Array<{ roleName: string; unitName: string }>;
  };
  stats: {
    mySubmissions: number;
    myAttendance: number;
    myActivityCount: number;
    myLoginCount: number;
  };
}

export interface DashboardModule {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  moduleType: string;
  forms: Array<{
    id: string;
    name: string;
    isPublished: boolean;
    totalRecords: number;
    sectionCount: number;
  }>;
  totalRecords: number;
}

export interface DashboardModulesResponse {
  success: boolean;
  modules: DashboardModule[];
}

export interface DashboardTimeSeriesResponse {
  success: boolean;
  timeSeries: Array<{ date: string; submissions: number }>;
  totalSubmissions: number;
}

export interface DashboardActivityResponse {
  success: boolean;
  activity: Array<{
    id: string;
    action: string;
    module: string | null;
    recordName: string | null;
    timestamp: string;
  }>;
}

// ─── Endpoints ──────────────────────────────────────────────────────────────
// Summary is the only thing fetched on the user landing page's first paint.
// Modules, time-series, and recent-activity are skipped (`skip: true` in the
// component) and only triggered when the user opens the relevant panel —
// keeps the initial render fast and avoids paying for data the user may
// never look at.

export const dashboardApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDashboardSummary: builder.query<DashboardSummary, { dateRange?: string } | void>({
      query: (args) => {
        const dateRange = (args && (args as any).dateRange) || "30days";
        return `/dashboard/summary?dateRange=${encodeURIComponent(dateRange)}`;
      },
      keepUnusedDataFor: 60,
    }),

    getDashboardModules: builder.query<DashboardModulesResponse, void>({
      query: () => "/dashboard/modules",
      keepUnusedDataFor: 300,
    }),

    getDashboardTimeSeries: builder.query<DashboardTimeSeriesResponse, { dateRange?: string } | void>({
      query: (args) => {
        const dateRange = (args && (args as any).dateRange) || "30days";
        return `/dashboard/time-series?dateRange=${encodeURIComponent(dateRange)}`;
      },
      keepUnusedDataFor: 300,
    }),

    getDashboardRecentActivity: builder.query<DashboardActivityResponse, { limit?: number; dateRange?: string } | void>({
      query: (args) => {
        const a = (args || {}) as { limit?: number; dateRange?: string };
        const limit = a.limit ?? 10;
        const dateRange = a.dateRange ?? "30days";
        return `/dashboard/recent-activity?limit=${limit}&dateRange=${encodeURIComponent(dateRange)}`;
      },
      keepUnusedDataFor: 120,
    }),
  }),
});

export const {
  useGetDashboardSummaryQuery,
  useGetDashboardModulesQuery,
  useGetDashboardTimeSeriesQuery,
  useGetDashboardRecentActivityQuery,
} = dashboardApi;
