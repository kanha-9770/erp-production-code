import { baseApi } from "./baseApi"

interface ApiResponse<T = any> {
  success: boolean
  data: T
  error?: string
}

export interface FunctionData {
  id: string
  name: string
  displayName: string
  category: string
  language: string
  description: string | null
  associated: boolean
  restApi: boolean
  script: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateFunctionBody {
  name: string
  displayName: string
  category: string
  language: string
  description?: string
}

export type BindingEvent =
  | "onFieldChange"
  | "onFieldBlur"
  | "beforeSubmit"
  | "afterCreate"
  | "afterUpdate"
  | "manual"

export interface FunctionBinding {
  id: string
  functionId: string
  formId: string | null
  fieldId: string | null
  moduleId: string | null
  event: BindingEvent
  inputMapping: Record<string, string>
  outputMapping: Record<string, string>
  condition: any | null
  active: boolean
  order: number
  organizationId: string
  createdAt: string
  updatedAt: string
}

export interface CreateBindingBody {
  event: BindingEvent
  formId?: string | null
  fieldId?: string | null
  moduleId?: string | null
  inputMapping?: Record<string, string>
  outputMapping?: Record<string, string>
  condition?: any
  active?: boolean
  order?: number
}

export type UpdateBindingBody = Partial<CreateBindingBody>

export const functionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getFunctions: builder.query<ApiResponse<FunctionData[]>, void>({
      query: () => "/functions",
      providesTags: ["Functions"],
    }),

