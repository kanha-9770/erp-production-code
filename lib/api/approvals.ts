/**
 * RTK Query endpoints for the module-aware Approval Process feature
 * (inventory, purchase, …). Config CRUD is per-module; the inbox is cross-module.
 * Backed by the unified /api/approvals/* routes.
 */

import { baseApi } from "@/lib/api/baseApi";
import type { ApprovalStage, Criteria, ProcessScope, SettlementAction } from "@/lib/approvals/types";

export type ApprovalModule = "inventory" | "purchase";

export interface ApprovalProcessListItem {
  id: string;
  name: string;
  description: string | null;
  module: string;
  submodule: string | null;
  trigger: "CREATE" | "EDIT" | "BOTH";
  isActive: boolean;
  sortOrder: number;
  scope: ProcessScope;
  ruleCount: number;
  stageCount: number;
  requestCount: number;
  updatedAt: string;
}

export interface ApprovalProcessDetail {
  id: string;
  name: string;
  description: string | null;
  module: string;
  submodule: string | null;
  trigger: "CREATE" | "EDIT" | "BOTH";
  isActive: boolean;
  sortOrder: number;
  criteria: Criteria;
  scope: ProcessScope;
  stages: ApprovalStage[];
  onApprove: SettlementAction | null;
  onReject: SettlementAction | null;
  adminUserIds: string[];
}

export interface ApprovalProcessInput {
  module: ApprovalModule;
  name: string;
  description?: string | null;
  submodule?: string | null;
  trigger?: "CREATE" | "EDIT" | "BOTH";
  isActive?: boolean;
  sortOrder?: number;
  criteria?: Criteria;
  scope?: ProcessScope;
  stages?: ApprovalStage[];
  onApprove?: SettlementAction | null;
  onReject?: SettlementAction | null;
  adminUserIds?: string[];
}

export interface ApprovalRequestSummary {
  id: string;
  module: string;
  recordId: string;
  submodule: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED";
  trigger: string;
  currentStage: number;
  totalStages: number;
  stageName: string | null;
  processId: string | null;
  processName: string;
  requestedById: string;
  requestedByName: string;
  createdAt: string;
  decidedAt: string | null;
  record: { id: string; primary: string; secondary: string | null; submodule: string } | null;
}

export interface ApprovalRequestDetail {
  request: {
    id: string;
    module: string;
    recordId: string;
    submodule: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED";
    trigger: string;
    currentStage: number;
    totalStages: number;
    processId: string | null;
    processName: string;
    requestedById: string;
    requestedByName: string;
    createdAt: string;
    decidedAt: string | null;
  };
  stages: Array<{
    index: number;
    name: string;
    mode: "ALL" | "ANY";
    approvers: Array<{ kind: "user" | "role"; id: string; name: string }>;
  }>;
  actions: Array<{
    id: string;
    type: string;
    stage: number;
    actorId: string;
    actorName: string;
    comment: string | null;
    createdAt: string;
  }>;
  record: { id: string; submodule: string; data: Record<string, unknown> } | null;
  pendingPatch: Record<string, unknown> | null;
  capabilities: { canAct: boolean; canRecall: boolean; canResubmit: boolean };
}

interface Ok<T> {
  success: boolean;
  data: T;
}

