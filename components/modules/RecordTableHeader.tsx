// "use client";

// import React from "react";
// import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
// import { Checkbox } from "@/components/ui/checkbox";
// import { cn } from "@/lib/utils";
// import { SortableColumnHeader } from "./SortableColumnHeader";
// import { getFieldIcon } from "@/lib/utils/fieldUtils";
// import type {
//   FormGroup,
//   FormFieldWithSection,
//   FieldFilter,
// } from "@/types/records";

// interface RecordTableHeaderProps {
//   isMergedMode: boolean;
//   hierarchyGroups: FormGroup[];
//   displayedFields: FormFieldWithSection[];
//   columnWidths: Map<string, number>;
//   selectedRecords: Set<string>;
//   paginatedRecords: { id: string }[];
//   setSelectedRecords: (records: Set<string>) => void;
//   recordSortField: string;
//   recordSortOrder: "asc" | "desc";
//   activeFieldFilters: FieldFilter[];
//   handleResizeStart: (
//     e: React.MouseEvent,
//     fieldId: string,
//     currentWidth: number,
//   ) => void;
//   handleOpenAdvancedFilterForColumn: (fieldId: string) => void;
// }

// export function RecordTableHeader({
//   isMergedMode,
//   hierarchyGroups,
//   displayedFields,
//   columnWidths,
//   selectedRecords,
//   paginatedRecords,
//   setSelectedRecords,
//   recordSortField,
//   recordSortOrder,
//   activeFieldFilters,
//   handleResizeStart,
//   handleOpenAdvancedFilterForColumn,
// }: RecordTableHeaderProps) {
//   const getGroupWidth = (fields: FormFieldWithSection[]) =>
//     fields.reduce((sum, f) => sum + (columnWidths.get(f.id) || 192), 0);

//   return (
//     <>
//       {/* Row 1: Form names (merged mode only) */}
//       {isMergedMode && hierarchyGroups.length > 1 && (
//         <div className="flex bg-gradient-to-r from-indigo-100 via-purple-100 to-indigo-100 border-b-2 border-gray-400 sticky top-0 z-30 min-w-max shadow-sm">
//           <div className="w-10 h-8 border-r border-gray-300 bg-indigo-100 flex-shrink-0" />
//           <div className="w-12 h-8 border-r border-gray-300 bg-indigo-100 flex-shrink-0" />
//           <div className="w-20 sm:w-24 h-8 border-r border-gray-300 bg-indigo-100 flex-shrink-0" />
//           {hierarchyGroups.map((formGroup) => {
//             const formWidth =
//               formGroup.directSections.reduce(
//                 (sum, sec) => sum + getGroupWidth(sec.fields),
//                 0,
//               ) +
//               formGroup.subforms.reduce(
//                 (sum, sf) =>
//                   sum +
//                   sf.sections.reduce((s, sec) => s + getGroupWidth(sec.fields), 0),
//                 0,
//               );
//             return (
//               <div
//                 key={formGroup.id}
//                 className="h-8 bg-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-900 border-r border-gray-300"
//                 style={{ width: `${formWidth}px` }}
//               >
//                 {formGroup.name}
//               </div>
//             );
//           })}
//         </div>
//       )}

//       {/* Row 2: Subform / section group names */}
//       <div
//         className={cn(
//           "flex bg-gradient-to-r from-slate-100 via-gray-100 to-slate-100 border-b-2 border-gray-400 sticky z-20 min-w-max shadow-sm",
//           isMergedMode && hierarchyGroups.length > 1 ? "top-8" : "top-0",
//         )}
//       >
//         <div className="w-10 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center flex-shrink-0">
//           <Checkbox
//             checked={
//               selectedRecords.size === paginatedRecords.length &&
//               paginatedRecords.length > 0
//             }
//             onCheckedChange={(checked) =>
//               setSelectedRecords(
//                 checked
//                   ? new Set(paginatedRecords.map((r) => r.id))
//                   : new Set(),
//               )
//             }
//             className="h-4 w-4"
//           />
//         </div>
//         <div className="w-12 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center text-xs font-bold text-gray-800 flex-shrink-0">
//           #
//         </div>
//         <div className="w-20 sm:w-24 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center text-xs font-bold text-gray-800 flex-shrink-0">
//           Actions
//         </div>
//         {hierarchyGroups.map((formGroup) => (
//           <React.Fragment key={formGroup.id}>
//             {formGroup.directSections.map((sec) => (
//               <div
//                 key={`${formGroup.id}-direct-${sec.id}`}
//                 className="h-10 bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-800 border-r border-gray-300"
//                 style={{ width: `${getGroupWidth(sec.fields)}px` }}
//               >
//                 {sec.title || "Fields"}
//               </div>
//             ))}
//             {formGroup.subforms.map((sf) => {
//               const sfWidth = sf.sections.reduce(
//                 (sum, sec) => sum + getGroupWidth(sec.fields),
//                 0,
//               );
//               return (
//                 <div
//                   key={sf.id}
//                   className="h-10 bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-800 border-r border-gray-300"
//                   style={{ width: `${sfWidth}px` }}
//                 >
//                   {sf.name}
//                 </div>
//               );
//             })}
//           </React.Fragment>
//         ))}
//       </div>