    createFunction: builder.mutation<ApiResponse<FunctionData>, CreateFunctionBody>({
      query: (body) => ({
        url: "/functions",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Functions"],
    }),

    updateFunction: builder.mutation<
      ApiResponse<FunctionData>,
      { id: string } & Partial<CreateFunctionBody> & { associated?: boolean; restApi?: boolean; script?: string }
    >({
      query: (body) => ({
        url: "/functions",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Functions"],
    }),

    deleteFunction: builder.mutation<ApiResponse, string>({
      query: (id) => ({
        url: `/functions?id=${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Functions"],
    }),

    executeFunction: builder.mutation<
      ApiResponse<{
        success: boolean
        result?: any
        logs: Array<{ level: string; args: any[]; ts: number }>
        error?: string
        durationMs: number
      }>,
      { id?: string; script?: string; input?: any; timeoutMs?: number; maxOps?: number; persist?: boolean }
    >({
      query: (body) => ({
        url: "/functions/execute",
        method: "POST",
        body,
      }),
      // Test runs that persist invalidate the executions tag so the log
      // viewer auto-refreshes after a manual test.
      invalidatesTags: (_r, _e, arg) => (arg.persist ? ["FunctionExecutions"] : []),
    }),

    getFunctionExecutions: builder.query<
      {
        success: boolean
        summary: {
          total: number
          byStatus: Record<string, number>
          byTrigger: Record<string, number>
          lastRunAt: string | null
          totalDurationMs: number
          avgDurationMs: number
          windowFrom: string | null
          windowTo: string | null
        }
        data: Array<{
          id: string
          functionId: string
          trigger: string
          status: string
          startedAt: string
          finishedAt: string | null
          durationMs: number | null
          input: any
          result: any
          logs: Array<{ level: string; args: any[]; ts: number }> | null
          error: string | null
          userId: string | null
          function: { name: string; displayName: string; category: string } | null
          user: { id: string; email: string; first_name: string | null; last_name: string | null } | null
        }>
        pagination: { limit: number; offset: number; total: number }
      },
      {
        functionId?: string
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
        return `/functions/executions${qs ? `?${qs}` : ""}`
      },
      providesTags: ["FunctionExecutions"],
    }),

    // ── Bindings ──────────────────────────────────────────────────────────

    listBindings: builder.query<ApiResponse<FunctionBinding[]>, string>({
      query: (functionId) => `/functions/${functionId}/bindings`,
      providesTags: (_r, _e, functionId) => [{ type: "FunctionBindings", id: functionId }],
    }),

    /**
     * Module → form → event tree. Every form ships with all 6 event slots
     * prebuilt (each with its bindings array — possibly empty). Powers the
     * tree view in the APIs and SDKs settings page.
     */
    getBindingsTree: builder.query<
      ApiResponse<Array<{
        id: string
        name: string
        description: string | null
        icon: string | null
        events: Array<{ event: BindingEvent; bindings: any[] }>
        forms: Array<{
          id: string
          name: string
          isPublished: boolean
          /** Flat list of fields in the form (sections + subforms),
           *  ordered, with `group` set to the section title or "Subform name (subform)".
           *  `apiName` is a stable PascalCase slug of the label, deduped within the form. */
          fields: Array<{
            id: string
            label: string
            type: string
            group: string
            apiName: string
          }>
          events: Array<{ event: BindingEvent; bindings: any[] }>
        }>
      }>>,
      void
    >({
      query: () => "/functions/bindings/tree",
      providesTags: ["FunctionBindings"],
    }),

    /**
     * Org-wide bindings list. Each row carries the function and a
     * pre-resolved `scope` summary so the table can render without extra
     * lookups. Powers the APIs and SDKs settings page.
     */
    listAllBindings: builder.query<
      ApiResponse<Array<FunctionBinding & {
        function: { id: string; name: string; displayName: string; category: string; language: string }
        scope: { kind: "field" | "form" | "module"; label: string; formId: string | null; formName: string | null }
      }>>,
      { event?: string; functionId?: string; active?: boolean } | void
    >({
      query: (args) => {
        const params = new URLSearchParams()
        if (args?.event) params.set("event", args.event)
        if (args?.functionId) params.set("functionId", args.functionId)
        if (args?.active !== undefined) params.set("active", String(args.active))
        const qs = params.toString()
        return `/functions/bindings${qs ? `?${qs}` : ""}`
      },
      providesTags: ["FunctionBindings"],
    }),

    createBinding: builder.mutation<
      ApiResponse<FunctionBinding>,
      { functionId: string; body: CreateBindingBody }
    >({
      query: ({ functionId, body }) => ({
        url: `/functions/${functionId}/bindings`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { functionId }) => [
        { type: "FunctionBindings", id: functionId },
        "FunctionBindings",
        "Functions",
      ],
    }),

    updateBinding: builder.mutation<
      ApiResponse<FunctionBinding>,
      { functionId: string; bindingId: string; body: UpdateBindingBody }
    >({
      query: ({ functionId, bindingId, body }) => ({
        url: `/functions/${functionId}/bindings/${bindingId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { functionId }) => [
        { type: "FunctionBindings", id: functionId },
        "FunctionBindings",
      ],
    }),

    deleteBinding: builder.mutation<
      ApiResponse,
      { functionId: string; bindingId: string }
    >({
      query: ({ functionId, bindingId }) => ({
        url: `/functions/${functionId}/bindings/${bindingId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { functionId }) => [
        { type: "FunctionBindings", id: functionId },
        "FunctionBindings",
        "Functions",
      ],
    }),

    runFormBinding: builder.mutation<
      {
        ok: boolean
        fieldUpdates: Record<string, any>
        result?: any
        error?: string
        logs: Array<{ level: string; args: any[]; ts: number }>
        durationMs: number
      },
      { formId: string; bindingId: string; formData?: Record<string, any>; triggerFieldId?: string }
    >({
      query: ({ formId, ...body }) => ({
        url: `/forms/${formId}/functions/run`,
        method: "POST",
        body,
      }),
    }),
  }),
})

export const {
  useGetFunctionsQuery,
  useCreateFunctionMutation,
  useUpdateFunctionMutation,
  useDeleteFunctionMutation,
  useExecuteFunctionMutation,
  useGetFunctionExecutionsQuery,
  useListBindingsQuery,
  useListAllBindingsQuery,
  useGetBindingsTreeQuery,
  useCreateBindingMutation,
  useUpdateBindingMutation,
  useDeleteBindingMutation,
  useRunFormBindingMutation,
} = functionsApi
