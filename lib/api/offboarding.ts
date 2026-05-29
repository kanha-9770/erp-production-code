/**
 * Offboarding RTK Query slice — exit checklists + tasks.
 *
 * Checklists are usually created by the resignation-date trigger;
 * createExitChecklist is for the manual-start case.
 */

import { baseApi } from "./baseApi";

export type ExitTaskCategory =
  | "ASSETS" | "HANDOVER" | "ACCESS" | "FINANCE" | "INTERVIEW" | "OTHER";
export type ExitTaskStatus =
  | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
export type ExitChecklistStatus =
  | "INITIATED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface ExitTaskItem {
  id: string;
  checklistId: string;
  title: string;
  description: string | null;
  category: ExitTaskCategory;
  sortOrder: number;
  assigneeUserId: string | null;
  dueDate: string | null;
  status: ExitTaskStatus;
  completedAt: string | null;
  completedById: string | null;
  completionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExitChecklistItem {
  id: string;
  organizationId: string;
  employeeId: string;
  initiatedAt: string;
  lastWorkingDate: string | null;
  status: ExitChecklistStatus;
  completedAt: string | null;
  finalSettlementStatus: string | null;
  reason: string | null;
  exitInterview: any | null;
  completionPercent: number;
  tasks: ExitTaskItem[];
  employee?: {
    id: string;
    employeeName: string;
    department: string | null;
    designation: string | null;
    emailAddress1: string | null;
    dateOfJoining?: string | null;
    resignationLetterDate?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse<T> {
  success: boolean;
  items: T[];
}
interface SingleResponse<T> {
  success: boolean;
  item: T;
}

export const offboardingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getExitChecklists: builder.query<
      ListResponse<ExitChecklistItem>,
      { status?: ExitChecklistStatus; employeeId?: string } | void
    >({
      query: (args) => {
        const a = (args ?? {}) as { status?: string; employeeId?: string };
        const qs = new URLSearchParams();
        if (a.status) qs.set("status", a.status);
        if (a.employeeId) qs.set("employeeId", a.employeeId);
        const q = qs.toString();
        return q ? `/offboarding/checklists?${q}` : "/offboarding/checklists";
      },
      providesTags: (res) =>
        res
          ? [
              ...res.items.map((c) => ({ type: "ExitChecklist" as const, id: c.id })),
              { type: "ExitChecklists" as const, id: "LIST" },
            ]
          : [{ type: "ExitChecklists" as const, id: "LIST" }],
    }),

    getExitChecklist: builder.query<SingleResponse<ExitChecklistItem>, string>({
      query: (id) => `/offboarding/checklists/${id}`,
      providesTags: (_r, _e, id) => [{ type: "ExitChecklist", id }],
    }),

    createExitChecklist: builder.mutation<
      { success: boolean; item: ExitChecklistItem; alreadyExisted: boolean },
      { employeeId: string; lastWorkingDate?: string | null; reason?: string | null }
    >({
      query: (body) => ({ url: "/offboarding/checklists", method: "POST", body }),
      invalidatesTags: [{ type: "ExitChecklists", id: "LIST" }],
    }),

    updateExitChecklist: builder.mutation<
      SingleResponse<ExitChecklistItem>,
      { id: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/offboarding/checklists/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "ExitChecklist", id },
        { type: "ExitChecklists", id: "LIST" },
      ],
    }),

    deleteExitChecklist: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `/offboarding/checklists/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "ExitChecklist", id },
        { type: "ExitChecklists", id: "LIST" },
      ],
    }),

    updateExitTask: builder.mutation<
      {
        success: boolean;
        item: ExitTaskItem;
        progress: { percent: number; status: string; justCompleted: boolean };
      },
      { id: string; checklistId: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/offboarding/tasks/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { checklistId }) => [
        { type: "ExitChecklist", id: checklistId },
        { type: "ExitChecklists", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetExitChecklistsQuery,
  useGetExitChecklistQuery,
  useCreateExitChecklistMutation,
  useUpdateExitChecklistMutation,
  useDeleteExitChecklistMutation,
  useUpdateExitTaskMutation,
} = offboardingApi;
