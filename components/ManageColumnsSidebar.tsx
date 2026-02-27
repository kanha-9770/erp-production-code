// "use client"

// import React from "react"
// import { Button } from "@/components/ui/button"
// import { Checkbox } from "@/components/ui/checkbox"
// import { ScrollArea } from "@/components/ui/scroll-area"
// import { X, GripVertical } from "lucide-react"
// import type { FormFieldWithSection } from "@/types/form-builder"

// interface ManageColumnsSidebarProps {
//   isOpen: boolean
//   onClose: () => void
//   fields: FormFieldWithSection[]
//   visibleFieldIds: Set<string>
//   onToggleField: (fieldId: string) => void
// }

// export default function ManageColumnsSidebar({
//   isOpen,
//   onClose,
//   fields,
//   visibleFieldIds,
//   onToggleField,
// }: ManageColumnsSidebarProps) {
//   if (!isOpen) return null

//   return (
//     <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col">
//       {/* Header */}
//       <div className="flex items-center justify-between p-6 border-b">
//         <div className="flex items-center gap-3">
//           <GripVertical className="h-5 w-5 text-gray-500" />
//           <h2 className="text-xl font-semibold">Manage Columns</h2>
//         </div>
//         <Button variant="ghost" size="icon" onClick={onClose}>
//           <X className="h-5 w-5" />
//         </Button>
//       </div>

//       {/* Search */}
//       <div className="p-4 border-b">
//         <input
//           type="text"
//           placeholder="Search columns..."
//           className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
//         />
//       </div>

//       {/* Scrollable List */}
//       <ScrollArea className="flex-1">
//         <div className="p-4 space-y-2">
//           {fields.map((field) => (
//             <label
//               key={field.id}
//               className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-gray-200"
//             >
//               <Checkbox
//                 checked={visibleFieldIds.has(field.id)}
//                 onCheckedChange={() => onToggleField(field.id)}
//               />
//               <div className="flex-1 min-w-0">
//                 <p className="font-medium text-sm truncate">{field.label}</p>
//                 <div className="flex items-center gap-2 mt-1">
//                   <span className="text-xs text-gray-500 capitalize">{field.type}</span>
//                   <span className="text-xs text-gray-400">•</span>
//                   <span className="text-xs text-gray-500">{field.formName}</span>
//                 </div>
//               </div>
//             </label>
//           ))}
//         </div>
//       </ScrollArea>

//       {/* Footer */}
//       <div className="p-4 border-t bg-gray-50">
//         <div className="flex items-center justify-between text-sm">
//           <span className="text-gray-600">
//             {visibleFieldIds.size} of {fields.length} columns visible
//           </span>
//           <Button
//             variant="outline"
//             size="sm"
//             onClick={() => {
//               const allIds = fields.map(f => f.id)
//               setVisibleColumnIds(new Set(allIds))
//             }}
//           >
//             Show All
//           </Button>
//         </div>
//       </div>
//     </div>
//   )
// }