//       {/* Row 3: Field name columns */}
//       <div
//         className={cn(
//           "flex bg-slate-100 border-b border-gray-300 shadow-sm sticky z-10",
//           isMergedMode && hierarchyGroups.length > 1
//             ? "top-[70px]"
//             : "top-[40px]",
//         )}
//       >
//         <div className="w-10 flex-shrink-0" />
//         <div className="w-12 flex-shrink-0" />
//         <div className="w-20 sm:w-24 flex-shrink-0" />

//         <SortableContext
//           items={displayedFields.map((f) => f.id)}
//           strategy={horizontalListSortingStrategy}
//         >
//           {hierarchyGroups.flatMap((formGroup) => [
//             ...formGroup.directSections.flatMap((sec) =>
//               sec.fields.map((field) => (
//                 <SortableColumnHeader
//                   key={field.id}
//                   field={field}
//                   columnWidths={columnWidths}
//                   handleResizeStart={handleResizeStart}
//                   isMergedMode={isMergedMode}
//                   getFieldIcon={getFieldIcon}
//                   recordSortField={recordSortField}
//                   recordSortOrder={recordSortOrder}
//                   activeFieldFilters={activeFieldFilters}
//                   handleOpenAdvancedFilterForColumn={handleOpenAdvancedFilterForColumn}
//                 />
//               )),
//             ),
//             ...formGroup.subforms.flatMap((sf) =>
//               sf.sections.flatMap((sec) =>
//                 sec.fields.map((field) => (
//                   <SortableColumnHeader
//                     key={field.id}
//                     field={field}
//                     columnWidths={columnWidths}
//                     handleResizeStart={handleResizeStart}
//                     isMergedMode={isMergedMode}
//                     getFieldIcon={getFieldIcon}
//                     recordSortField={recordSortField}
//                     recordSortOrder={recordSortOrder}
//                     activeFieldFilters={activeFieldFilters}
//                     handleOpenAdvancedFilterForColumn={handleOpenAdvancedFilterForColumn}
//                   />
//                 )),
//               ),
//             ),
//           ])}
//         </SortableContext>
//       </div>
//     </>
//   );
// }


// "use client";

// import React from "react";
// import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
// import { Checkbox } from "@/components/ui/checkbox";
// import { Button } from "@/components/ui/button";
// import { Trash2 } from "lucide-react";
// import { cn } from "@/lib/utils";
// import { SortableColumnHeader } from "./SortableColumnHeader";
// import { getFieldIcon } from "@/lib/utils/fieldUtils";
// import type {
//   FormGroup,
//   FormFieldWithSection,
//   FieldFilter,
// } from "@/types/records";

// interface RecordTableHeaderProps {
//   isMergedMode: boolean;
//   hierarchyGroups: FormGroup[];
//   displayedFields: FormFieldWithSection[];
//   columnWidths: Map<string, number>;
//   selectedRecords: Set<string>;
//   paginatedRecords: { id: string }[];
//   setSelectedRecords: (records: Set<string>) => void;
//   recordSortField: string;
//   recordSortOrder: "asc" | "desc";
//   activeFieldFilters: FieldFilter[];
//   handleResizeStart: (
//     e: React.MouseEvent,
//     fieldId: string,
//     currentWidth: number,
//   ) => void;
//   handleOpenAdvancedFilterForColumn: (fieldId: string) => void;
//   onDeleteSelected: () => void;   // ← Will delete all selected records
// }

// export function RecordTableHeader({
//   isMergedMode,
//   hierarchyGroups,
//   displayedFields,
//   columnWidths,
//   selectedRecords,
//   paginatedRecords,
//   setSelectedRecords,
//   recordSortField,
//   recordSortOrder,
//   activeFieldFilters,
//   handleResizeStart,
//   handleOpenAdvancedFilterForColumn,
//   onDeleteSelected,
// }: RecordTableHeaderProps) {
//   const getGroupWidth = (fields: FormFieldWithSection[]) =>
//     fields.reduce((sum, f) => sum + (columnWidths.get(f.id) || 192), 0);

