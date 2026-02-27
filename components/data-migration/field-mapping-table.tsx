// "use client"

// import { useState } from "react"
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
// import { Badge } from "@/components/ui/badge"
// import { Button } from "@/components/ui/button"
// import {
//   Command,
//   CommandEmpty,
//   CommandGroup,
//   CommandInput,
//   CommandItem,
//   CommandList,
// } from "@/components/ui/command"
// import {
//   Popover,
//   PopoverContent,
//   PopoverTrigger,
// } from "@/components/ui/popover"
// import { Check, ChevronsUpDown } from "lucide-react"
// import { cn } from "@/lib/utils"
// import type { SectionWithFields } from "@/lib/types"

// interface FieldMappingRow {
//   sourceColumn: string
//   targetFieldId: string | null
//   sampleData: string[]
// }

// interface FieldMappingTableProps {
//   sourceColumns: string[]
//   targetSections: SectionWithFields[]
//   mappings: FieldMappingRow[]
//   onMappingChange: (sourceColumn: string, targetFieldId: string | null) => void
//   sampleData: Record<string, string[]>
// }

// export function FieldMappingTable({
//   sourceColumns,
//   targetSections,
//   mappings,
//   onMappingChange,
//   sampleData,
// }: FieldMappingTableProps) {
//   const [filterView, setFilterView] = useState<"all" | "mapped" | "unmapped">("all")

//   const allFields = targetSections.flatMap((section) =>
//     section.fields
//       .filter((f) => f.isImportable)
//       .map((field) => ({
//         ...field,
//         sectionLabel: section.label,
//       }))
//   )

//   const filteredColumns = sourceColumns.filter((column) => {
//     const mapping = mappings.find((m) => m.sourceColumn === column)
//     if (filterView === "all") return true
//     if (filterView === "mapped") return mapping?.targetFieldId !== null
//     if (filterView === "unmapped") return mapping?.targetFieldId === null
//     return true
//   })

//   const mappedCount = mappings.filter((m) => m.targetFieldId !== null).length
//   const unmappedCount = sourceColumns.length - mappedCount

//   return (
//     <div className="space-y-4">
//       <div className="flex items-center gap-2">
//         <button
//           onClick={() => setFilterView("all")}
//           className={cn(
//             "px-4 py-2 text-sm font-medium rounded-md transition-colors",
//             filterView === "all"
//               ? "bg-primary text-primary-foreground"
//               : "bg-muted text-muted-foreground hover:bg-muted/80",
//           )}
//         >
//           All Fields ({sourceColumns.length})
//         </button>
//         <button
//           onClick={() => setFilterView("mapped")}
//           className={cn(
//             "px-4 py-2 text-sm font-medium rounded-md transition-colors",
//             filterView === "mapped"
//               ? "bg-primary text-primary-foreground"
//               : "bg-muted text-muted-foreground hover:bg-muted/80",
//           )}
//         >
//           Mapped Fields ({mappedCount})
//         </button>
//         <button
//           onClick={() => setFilterView("unmapped")}
//           className={cn(
//             "px-4 py-2 text-sm font-medium rounded-md transition-colors",
//             filterView === "unmapped"
//               ? "bg-primary text-primary-foreground"
//               : "bg-muted text-muted-foreground hover:bg-muted/80",
//           )}
//         >
//           Unmapped Fields ({unmappedCount})
//         </button>
//       </div>

//       <div className="border rounded-lg">
//         <Table>
//           <TableHeader>
//             <TableRow className="bg-muted/50">
//               <TableHead className="font-semibold">FIELDS IN FILE</TableHead>
//               <TableHead className="font-semibold">FIELDS IN ZOHO CRM</TableHead>
//               <TableHead className="font-semibold">SAMPLE DATA FROM FILE</TableHead>
//             </TableRow>
//           </TableHeader>
//           <TableBody>
//             {filteredColumns.map((column) => {
//               const mapping = mappings.find((m) => m.sourceColumn === column)
//               const selectedField = allFields.find((f) => f.id === mapping?.targetFieldId)
//               const samples = sampleData[column] || []

//               const [open, setOpen] = useState(false)

//               return (
//                 <TableRow key={column}>
//                   <TableCell className="font-medium">{column}</TableCell>
//                   <TableCell>
//                     <Popover open={open} onOpenChange={setOpen}>
//                       <PopoverTrigger asChild>
//                         <Button
//                           variant="outline"
//                           role="combobox"
//                           aria-expanded={open}
//                           className="w-full justify-between font-normal"
//                         >
//                           <span className="truncate">
//                             {selectedField ? (
//                               <div className="flex items-center gap-2">
//                                 <span>{selectedField.label}</span>
//                                 {selectedField.isRequired && (
//                                   <Badge variant="destructive" className="text-[10px] px-1">
//                                     Required
//                                   </Badge>
//                                 )}
//                               </div>
//                             ) : (
//                               "Select Field To Import..."
//                             )}
//                           </span>
//                           <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
//                         </Button>
//                       </PopoverTrigger>
//                       <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
//                         <Command>
//                           <CommandInput placeholder="Search fields..." autoFocus />
//                           <CommandList>
//                             <CommandEmpty>No field found.</CommandEmpty>

