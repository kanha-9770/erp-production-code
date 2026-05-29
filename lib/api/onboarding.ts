/**
 * Onboarding RTK Query slice.
 *
 * Exposes the template + checklist + task surface. Checklists are usually
 * created by the AppointmentLetter SIGNED trigger (server-side); the
 * `createOnboardingChecklist` mutation is for the manual-start case from
 * the HR dashboard.
 */

import { baseApi } from "./baseApi";

export type OnboardingTaskCategory =
  | "DOCS" | "IT" | "INDUCTION" | "POLICY" | "FINANCE" | "OTHER";
export type OnboardingTaskStatus =
  | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
export type OnboardingChecklistStatus =
  | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface OnboardingTemplateItem {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  defaultTasks: Array<{
    title: string;
    description?: string;
    category?: OnboardingTaskCategory;
    offsetDays?: number;
  }>;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingTaskItem {
  id: string;
  checklistId: string;
  title: string;
  description: string | null;
  category: OnboardingTaskCategory;
  sortOrder: number;
  assigneeUserId: string | null;
  dueDate: string | null;
  status: OnboardingTaskStatus;
  completedAt: string | null;
  completedById: string | null;
  completionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingChecklistItem {
  id: string;
  organizationId: string;
  employeeId: string;
  appointmentLetterId: string | null;
  templateId: string | null;
  template?: { id: string; name: string } | null;
  status: OnboardingChecklistStatus;
  startDate: string | null;
  completedAt: string | null;
  completionPercent: number;
  notes: string | null;
  tasks: OnboardingTaskItem[];
  employee?: {
    id: string;
    employeeName: string;
    department: string | null;
    designation: string | null;
    emailAddress1: string | null;
    dateOfJoining?: string | null;
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

export const onboardingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Templates
    getOnboardingTemplates: builder.query<ListResponse<OnboardingTemplateItem>, void>({
      query: () => "/onboarding/templates",
      providesTags: (res) =>
        res
          ? [
              ...res.items.map((t) => ({ type: "OnboardingTemplate" as const, id: t.id })),
              { type: "OnboardingTemplates" as const, id: "LIST" },
            ]
          : [{ type: "OnboardingTemplates" as const, id: "LIST" }],
    }),
    getOnboardingTemplate: builder.query<SingleResponse<OnboardingTemplateItem>, string>({
      query: (id) => `/onboarding/templates/${id}`,
      providesTags: (_r, _e, id) => [{ type: "OnboardingTemplate", id }],
    }),
    createOnboardingTemplate: builder.mutation<SingleResponse<OnboardingTemplateItem>, Record<string, any>>({
      query: (body) => ({ url: "/onboarding/templates", method: "POST", body }),
      invalidatesTags: [{ type: "OnboardingTemplates", id: "LIST" }],
    }),
    updateOnboardingTemplate: builder.mutation<
      SingleResponse<OnboardingTemplateItem>,
      { id: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/onboarding/templates/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "OnboardingTemplate", id },
        { type: "OnboardingTemplates", id: "LIST" },
      ],
    }),
    deleteOnboardingTemplate: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `/onboarding/templates/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "OnboardingTemplate", id },
        { type: "OnboardingTemplates", id: "LIST" },
      ],
    }),

    // Checklists
    getOnboardingChecklists: builder.query<
      ListResponse<OnboardingChecklistItem>,
      { status?: OnboardingChecklistStatus; employeeId?: string } | void
    >({
      query: (args) => {
        const a = (args ?? {}) as { status?: string; employeeId?: string };
        const qs = new URLSearchParams();
        if (a.status) qs.set("status", a.status);
        if (a.employeeId) qs.set("employeeId", a.employeeId);
        const q = qs.toString();
        return q ? `/onboarding/checklists?${q}` : "/onboarding/checklists";
      },
      providesTags: (res) =>
        res
          ? [
              ...res.items.map((c) => ({ type: "OnboardingChecklist" as const, id: c.id })),
              { type: "OnboardingChecklists" as const, id: "LIST" },
            ]
          : [{ type: "OnboardingChecklists" as const, id: "LIST" }],
    }),

    getOnboardingChecklist: builder.query<SingleResponse<OnboardingChecklistItem>, string>({
      query: (id) => `/onboarding/checklists/${id}`,
      providesTags: (_r, _e, id) => [{ type: "OnboardingChecklist", id }],
    }),

    createOnboardingChecklist: builder.mutation<
      { success: boolean; item: OnboardingChecklistItem; alreadyExisted: boolean },
      { employeeId: string; appointmentLetterId?: string | null; startDate?: string | null }
    >({
      query: (body) => ({ url: "/onboarding/checklists", method: "POST", body }),
      invalidatesTags: [{ type: "OnboardingChecklists", id: "LIST" }],
    }),

    updateOnboardingChecklist: builder.mutation<
      SingleResponse<OnboardingChecklistItem>,
      { id: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/onboarding/checklists/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "OnboardingChecklist", id },
        { type: "OnboardingChecklists", id: "LIST" },
      ],
    }),

    deleteOnboardingChecklist: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `/onboarding/checklists/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "OnboardingChecklist", id },
        { type: "OnboardingChecklists", id: "LIST" },
      ],
    }),

    // Tasks (PUT only — list/get are via parent checklist)
    updateOnboardingTask: builder.mutation<
      {
        success: boolean;
        item: OnboardingTaskItem;
        progress: { percent: number; status: string; justCompleted: boolean };
      },
      { id: string; checklistId: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/onboarding/tasks/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { checklistId }) => [
        { type: "OnboardingChecklist", id: checklistId },
        { type: "OnboardingChecklists", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetOnboardingTemplatesQuery,
  useGetOnboardingTemplateQuery,
  useCreateOnboardingTemplateMutation,
  useUpdateOnboardingTemplateMutation,
  useDeleteOnboardingTemplateMutation,
  useGetOnboardingChecklistsQuery,
  useGetOnboardingChecklistQuery,
  useCreateOnboardingChecklistMutation,
  useUpdateOnboardingChecklistMutation,
  useDeleteOnboardingChecklistMutation,
  useUpdateOnboardingTaskMutation,
} = onboardingApi;