//   const hasSelection = selectedRecords.size > 0;

//   return (
//     <>
//       {/* Row 1: Form names (unchanged) */}
//       {isMergedMode && hierarchyGroups.length > 1 && (
//         <div className="flex bg-gradient-to-r from-indigo-100 via-purple-100 to-indigo-100 border-b-2 border-gray-400 sticky top-0 z-30 min-w-max shadow-sm">
//           <div className="w-10 h-8 border-r border-gray-300 bg-indigo-100 flex-shrink-0" />
//           <div className="w-12 h-8 border-r border-gray-300 bg-indigo-100 flex-shrink-0" />
//           <div className="w-20 sm:w-24 h-8 border-r border-gray-300 bg-indigo-100 flex-shrink-0" />
//           {hierarchyGroups.map((formGroup) => {
//             const formWidth =
//               formGroup.directSections.reduce(
//                 (sum, sec) => sum + getGroupWidth(sec.fields),
//                 0,
//               ) +
//               formGroup.subforms.reduce(
//                 (sum, sf) =>
//                   sum +
//                   sf.sections.reduce((s, sec) => s + getGroupWidth(sec.fields), 0),
//                 0,
//               );
//             return (
//               <div
//                 key={formGroup.id}
//                 className="h-8 bg-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-900 border-r border-gray-300"
//                 style={{ width: `${formWidth}px` }}
//               >
//                 {formGroup.name}
//               </div>
//             );
//           })}
//         </div>
//       )}

//       {/* Row 2: Group Headers */}
//       <div
//         className={cn(
//           "flex bg-gradient-to-r from-slate-100 via-gray-100 to-slate-100 border-b-2 border-gray-400 sticky z-20 min-w-max shadow-sm",
//           isMergedMode && hierarchyGroups.length > 1 ? "top-8" : "top-0",
//         )}
//       >
//         {/* Select All + Delete Icon in SAME CELL */}
//         <div className="w-10 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center gap-1 flex-shrink-0">
//           <Checkbox
//             checked={
//               selectedRecords.size === paginatedRecords.length &&
//               paginatedRecords.length > 0
//             }
//             onCheckedChange={(checked) =>
//               setSelectedRecords(
//                 checked
//                   ? new Set(paginatedRecords.map((r) => r.id))
//                   : new Set(),
//               )
//             }
//             className="h-4 w-4"
//           />

//           {/* Small Delete Icon - appears only when something is selected */}
//           {hasSelection && (
//             <Button
//               variant="ghost"
//               size="sm"
//               className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-100"
//               onClick={onDeleteSelected}
//               title={`Delete ${selectedRecords.size} selected record(s)`}
//             >
//               <Trash2 className="h-4 w-4" />
//             </Button>
//           )}
//         </div>

//         {/* Serial Number */}
//         <div className="w-12 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center text-xs font-bold text-gray-800 flex-shrink-0">
//           #
//         </div>

//         {/* Actions Column Header */}
//         <div className="w-20 sm:w-24 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center text-xs font-bold text-gray-800 flex-shrink-0">
//           Actions
//         </div>

//         {/* Rest of the group headers (unchanged) */}
//         {hierarchyGroups.map((formGroup) => (
//           <React.Fragment key={formGroup.id}>
//             {formGroup.directSections.map((sec) => (
//               <div
//                 key={`${formGroup.id}-direct-${sec.id}`}
//                 className="h-10 bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-800 border-r border-gray-300"
//                 style={{ width: `${getGroupWidth(sec.fields)}px` }}
//               >
//                 {sec.title || "Fields"}
//               </div>
//             ))}
//             {formGroup.subforms.map((sf) => {
//               const sfWidth = sf.sections.reduce(
//                 (sum, sec) => sum + getGroupWidth(sec.fields),
//                 0,
//               );
//               return (
//                 <div
//                   key={sf.id}
//                   className="h-10 bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-800 border-r border-gray-300"
//                   style={{ width: `${sfWidth}px` }}
//                 >
//                   {sf.name}
//                 </div>
//               );
//             })}
//           </React.Fragment>
//         ))}
//       </div>

//       {/* Row 3: Field Headers (unchanged) */}
//       <div
//         className={cn(
//           "flex bg-slate-100 border-b border-gray-300 shadow-sm sticky z-10",
//           isMergedMode && hierarchyGroups.length > 1
//             ? "top-[70px]"
//             : "top-[40px]",
//         )}
//       >
//         <div className="w-10 flex-shrink-0" />
//         <div className="w-12 flex-shrink-0" />
//         <div className="w-20 sm:w-24 flex-shrink-0" />