//                             {/* ── Added N/A option at the top ── */}
//                             <CommandGroup>
//                               <CommandItem
//                                 value="none"
//                                 onSelect={() => {
//                                   onMappingChange(column, null)
//                                   setOpen(false)
//                                 }}
//                                 className="text-muted-foreground italic"
//                               >
//                                 <Check
//                                   className={cn(
//                                     "mr-2 h-4 w-4",
//                                     mapping?.targetFieldId === null ? "opacity-100" : "opacity-0"
//                                   )}
//                                 />
//                                 N/A - Do not map this column
//                               </CommandItem>
//                             </CommandGroup>

//                             {/* Original fields grouped by section */}
//                             {targetSections.map((section) => (
//                               <CommandGroup key={section.id} heading={section.label}>
//                                 {section.fields
//                                   .filter((f) => f.isImportable)
//                                   .map((field) => (
//                                     <CommandItem
//                                       key={field.id}
//                                       value={`${field.label}${field.id}${section.label}`}
//                                       onSelect={() => {
//                                         // Toggle: if already selected → unmap (set to null)
//                                         const newValue =
//                                           mapping?.targetFieldId === field.id ? null : field.id
//                                         onMappingChange(column, newValue)
//                                         setOpen(false)
//                                       }}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           mapping?.targetFieldId === field.id
//                                             ? "opacity-100"
//                                             : "opacity-0"
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2">
//                                         <span>{field.label}</span>
//                                         {field.isRequired && (
//                                           <Badge variant="destructive" className="text-[10px] px-1">
//                                             Required
//                                           </Badge>
//                                         )}
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                             ))}
//                           </CommandList>
//                         </Command>
//                       </PopoverContent>
//                     </Popover>

//                     {selectedField && (
//                       <div className="mt-1 text-xs text-muted-foreground">
//                         {selectedField.sectionLabel} • {selectedField.fieldType}
//                       </div>
//                     )}
//                   </TableCell>
//                   <TableCell>
//                     <div className="flex flex-wrap gap-2 max-w-md">
//                       {samples.slice(0, 2).map((sample, idx) => (
//                         <span key={idx} className="text-sm text-muted-foreground truncate max-w-[200px]">
//                           {sample}
//                           {idx < samples.length - 1 && idx < 1 && " "}
//                         </span>
//                       ))}
//                     </div>
//                   </TableCell>
//                 </TableRow>
//               )
//             })}
//           </TableBody>
//         </Table>
//       </div>
//     </div>
//   )
// }


// "use client"

// import { useState } from "react"
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
// import { Badge } from "@/components/ui/badge"
// import { Button } from "@/components/ui/button"
// import {
//   Command,
//   CommandEmpty,
//   CommandGroup,
//   CommandInput,
//   CommandItem,
//   CommandList,
// } from "@/components/ui/command"
// import {
//   Popover,
//   PopoverContent,
//   PopoverTrigger,
// } from "@/components/ui/popover"
// import { Check, ChevronsUpDown, ArrowLeft } from "lucide-react"
// import { cn } from "@/lib/utils"
// import type { SectionWithFields } from "@/lib/types"

// interface FieldMappingRow {
//   sourceColumn: string
//   targetFieldId: string | null
//   sampleData: string[]
// }

// interface FieldMappingTableProps {
//   sourceColumns: string[]
//   targetSections: SectionWithFields[]
//   mappings: FieldMappingRow[]
//   onMappingChange: (sourceColumn: string, targetFieldId: string | null) => void
//   sampleData: Record<string, string[]>
// }

// export function FieldMappingTable({
//   sourceColumns,
//   targetSections,
//   mappings,
//   onMappingChange,
//   sampleData,
// }: FieldMappingTableProps) {
//   const [filterView, setFilterView] = useState<"all" | "mapped" | "unmapped">("all")

//   const allFields = targetSections.flatMap((section) =>
//     section.fields
//       .filter((f) => f.isImportable)
//       .map((field) => ({
//         ...field,
//         sectionLabel: section.label,
//         sectionId: section.id,
//       }))
//   )

//   const filteredColumns = sourceColumns.filter((column) => {
//     const mapping = mappings.find((m) => m.sourceColumn === column)
//     if (filterView === "all") return true
//     if (filterView === "mapped") return mapping?.targetFieldId !== null
//     if (filterView === "unmapped") return mapping?.targetFieldId === null
//     return true
//   })

