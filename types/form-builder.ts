// export interface FieldOption {
//   id: string;
//   label: string;
//   value: string;
// }

// export interface FormField {
//   id: string;
//   sectionId?: string; // For fields inside sections
//   subformId?: string; // For fields inside subforms
//   type: string;
//   label: string;
//   placeholder?: string;
//   description?: string;
//   defaultValue?: string;
//   value?: any;
//   options: FieldOption[];
//   validation: Record<string, any>;
//   visible: boolean;
//   readonly: boolean;
//   width: "full" | "half" | "third" | "quarter";
//   order: number;
//   conditional?: Record<string, any> | null;
//   styling?: Record<string, any> | null;
//   properties?: Record<string, any> | null;
//   formula?: string | null;
//   rollup?: Record<string, any> | null;
//   lookup?: Record<string, any> | null;
//   // Special field properties
//   preferredCountries?: string[];
//   defaultCountry?: string;
//   decimalPlaces?: number;
//   createdAt: Date;
//   updatedAt: Date;
//   parentFieldId?: string; // for conditional / dependent fields
//   isDependent?: boolean;
//   dependentGroups?: Array<{
//     parentValue: string;
//     options: Array<{ value: string; label: string }>;
//   }>;
// }

// // NEW: Interface for minimal parent subform structure
// export interface ParentSubform {
//   id: string;
//   name: string;
//   level: number;
//   path?: string;
// }

// // ENHANCED: Subform with nested support - matches Prisma schema
// // ARCHITECTURE: Subforms are now TOP-LEVEL form components (not inside sections)
// export interface Subform {
//   id: string;
//   formId: string; // NEW: Parent form ID (top-level subforms)
//   parentSubformId?: string; // For nested subforms
//   name: string;
//   description?: string;
//   order: number;
//   level: number; // Nesting level (0 = root, 1 = first nested, etc.)
//   path?: string; // Hierarchical path like "1.2.3"

//   // Visual and behavior properties
//   columns: number;
//   visible: boolean;
//   collapsible: boolean;
//   collapsed?: boolean;

//   // Styling for different nesting levels
//   styling?: Record<string, any> | null;
//   conditional?: Record<string, any> | null;

//   fields: FormField[];
//   childSubforms: Subform[]; // Nested subforms
//   parentSubform?: ParentSubform | null;

//   createdAt: Date;
//   updatedAt: Date;
// }

// export interface FormSection {
//   subforms: any;
//   name: any;
//   id: string;
//   formId: string;
//   title: string;
//   description?: string;
//   order: number;
//   columns: number;
//   visible: boolean;
//   collapsible: boolean;
//   collapsed: boolean;
//   conditional?: Record<string, any> | null;
//   styling?: Record<string, any> | null;
//   fields: FormField[];
//   createdAt: Date;
//   updatedAt: Date;
// }

// export interface Form {
//   recordCount: number;
//   id: string;
//   moduleId: string;
//   name: string;
//   description?: string;
//   settings: Record<string, any>;
//   sections: FormSection[];
//   subforms: Subform[];
//   isPublished: boolean;
//   publishedAt?: Date | null;
//   formUrl?: string | null;
//   allowAnonymous: boolean;
//   requireLogin: boolean;
//   maxSubmissions?: number | null;
//   submissionMessage?: string | null;
//   conditional?: Record<string, any> | null;
//   styling?: Record<string, any> | null;
//   isUserForm?: boolean;
//   isEmployeeForm?: boolean;
//   createdAt: Date;
//   updatedAt: Date;
//   tableMapping?: Record<string, any> | null;
//   totalRecords?: number;
// }

// // NEW: Helper types for nested operations
// export interface SubformHierarchy {
//   subform: Subform;
//   children: SubformHierarchy[];
//   depth: number;
// }

// export interface NestedDropTarget {
//   type: "section" | "subform";
//   id: string;
//   level: number;
//   path: string;
// }

