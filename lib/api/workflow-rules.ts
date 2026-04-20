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
  }),
})

export const {
  useGetWorkflowRulesQuery,
  useCreateWorkflowRuleMutation,
  useUpdateWorkflowRuleMutation,
  useDeleteWorkflowRuleMutation,
} = workflowRulesApi