//   const mappedCount = mappings.filter((m) => m.targetFieldId !== null).length
//   const unmappedCount = sourceColumns.length - mappedCount

//   return (
//     <div className="space-y-4">
//       <div className="flex items-center gap-3 flex-wrap">
//         <button
//           onClick={() => setFilterView("all")}
//           className={cn(
//             "px-4 py-2 text-sm font-medium rounded-md transition-colors",
//             filterView === "all"
//               ? "bg-primary text-primary-foreground shadow-sm"
//               : "bg-muted text-muted-foreground hover:bg-muted/80"
//           )}
//         >
//           All ({sourceColumns.length})
//         </button>
//         <button
//           onClick={() => setFilterView("mapped")}
//           className={cn(
//             "px-4 py-2 text-sm font-medium rounded-md transition-colors",
//             filterView === "mapped"
//               ? "bg-primary text-primary-foreground shadow-sm"
//               : "bg-muted text-muted-foreground hover:bg-muted/80"
//           )}
//         >
//           Mapped ({mappedCount})
//         </button>
//         <button
//           onClick={() => setFilterView("unmapped")}
//           className={cn(
//             "px-4 py-2 text-sm font-medium rounded-md transition-colors",
//             filterView === "unmapped"
//               ? "bg-primary text-primary-foreground shadow-sm"
//               : "bg-muted text-muted-foreground hover:bg-muted/80"
//           )}
//         >
//           Unmapped ({unmappedCount})
//         </button>
//       </div>

//       <div className="border rounded-lg overflow-hidden">
//         <Table>
//           <TableHeader>
//             <TableRow className="bg-muted/60">
//               <TableHead className="font-semibold w-1/4">COLUMN IN YOUR FILE</TableHead>
//               <TableHead className="font-semibold w-2/5">MAP TO ZOHO CRM FIELD</TableHead>
//               <TableHead className="font-semibold">SAMPLE DATA</TableHead>
//             </TableRow>
//           </TableHeader>
//           <TableBody>
//             {filteredColumns.map((column) => {
//               const mapping = mappings.find((m) => m.sourceColumn === column)
//               const selectedField = allFields.find((f) => f.id === mapping?.targetFieldId)

//               // Each row gets its own popover + section selection state
//               const [open, setOpen] = useState(false)
//               const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)

//               return (
//                 <TableRow key={column} className="hover:bg-muted/30">
//                   <TableCell className="font-medium text-gray-800">
//                     {column}
//                   </TableCell>

//                   <TableCell>
//                     <Popover open={open} onOpenChange={(o) => {
//                       setOpen(o)
//                       if (!o) setSelectedSectionId(null) // reset when closing
//                     }}>
//                       <PopoverTrigger asChild>
//                         <Button
//                           variant="outline"
//                           role="combobox"
//                           aria-expanded={open}
//                           className="w-full justify-between h-10 font-normal"
//                         >
//                           {selectedField ? (
//                             <div className="flex items-center gap-2 truncate">
//                               <span className="font-medium">{selectedField.label}</span>
//                               {selectedField.isRequired && (
//                                 <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
//                                   Required
//                                 </Badge>
//                               )}
//                             </div>
//                           ) : (
//                             <span className="text-muted-foreground">Select field to map...</span>
//                           )}
//                           <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
//                         </Button>
//                       </PopoverTrigger>

//                       <PopoverContent 
//                         className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[480px] overflow-hidden flex flex-col"
//                         align="start"
//                       >
//                         <Command shouldFilter={false} className="flex flex-col h-full">
//                           <CommandInput placeholder="Search fields..." className="border-b" />

//                           {selectedSectionId ? (
//                             // ── STEP 2: Fields of selected section ──
//                             <>
//                               <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
//                                 <Button
//                                   variant="ghost"
//                                   size="sm"
//                                   className="h-8 px-2"
//                                   onClick={() => setSelectedSectionId(null)}
//                                 >
//                                   <ArrowLeft className="h-4 w-4 mr-1" />
//                                   Back
//                                 </Button>
//                                 <span className="font-medium text-sm">
//                                   {targetSections.find(s => s.id === selectedSectionId)?.label}
//                                 </span>
//                               </div>

//                               <CommandList className="flex-1 max-h-[360px]">
//                                 <CommandEmpty>No matching fields.</CommandEmpty>
//                                 <CommandGroup>
//                                   {/* N/A option */}
//                                   <CommandItem
//                                     value="none"
//                                     onSelect={() => {
//                                       onMappingChange(column, null)
//                                       setOpen(false)
//                                       setSelectedSectionId(null)
//                                     }}
//                                     className="text-muted-foreground"
//                                   >
//                                     <Check
//                                       className={cn(
//                                         "mr-2 h-4 w-4",
//                                         mapping?.targetFieldId === null ? "opacity-100" : "opacity-0"
//                                       )}
//                                     />
//                                     N/A - Skip this column
//                                   </CommandItem>

