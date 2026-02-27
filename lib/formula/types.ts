export type FormulaReturnType = "Number" | "Text" | "Date" | "Time" | "DateTime" | "Boolean" | "Currency" | "Percent" | "Picklist"
export type BlankPreference = "Empty" | "Exclude" | "Blank" | "Zero" | "EmptyString"

export interface FormulaFunction {
  name: string
  category: "Numeric" | "Text" | "Date" | "Logical" | "Advanced"
  description: string
  syntax: string
  examples: string[]
  parameters: {
    name: string
    type: string
    description: string
    optional?: boolean
  }[]
  returnType: FormulaReturnType
}

export interface FormulaFieldContext {
  formId: string
  fieldId: string
  fields: FormFieldInfo[]
  expression: string
  returnType: FormulaReturnType
}

export interface FormFieldInfo {
  id: string
  label: string
  type: string
  databaseName: string
}

export interface FormulaVariable {
  name: string
  value: any
  type: string
}

export interface FormulaEvaluationResult {
  success: boolean
  value?: any
  error?: string
  dependencies?: string[]
}

export interface FormulaDependency {
  fieldId: string
  fieldLabel: string
  type: string
}

export const fieldTypeToReturnType: Record<string, FormulaReturnType> = {
  text: "Text",
  textarea: "Text",
  number: "Number",
  email: "Text",
  phone: "Text",
  url: "Text",
  date: "DateTime",
  time: "Time",
  checkbox: "Boolean",
  radio: "Picklist",
  select: "Picklist",
  file: "Text",
  lookup: "Picklist",
  rating: "Number",
  location: "Text",
  signature: "Text",
  payment: "Currency",
  image: "Text",
  camera: "Text",
  subform: "Text",
  user: "Picklist",
  "multi-select": "Picklist",
  address: "Text",
  name: "Text",
  datetime: "DateTime",
  currency: "Currency",
  "rich-text": "Text",
  decimal: "Number",
  percent: "Number",
  audio: "Text",
  "long-integer": "Number",
  video: "Text",
  formula: "Text",
  rollup: "Number",
  "auto-number": "Number",
  decision: "Boolean",
  qr: "Text",
  notes: "Text",
  integration: "Text",
  prediction: "Number",
  "keyboard-extraction": "Text",
  sentiment: "Picklist",
  ocr: "Text",
  "object-detection": "Picklist",
  "new-section": "Text",
  slider: "Number",
  switch: "Boolean",
  hidden: "Text",
  password: "Text",
  tel: "Text",
} as const

export function getFieldReturnType(
  fieldType: string,
  formulaReturnType?: FormulaReturnType
): FormulaReturnType {
  return formulaReturnType ?? fieldTypeToReturnType[fieldType as keyof typeof fieldTypeToReturnType] ?? "Text"
}
