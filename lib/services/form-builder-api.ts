import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import type { Form, FormSection, FormField, Subform } from "@/types/form-builder"

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export const formBuilderApi = createApi({
  reducerPath: "formBuilderApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["Form", "Section", "Field", "Subform"],
  endpoints: (builder) => ({
    // Get Form
    getForm: builder.query<Form, string>({
      query: (formId) => `/forms/${formId}`,
      transformResponse: (response: ApiResponse<Form>) => response.data!,
      providesTags: (result, error, formId) => [{ type: "Form", id: formId }],
    }),

    // Update Form
    updateForm: builder.mutation<Form, { formId: string; updates: Partial<Form> }>({
      query: ({ formId, updates }) => ({
        url: `/forms/${formId}`,
        method: "PUT",
        body: updates,
      }),
      transformResponse: (response: ApiResponse<Form>) => response.data!,
      // Optimistic update
      async onQueryStarted({ formId, updates }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
            Object.assign(draft, updates)
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: (result, error, { formId }) => [{ type: "Form", id: formId }],
    }),

    // Create Section
    createSection: builder.mutation<FormSection, { formId: string; sectionData: Partial<FormSection> }>({
      query: ({ sectionData }) => ({
        url: "/sections",
        method: "POST",
        body: sectionData,
      }),
      transformResponse: (response: ApiResponse<FormSection>) => response.data!,
      // Optimistic update
      async onQueryStarted({ formId, sectionData }, { dispatch, queryFulfilled }) {
        const tempId = `temp_${Date.now()}`
        const optimisticSection: FormSection = {
          id: tempId,
          formId,
          title: sectionData.title || "New Section",
          description: sectionData.description || "",
          order: sectionData.order || 0,
          columns: sectionData.columns || 1,
          visible: true,
          collapsible: false,
          collapsed: false,
          conditional: null,
          styling: null,
          fields: [],
          subforms: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          ...sectionData,
        } as FormSection

        const patchResult = dispatch(
          formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
            draft.sections.push(optimisticSection)
          }),
        )

        try {
          const { data: actualSection } = await queryFulfilled
          dispatch(
            formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
              const index = draft.sections.findIndex((s) => s.id === tempId)
              if (index !== -1) {
                draft.sections[index] = actualSection
              }
            }),
          )
        } catch {
          patchResult.undo()
        }
      },
    }),

    // Update Section
    updateSection: builder.mutation<FormSection, { sectionId: string; formId: string; updates: Partial<FormSection> }>({
      query: ({ sectionId, updates }) => ({
        url: `/sections/${sectionId}`,
        method: "PUT",
        body: updates,
      }),
      transformResponse: (response: ApiResponse<FormSection>) => response.data!,
      // Optimistic update
      async onQueryStarted({ formId, sectionId, updates }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
            const section = draft.sections.find((s) => s.id === sectionId)
            if (section) {
              Object.assign(section, updates, { updatedAt: new Date() })
            }
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
    }),

    // Delete Section
    deleteSection: builder.mutation<void, { sectionId: string; formId: string }>({
      query: ({ sectionId }) => ({
        url: `/sections/${sectionId}`,
        method: "DELETE",
      }),
      // Optimistic update
      async onQueryStarted({ formId, sectionId }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
            draft.sections = draft.sections
              .filter((s) => s.id !== sectionId)
              .map((s, index) => ({ ...s, order: index }))
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
    }),

    // Create Field
    createField: builder.mutation<FormField, { formId: string; fieldData: Partial<FormField> }>({
      query: ({ fieldData }) => ({
        url: "/fields",
        method: "POST",
        body: fieldData,
      }),
      transformResponse: (response: ApiResponse<FormField>) => response.data!,
      // Optimistic update
      async onQueryStarted({ formId, fieldData }, { dispatch, queryFulfilled }) {
        const tempId = `temp_${Date.now()}`
        const optimisticField: FormField = {
          id: tempId,
          type: fieldData.type || "text",
          label: fieldData.label || "New Field",
          placeholder: "",
          description: "",
          defaultValue: "",
          options: [],
          validation: {},
          visible: true,
          readonly: false,
          width: "full",
          order: fieldData.order || 0,
          conditional: null,
          styling: null,
          properties: null,
          rollup: null,
          lookup: null,
          formula: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...fieldData,
        } as FormField

        const patchResult = dispatch(
          formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
            if (fieldData.subformId) {
              // Add to subform
              const addToSubform = (subforms: Subform[]): boolean => {
                for (const subform of subforms) {
                  if (subform.id === fieldData.subformId) {
                    subform.fields.push(optimisticField)
                    return true
                  }
                  if (subform.childSubforms && addToSubform(subform.childSubforms)) {
                    return true
                  }
                }
                return false
              }
              for (const section of draft.sections) {
                if (addToSubform(section.subforms)) break
              }
            } else {
              // Add to section
              const section = draft.sections.find((s) => s.id === fieldData.sectionId)
              if (section) {
                section.fields.push(optimisticField)
              }
            }
          }),
        )

        try {
          const { data: actualField } = await queryFulfilled
          dispatch(
            formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
              const updateField = (fields: FormField[]) => {
                const index = fields.findIndex((f) => f.id === tempId)
                if (index !== -1) {
                  fields[index] = actualField
                  return true
                }
                return false
              }

              if (fieldData.subformId) {
                const updateInSubform = (subforms: Subform[]): boolean => {
                  for (const subform of subforms) {
                    if (updateField(subform.fields)) return true
                    if (subform.childSubforms && updateInSubform(subform.childSubforms)) return true
                  }
                  return false
                }
                for (const section of draft.sections) {
                  if (updateInSubform(section.subforms)) break
                }
              } else {
                for (const section of draft.sections) {
                  if (updateField(section.fields)) break
                }
              }
            }),
          )
        } catch {
          patchResult.undo()
        }
      },
    }),

    // Update Field
    updateField: builder.mutation<FormField, { fieldId: string; formId: string; updates: Partial<FormField> }>({
      query: ({ fieldId, updates }) => ({
        url: `/fields/${fieldId}`,
        method: "PUT",
        body: updates,
      }),
      transformResponse: (response: ApiResponse<FormField>) => response.data!,
      // Optimistic update
      async onQueryStarted({ formId, fieldId, updates }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
            const updateField = (fields: FormField[]) => {
              const field = fields.find((f) => f.id === fieldId)
              if (field) {
                Object.assign(field, updates, { updatedAt: new Date() })
                return true
              }
              return false
            }

            const updateInSubforms = (subforms: Subform[]): boolean => {
              for (const subform of subforms) {
                if (updateField(subform.fields)) return true
                if (subform.childSubforms && updateInSubforms(subform.childSubforms)) return true
              }
              return false
            }

            for (const section of draft.sections) {
              if (updateField(section.fields)) break
              if (updateInSubforms(section.subforms)) break
            }
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
    }),

    // Delete Field
    deleteField: builder.mutation<void, { fieldId: string; formId: string }>({
      query: ({ fieldId }) => ({
        url: `/fields/${fieldId}`,
        method: "DELETE",
      }),
      // Optimistic update
      async onQueryStarted({ formId, fieldId }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
            const removeField = (fields: FormField[]) => {
              const index = fields.findIndex((f) => f.id === fieldId)
              if (index !== -1) {
                fields.splice(index, 1)
                fields.forEach((f, idx) => (f.order = idx))
                return true
              }
              return false
            }

            const removeFromSubforms = (subforms: Subform[]): boolean => {
              for (const subform of subforms) {
                if (removeField(subform.fields)) return true
                if (subform.childSubforms && removeFromSubforms(subform.childSubforms)) return true
              }
              return false
            }

            for (const section of draft.sections) {
              if (removeField(section.fields)) break
              if (removeFromSubforms(section.subforms)) break
            }
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
    }),

    // Create Subform
    createSubform: builder.mutation<Subform, { formId: string; subformData: Partial<Subform> }>({
      query: ({ subformData }) => ({
        url: "/subforms",
        method: "POST",
        body: subformData,
      }),
      transformResponse: (response: ApiResponse<Subform>) => response.data!,
      // Optimistic update
      async onQueryStarted({ formId, subformData }, { dispatch, queryFulfilled }) {
        const tempId = `temp_${Date.now()}`
        const optimisticSubform: Subform = {
          id: tempId,
          name: subformData.name || "New Subform",
          order: subformData.order || 0,
          columns: subformData.columns || 1,
          visible: true,
          collapsible: true,
          collapsed: false,
          fields: [],
          childSubforms: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          ...subformData,
        } as Subform

        const patchResult = dispatch(
          formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
            if (subformData.parentSubformId) {
              const addToParent = (subforms: Subform[]): boolean => {
                for (const subform of subforms) {
                  if (subform.id === subformData.parentSubformId) {
                    if (!subform.childSubforms) subform.childSubforms = []
                    subform.childSubforms.push(optimisticSubform)
                    return true
                  }
                  if (subform.childSubforms && addToParent(subform.childSubforms)) return true
                }
                return false
              }
              for (const section of draft.sections) {
                if (addToParent(section.subforms)) break
              }
            } else {
              const section = draft.sections.find((s) => s.id === subformData.sectionId)
              if (section) {
                section.subforms.push(optimisticSubform)
              }
            }
          }),
        )

        try {
          const { data: actualSubform } = await queryFulfilled
          dispatch(
            formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
              const updateSubform = (subforms: Subform[]): boolean => {
                const index = subforms.findIndex((s) => s.id === tempId)
                if (index !== -1) {
                  subforms[index] = actualSubform
                  return true
                }
                for (const subform of subforms) {
                  if (subform.childSubforms && updateSubform(subform.childSubforms)) return true
                }
                return false
              }

              for (const section of draft.sections) {
                if (updateSubform(section.subforms)) break
              }
            }),
          )
        } catch {
          patchResult.undo()
        }
      },
    }),

    // Update Subform
    updateSubform: builder.mutation<Subform, { subformId: string; formId: string; updates: Partial<Subform> }>({
      query: ({ subformId, updates }) => ({
        url: `/subforms/${subformId}`,
        method: "PUT",
        body: updates,
      }),
      transformResponse: (response: ApiResponse<Subform>) => response.data!,
      // Optimistic update
      async onQueryStarted({ formId, subformId, updates }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
            const updateSubform = (subforms: Subform[]): boolean => {
              for (const subform of subforms) {
                if (subform.id === subformId) {
                  Object.assign(subform, updates, { updatedAt: new Date() })
                  return true
                }
                if (subform.childSubforms && updateSubform(subform.childSubforms)) return true
              }
              return false
            }

            for (const section of draft.sections) {
              if (updateSubform(section.subforms)) break
            }
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
    }),

    // Delete Subform
    deleteSubform: builder.mutation<void, { subformId: string; formId: string }>({
      query: ({ subformId }) => ({
        url: `/subforms/${subformId}`,
        method: "DELETE",
      }),
      // Optimistic update
      async onQueryStarted({ formId, subformId }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
            const removeSubform = (subforms: Subform[]): boolean => {
              const index = subforms.findIndex((s) => s.id === subformId)
              if (index !== -1) {
                subforms.splice(index, 1)
                return true
              }
              for (const subform of subforms) {
                if (subform.childSubforms && removeSubform(subform.childSubforms)) return true
              }
              return false
            }

            for (const section of draft.sections) {
              if (removeSubform(section.subforms)) break
              // Also remove fields belonging to this subform
              section.fields = section.fields.filter((f) => f.subformId !== subformId)
            }
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
    }),

    // Reorder Sections
    reorderSections: builder.mutation<void, { formId: string; sectionIds: string[] }>({
      query: ({ sectionIds }) => ({
        url: "/sections/reorder",
        method: "POST",
        body: { sectionIds },
      }),
      // Optimistic update
      async onQueryStarted({ formId, sectionIds }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          formBuilderApi.util.updateQueryData("getForm", formId, (draft) => {
            const newSections = sectionIds
              .map((id) => draft.sections.find((s) => s.id === id))
              .filter(Boolean) as FormSection[]
            newSections.forEach((s, index) => (s.order = index))
            draft.sections = newSections
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
    }),
  }),
})

export const {
  useGetFormQuery,
  useUpdateFormMutation,
  useCreateSectionMutation,
  useUpdateSectionMutation,
  useDeleteSectionMutation,
  useCreateFieldMutation,
  useUpdateFieldMutation,
  useDeleteFieldMutation,
  useCreateSubformMutation,
  useUpdateSubformMutation,
  useDeleteSubformMutation,
  useReorderSectionsMutation,
} = formBuilderApi