//                                   {targetSections
//                                     .find(s => s.id === selectedSectionId)
//                                     ?.fields
//                                     .filter(f => f.isImportable)
//                                     .map((field) => (
//                                       <CommandItem
//                                         key={field.id}
//                                         value={field.id}
//                                         onSelect={() => {
//                                           onMappingChange(column, field.id)
//                                           setOpen(false)
//                                           setSelectedSectionId(null)
//                                         }}
//                                       >
//                                         <Check
//                                           className={cn(
//                                             "mr-2 h-4 w-4",
//                                             mapping?.targetFieldId === field.id ? "opacity-100" : "opacity-0"
//                                           )}
//                                         />
//                                         <div className="flex items-center gap-2">
//                                           <span>{field.label}</span>
//                                           {field.isRequired && (
//                                             <Badge variant="destructive" className="text-[10px]">
//                                               Required
//                                             </Badge>
//                                           )}
//                                         </div>
//                                       </CommandItem>
//                                     ))}
//                                 </CommandGroup>
//                               </CommandList>
//                             </>
//                           ) : (
//                             // ── STEP 1: Select Section ──
//                             <CommandList>
//                               <CommandGroup heading="Select a Section">
//                                 {targetSections.map((section) => {
//                                   const importableCount = section.fields.filter(f => f.isImportable).length
//                                   if (importableCount === 0) return null

//                                   return (
//                                     <CommandItem
//                                       key={section.id}
//                                       value={section.id}
//                                       onSelect={() => setSelectedSectionId(section.id)}
//                                       className="py-3"
//                                     >
//                                       <div className="flex flex-col">
//                                         <span className="font-medium">{section.label}</span>
//                                         <span className="text-xs text-muted-foreground">
//                                           {importableCount} importable fields
//                                         </span>
//                                       </div>
//                                     </CommandItem>
//                                   )
//                                 })}
//                               </CommandGroup>
//                             </CommandList>
//                           )}
//                         </Command>
//                       </PopoverContent>
//                     </Popover>

//                     {selectedField && (
//                       <div className="mt-1.5 text-xs text-muted-foreground">
//                         {selectedField.sectionLabel} • {selectedField.fieldType}
//                       </div>
//                     )}
//                   </TableCell>

//                   <TableCell>
//                     <div className="flex flex-wrap gap-2 max-w-md">
//                       {sampleData[column]?.slice(0, 3).map((sample, idx) => (
//                         <div
//                           key={idx}
//                           className="text-xs bg-muted/60 px-2 py-1 rounded border truncate max-w-[220px]"
//                           title={sample}
//                         >
//                           {sample || <span className="text-muted-foreground italic">empty</span>}
//                         </div>
//                       ))}
//                       {(sampleData[column]?.length ?? 0) > 3 && (
//                         <span className="text-xs text-muted-foreground self-center">
//                           +{(sampleData[column]?.length ?? 0) - 3} more
//                         </span>
//                       )}
//                     </div>
//                   </TableCell>
//                 </TableRow>
//               )
//             })}
//           </TableBody>
//         </Table>
//       </div>
//     </div>
//   )
// }


// "use client"

// import { useState } from "react"
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
// import { Badge } from "@/components/ui/badge"
// import { Button } from "@/components/ui/button"
// import {
//   Command,
//   CommandEmpty,
//   CommandGroup,
//   CommandInput,
//   CommandItem,
//   CommandList,
// } from "@/components/ui/command"
// import {
//   Popover,
//   PopoverContent,
//   PopoverTrigger,
// } from "@/components/ui/popover"
// import { Check, ChevronsUpDown, ArrowLeft } from "lucide-react"
// import { cn } from "@/lib/utils"
// import type { SectionWithFields } from "@/lib/types"

// interface MappingTarget {
//   sectionId: string | null
//   fieldId: string | null
// }

// interface FieldMappingRow {
//   sourceColumn: string
//   target: MappingTarget
//   sampleData: string[]
// }

// interface FieldMappingTableProps {
//   sourceColumns: string[]
//   targetSections: SectionWithFields[]
//   mappings: FieldMappingRow[]
//   onMappingChange: (sourceColumn: string, target: MappingTarget) => void
//   sampleData: Record<string, string[]>
// }

// export function FieldMappingTable({
//   sourceColumns,
//   targetSections,
//   mappings,
//   onMappingChange,
//   sampleData,
// }: FieldMappingTableProps) {
//   const [filterView, setFilterView] = useState<"all" | "mapped" | "unmapped">("all")

