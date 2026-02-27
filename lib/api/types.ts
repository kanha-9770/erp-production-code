export interface Module {
  module_id: string
  module_name: string
  description?: string
  icon?: string
  color?: string
  path?: string
  parent_id?: string
  level: number
  sort_order: number
  module_type: string
  forms?: Form[]
}

export interface Form {
  id: string
  name: string
  description?: string
  moduleId: string
  isPublished: boolean
  updatedAt: string
  sections: FormSection[]
}

export interface FormSection {
  id: string
  title: string
  fields: FormField[]
}

export interface FormField {
  id: string
  label: string
  type: string
  order: number
  placeholder?: string
  description?: string
  validation?: any
  options?: any[]
  lookup?: any
}

export interface FormRecord {
  id: string
  formId: string
  formName?: string
  recordData: Record<string, any>
  submittedAt: string
  status: "pending" | "approved" | "rejected" | "submitted"
}

export interface FormFieldWithMeta extends FormField {
  sectionId: string
  sectionTitle: string
  formId: string
  formName: string
}