export const approvalsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ── Process config (per module) ──
    getApprovalProcesses: builder.query<ApprovalProcessListItem[], ApprovalModule>({
      query: (module) => `/approvals/processes?module=${module}`,
      transformResponse: (r: Ok<ApprovalProcessListItem[]>) => r.data,
      providesTags: (_res, _err, module) => [{ type: "ApprovalProcesses", id: module }],
    }),
    getApprovalProcess: builder.query<ApprovalProcessDetail, { module: ApprovalModule; id: string }>({
      query: ({ module, id }) => `/approvals/processes/${id}?module=${module}`,
      transformResponse: (r: Ok<ApprovalProcessDetail>) => r.data,
      providesTags: (_res, _err, { id }) => [{ type: "ApprovalProcess", id }],
    }),
    createApprovalProcess: builder.mutation<ApprovalProcessDetail, ApprovalProcessInput>({
      query: (body) => ({ url: "/approvals/processes", method: "POST", body }),
      transformResponse: (r: Ok<ApprovalProcessDetail>) => r.data,
      invalidatesTags: (_res, _err, body) => [{ type: "ApprovalProcesses", id: body.module }],
    }),
    updateApprovalProcess: builder.mutation<ApprovalProcessDetail, { id: string; body: ApprovalProcessInput }>({
      query: ({ id, body }) => ({ url: `/approvals/processes/${id}`, method: "PUT", body }),
      transformResponse: (r: Ok<ApprovalProcessDetail>) => r.data,
      invalidatesTags: (_res, _err, { id, body }) => [
        { type: "ApprovalProcesses", id: body.module },
        { type: "ApprovalProcess", id },
      ],
    }),
    setApprovalProcessActive: builder.mutation<unknown, { module: ApprovalModule; id: string; isActive: boolean }>({
      query: ({ module, id, isActive }) => ({ url: `/approvals/processes/${id}`, method: "PATCH", body: { module, isActive } }),
      invalidatesTags: (_res, _err, { module }) => [{ type: "ApprovalProcesses", id: module }],
    }),
    deleteApprovalProcess: builder.mutation<unknown, { module: ApprovalModule; id: string }>({
      query: ({ module, id }) => ({ url: `/approvals/processes/${id}?module=${module}`, method: "DELETE" }),
      invalidatesTags: (_res, _err, { module }) => [{ type: "ApprovalProcesses", id: module }],
    }),

    // ── Inbox / history ──
    getApprovalInbox: builder.query<ApprovalRequestSummary[], void>({
      query: () => "/approvals/inbox",
      transformResponse: (r: Ok<ApprovalRequestSummary[]>) => r.data,
      providesTags: ["ApprovalInbox"],
    }),
    getApprovalRequests: builder.query<
      { rows: ApprovalRequestSummary[]; total: number; page: number; pageSize: number },
      { module?: string; scope?: string; status?: string; submodule?: string; page?: number; pageSize?: number } | void
    >({
      query: (params) => {
        const sp = new URLSearchParams();
        if (params?.module) sp.set("module", params.module);
        if (params?.scope) sp.set("scope", params.scope);
        if (params?.status) sp.set("status", params.status);
        if (params?.submodule) sp.set("submodule", params.submodule);
        if (params?.page != null) sp.set("page", String(params.page));
        if (params?.pageSize != null) sp.set("pageSize", String(params.pageSize));
        return `/approvals/requests?${sp.toString()}`;
      },
      transformResponse: (r: Ok<{ rows: ApprovalRequestSummary[]; total: number; page: number; pageSize: number }>) => r.data,
      providesTags: ["ApprovalRequests"],
    }),
    getApprovalRequest: builder.query<ApprovalRequestDetail, string>({
      query: (id) => `/approvals/requests/${id}`,
      transformResponse: (r: Ok<ApprovalRequestDetail>) => r.data,
      providesTags: (_res, _err, id) => [{ type: "ApprovalRequest", id }],
    }),
    getRecordApprovalHistory: builder.query<ApprovalRequestSummary[], { module: string; recordId: string }>({
      query: ({ module, recordId }) => `/approvals/records/${module}/${recordId}/history`,
      transformResponse: (r: Ok<ApprovalRequestSummary[]>) => r.data,
      providesTags: ["ApprovalRequests"],
    }),

    // ── Actions ──
    decideApprovalRequest: builder.mutation<unknown, { id: string; decision: "APPROVE" | "REJECT"; comment?: string }>({
      query: ({ id, decision, comment }) => ({
        url: `/approvals/requests/${id}/decision`,
        method: "POST",
        body: { decision, comment },
      }),
      invalidatesTags: (_res, _err, { id }) => ["ApprovalInbox", "ApprovalRequests", { type: "ApprovalRequest", id }],
    }),
    recallApprovalRequest: builder.mutation<unknown, { id: string; comment?: string }>({
      query: ({ id, comment }) => ({ url: `/approvals/requests/${id}/recall`, method: "POST", body: { comment } }),
      invalidatesTags: (_res, _err, { id }) => ["ApprovalInbox", "ApprovalRequests", { type: "ApprovalRequest", id }],
    }),
    resubmitApproval: builder.mutation<{ data: { resubmitted: boolean } }, { module: string; recordId: string }>({
      query: ({ module, recordId }) => ({ url: `/approvals/records/${module}/${recordId}/resubmit`, method: "POST" }),
      invalidatesTags: ["ApprovalInbox", "ApprovalRequests"],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetApprovalProcessesQuery,
  useGetApprovalProcessQuery,
  useCreateApprovalProcessMutation,
  useUpdateApprovalProcessMutation,
  useSetApprovalProcessActiveMutation,
  useDeleteApprovalProcessMutation,
  useGetApprovalInboxQuery,
  useGetApprovalRequestsQuery,
  useGetApprovalRequestQuery,
  useGetRecordApprovalHistoryQuery,
  useDecideApprovalRequestMutation,
  useRecallApprovalRequestMutation,
  useResubmitApprovalMutation,
} = approvalsApi;