//   const allFields = targetSections.flatMap((section) =>
//     section.fields
//       .filter((f) => f.isImportable)
//       .map((field) => ({
//         ...field,
//         sectionLabel: section.label,
//         sectionId: section.id,
//       }))
//   )

//   const filteredColumns = sourceColumns.filter((column) => {
//     const mapping = mappings.find((m) => m.sourceColumn === column)
//     if (filterView === "all") return true
//     if (filterView === "mapped") return !!(mapping?.target.sectionId && mapping?.target.fieldId)
//     if (filterView === "unmapped") return !(mapping?.target.sectionId && mapping?.target.fieldId)
//     return true
//   })

//   const mappedCount = mappings.filter(
//     (m) => m.target.sectionId && m.target.fieldId
//   ).length
//   const unmappedCount = sourceColumns.length - mappedCount

//   return (
//     <div className="space-y-4">
//       <div className="flex items-center gap-3 flex-wrap">
//         <button
//           onClick={() => setFilterView("all")}
//           className={cn(
//             "px-4 py-2 text-sm font-medium rounded-md transition-colors",
//             filterView === "all"
//               ? "bg-primary text-primary-foreground shadow-sm"
//               : "bg-muted text-muted-foreground hover:bg-muted/80"
//           )}
//         >
//           All ({sourceColumns.length})
//         </button>
//         <button
//           onClick={() => setFilterView("mapped")}
//           className={cn(
//             "px-4 py-2 text-sm font-medium rounded-md transition-colors",
//             filterView === "mapped"
//               ? "bg-primary text-primary-foreground shadow-sm"
//               : "bg-muted text-muted-foreground hover:bg-muted/80"
//           )}
//         >
//           Mapped ({mappedCount})
//         </button>
//         <button
//           onClick={() => setFilterView("unmapped")}
//           className={cn(
//             "px-4 py-2 text-sm font-medium rounded-md transition-colors",
//             filterView === "unmapped"
//               ? "bg-primary text-primary-foreground shadow-sm"
//               : "bg-muted text-muted-foreground hover:bg-muted/80"
//           )}
//         >
//           Unmapped ({unmappedCount})
//         </button>
//       </div>

//       <div className="border rounded-lg overflow-hidden">
//         <Table>
//           <TableHeader>
//             <TableRow className="bg-muted/60">
//               <TableHead className="font-semibold w-1/4">COLUMN IN YOUR FILE</TableHead>
//               <TableHead className="font-semibold w-2/5">MAP TO SECTION → FIELD</TableHead>
//               <TableHead className="font-semibold">SAMPLE DATA</TableHead>
//             </TableRow>
//           </TableHeader>
//           <TableBody>
//             {filteredColumns.map((column) => {
//               const mapping = mappings.find((m) => m.sourceColumn === column)
//               const selectedSection = targetSections.find(
//                 (s) => s.id === mapping?.target.sectionId
//               )
//               const selectedField = allFields.find(
//                 (f) => f.id === mapping?.target.fieldId
//               )

//               const [open, setOpen] = useState(false)
//               const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)

//               return (
//                 <TableRow key={column} className="hover:bg-muted/30">
//                   <TableCell className="font-medium text-gray-800">
//                     {column}
//                   </TableCell>

//                   <TableCell>
//                     <Popover
//                       open={open}
//                       onOpenChange={(o) => {
//                         setOpen(o)
//                         if (!o) setSelectedSectionId(null) // reset when closing
//                       }}
//                     >
//                       <PopoverTrigger asChild>
//                         <Button
//                           variant="outline"
//                           role="combobox"
//                           aria-expanded={open}
//                           className="w-full justify-between h-10 font-normal"
//                         >
//                           {selectedSection && selectedField ? (
//                             <div className="flex items-center gap-2 truncate">
//                               <span className="font-medium text-gray-800">
//                                 {selectedSection.label} → {selectedField.label}
//                               </span>
//                               {selectedField.isRequired && (
//                                 <Badge
//                                   variant="destructive"
//                                   className="text-[10px] px-1.5 py-0"
//                                 >
//                                   Required
//                                 </Badge>
//                               )}
//                             </div>
//                           ) : selectedSection ? (
//                             <span className="text-muted-foreground truncate">
//                               Select field in {selectedSection.label}...
//                             </span>
//                           ) : (
//                             <span className="text-muted-foreground">
//                               Select section & field...
//                             </span>
//                           )}
//                           <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
//                         </Button>
//                       </PopoverTrigger>

//                       <PopoverContent
//                         className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[480px] overflow-hidden flex flex-col"
//                         align="start"
//                       >
//                         <Command shouldFilter={false} className="flex flex-col h-full">
//                           <CommandInput placeholder="Search section or field..." className="border-b" />

