import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import { Form, FormField, FormSection, FormFieldWithMeta } from "./types"

interface FormDetailResponse {
  success: boolean
  data: Form
  error?: string
}

export const formsApi = createApi({
  reducerPath: "formsApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    credentials: "include",
  }),
  tagTypes: ["Form", "FormDetail", "Records"],
  endpoints: (builder) => ({
    getFormDetail: builder.query<FormDetailResponse, string>({
      query: (formId) => `/forms/${formId}`,
      providesTags: (result, error, formId) => [{ type: "FormDetail", id: formId }],
      keepUnusedDataFor: 600,
    }),

    getFormFieldsWithSections: builder.query<FormFieldWithMeta[], string>({
      queryFn: async (formId, { extra, getState }, options, baseQuery) => {
        const result = await baseQuery(`/forms/${formId}`)

        if (result.error) {
          return { error: result.error }
        }

        const formData = (result.data as FormDetailResponse).data
        const fieldsWithMeta: FormFieldWithMeta[] = []

        if (formData.sections) {
          formData.sections.forEach((section: FormSection) => {
            if (section.fields) {
              section.fields.forEach((field: FormField) => {
                fieldsWithMeta.push({
                  ...field,
                  sectionId: section.id,
                  sectionTitle: section.title,
                  formId: formId,
                  formName: formData.name,
                })
              })
            }
          })
        }

        return { data: fieldsWithMeta }
      },
      providesTags: (result, error, formId) => [{ type: "FormDetail", id: formId }],
      keepUnusedDataFor: 600,
    }),
  }),
})

export const { useGetFormDetailQuery, useGetFormFieldsWithSectionsQuery } = formsApi
