import { baseApi } from "./baseApi"

interface ApiResponse<T = any> {
  success: boolean
  data: T
  error?: string
}

export interface WorkflowRuleData {
  id: string
  name: string
  description: string | null
  moduleName: string
  executeBasedOn: string
  recordAction: string | null
  dateField: string | null
  conditionType: string
  conditions: Array<{
    field: string
    operator: string
    value: string
  }> | null
  instantActions: WorkflowInstantAction[] | null
  scheduledExecute: string | null
  scheduledUnit: string | null
  // Schedule trigger fields (executeBasedOn === "schedule")
  scheduleCadence: string | null
  scheduleCron: string | null
  scheduleHour: number | null
  scheduleMinute: number | null
  scheduleDayOfWeek: number | null
  scheduleDayOfMonth: number | null
  scheduleTimezone: string | null
  scheduleEnabled: boolean
  active: boolean
  createdAt: string
  updatedAt: string
  createdBy?: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string
  }
}

export interface WorkflowInstantAction {
  type: string
  functionId?: string
  functionName?: string
  // For type === "Field Update"
  targetFieldId?: string
  targetValue?: string
  // For type === "Email Notification"
  emailName?: string
  emailToField?: string
  emailToStatic?: string
  emailToRoleIds?: string[]
  emailSubject?: string
  emailBody?: string
  emailFrom?: string
  emailReplyTo?: string
  emailSmtpUser?: string
  emailSmtpPass?: string
  emailFieldIds?: string[]
  // For type === "System Notification"
  notifyName?: string
  notifyRoleIds?: string[]
  notifyFormId?: string
  notifyFieldIds?: string[]
  notifyTitle?: string
  notifyMessage?: string
  // For type === "Report Export"
  reportName?: string
  reportDataSource?: string
  reportModuleName?: string
  reportPeriod?: string
  reportTimezone?: string
  reportFieldIds?: string[]
  reportFormIds?: string[]
  reportFilters?: Array<{ field: string; operator: string; value?: string }>
  reportSortBy?: string
  reportSortDir?: string
  reportFilenameTemplate?: string
  reportMaxRows?: number
  reportSheetName?: string
}

export interface CreateWorkflowRuleBody {
  name: string
  description?: string
  moduleName: string
  executeBasedOn: string
  recordAction?: string
  dateField?: string
  conditionType: string
  conditions?: Array<{
    field: string
    operator: string
    value: string
  }>
  instantActions?: WorkflowInstantAction[]
  scheduledExecute?: string
  scheduledUnit?: string
  // Schedule trigger fields (only sent when executeBasedOn === "schedule")
  scheduleCadence?: string | null
  scheduleCron?: string | null
  scheduleHour?: number | null
  scheduleMinute?: number | null
  scheduleDayOfWeek?: number | null
  scheduleDayOfMonth?: number | null
  scheduleTimezone?: string | null
  scheduleEnabled?: boolean
}

export interface RunWorkflowRuleResult {
  success: boolean
  status: "success" | "partial" | "failed" | "skipped"
  results: Array<{ type: string; ok: boolean; detail?: any; error?: string }>
  error?: string
}

export const workflowRulesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWorkflowRules: builder.query<ApiResponse<WorkflowRuleData[]>, string | void>({
      query: (moduleName) =>
        moduleName
          ? `/workflow-rules?moduleName=${encodeURIComponent(moduleName)}`
          : "/workflow-rules",
      providesTags: ["WorkflowRules"],
    }),

    createWorkflowRule: builder.mutation<
      ApiResponse<WorkflowRuleData>,
      CreateWorkflowRuleBody
    >({
      query: (body) => ({
        url: "/workflow-rules",
        method: "POST",
        body,
      }),
      invalidatesTags: ["WorkflowRules"],
    }),

    updateWorkflowRule: builder.mutation<
      ApiResponse<WorkflowRuleData>,
      { id: string } & Partial<CreateWorkflowRuleBody> & { active?: boolean }
    >({
      query: (body) => ({
        url: "/workflow-rules",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["WorkflowRules"],
    }),

    deleteWorkflowRule: builder.mutation<ApiResponse, string>({
      query: (id) => ({
        url: `/workflow-rules?id=${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["WorkflowRules"],
    }),

    runWorkflowRule: builder.mutation<RunWorkflowRuleResult, string>({
      query: (id) => ({
        url: `/workflow-rules/${id}/run`,
        method: "POST",
      }),
    }),

    getWorkflowRuleExecutions: builder.query<ApiResponse<any[]>, string>({
      query: (id) => `/workflow-rules/${id}/run`,
    }),

    getWorkflowExecutions: builder.query<
      {
        success: boolean
        summary: {
          total: number
          byStatus: Record<string, number>
          byTrigger: Record<string, number>
          lastRunAt: string | null
          totalRecipients: number
          windowFrom: string | null
          windowTo: string | null
        }
        data: Array<{
          id: string
          ruleId: string
          trigger: string
          status: string
          startedAt: string
          finishedAt: string | null
          durationMs: number | null
          actionsRun: number
          recipientCount: number | null
          error: string | null
          details: any
          rule: { name: string; moduleName: string } | null
        }>
        pagination: { limit: number; offset: number; total: number }
      },
      {
        ruleId?: string
        status?: string
        trigger?: string
        since?: string
        until?: string
        limit?: number
        offset?: number
      } | void
    >({
      query: (params) => {
        const sp = new URLSearchParams()
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== "") sp.set(k, String(v))
          }
        }
        const qs = sp.toString()
        return `/workflow-rules/executions${qs ? `?${qs}` : ""}`
      },
    }),
  }),
})

export const {
  useGetWorkflowRulesQuery,
  useCreateWorkflowRuleMutation,
  useUpdateWorkflowRuleMutation,
  useDeleteWorkflowRuleMutation,
  useRunWorkflowRuleMutation,
  useGetWorkflowRuleExecutionsQuery,
  useGetWorkflowExecutionsQuery,
} = workflowRulesApi
