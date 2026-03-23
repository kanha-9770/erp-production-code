// Shared types for RTK Query API slices

export interface Form {
  id: string
  name: string
  description?: string | null
  moduleId: string
  isPublished: boolean
  updatedAt: Date | string
  publishedAt?: Date | string | null
  formUrl?: string | null
  settings?: any
  subforms?: Subform[]
  sections: FormSection[]
  allowAnonymous?: boolean
  requireLogin?: boolean
  createdAt?: Date | string
  [key: string]: any
}

export interface FormSection {
  id: string
  formId: string
  title: string
  order: number
  columns: number
  visible: boolean
  fields: FormField[]
  subforms?: Subform[]
  [key: string]: any
}

export interface FormField {
  id: string
  sectionId?: string
  subformId?: string
  type: string
  label: string
  placeholder?: string
  description?: string
  defaultValue?: any
  options?: any[]
  required?: boolean
  visible?: boolean
  order: number
  formula?: any
  lookup?: any
  validation?: any
  isIndexed?: boolean
  createdAt?: Date | string
  updatedAt?: Date | string
  [key: string]: any
}

export interface FormFieldWithMeta extends FormField {
  sectionTitle?: string
  sectionOrder?: number
}

export interface Subform {
  id: string
  formId: string
  parentSubformId?: string
  parentSectionId?: string
  name: string
  description?: string
  order: number
  level: number
  path?: string
  columns: number
  visible: boolean
  fields: FormField[]
  childSubforms?: Subform[]
  [key: string]: any
}

export interface Module {
  id: string
  name: string
  description?: string | null
  organizationId: string
  parentModuleId?: string | null
  order?: number
  icon?: string | null
  forms?: Form[]
  children?: Module[]
  [key: string]: any
}

export interface FormRecord {
  id: string
  formId: string
  data: Record<string, any>
  status?: string
  createdAt?: Date | string
  updatedAt?: Date | string
  [key: string]: any
}