//         <SortableContext
//           items={displayedFields.map((f) => f.id)}
//           strategy={horizontalListSortingStrategy}
//         >
//           {hierarchyGroups.flatMap((formGroup) => [
//             ...formGroup.directSections.flatMap((sec) =>
//               sec.fields.map((field) => (
//                 <SortableColumnHeader
//                   key={field.id}
//                   field={field}
//                   columnWidths={columnWidths}
//                   handleResizeStart={handleResizeStart}
//                   isMergedMode={isMergedMode}
//                   getFieldIcon={getFieldIcon}
//                   recordSortField={recordSortField}
//                   recordSortOrder={recordSortOrder}
//                   activeFieldFilters={activeFieldFilters}
//                   handleOpenAdvancedFilterForColumn={handleOpenAdvancedFilterForColumn}
//                 />
//               )),
//             ),
//             ...formGroup.subforms.flatMap((sf) =>
//               sf.sections.flatMap((sec) =>
//                 sec.fields.map((field) => (
//                   <SortableColumnHeader
//                     key={field.id}
//                     field={field}
//                     columnWidths={columnWidths}
//                     handleResizeStart={handleResizeStart}
//                     isMergedMode={isMergedMode}
//                     getFieldIcon={getFieldIcon}
//                     recordSortField={recordSortField}
//                     recordSortOrder={recordSortOrder}
//                     activeFieldFilters={activeFieldFilters}
//                     handleOpenAdvancedFilterForColumn={handleOpenAdvancedFilterForColumn}
//                   />
//                 )),
//               ),
//             ),
//           ])}
//         </SortableContext>
//       </div>
//     </>
//   );
// }


"use client";

import React from "react";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SortableColumnHeader } from "./SortableColumnHeader";
import { getFieldIcon } from "@/lib/utils/fieldUtils";
import type {
  FormGroup,
  FormFieldWithSection,
  FieldFilter,
} from "@/types/records";

interface RecordTableHeaderProps {
  isMergedMode: boolean;
  hierarchyGroups: FormGroup[];
  displayedFields: FormFieldWithSection[];
  columnWidths: Map<string, number>;
  selectedRecords: Set<string>;
  paginatedRecords: { id: string }[];
  setSelectedRecords: (records: Set<string>) => void;
  recordSortField: string;
  recordSortOrder: "asc" | "desc";
  activeFieldFilters: FieldFilter[];
  handleResizeStart: (
    e: React.MouseEvent,
    fieldId: string,
    currentWidth: number,
  ) => void;
  handleOpenAdvancedFilterForColumn: (fieldId: string) => void;
  onDeleteSelected: () => void;
  canBulkDelete?: boolean;
  onSort?: (fieldId: string) => void;
}