//                           {selectedSectionId ? (
//                             // ── STEP 2: Fields of selected section ──
//                             <>
//                               <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
//                                 <Button
//                                   variant="ghost"
//                                   size="sm"
//                                   className="h-8 px-2"
//                                   onClick={() => setSelectedSectionId(null)}
//                                 >
//                                   <ArrowLeft className="h-4 w-4 mr-1" />
//                                   Back
//                                 </Button>
//                                 <span className="font-medium text-sm">
//                                   {targetSections.find((s) => s.id === selectedSectionId)?.label}
//                                 </span>
//                               </div>

//                               <CommandList className="flex-1 max-h-[360px]">
//                                 <CommandEmpty>No matching fields.</CommandEmpty>
//                                 <CommandGroup>
//                                   {/* Clear / Skip option */}
//                                   <CommandItem
//                                     value="none"
//                                     onSelect={() => {
//                                       onMappingChange(column, { sectionId: null, fieldId: null })
//                                       setOpen(false)
//                                       setSelectedSectionId(null)
//                                     }}
//                                     className="text-muted-foreground"
//                                   >
//                                     <Check
//                                       className={cn(
//                                         "mr-2 h-4 w-4",
//                                         !mapping?.target.fieldId ? "opacity-100" : "opacity-0"
//                                       )}
//                                     />
//                                     N/A - Skip this column
//                                   </CommandItem>

//                                   {targetSections
//                                     .find((s) => s.id === selectedSectionId)
//                                     ?.fields.filter((f) => f.isImportable)
//                                     .map((field) => (
//                                       <CommandItem
//                                         key={field.id}
//                                         value={field.id}
//                                         onSelect={() => {
//                                           onMappingChange(column, {
//                                             sectionId: selectedSectionId,
//                                             fieldId: field.id,
//                                           })
//                                           setOpen(false)
//                                           setSelectedSectionId(null)
//                                         }}
//                                       >
//                                         <Check
//                                           className={cn(
//                                             "mr-2 h-4 w-4",
//                                             mapping?.target.fieldId === field.id
//                                               ? "opacity-100"
//                                               : "opacity-0"
//                                           )}
//                                         />
//                                         <div className="flex items-center gap-2">
//                                           <span>{field.label}</span>
//                                           {field.isRequired && (
//                                             <Badge variant="destructive" className="text-[10px]">
//                                               Required
//                                             </Badge>
//                                           )}
//                                         </div>
//                                       </CommandItem>
//                                     ))}
//                                 </CommandGroup>
//                               </CommandList>
//                             </>
//                           ) : (
//                             // ── STEP 1: Select Section ──
//                             <CommandList>
//                               <CommandGroup heading="Select a Section">
//                                 {targetSections.map((section) => {
//                                   const importableCount = section.fields.filter(
//                                     (f) => f.isImportable
//                                   ).length
//                                   if (importableCount === 0) return null

//                                   return (
//                                     <CommandItem
//                                       key={section.id}
//                                       value={section.id}
//                                       onSelect={() => setSelectedSectionId(section.id)}
//                                       className="py-3"
//                                     >
//                                       <div className="flex flex-col">
//                                         <span className="font-medium">{section.label}</span>
//                                         <span className="text-xs text-muted-foreground">
//                                           {importableCount} importable fields
//                                         </span>
//                                       </div>
//                                     </CommandItem>
//                                   )
//                                 })}
//                               </CommandGroup>
//                             </CommandList>
//                           )}
//                         </Command>
//                       </PopoverContent>
//                     </Popover>

//                     {selectedField && (
//                       <div className="mt-1.5 text-xs text-muted-foreground">
//                         {selectedField.sectionLabel} • {selectedField.fieldType}
//                       </div>
//                     )}
//                   </TableCell>

//                   <TableCell>
//                     <div className="flex flex-wrap gap-2 max-w-md">
//                       {sampleData[column]?.slice(0, 3).map((sample, idx) => (
//                         <div
//                           key={idx}
//                           className="text-xs bg-muted/60 px-2 py-1 rounded border truncate max-w-[220px]"
//                           title={sample}
//                         >
//                           {sample || <span className="text-muted-foreground italic">empty</span>}
//                         </div>
//                       ))}
//                       {(sampleData[column]?.length ?? 0) > 3 && (
//                         <span className="text-xs text-muted-foreground self-center">
//                           +{(sampleData[column]?.length ?? 0) - 3} more
//                         </span>
//                       )}
//                     </div>
//                   </TableCell>
//                 </TableRow>
//               )
//             })}
//           </TableBody>
//         </Table>
//       </div>
//     </div>
//   )
// }

"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Check, ChevronsUpDown, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SectionWithFields } from "@/lib/types"
import React from "react"

// ── Types ────────────────────────────────────────────────────────────────

interface MappingTarget {
  sectionId: string | null
  fieldId: string | null
}

