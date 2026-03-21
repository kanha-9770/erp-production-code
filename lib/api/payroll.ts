import { baseApi } from "./baseApi"

interface ApiResponse<T = any> {
  success: boolean
  data: T
  error?: string
}

export const payrollApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    autoGeneratePayroll: builder.mutation<ApiResponse, Record<string, any>>({
      query: (body) => ({
        url: "/payroll/auto-generate",
        method: "POST",
        body,
      }),
    }),

    getPayroll: builder.query<ApiResponse, void>({
      query: () => "/payroll",
    }),

    createPayroll: builder.mutation<ApiResponse, Record<string, any>>({
      query: (body) => ({
        url: "/payroll",
        method: "POST",
        body,
      }),
    }),

    getPayrollForms: builder.query<ApiResponse, void>({
      query: () => "/payroll/forms",
    }),

    getPayrollFormFields: builder.query<ApiResponse, string>({
      query: (formId) => `/payroll/form-fields?formId=${formId}`,
    }),

    savePayrollConfig: builder.mutation<ApiResponse, Record<string, any>>({
      query: (body) => ({
        url: "/payroll/config",
        method: "POST",
        body,
      }),
    }),
  }),
})

export const {
  useAutoGeneratePayrollMutation,
  useGetPayrollQuery,
  useLazyGetPayrollQuery,
  useCreatePayrollMutation,
  useGetPayrollFormsQuery,
  useLazyGetPayrollFormsQuery,
  useGetPayrollFormFieldsQuery,
  useLazyGetPayrollFormFieldsQuery,
  useSavePayrollConfigMutation,
} = payrollApi