export function RecordTableHeader({
  isMergedMode,
  hierarchyGroups,
  displayedFields,
  columnWidths,
  selectedRecords,
  paginatedRecords,
  setSelectedRecords,
  recordSortField,
  recordSortOrder,
  activeFieldFilters,
  handleResizeStart,
  handleOpenAdvancedFilterForColumn,
  onDeleteSelected,
  canBulkDelete = true,
  onSort,
}: RecordTableHeaderProps) {
  const getGroupWidth = (fields: FormFieldWithSection[]) =>
    fields.reduce((sum, f) => sum + (columnWidths.get(f.id) || 192), 0);

  const hasSelection = selectedRecords.size > 0;

  return (
    <>
      {/* Row 1: Form names (unchanged) */}
      {isMergedMode && hierarchyGroups.length > 1 && (
        <div className="flex bg-gradient-to-r from-indigo-100 via-purple-100 to-indigo-100 border-b-2 border-gray-400 sticky top-0 z-30 min-w-max shadow-sm">
          <div className="w-10 h-8 border-r border-gray-300 bg-indigo-100 flex-shrink-0" />
          <div className="w-12 h-8 border-r border-gray-300 bg-indigo-100 flex-shrink-0" />
          <div className="w-20 sm:w-24 h-8 border-r border-gray-300 bg-indigo-100 flex-shrink-0" />
          {hierarchyGroups.map((formGroup) => {
            const formWidth =
              formGroup.directSections.reduce(
                (sum, sec) => sum + getGroupWidth(sec.fields),
                0,
              ) +
              formGroup.subforms.reduce(
                (sum, sf) =>
                  sum +
                  sf.sections.reduce((s, sec) => s + getGroupWidth(sec.fields), 0),
                0,
              );
            return (
              <div
                key={formGroup.id}
                className="h-8 bg-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-900 border-r border-gray-300"
                style={{ width: `${formWidth}px` }}
              >
                {formGroup.name}
              </div>
            );
          })}
        </div>
      )}

      {/* Row 2: Group Headers */}
      <div
        className={cn(
          "flex bg-gradient-to-r from-slate-100 via-gray-100 to-slate-100 border-b-2 border-gray-400 sticky z-20 min-w-max shadow-sm",
          isMergedMode && hierarchyGroups.length > 1 ? "top-8" : "top-0",
        )}
      >
        {/* Select All + Delete Icon in SAME CELL - Dynamic Width */}
        <div
          className={cn(
            "h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center flex-shrink-0 transition-all duration-200",
            hasSelection ? "w-16" : "w-10"
          )}
        >
          <div className="flex items-center gap-2">
            <Checkbox
              checked={
                selectedRecords.size === paginatedRecords.length &&
                paginatedRecords.length > 0
              }
              onCheckedChange={(checked) =>
                setSelectedRecords(
                  checked
                    ? new Set(paginatedRecords.map((r) => r.id))
                    : new Set(),
                )
              }
              className="h-4 w-4"
            />

            {/* Delete Icon - appears only when something is selected and user has delete permission */}
            {hasSelection && canBulkDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-md"
                onClick={onDeleteSelected}
                title={`Delete ${selectedRecords.size} selected record(s)`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Serial Number */}
        <div className="w-12 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center text-xs font-bold text-gray-800 flex-shrink-0">
          #
        </div>

        {/* Actions Column Header */}
        <div className="w-20 sm:w-24 h-10 border-r border-gray-300 bg-slate-100 flex items-center justify-center text-xs font-bold text-gray-800 flex-shrink-0">
          Actions
        </div>

        {/* Rest of the group headers */}
        {hierarchyGroups.map((formGroup) => (
          <React.Fragment key={formGroup.id}>
            {formGroup.directSections.map((sec) => (
              <div
                key={`${formGroup.id}-direct-${sec.id}`}
                className="h-10 bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-800 border-r border-gray-300"
                style={{ width: `${getGroupWidth(sec.fields)}px` }}
              >
                {sec.title || "Fields"}
              </div>
            ))}
            {formGroup.subforms.map((sf) => {
              const sfWidth = sf.sections.reduce(
                (sum, sec) => sum + getGroupWidth(sec.fields),
                0,
              );
              return (
                <div
                  key={sf.id}
                  className="h-10 bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-800 border-r border-gray-300"
                  style={{ width: `${sfWidth}px` }}
                >
                  {sf.name}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Row 3: Field Headers (unchanged) */}
      <div
        className={cn(
          "flex bg-slate-100 border-b border-gray-300 shadow-sm sticky z-10",
          isMergedMode && hierarchyGroups.length > 1
            ? "top-[70px]"
            : "top-[40px]",
        )}
      >
        <div className="w-10 flex-shrink-0" />
        <div className="w-12 flex-shrink-0" />
        <div className="w-20 sm:w-24 flex-shrink-0" />

        <SortableContext
          items={displayedFields.map((f) => f.id)}
          strategy={horizontalListSortingStrategy}
        >
          {hierarchyGroups.flatMap((formGroup) => [
            ...formGroup.directSections.flatMap((sec) =>
              sec.fields.map((field) => (
                <SortableColumnHeader
                  key={field.id}
                  field={field}
                  columnWidths={columnWidths}
                  handleResizeStart={handleResizeStart}
                  isMergedMode={isMergedMode}
                  getFieldIcon={getFieldIcon}
                  recordSortField={recordSortField}
                  recordSortOrder={recordSortOrder}
                  activeFieldFilters={activeFieldFilters}
                  handleOpenAdvancedFilterForColumn={handleOpenAdvancedFilterForColumn}
                  onSort={onSort}
                />
              )),
            ),
            ...formGroup.subforms.flatMap((sf) =>
              sf.sections.flatMap((sec) =>
                sec.fields.map((field) => (
                  <SortableColumnHeader
                    key={field.id}
                    field={field}
                    columnWidths={columnWidths}
                    handleResizeStart={handleResizeStart}
                    isMergedMode={isMergedMode}
                    getFieldIcon={getFieldIcon}
                    recordSortField={recordSortField}
                    recordSortOrder={recordSortOrder}
                    activeFieldFilters={activeFieldFilters}
                    handleOpenAdvancedFilterForColumn={handleOpenAdvancedFilterForColumn}
                  />
                )),
              ),
            ),
          ])}
        </SortableContext>
      </div>
    </>
  );
}