// export interface FormModule {
//   id: string;
//   name: string;
//   description?: string | null;
//   icon?: string | null;
//   color?: string | null;
//   settings: Record<string, any>;
//   // Hierarchical fields
//   parentId?: string | null;
//   parent?: FormModule | null;
//   children?: FormModule[];
//   moduleType: "master" | "child" | "standard";
//   level: number;
//   path?: string | null;
//   isActive: boolean;
//   sortOrder: number;
//   forms: Form[];
//   isPublished?: any;
//   createdAt: Date;
//   updatedAt: Date;
// }

// export interface FieldValidation {
//   required?: boolean;
//   minLength?: number;
//   maxLength?: number;
//   min?: number;
//   max?: number;
//   pattern?: string;
//   message?: string;
//   patternMessage?: string;
// }

// export interface FieldStyling {
//   backgroundColor?: string;
//   textColor?: string;
//   borderColor?: string;
//   fontSize?: string;
//   fontWeight?: string;
//   padding?: string;
//   margin?: string;
// }

// export interface SectionStyling {
//   backgroundColor?: string;
//   textColor?: string;
//   borderColor?: string;
//   padding?: string;
//   margin?: string;
// }

// export interface FormStyling {
//   backgroundColor?: string;
//   textColor?: string;
//   primaryColor?: string;
//   secondaryColor?: string;
//   fontFamily?: string;
// }

// export interface FieldProperties {
//   accept?: string;
//   multiple?: boolean;
//   rows?: number;
//   cols?: number;
//   min?: number;
//   max?: number;
//   step?: number;
// }

// export interface ConditionalLogic {
//   field: string;
//   operator:
//     | "equals"
//     | "not_equals"
//     | "contains"
//     | "not_contains"
//     | "greater_than"
//     | "less_than";
//   value: string;
// }

// export interface LookupConfig {
//   sourceId?: string;
//   displayField?: string;
//   valueField?: string;
//   multiple?: boolean;
//   searchable?: boolean;
//   searchPlaceholder?: string;
//   filters?: Record<string, any>;
// }

// export interface FormRecord {
//   id: string;
//   formId: string;
//   userId: string;
//   status: string;
//   form?: Form; // Include complete form structure with sections and fields
//   recordData: Record<string, any>;
//   employee_id?: string | null;
//   amount?: number | null;
//   date?: Date | null;
//   submittedBy?: string | null;
//   submittedAt: Date;
//   ipAddress?: string | null;
//   userAgent?: string | null;
//   createdAt: Date;
//   updatedAt: Date;
// }

// export interface FormEvent {
//   id: string;
//   formId: string;
//   eventType: string;
//   payload: Record<string, any>;
//   sessionId?: string | null;
//   userAgent?: string | null;
//   ipAddress?: string | null;
//   createdAt: Date;
//   updatedAt: Date;
// }

// export interface FieldType {
//   id: string;
//   name: string;
//   label: string;
//   category: string;
//   icon: string;
//   description: string;
//   defaultProps: Record<string, any>;
//   active: boolean;
//   createdAt: Date;
//   updatedAt: Date;
// }

// export interface DraggedItem {
//   id: string;
//   type: string;
//   index?: number;
//   sectionId?: string;
//   subformId?: string;
// }

// export interface DragItem {
//   id: string;
//   type: string;
//   fieldType?: string;
//   field?: FormField;
//   section?: FormSection;
//   subform?: Subform;
// }

// export interface DropResult {
//   draggedId: string;
//   targetId?: string;
//   position: "before" | "after" | "inside";
// }

// export type FieldWidth = "full" | "half" | "third" | "quarter";

// export interface LookupSource {
//   id: string;
//   name: string;
//   type: "static" | "module" | "form" | "api";
//   description?: string;
//   recordCount?: number;
//   icon?: string;
// }

// export interface LookupOption {
//   value: string;
//   label: string;
//   data?: Record<string, any>;
// }