interface FieldMappingRow {
  sourceColumn: string
  target: MappingTarget
  sampleData: string[]
}

interface SourceColumnGroup {
  sectionTitle: string          // e.g. "PRODUCT IDENTIFICATION DETAILS"
  columns: string[]             // columns that belong to this section
}

interface FieldMappingTableProps {
  sourceColumns: string[]
  sourceColumnGroups?: SourceColumnGroup[]   // ← NEW: optional grouped structure
  targetSections: SectionWithFields[]
  mappings: FieldMappingRow[]
  onMappingChange: (sourceColumn: string, target: MappingTarget) => void
  sampleData: Record<string, string[]>
}

// ── Component ────────────────────────────────────────────────────────────

export function FieldMappingTable({
  sourceColumns,
  sourceColumnGroups = [],
  targetSections,
  mappings,
  onMappingChange,
  sampleData,
}: FieldMappingTableProps) {
  const [filterView, setFilterView] = useState<"all" | "mapped" | "unmapped">("all")

  // All available target fields (flattened)
  const allFields = targetSections.flatMap((section) =>
    section.fields
      .filter((f) => f.isImportable)
      .map((field) => ({
        ...field,
        sectionLabel: section.label,
        sectionId: section.id,
      }))
  )

  // Decide what to display: grouped or flat
  const displayGroups: SourceColumnGroup[] =
    sourceColumnGroups.length > 0
      ? sourceColumnGroups
      : [{ sectionTitle: "All Columns", columns: sourceColumns }]

  // Flat list for counting & filtering
  const flatColumns = displayGroups.flatMap((g) => g.columns)

  const filteredGroups = displayGroups.map((group) => ({
    ...group,
    columns: group.columns.filter((column) => {
      const mapping = mappings.find((m) => m.sourceColumn === column)
      if (filterView === "all") return true
      if (filterView === "mapped")
        return !!(mapping?.target.sectionId && mapping?.target.fieldId)
      if (filterView === "unmapped")
        return !(mapping?.target.sectionId && mapping?.target.fieldId)
      return true
    }),
  })).filter((group) => group.columns.length > 0) // remove empty groups

  const mappedCount = mappings.filter(
    (m) => m.target.sectionId && m.target.fieldId
  ).length

  const totalColumns = flatColumns.length

  return (
    <div className="space-y-6">
      {/* Filter controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setFilterView("all")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            filterView === "all"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          All ({totalColumns})
        </button>
        <button
          onClick={() => setFilterView("mapped")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            filterView === "mapped"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          Mapped ({mappedCount})
        </button>
        <button
          onClick={() => setFilterView("unmapped")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            filterView === "unmapped"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          Unmapped ({totalColumns - mappedCount})
        </button>
      </div>

      {/* Main Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60">
              <TableHead className="font-semibold w-1/4">COLUMN IN YOUR FILE</TableHead>
              <TableHead className="font-semibold w-2/5">MAP TO SECTION → FIELD</TableHead>
              <TableHead className="font-semibold">SAMPLE DATA</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredGroups.map((group, groupIndex) => (
              <React.Fragment key={`group-${groupIndex}`}>
                {/* Section Header Row */}
                <TableRow className="bg-gradient-to-r from-muted/80 to-muted/50 hover:bg-muted/80">
                  <TableCell
                    colSpan={3}
                    className="font-bold text-base py-3 px-6 border-b"
                  >
                    {group.sectionTitle}
                    <span className="ml-3 text-sm font-normal text-muted-foreground">
                      ({group.columns.length} columns)
                    </span>
                  </TableCell>
                </TableRow>

                {/* Columns under this section */}
                {group.columns.map((column) => {
                  const mapping = mappings.find((m) => m.sourceColumn === column)

                  const selectedSection = targetSections.find(
                    (s) => s.id === mapping?.target.sectionId
                  )
                  const selectedField = allFields.find(
                    (f) => f.id === mapping?.target.fieldId
                  )

                  const [open, setOpen] = useState(false)
                  const [tempSectionId, setTempSectionId] = useState<string | null>(null)

                  const isMapped = !!mapping?.target.sectionId && !!mapping?.target.fieldId

                  return (
                    <TableRow key={column} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-gray-800 pl-10">
                        {column}
                      </TableCell>

                      <TableCell>
                        <Popover
                          open={open}
                          onOpenChange={(o) => {
                            setOpen(o)
                            if (!o) setTempSectionId(null)
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={open}
                              className={cn(
                                "w-full justify-between h-10 font-normal transition-colors",
                                isMapped && "border-green-400 bg-green-50/30 hover:bg-green-50/60"
                              )}
                            >
                              {isMapped ? (
                                <div className="flex items-center gap-2 truncate min-w-0">
                                  <span className="font-medium text-gray-900 truncate">
                                    {selectedSection?.label || "—"} → {selectedField?.label || "—"}
                                  </span>
                                  {selectedField?.isRequired && (
                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
                                      Required
                                    </Badge>
                                  )}
                                </div>
                              ) : tempSectionId ? (
                                <span className="text-muted-foreground truncate">
                                  Select field in {targetSections.find(s => s.id === tempSectionId)?.label || "section"}...
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic">
                                  Select section & field...
                                </span>
                              )}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>

                          <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[480px] overflow-hidden flex flex-col"
                            align="start"
                          >
                            <Command shouldFilter={false} className="flex flex-col h-full">
                              <CommandInput placeholder="Search section or field..." className="border-b" />

                              {tempSectionId ? (
                                <>
                                  <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2"
                                      onClick={() => setTempSectionId(null)}
                                    >
                                      <ArrowLeft className="h-4 w-4 mr-1" />
                                      Back
                                    </Button>
                                    <span className="font-medium text-sm truncate">
                                      {targetSections.find((s) => s.id === tempSectionId)?.label || "Section"}
                                    </span>
                                  </div>

                                  <CommandList className="flex-1 max-h-[360px]">
                                    <CommandEmpty>No matching fields found.</CommandEmpty>
                                    <CommandGroup>
                                      <CommandItem
                                        value="clear"
                                        onSelect={() => {
                                          onMappingChange(column, { sectionId: null, fieldId: null })
                                          setOpen(false)
                                          setTempSectionId(null)
                                        }}
                                        className="text-muted-foreground"
                                      >
                                        <Check
                                          className={cn("mr-2 h-4 w-4", !isMapped ? "opacity-100" : "opacity-0")}
                                        />
                                        Clear / Skip this column
                                      </CommandItem>

                                      {targetSections
                                        .find((s) => s.id === tempSectionId)
                                        ?.fields?.filter((f) => f.isImportable)
                                        ?.map((field) => (
                                          <CommandItem
                                            key={field.id}
                                            value={field.id}
                                            onSelect={() => {
                                              onMappingChange(column, {
                                                sectionId: tempSectionId,
                                                fieldId: field.id,
                                              })
                                              setOpen(false)
                                              setTempSectionId(null)
                                            }}
                                          >
                                            <Check
                                              className={cn(
                                                "mr-2 h-4 w-4",
                                                mapping?.target.fieldId === field.id ? "opacity-100" : "opacity-0"
                                              )}
                                            />
                                            <div className="flex items-center gap-2 truncate">
                                              <span className="truncate">{field.label}</span>
                                              {field.isRequired && (
                                                <Badge variant="destructive" className="text-[10px] shrink-0">
                                                  Required
                                                </Badge>
                                              )}
                                            </div>
                                          </CommandItem>
                                        ))}
                                    </CommandGroup>
                                  </CommandList>
                                </>
                              ) : (
                                <CommandList>
                                  <CommandGroup heading="Select a Section">
                                    {targetSections.length === 0 ? (
                                      <CommandItem disabled className="text-muted-foreground py-3">
                                        No sections available
                                      </CommandItem>
                                    ) : (
                                      targetSections.map((section) => {
                                        const count = section.fields?.filter(f => f.isImportable)?.length ?? 0
                                        if (count === 0) return null

                                        return (
                                          <CommandItem
                                            key={section.id}
                                            value={section.id}
                                            onSelect={() => setTempSectionId(section.id)}
                                            className="py-3"
                                          >
                                            <div className="flex flex-col">
                                              <span className="font-medium">{section.label}</span>
                                              <span className="text-xs text-muted-foreground">
                                                {count} importable fields
                                              </span>
                                            </div>
                                          </CommandItem>
                                        )
                                      })
                                    )}
                                  </CommandGroup>
                                </CommandList>
                              )}
                            </Command>
                          </PopoverContent>
                        </Popover>

                        {isMapped && selectedField && (
                          <div className="mt-1.5 text-xs text-muted-foreground flex flex-wrap gap-1">
                            <span>{selectedField.sectionLabel}</span>
                            <span>•</span>
                            <span>{selectedField.fieldType || "Text"}</span>
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap gap-2 max-w-md">
                          {sampleData[column]?.slice(0, 3).map((sample, idx) => (
                            <div
                              key={idx}
                              className="text-xs bg-muted/60 px-2 py-1 rounded border truncate max-w-[220px]"
                              title={sample || ""}
                            >
                              {sample || <span className="text-muted-foreground italic">empty</span>}
                            </div>
                          ))}
                          {(sampleData[column]?.length ?? 0) > 3 && (
                            <span className="text-xs text-muted-foreground self-center">
                              +{(sampleData[column]?.length ?? 0) - 3} more
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}