// export const ItemTypes = {
//   PALETTE_FIELD: "palette_field",
//   FIELD: "field",
//   SECTION: "section",
//   SUBFORM: "subform",
// };

// // Additional types for hierarchical module management
// export interface ModuleHierarchyNode extends FormModule {
//   depth: number;
//   hasChildren: boolean;
//   isExpanded?: boolean;
//   childCount: number;
//   formCount: number;
//   totalRecords: number;
// }

// export interface ModuleBreadcrumb {
//   id: string;
//   name: string;
//   path: string;
//   level: number;
// }

// export interface ModuleTreeItem {
//   module: FormModule;
//   children: ModuleTreeItem[];
//   expanded: boolean;
// }

// export interface HierarchicalModuleStats {
//   totalModules: number;
//   masterModules: number;
//   childModules: number;
//   standardModules: number;
//   maxDepth: number;
//   totalForms: number;
//   totalRecords: number;
// }

// // Module management actions
// export type ModuleAction =
//   | { type: "CREATE_CHILD"; parentId: string; moduleData: Partial<FormModule> }
//   | { type: "MOVE_MODULE"; moduleId: string; newParentId?: string }
//   | { type: "REORDER_MODULES"; moduleIds: string[]; parentId?: string }
//   | { type: "CONVERT_TO_MASTER"; moduleId: string }
//   | { type: "CONVERT_TO_CHILD"; moduleId: string; parentId: string }
//   | { type: "DELETE_MODULE"; moduleId: string; cascadeChildren?: boolean };

// // Enhanced lookup configuration for hierarchical modules
// export interface HierarchicalLookupConfig extends LookupConfig {
//   includeChildModules?: boolean;
//   moduleFilter?: {
//     moduleType?: ("master" | "child" | "standard")[];
//     level?: number;
//     parentId?: string;
//   };
// }

// // Module permissions and access control
// export interface ModulePermissions {
//   moduleId: string;
//   userId?: string;
//   roleId?: string;
//   permissions: {
//     read: boolean;
//     write: boolean;
//     delete: boolean;
//     manageChildren: boolean;
//     moveModule: boolean;
//   };
//   inherited: boolean;
//   inheritedFrom?: string;
// }

// // Module settings specific to hierarchy
// export interface HierarchicalModuleSettings {
//   allowChildCreation: boolean;
//   maxChildDepth?: number;
//   childModuleTemplate?: Partial<FormModule>;
//   inheritPermissions: boolean;
//   cascadeSettings: boolean;
//   displayMode: "tree" | "flat" | "breadcrumb";
//   sortChildrenBy: "name" | "createdAt" | "sortOrder" | "formCount";
//   sortDirection: "asc" | "desc";
// }

// // Integration types for subforms
// export interface SubformIntegration {
//   id: string;
//   subformId: string;
//   type: "webhook" | "database" | "api" | "email" | "sms";
//   name: string;
//   enabled: boolean;
//   config: {
//     url?: string;
//     method?: "GET" | "POST" | "PUT" | "DELETE";
//     headers?: Record<string, string>;
//     authentication?: {
//       type: "none" | "bearer" | "basic" | "api_key";
//       token?: string;
//       username?: string;
//       password?: string;
//       apiKey?: string;
//     };
//     mapping?: Record<string, string>;
//     triggers?: ("create" | "update" | "delete")[];
//     conditions?: ConditionalLogic[];
//   };
//   createdAt: Date;
//   updatedAt: Date;
// }

// // Webhook payload structure
// export interface WebhookPayload {
//   event: "subform.created" | "subform.updated" | "subform.deleted";
//   timestamp: string;
//   subform: {
//     id: string;
//     name: string;
//     formId: string;
//     data: Record<string, any>;
//   };
//   fields: FormField[];
//   metadata: {
//     userAgent?: string;
//     ipAddress?: string;
//     userId?: string;
//   };
// }

// // API Integration response
// export interface APIIntegrationResponse {
//   success: boolean;
//   data?: any;
//   error?: string;
//   statusCode: number;
//   headers?: Record<string, string>;
// }

// // Legacy interfaces for backward compatibility
// export interface LookupFieldRelation {
//   id: string;
//   lookupSourceId: string;
//   formFieldId: string;
//   formId: string;
//   moduleId: string;
//   displayField?: string;
//   valueField?: string;
//   multiple?: boolean;
//   searchable?: boolean;
//   filters: Record<string, any>;
//   createdAt: Date;
//   updatedAt: Date;
// }


// form-builder.ts

export interface FieldOption {
  id: string;
  label: string;
  value: string;
  order?: number;
}

/**
 * One group of options shown when parent field has a specific value
 */
export interface DependentOptionGroup {
  parentValue: string;
  options: FieldOption[];
}

export interface FormField {
  id: string;
  sectionId?: string | null;     // For fields inside sections
  subformId?: string | null;     // For fields inside subforms

  type: string;
  label: string;
  placeholder?: string;
  description?: string;
  defaultValue?: string;

  // Runtime value (only during form filling / preview)
  value?: any;

  // ──────────────────────────────────────────────────────────────
  // Standard static options — used when isDependent = false
  // ──────────────────────────────────────────────────────────────
  options: FieldOption[];

  // ──────────────────────────────────────────────────────────────
  // Dependent / cascading dropdown support
  // ──────────────────────────────────────────────────────────────
  isDependent?: boolean;
  parentFieldId?: string | null;
  dependentGroups?: DependentOptionGroup[];
  // ──────────────────────────────────────────────────────────────

  validation: Record<string, any>;
  visible: boolean;
  readonly: boolean;
  width: "full" | "half" | "third" | "quarter";
  order: number;

  conditional?: Record<string, any> | null;
  styling?: Record<string, any> | null;
  properties?: Record<string, any> | null;

  formula?: string | null;
  rollup?: Record<string, any> | null;
  lookup?: Record<string, any> | null;

  // Special field properties
  preferredCountries?: string[];
  defaultCountry?: string;
  decimalPlaces?: number;
  isIndexed?: boolean;

  createdAt: Date;
  updatedAt: Date;
}

// NEW: Interface for minimal parent subform structure
export interface ParentSubform {
  id: string;
  name: string;
  level: number;
  path?: string;
}

// ENHANCED: Subform with nested support - matches Prisma schema
// ARCHITECTURE: Subforms are now TOP-LEVEL form components (not inside sections)
export interface Subform {
  id: string;
  formId: string; // NEW: Parent form ID (top-level subforms)
  parentSubformId?: string; // For nested subforms
  parentSectionId?: string | null; // Section this subform belongs under
  name: string;
  description?: string;
  order: number;
  level: number; // Nesting level (0 = root, 1 = first nested, etc.)
  path?: string; // Hierarchical path like "1.2.3"

  // Visual and behavior properties
  columns: number;
  visible: boolean;
  collapsible: boolean;
  collapsed?: boolean;

  // Styling for different nesting levels
  styling?: Record<string, any> | null;
  conditional?: Record<string, any> | null;

  fields: FormField[];
  childSubforms: Subform[]; // Nested subforms
  parentSubform?: ParentSubform | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface FormSection {
  id: string;
  formId: string;
  title: string;
  description?: string;
  order: number;
  columns: number;
  visible: boolean;
  collapsible: boolean;
  collapsed: boolean;
  /**
   * When true, fields in this section are stripped from records that a
   * viewer is seeing through hierarchical inheritance (i.e. the viewer
   * is not the original creator). The creator always sees the full row.
   */
  excludeFromInheritance?: boolean;
  conditional?: Record<string, any> | null;
  styling?: Record<string, any> | null;
  fields: FormField[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Form {
  id: string;
  moduleId: string;
  name: string;
  description?: string;
  settings: Record<string, any>;
  sections: FormSection[];
  subforms: Subform[];
  isPublished: boolean;
  publishedAt?: Date | null;
  formUrl?: string | null;
  allowAnonymous: boolean;
  requireLogin: boolean;
  maxSubmissions?: number | null;
  submissionMessage?: string | null;
  conditional?: Record<string, any> | null;
  styling?: Record<string, any> | null;
  isUserForm?: boolean;
  isEmployeeForm?: boolean;
  createdAt: Date;
  updatedAt: Date;
  tableMapping?: Record<string, any> | null;

  // Optional runtime / aggregated fields
  recordCount?: number;
  totalRecords?: number;

  // Field-level FunctionBindings (onFieldChange / onFieldBlur) the client
  // dispatches against the run route. Server-only events (beforeSubmit, etc.)
  // are not shipped here.
  functionBindings?: ClientFunctionBinding[];
}

export interface ClientFunctionBinding {
  id: string;
  functionId: string;
  formId: string | null;
  fieldId: string | null;
  event: "onFieldChange" | "onFieldBlur";
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  condition?: any | null;
  order: number;
  function?: { displayName?: string; name?: string };
}

// NEW: Helper types for nested operations
export interface SubformHierarchy {
  subform: Subform;
  children: SubformHierarchy[];
  depth: number;
}

export interface NestedDropTarget {
  type: "section" | "subform";
  id: string;
  level: number;
  path: string;
}

export interface FormModule {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  settings: Record<string, any>;
  // Hierarchical fields
  parentId?: string | null;
  parent?: FormModule | null;
  children?: FormModule[];
  moduleType: "master" | "child" | "standard";
  level: number;
  path?: string | null;
  isActive: boolean;
  sortOrder: number;
  forms: Form[];
  isPublished?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface FieldValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  message?: string;
  patternMessage?: string;
}

export interface FieldStyling {
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  fontSize?: string;
  fontWeight?: string;
  padding?: string;
  margin?: string;
}

export interface SectionStyling {
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  padding?: string;
  margin?: string;
}

export interface FormStyling {
  backgroundColor?: string;
  textColor?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
}

export interface FieldProperties {
  accept?: string;
  multiple?: boolean;
  rows?: number;
  cols?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface ConditionalLogic {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "greater_than"
    | "less_than";
  value: string;
}

export interface LookupConfig {
  sourceId?: string;
  displayField?: string;
  valueField?: string;
  multiple?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  filters?: Record<string, any>;
}

export interface FormRecord {
  id: string;
  formId: string;
  userId: string;
  status: string;
  form?: Form; // Include complete form structure with sections and fields
  recordData: Record<string, any>;
  employee_id?: string | null;
  amount?: number | null;
  date?: Date | null;
  submittedBy?: string | null;
  submittedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FormEvent {
  id: string;
  formId: string;
  eventType: string;
  payload: Record<string, any>;
  sessionId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FieldType {
  id: string;
  name: string;
  label: string;
  category: string;
  icon: string;
  description: string;
  defaultProps: Record<string, any>;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DraggedItem {
  id: string;
  type: string;
  index?: number;
  sectionId?: string;
  subformId?: string;
}

export interface DragItem {
  id: string;
  type: string;
  fieldType?: string;
  field?: FormField;
  section?: FormSection;
  subform?: Subform;
}

export interface DropResult {
  draggedId: string;
  targetId?: string;
  position: "before" | "after" | "inside";
}

export type FieldWidth = "full" | "half" | "third" | "quarter";

export interface LookupSource {
  id: string;
  name: string;
  type: "static" | "module" | "form" | "api";
  description?: string;
  recordCount?: number;
  icon?: string;
}

export interface LookupOption {
  value: string;
  label: string;
  data?: Record<string, any>;
}

export const ItemTypes = {
  PALETTE_FIELD: "palette_field",
  FIELD: "field",
  SECTION: "section",
  SUBFORM: "subform",
};

// Additional types for hierarchical module management
export interface ModuleHierarchyNode extends FormModule {
  depth: number;
  hasChildren: boolean;
  isExpanded?: boolean;
  childCount: number;
  formCount: number;
  totalRecords: number;
}

export interface ModuleBreadcrumb {
  id: string;
  name: string;
  path: string;
  level: number;
}

export interface ModuleTreeItem {
  module: FormModule;
  children: ModuleTreeItem[];
  expanded: boolean;
}

export interface HierarchicalModuleStats {
  totalModules: number;
  masterModules: number;
  childModules: number;
  standardModules: number;
  maxDepth: number;
  totalForms: number;
  totalRecords: number;
}

// Module management actions
export type ModuleAction =
  | { type: "CREATE_CHILD"; parentId: string; moduleData: Partial<FormModule> }
  | { type: "MOVE_MODULE"; moduleId: string; newParentId?: string }
  | { type: "REORDER_MODULES"; moduleIds: string[]; parentId?: string }
  | { type: "CONVERT_TO_MASTER"; moduleId: string }
  | { type: "CONVERT_TO_CHILD"; moduleId: string; parentId: string }
  | { type: "DELETE_MODULE"; moduleId: string; cascadeChildren?: boolean };

// Enhanced lookup configuration for hierarchical modules
export interface HierarchicalLookupConfig extends LookupConfig {
  includeChildModules?: boolean;
  moduleFilter?: {
    moduleType?: ("master" | "child" | "standard")[];
    level?: number;
    parentId?: string;
  };
}

// Module permissions and access control
export interface ModulePermissions {
  moduleId: string;
  userId?: string;
  roleId?: string;
  permissions: {
    read: boolean;
    write: boolean;
    delete: boolean;
    manageChildren: boolean;
    moveModule: boolean;
  };
  inherited: boolean;
  inheritedFrom?: string;
}

// Module settings specific to hierarchy
export interface HierarchicalModuleSettings {
  allowChildCreation: boolean;
  maxChildDepth?: number;
  childModuleTemplate?: Partial<FormModule>;
  inheritPermissions: boolean;
  cascadeSettings: boolean;
  displayMode: "tree" | "flat" | "breadcrumb";
  sortChildrenBy: "name" | "createdAt" | "sortOrder" | "formCount";
  sortDirection: "asc" | "desc";
}

// Integration types for subforms
export interface SubformIntegration {
  id: string;
  subformId: string;
  type: "webhook" | "database" | "api" | "email" | "sms";
  name: string;
  enabled: boolean;
  config: {
    url?: string;
    method?: "GET" | "POST" | "PUT" | "DELETE";
    headers?: Record<string, string>;
    authentication?: {
      type: "none" | "bearer" | "basic" | "api_key";
      token?: string;
      username?: string;
      password?: string;
      apiKey?: string;
    };
    mapping?: Record<string, string>;
    triggers?: ("create" | "update" | "delete")[];
    conditions?: ConditionalLogic[];
  };
  createdAt: Date;
  updatedAt: Date;
}

// Webhook payload structure
export interface WebhookPayload {
  event: "subform.created" | "subform.updated" | "subform.deleted";
  timestamp: string;
  subform: {
    id: string;
    name: string;
    formId: string;
    data: Record<string, any>;
  };
  fields: FormField[];
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    userId?: string;
  };
}

// API Integration response
export interface APIIntegrationResponse {
  success: boolean;
  data?: any;
  error?: string;
  statusCode: number;
  headers?: Record<string, string>;
}

// Legacy interfaces for backward compatibility
export interface LookupFieldRelation {
  id: string;
  lookupSourceId: string;
  formFieldId: string;
  formId: string;
  moduleId: string;
  displayField?: string;
  valueField?: string;
  multiple?: boolean;
  searchable?: boolean;
  filters: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}