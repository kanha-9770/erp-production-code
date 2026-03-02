// "use client"
// import { useState, useEffect } from "react"
// import { Button } from "@/components/ui/button"
// import { Input } from "@/components/ui/input"
// import { Label } from "@/components/ui/label"
// import { Textarea } from "@/components/ui/textarea"
// import { Switch } from "@/components/ui/switch"
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
// import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
// import { Badge } from "@/components/ui/badge"
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
// import { Separator } from "@/components/ui/separator"
// import { ScrollArea } from "@/components/ui/scroll-area"
// import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
// import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
// import { Check, ChevronsUpDown, Settings, X, Plus, Database, FileText, Zap, Info, Loader2, Save, Hash } from "lucide-react"
// import { cn } from "@/lib/utils"
// import { useToast } from "@/hooks/use-toast"
// import type { FormField, FieldOption } from "@/types/form-builder"

// interface FieldSettingsProps {
//   field: FormField
//   open: boolean
//   onOpenChange: (open: boolean) => void
//   onUpdate: (updates: Partial<FormField>) => void
// }

// export default function FieldSettings({ field, open, onOpenChange, onUpdate }: FieldSettingsProps) {
//   const { toast } = useToast()
//   const [localField, setLocalField] = useState<FormField>(field)
//   const [lookupSources, setLookupSources] = useState<any[]>([])
//   const [loadingSources, setLoadingSources] = useState(false)
//   const [sourceOpen, setSourceOpen] = useState(false)
//   const [availableFields, setAvailableFields] = useState<string[]>([])
//   const [loadingFields, setLoadingFields] = useState(false)
//   const [hasChanges, setHasChanges] = useState(false)
//   const [saving, setSaving] = useState(false)

//   // Load lookup sources when component mounts or field type changes to lookup
//   useEffect(() => {
//     if (localField.type === "lookup") {
//       loadLookupSources()
//     }
//   }, [localField.type])

//   // Load available fields when source changes
//   useEffect(() => {
//     if (localField.lookup?.sourceId) {
//       loadAvailableFields(localField.lookup.sourceId)
//     }
//   }, [localField.lookup?.sourceId])

//   // Reset local field when field prop changes
//   useEffect(() => {
//     setLocalField(field)
//     setHasChanges(false)
//   }, [field])

//   const loadLookupSources = async () => {
//     setLoadingSources(true)
//     try {
//       const response = await fetch("/api/lookup/sources")
//       if (response.ok) {
//         const result = await response.json()
//         if (result.success) {
//           setLookupSources(result.data || [])
//         }
//       }
//     } catch (error) {
//       console.error("Error loading lookup sources:", error)
//       toast({
//         title: "Error",
//         description: "Failed to load lookup sources",
//         variant: "destructive",
//       })
//     } finally {
//       setLoadingSources(false)
//     }
//   }

//   const loadAvailableFields = async (sourceId: string) => {
//     setLoadingFields(true)
//     try {
//       const response = await fetch(`/api/lookup/fields?sourceId=${sourceId}`)
//       if (response.ok) {
//         const result = await response.json()
//         if (result.success) {
//           setAvailableFields(result.data || [])
//         }
//       }
//     } catch (error) {
//       console.error("Error loading available fields:", error)
//       // Fallback to common fields
//       setAvailableFields(["id", "name", "title", "label", "description", "email"])
//     } finally {
//       setLoadingFields(false)
//     }
//   }

//   const handleFieldUpdate = (updates: Partial<FormField>) => {
//     const updatedField = { ...localField, ...updates }
//     setLocalField(updatedField)
//     setHasChanges(true)
//   }

//   const handleValidationChange = (key: string, value: any) => {
//     const newValidation = { ...localField.validation, [key]: value }
//     handleFieldUpdate({ validation: newValidation })
//   }

//   const handlePropertiesChange = (key: string, value: any) => {
//     const newProperties = { ...localField.properties, [key]: value }
//     handleFieldUpdate({ properties: newProperties })
//   }

//   const handleLookupChange = (key: string, value: any) => {
//     const currentLookup = localField.lookup || {}
//     const newLookup = { ...currentLookup, [key]: value }
//     handleFieldUpdate({ lookup: newLookup })
//   }

//   const handleFieldMappingUpdate = (mappingKey: string, value: string) => {
//     const currentLookup = localField.lookup || {}
//     const currentMapping = currentLookup.fieldMapping || {
//       display: "name",
//       value: "id",
//       store: "name",
//     }
//     const newLookup = {
//       ...currentLookup,
//       fieldMapping: {
//         ...currentMapping,
//         [mappingKey]: value,
//       },
//     }
//     handleFieldUpdate({ lookup: newLookup })
//   }

//   const handleSourceSelect = (sourceId: string) => {
//     const source = lookupSources.find((s) => s.id === sourceId)
//     // Reset field mapping when source changes with proper structure
//     const newLookup = {
//       sourceId: sourceId,
//       sourceType: source?.type as "form" | "module" | "static",
//       multiple: localField.lookup?.multiple || false,
//       searchable: localField.lookup?.searchable !== false,
//       fieldMapping: {
//         display: "name",
//         value: "id",
//         store: "name",
//         description: "description",
//       },
//     }
//     handleFieldUpdate({ lookup: newLookup })
//     setSourceOpen(false)
//   }

//   const handleSave = async () => {
//     setSaving(true)
//     try {
//       // Apply all changes to the field
//       onUpdate(localField)
//       setHasChanges(false)
//       onOpenChange(false)
//       toast({
//         title: "Success",
//         description: "Field settings saved successfully",
//       })
//     } catch (error) {
//       toast({
//         title: "Error",
//         description: "Failed to save field settings",
//         variant: "destructive",
//       })
//     } finally {
//       setSaving(false)
//     }
//   }

//   const handleClose = () => {
//     if (hasChanges) {
//       const confirmClose = window.confirm("You have unsaved changes. Are you sure you want to close?")
//       if (!confirmClose) return
//     }
//     onOpenChange(false)
//   }

//   const addOption = () => {
//     const newOption: FieldOption = {
//       id: `opt_${Date.now()}`,
//       label: "New Option",
//       value: `option_${(localField.options || []).length + 1}`,
//       order: (localField.options || []).length,
//     }
//     handleFieldUpdate({ options: [...(localField.options || []), newOption] })
//   }

//   const updateOption = (index: number, updates: Partial<FieldOption>) => {
//     const newOptions = [...(localField.options || [])]
//     newOptions[index] = { ...newOptions[index], ...updates }
//     handleFieldUpdate({ options: newOptions })
//   }

//   const removeOption = (index: number) => {
//     const newOptions = (localField.options || []).filter((_, i) => i !== index)
//     handleFieldUpdate({ options: newOptions })
//   }

//   const getSourceIcon = (type: string) => {
//     switch (type) {
//       case "form":
//         return <FileText className="h-4 w-4" />
//       case "module":
//         return <Database className="h-4 w-4" />
//       case "static":
//         return <Zap className="h-4 w-4" />
//       default:
//         return <Database className="h-4 w-4" />
//     }
//   }

//   const getSourceTypeLabel = (type: string) => {
//     switch (type) {
//       case "form":
//         return "Form"
//       case "module":
//         return "Module"
//       case "static":
//         return "Built-in"
//       default:
//         return "Unknown"
//     }
//   }

//   const selectedSource = lookupSources.find((source) => source.id === localField.lookup?.sourceId)

//   // Helper to detect location field
//   const isLocationField = ["location", "newlocation"].includes(localField.type ?? "")

//   // Fields that support regex pattern validation
//   const supportsPattern = ["text", "textarea", "email", "url", "tel", "password", "number"].includes(
//     localField.type ?? ""
//   )

//   return (
//     <Dialog open={open} onOpenChange={handleClose}>
//       <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2">
//             <Settings className="h-5 w-5" />
//             Field Settings - {localField.label}
//             {hasChanges && <Badge variant="secondary">Unsaved Changes</Badge>}
//           </DialogTitle>
//         </DialogHeader>

//         <Tabs defaultValue="general" className="flex-1 overflow-hidden">
//           <TabsList className="grid w-full grid-cols-4">
//             <TabsTrigger value="general">General</TabsTrigger>
//             <TabsTrigger value="validation">Validation</TabsTrigger>
//             <TabsTrigger value="options">Options</TabsTrigger>
//             <TabsTrigger value="advanced">Advanced</TabsTrigger>
//           </TabsList>

//           <ScrollArea className="h-[350px] mt-4 border rounded-lg">
//             <TabsContent value="general" className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Basic Information</CardTitle>
//                   <CardDescription>Configure the basic properties of your field</CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                   <div className="grid grid-cols-2 gap-4">
//                     <div className="space-y-2">
//                       <Label htmlFor="label">Label</Label>
//                       <Input
//                         id="label"
//                         value={localField.label}
//                         onChange={(e) => handleFieldUpdate({ label: e.target.value })}
//                         placeholder="Field label"
//                       />
//                     </div>
//                     <div className="space-y-2">
//                       <Label htmlFor="placeholder">Placeholder</Label>
//                       <Input
//                         id="placeholder"
//                         value={localField.placeholder || ""}
//                         onChange={(e) => handleFieldUpdate({ placeholder: e.target.value })}
//                         placeholder="Placeholder text"
//                       />
//                     </div>
//                   </div>
//                   <div className="space-y-2">
//                     <Label htmlFor="description">Description</Label>
//                     <Textarea
//                       id="description"
//                       value={localField.description || ""}
//                       onChange={(e) => handleFieldUpdate({ description: e.target.value })}
//                       placeholder="Field description or help text"
//                       rows={3}
//                     />
//                   </div>
//                   <div className="grid grid-cols-2 gap-4">
//                     <div className="space-y-2">
//                       <Label htmlFor="width">Width</Label>
//                       <Select
//                         value={localField.width}
//                         onValueChange={(value: "full" | "half" | "third" | "quarter") =>
//                           handleFieldUpdate({ width: value })
//                         }
//                       >
//                         <SelectTrigger>
//                           <SelectValue />
//                         </SelectTrigger>
//                         <SelectContent>
//                           <SelectItem value="full">Full Width</SelectItem>
//                           <SelectItem value="half">Half Width</SelectItem>
//                           <SelectItem value="third">Third Width</SelectItem>
//                           <SelectItem value="quarter">Quarter Width</SelectItem>
//                         </SelectContent>
//                       </Select>
//                     </div>
//                     <div className="space-y-2">
//                       <Label htmlFor="defaultValue">Default Value</Label>
//                       <Input
//                         id="defaultValue"
//                         value={localField.defaultValue || ""}
//                         onChange={(e) => handleFieldUpdate({ defaultValue: e.target.value })}
//                         placeholder="Default value"
//                       />
//                     </div>
//                   </div>
//                   <div className="flex items-center justify-between">
//                     <div className="space-y-0.5">
//                       <Label>Visible</Label>
//                       <p className="text-sm text-muted-foreground">Show this field in the form</p>
//                     </div>
//                     <Switch
//                       checked={localField.visible}
//                       onCheckedChange={(checked) => handleFieldUpdate({ visible: checked })}
//                     />
//                   </div>
//                   <div className="flex items-center justify-between">
//                     <div className="space-y-0.5">
//                       <Label>Read Only</Label>
//                       <p className="text-sm text-muted-foreground">Make this field read-only</p>
//                     </div>
//                     <Switch
//                       checked={localField.readonly}
//                       onCheckedChange={(checked) => handleFieldUpdate({ readonly: checked })}
//                     />
//                   </div>

//                   {/* Auto-fetch toggles */}
//                   {localField.type === "date" && (
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Auto-fetch Current Date</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Automatically set the current date as the default value
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.autoFetchDate || false}
//                         onCheckedChange={(checked) => handlePropertiesChange("autoFetchDate", checked)}
//                       />
//                     </div>
//                   )}

//                   {localField.type === "time" && (
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Auto-fetch Current Time</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Automatically set the current time as the default value
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.autoFetchTime || false}
//                         onCheckedChange={(checked) => handlePropertiesChange("autoFetchTime", checked)}
//                       />
//                     </div>
//                   )}

//                   {isLocationField && (
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Auto-fetch Current Location</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Automatically fill the user’s GPS location (address + coordinates)
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.autoFetchLocation || false}
//                         onCheckedChange={(checked) => handlePropertiesChange("autoFetchLocation", checked)}
//                       />
//                     </div>
//                   )}
//                 </CardContent>
//               </Card>

//               {/* Enhanced Lookup Configuration */}
//               {localField.type === "lookup" && (
//                 <Card>
//                   <CardHeader>
//                     <CardTitle>Lookup Configuration</CardTitle>
//                     <CardDescription>Configure the data source and field mapping for this lookup field</CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-6">
//                     {/* Data Source Selection */}
//                     <div className="space-y-2">
//                       <Label>Data Source</Label>
//                       <Popover open={sourceOpen} onOpenChange={setSourceOpen}>
//                         <PopoverTrigger asChild>
//                           <Button
//                             variant="outline"
//                             role="combobox"
//                             aria-expanded={sourceOpen}
//                             className="w-full justify-between bg-transparent"
//                             disabled={loadingSources}
//                           >
//                             {selectedSource ? (
//                               <div className="flex items-center gap-2">
//                                 {getSourceIcon(selectedSource.type)}
//                                 <span>{selectedSource.name}</span>
//                                 <Badge variant="secondary" className="ml-auto">
//                                   {getSourceTypeLabel(selectedSource.type)}
//                                 </Badge>
//                               </div>
//                             ) : (
//                               "Select data source..."
//                             )}
//                             <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
//                           </Button>
//                         </PopoverTrigger>
//                         <PopoverContent className="w-full p-0" align="start">
//                           <Command>
//                             <CommandInput placeholder="Search data sources..." />
//                             <CommandList>
//                               <CommandEmpty>No data sources found.</CommandEmpty>
//                               {/* Group by type */}
//                               <CommandGroup heading="Forms">
//                                 {lookupSources
//                                   .filter((source) => source.type === "form")
//                                   .map((source) => (
//                                     <CommandItem
//                                       key={source.id}
//                                       value={source.id}
//                                       onSelect={() => handleSourceSelect(source.id)}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2 flex-1">
//                                         <FileText className="h-4 w-4" />
//                                         <div className="flex flex-col">
//                                           <span className="font-medium">{source.name}</span>
//                                           <span className="text-xs text-muted-foreground">{source.description}</span>
//                                         </div>
//                                         <Badge variant="outline" className="ml-auto">
//                                           {source.recordCount} records
//                                         </Badge>
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                               <CommandGroup heading="Modules">
//                                 {lookupSources
//                                   .filter((source) => source.type === "module")
//                                   .map((source) => (
//                                     <CommandItem
//                                       key={source.id}
//                                       value={source.id}
//                                       onSelect={() => handleSourceSelect(source.id)}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2 flex-1">
//                                         <Database className="h-4 w-4" />
//                                         <div className="flex flex-col">
//                                           <span className="font-medium">{source.name}</span>
//                                           <span className="text-xs text-muted-foreground">{source.description}</span>
//                                         </div>
//                                         <Badge variant="outline" className="ml-auto">
//                                           {source.recordCount} records
//                                         </Badge>
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                               <CommandGroup heading="Built-in Sources">
//                                 {lookupSources
//                                   .filter((source) => source.type === "static")
//                                   .map((source) => (
//                                     <CommandItem
//                                       key={source.id}
//                                       value={source.id}
//                                       onSelect={() => handleSourceSelect(source.id)}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2 flex-1">
//                                         <Zap className="h-4 w-4" />
//                                         <div className="flex flex-col">
//                                           <span className="font-medium">{source.name}</span>
//                                           <span className="text-xs text-muted-foreground">{source.description}</span>
//                                         </div>
//                                         <Badge variant="outline" className="ml-auto">
//                                           {source.recordCount} items
//                                         </Badge>
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                             </CommandList>
//                           </Command>
//                         </PopoverContent>
//                       </Popover>
//                     </div>

//                     {/* Field Mapping Configuration */}
//                     {selectedSource && (
//                       <>
//                         <Separator />
//                         <div className="space-y-4">
//                           <div className="flex items-center gap-2">
//                             <Settings className="h-4 w-4" />
//                             <Label className="text-base font-medium">Field Mapping Configuration</Label>
//                             <Info className="h-4 w-4 text-muted-foreground" />
//                           </div>
//                           <p className="text-sm text-muted-foreground">
//                             Configure which fields from the source data to use for display, value, and storage
//                           </p>
//                           {loadingFields ? (
//                             <div className="flex items-center justify-center py-4">
//                               <Loader2 className="h-4 w-4 animate-spin mr-2" />
//                               <span className="text-sm">Loading available fields...</span>
//                             </div>
//                           ) : (
//                             <div className="grid grid-cols-2 gap-4">
//                               {/* Display Field */}
//                               <div className="space-y-2">
//                                 <Label htmlFor="displayField" className="flex items-center gap-2">
//                                   Display Field
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.display || "name"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("display", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select display field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">Field to show in dropdown options</p>
//                               </div>
//                               {/* Value Field */}
//                               <div className="space-y-2">
//                                 <Label htmlFor="valueField" className="flex items-center gap-2">
//                                   Value Field
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.value || "id"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("value", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select value field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">Field to use as internal option value</p>
//                               </div>
//                               {/* Store Field */}
//                               <div className="space-y-2">
//                                 <Label htmlFor="storeField" className="flex items-center gap-2">
//                                   Store Field
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.store || "name"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("store", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select store field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">
//                                   Field value to actually store in record (instead of ID)
//                                 </p>
//                               </div>
//                               {/* Description Field */}
//                               <div className="space-y-2">
//                                 <Label htmlFor="descriptionField" className="flex items-center gap-2">
//                                   Description Field (Optional)
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.description || "description"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("description", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select description field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     <SelectItem value="none">None</SelectItem>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">
//                                   Optional field to show as description under each option
//                                 </p>
//                               </div>
//                             </div>
//                           )}
//                         </div>
//                         <Separator />
//                       </>
//                     )}
//                     {/* Lookup Behavior Settings */}
//                     <div className="space-y-4">
//                       <div className="flex items-center justify-between">
//                         <div className="space-y-0.5">
//                           <Label>Multiple Selection</Label>
//                           <p className="text-sm text-muted-foreground">Allow selecting multiple values</p>
//                         </div>
//                         <Switch
//                           checked={localField.lookup?.multiple || false}
//                           onCheckedChange={(checked) => handleLookupChange("multiple", checked)}
//                         />
//                       </div>
//                       <div className="flex items-center justify-between">
//                         <div className="space-y-0.5">
//                           <Label>Searchable</Label>
//                           <p className="text-sm text-muted-foreground">Enable search functionality</p>
//                         </div>
//                         <Switch
//                           checked={localField.lookup?.searchable !== false}
//                           onCheckedChange={(checked) => handleLookupChange("searchable", checked)}
//                         />
//                       </div>
//                       <div className="space-y-2">
//                         <Label htmlFor="searchPlaceholder">Search Placeholder</Label>
//                         <Input
//                           id="searchPlaceholder"
//                           value={localField.lookup?.searchPlaceholder || ""}
//                           onChange={(e) => handleLookupChange("searchPlaceholder", e.target.value)}
//                           placeholder="Search..."
//                         />
//                       </div>
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </TabsContent>

//             <TabsContent value="validation" className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Validation Rules</CardTitle>
//                   <CardDescription>
//                     {supportsPattern
//                       ? "Configure required, length/range, pattern and custom error message"
//                       : "Set basic validation rules for this field"}
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-5">
//                   {/* Required toggle - always shown */}
//                   <div className="flex items-center justify-between">
//                     <div className="space-y-0.5">
//                       <Label>Required</Label>
//                       <p className="text-sm text-muted-foreground">This field must be filled</p>
//                     </div>
//                     <Switch
//                       checked={localField.validation?.required || false}
//                       onCheckedChange={(checked) => handleValidationChange("required", checked)}
//                     />
//                   </div>

//                   {/* Min/Max length for text-like fields */}
//                   {["text", "textarea", "email", "url", "tel", "password"].includes(localField.type ?? "") && (
//                     <div className="grid grid-cols-2 gap-4">
//                       <div className="space-y-2">
//                         <Label htmlFor="minLength">Minimum Length</Label>
//                         <Input
//                           id="minLength"
//                           type="number"
//                           value={localField.validation?.minLength || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "minLength",
//                               e.target.value ? Number.parseInt(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="0"
//                         />
//                       </div>
//                       <div className="space-y-2">
//                         <Label htmlFor="maxLength">Maximum Length</Label>
//                         <Input
//                           id="maxLength"
//                           type="number"
//                           value={localField.validation?.maxLength || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "maxLength",
//                               e.target.value ? Number.parseInt(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="100"
//                         />
//                       </div>
//                     </div>
//                   )}

//                   {/* Min/Max value for number fields */}
//                   {localField.type === "number" && (
//                     <div className="grid grid-cols-2 gap-4">
//                       <div className="space-y-2">
//                         <Label htmlFor="min">Minimum Value</Label>
//                         <Input
//                           id="min"
//                           type="number"
//                           value={localField.validation?.min || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "min",
//                               e.target.value ? Number.parseFloat(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="0"
//                         />
//                       </div>
//                       <div className="space-y-2">
//                         <Label htmlFor="max">Maximum Value</Label>
//                         <Input
//                           id="max"
//                           type="number"
//                           value={localField.validation?.max || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "max",
//                               e.target.value ? Number.parseFloat(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="100"
//                         />
//                       </div>
//                     </div>
//                   )}

//                   {/* Pattern (Regex) - shown for supported field types including number */}
//                   {supportsPattern && (
//                     <div className="space-y-2">
//                       <Label htmlFor="pattern">Pattern (Regex)</Label>
//                       <Input
//                         id="pattern"
//                         value={localField.validation?.pattern || ""}
//                         onChange={(e) => handleValidationChange("pattern", e.target.value)}
//                         placeholder={
//                           localField.type === "number"
//                             ? "^\\d{6}$ (exactly 6 digits)"
//                             : localField.type === "tel"
//                               ? "^[6-9]\\d{9}$ (Indian mobile)"
//                               : localField.type === "email"
//                                 ? "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
//                                 : "^[a-zA-Z0-9]+$ (alphanumeric only)"
//                         }
//                         className="font-mono"
//                       />
//                       <p className="text-xs text-muted-foreground">
//                         {localField.type === "number"
//                           ? "Useful for exact digit count, no decimals, or specific number formats (leave empty to disable)"
//                           : "Regular expression for custom validation (leave empty to disable)"}
//                       </p>
//                     </div>
//                   )}

//                   {/* Custom error message */}
//                   <div className="space-y-2">
//                     <Label htmlFor="message">Custom Error Message</Label>
//                     <Input
//                       id="message"
//                       value={localField.validation?.message || ""}
//                       onChange={(e) => handleValidationChange("message", e.target.value)}
//                       placeholder="This field is invalid"
//                     />
//                   </div>
//                 </CardContent>
//               </Card>
//             </TabsContent>

//             <TabsContent value="options" className="space-y-6">
//               {(localField.type === "select" || localField.type === "radio" || localField.type === "multiselect") && (
//                 <Card>
//                   <CardHeader>
//                     <CardTitle>Field Options</CardTitle>
//                     <CardDescription>Configure the available options for this field</CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-4">
//                     <div className="space-y-3">
//                       {(localField.options || []).map((option, index) => (
//                         <div key={option.id} className="flex items-center gap-2 p-3 border rounded-lg">
//                           <div className="flex-1 grid grid-cols-2 gap-2">
//                             <Input
//                               value={option.label}
//                               onChange={(e) => updateOption(index, { label: e.target.value })}
//                               placeholder="Option label"
//                             />
//                             <Input
//                               value={option.value}
//                               onChange={(e) => updateOption(index, { value: e.target.value })}
//                               placeholder="Option value"
//                             />
//                           </div>
//                           <Button
//                             variant="outline"
//                             size="sm"
//                             onClick={() => removeOption(index)}
//                             className="text-red-600 hover:text-red-700"
//                           >
//                             <X className="h-4 w-4" />
//                           </Button>
//                         </div>
//                       ))}
//                     </div>
//                     <Button onClick={addOption} variant="outline" className="w-full bg-transparent">
//                       <Plus className="h-4 w-4 mr-2" />
//                       Add Option
//                     </Button>
//                   </CardContent>
//                 </Card>
//               )}
//               {localField.type === "file" && (
//                 <Card>
//                   <CardHeader>
//                     <CardTitle>File Upload Settings</CardTitle>
//                     <CardDescription>Configure file upload restrictions</CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-4">
//                     <div className="space-y-2">
//                       <Label htmlFor="accept">Accepted File Types</Label>
//                       <Input
//                         id="accept"
//                         value={localField.properties?.accept || ""}
//                         onChange={(e) => handlePropertiesChange("accept", e.target.value)}
//                         placeholder=".jpg,.png,.pdf"
//                       />
//                     </div>
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Multiple Files</Label>
//                         <p className="text-sm text-muted-foreground">Allow multiple file uploads</p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.multiple || false}
//                         onCheckedChange={(checked) => handlePropertiesChange("multiple", checked)}
//                       />
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </TabsContent>

//             <TabsContent value="advanced" className="space-y-6">
//               {/* Existing Advanced Settings */}
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Advanced Settings</CardTitle>
//                   <CardDescription>Advanced configuration options</CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                   <div className="space-y-2">
//                     <Label htmlFor="formula">Formula</Label>
//                     <Textarea
//                       id="formula"
//                       value={localField.formula || ""}
//                       onChange={(e) => handleFieldUpdate({ formula: e.target.value })}
//                       placeholder="Enter formula (e.g., field1 + field2)"
//                       rows={3}
//                     />
//                   </div>
//                   <Separator />
//                   <div className="space-y-2">
//                     <Label>Field Properties (JSON)</Label>
//                     <Textarea
//                       value={JSON.stringify(localField.properties || {}, null, 2)}
//                       onChange={(e) => {
//                         try {
//                           const properties = JSON.parse(e.target.value)
//                           handleFieldUpdate({ properties })
//                         } catch (error) {
//                           // Invalid JSON, ignore
//                         }
//                       }}
//                       placeholder="{}"
//                       rows={5}
//                       className="font-mono text-sm"
//                     />
//                   </div>
//                 </CardContent>
//               </Card>

//               {/* ── UNIQUE ID SETTINGS ─────────────────────────────────────────────── */}
//               {localField.type === "unique-id" && (
//                 <Card className="border-2 border-blue-200 bg-blue-50/30">
//                   <CardHeader className="pb-4">
//                     <CardTitle className="flex items-center gap-2">
//                       <Hash className="h-5 w-5 text-blue-600" />
//                       Unique ID Generation Settings
//                     </CardTitle>
//                     <CardDescription>
//                       Choose how unique identifiers should be generated for this field
//                     </CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-6">
//                     {/* Generation Method */}
//                     <div className="space-y-2">
//                       <Label>Generation Method</Label>
//                       <Select
//                         value={localField.properties?.uniqueIdMode || "uuid"}
//                         onValueChange={(value) => handlePropertiesChange("uniqueIdMode", value)}
//                       >
//                         <SelectTrigger>
//                           <SelectValue placeholder="Select generation method" />
//                         </SelectTrigger>
//                         <SelectContent>
//                           <SelectItem value="uuid">UUID v4 (recommended - 36 characters)</SelectItem>
//                           <SelectItem value="sequential">Sequential Number (1, 2, 3...)</SelectItem>
//                           <SelectItem value="prefix">Custom Prefix + Number</SelectItem>
//                         </SelectContent>
//                       </Select>
//                       <p className="text-xs text-muted-foreground mt-1">
//                         {localField.properties?.uniqueIdMode === "uuid" &&
//                           "Generates a random 36-character UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)"}
//                         {localField.properties?.uniqueIdMode === "sequential" &&
//                           "Increments a number for each new record"}
//                         {localField.properties?.uniqueIdMode === "prefix" &&
//                           "Adds your custom prefix before a sequential number"}
//                       </p>
//                     </div>

//                     {/* Prefix - shown only when prefix mode is selected */}
//                     {localField.properties?.uniqueIdMode === "prefix" && (
//                       <div className="space-y-2">
//                         <Label htmlFor="prefix">Custom Prefix</Label>
//                         <Input
//                           id="prefix"
//                           value={localField.properties?.uniqueIdPrefix || ""}
//                           onChange={(e) => handlePropertiesChange("uniqueIdPrefix", e.target.value)}
//                           placeholder="INV-, ORDER-, TICKET-"
//                           maxLength={10}
//                         />
//                         <p className="text-xs text-muted-foreground">
//                           Example: "INV-" → INV-000001, INV-000002...
//                         </p>
//                       </div>
//                     )}

//                     {/* Start number / padding - for sequential & prefix modes */}
//                     {(localField.properties?.uniqueIdMode === "sequential" ||
//                       localField.properties?.uniqueIdMode === "prefix") && (
//                         <>
//                           <div className="grid grid-cols-2 gap-4">
//                             <div className="space-y-2">
//                               <Label htmlFor="startNumber">Start From</Label>
//                               <Input
//                                 id="startNumber"
//                                 type="number"
//                                 min="1"
//                                 value={localField.properties?.uniqueIdStart || "1"}
//                                 onChange={(e) =>
//                                   handlePropertiesChange("uniqueIdStart", Number(e.target.value) || 1)
//                                 }
//                               />
//                             </div>
//                             <div className="space-y-2">
//                               <Label htmlFor="minDigits">Minimum Digits (zero padding)</Label>
//                               <Input
//                                 id="minDigits"
//                                 type="number"
//                                 min="1"
//                                 max="10"
//                                 value={localField.properties?.uniqueIdMinDigits || "6"}
//                                 onChange={(e) =>
//                                   handlePropertiesChange("uniqueIdMinDigits", Number(e.target.value) || 6)
//                                 }
//                               />
//                               <p className="text-xs text-muted-foreground">
//                                 Example: 6 digits → 000001, 000042
//                               </p>
//                             </div>
//                           </div>
//                         </>
//                       )}

//                     {/* Common settings for all modes */}
//                     <div className="flex items-center justify-between pt-4 border-t">
//                       <div className="space-y-0.5">
//                         <Label>Hidden Field</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Hide this field from users (still generated automatically)
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.hidden ?? true} // hidden by default
//                         onCheckedChange={(checked) => handlePropertiesChange("hidden", checked)}
//                       />
//                     </div>

//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Read Only</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Prevent manual editing of the generated ID
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.readonly !== false}
//                         onCheckedChange={(checked) => handleFieldUpdate({ readonly: checked })}
//                       />
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </TabsContent>
//           </ScrollArea>
//         </Tabs>

//         <div className="flex justify-between items-center gap-2 pt-4 border-t">
//           <div className="text-sm text-muted-foreground">{hasChanges && "You have unsaved changes"}</div>
//           <div className="flex gap-2">
//             <Button variant="outline" onClick={handleClose}>
//               Cancel
//             </Button>
//             <Button onClick={handleSave} disabled={saving || !hasChanges}>
//               {saving ? (
//                 <>
//                   <Loader2 className="h-4 w-4 mr-2 animate-spin" />
//                   Saving...
//                 </>
//               ) : (
//                 <>
//                   <Save className="h-4 w-4 mr-2" />
//                   Save Changes
//                 </>
//               )}
//             </Button>
//           </div>
//         </div>
//       </DialogContent>
//     </Dialog>
//   )
// }



// "use client"

// import { useState, useEffect } from "react"
// import { Button } from "@/components/ui/button"
// import { Input } from "@/components/ui/input"
// import { Label } from "@/components/ui/label"
// import { Textarea } from "@/components/ui/textarea"
// import { Switch } from "@/components/ui/switch"
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select"
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog"
// import { Badge } from "@/components/ui/badge"
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card"
// import { Separator } from "@/components/ui/separator"
// import { ScrollArea } from "@/components/ui/scroll-area"
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
// import {
//   Check,
//   ChevronsUpDown,
//   Settings,
//   X,
//   Plus,
//   Database,
//   FileText,
//   Zap,
//   Info,
//   Loader2,
//   Save,
//   Hash,
// } from "lucide-react"
// import { cn } from "@/lib/utils"
// import { useToast } from "@/hooks/use-toast"
// import type { FormField, FieldOption } from "@/types/form-builder"

// // ────────────────────────────────────────────────────────────────
// //  IMPORTANT: ADD THESE TYPES TO YOUR types/form-builder.ts FILE
// // ────────────────────────────────────────────────────────────────

// export interface DependentOptionGroup {
//   parentValue: string           // e.g. "Rajasthan", "Gujarat"
//   options: FieldOption[]        // child options shown when parent matches
// }

// // You should extend your existing FormField interface like this:

// // export interface FormField {
// //   id: string
// //   type: string
// //   label: string
// //   placeholder?: string
// //   description?: string
// //   defaultValue?: string
// //   visible?: boolean
// //   readonly?: boolean
// //   width?: "full" | "half" | "third" | "quarter"
// //   options?: FieldOption[]
// //   properties?: Record<string, any>
// //   validation?: {
// //     required?: boolean
// //     minLength?: number
// //     maxLength?: number
// //     min?: number
// //     max?: number
// //     pattern?: string
// //     message?: string
// //   }
// //   formula?: string
// //   lookup?: any
// //   // ── NEW properties for dependent / cascading dropdowns ──
// //   isDependent?: boolean
// //   parentFieldId?: string
// //   dependentGroups?: DependentOptionGroup[]
// // }

// // ────────────────────────────────────────────────────────────────
// //  DEPENDENT OPTIONS EDITOR SUB-COMPONENT
// // ────────────────────────────────────────────────────────────────

// interface DependentOptionsEditorProps {
//   field: FormField
//   allFormFields: FormField[]
//   onUpdate: (updates: Partial<FormField>) => void
// }

// function DependentOptionsEditor({
//   field,
//   allFormFields = [],
//   onUpdate,
// }: DependentOptionsEditorProps) {
//   const possibleParents = allFormFields.filter(
//   (f) =>
//     ["select", "multi-select", "radio"].includes(f.type || "") &&   // ← these are the real types
//     f.id !== field.id
// )
//     console.log("this is the field id", field.type)
//     console.log("All fields collected:", allFormFields.map(f => f.type));

//   const addGroup = () => {
//     const newGroup: DependentOptionGroup = {
//       parentValue: "",
//       options: [
//         {
//           id: `opt_${Date.now()}`,
//           label: "New Option",
//           value: `val_${Date.now()}`,
//           order: 0,
//         },
//       ],
//     }
//     onUpdate({
//       dependentGroups: [...(field.dependentGroups || []), newGroup],
//     })
//   }

//   const updateGroup = (groupIndex: number, updates: Partial<DependentOptionGroup>) => {
//     const groups = [...(field.dependentGroups || [])]
//     groups[groupIndex] = { ...groups[groupIndex], ...updates }
//     onUpdate({ dependentGroups: groups })
//   }

//   const removeGroup = (groupIndex: number) => {
//     const groups = (field.dependentGroups || []).filter((_, i) => i !== groupIndex)
//     onUpdate({ dependentGroups: groups })
//   }

//   const addChildOption = (groupIndex: number) => {
//     const group = field.dependentGroups?.[groupIndex]
//     if (!group) return

//     const newOption: FieldOption = {
//       id: `opt_${Date.now()}`,
//       label: "New Child Option",
//       value: `child_${group.options.length + 1}`,
//       order: group.options.length,
//     }

//     const newOptions = [...group.options, newOption]
//     updateGroup(groupIndex, { options: newOptions })
//   }

//   const updateChildOption = (
//     groupIndex: number,
//     optionIndex: number,
//     updates: Partial<FieldOption>
//   ) => {
//     const group = field.dependentGroups?.[groupIndex]
//     if (!group) return

//     const newOptions = [...group.options]
//     newOptions[optionIndex] = { ...newOptions[optionIndex], ...updates }
//     updateGroup(groupIndex, { options: newOptions })
//   }

//   const removeChildOption = (groupIndex: number, optionIndex: number) => {
//     const group = field.dependentGroups?.[groupIndex]
//     if (!group) return

//     const newOptions = group.options.filter((_, i) => i !== optionIndex)
//     updateGroup(groupIndex, { options: newOptions })
//   }

//   return (
//     <div className="space-y-6">
//       <div className="space-y-2">
//         <Label>Parent Field (controls this dropdown)</Label>
//         <Select
//           value={field.parentFieldId || ""}
//           onValueChange={(value) => onUpdate({ parentFieldId: value })}
//         >
//           <SelectTrigger>
//             <SelectValue placeholder="Select which field controls the options" />
//           </SelectTrigger>
//           <SelectContent>
//   {possibleParents.map((parent) => (
//     <SelectItem key={parent.id} value={parent.id}>
//       {parent.label} ({parent.type})
//     </SelectItem>
//   ))}

//   {possibleParents.length === 0 && (
//     <div className="px-2 py-1.5 text-sm text-muted-foreground pointer-events-none">
//       No other dropdown, radio or multi-select fields found yet.
//       <br />
//       Add one first, then come back to set dependency.
//     </div>
//   )}
// </SelectContent>
//         </Select>
//         <p className="text-xs text-muted-foreground">
//           This field will show different options depending on what is selected in the parent field.
//         </p>
//       </div>

//       <div className="space-y-4">
//         {(field.dependentGroups || []).map((group, groupIndex) => (
//           <Card key={groupIndex} className="p-4 border border-gray-200">
//             <div className="flex items-start justify-between mb-4">
//               <div className="flex-1 space-y-1.5">
//                 <Label>When parent value is</Label>
//                 <Input
//                   value={group.parentValue}
//                   onChange={(e) =>
//                     updateGroup(groupIndex, { parentValue: e.target.value })
//                   }
//                   placeholder="e.g. Rajasthan, Gujarat, Maharashtra"
//                 />
//               </div>
//               <Button
//                 variant="ghost"
//                 size="icon"
//                 className="text-red-600 hover:text-red-700 hover:bg-red-50"
//                 onClick={() => removeGroup(groupIndex)}
//               >
//                 <X className="h-5 w-5" />
//               </Button>
//             </div>

//             <div className="space-y-3 pl-4 border-l-2 border-gray-200">
//               <p className="text-sm font-medium text-gray-700">
//                 Options shown when the above value is selected:
//               </p>

//               {group.options.map((option, optIndex) => (
//                 <div key={option.id} className="flex items-center gap-2">
//                   <Input
//                     value={option.label}
//                     onChange={(e) =>
//                       updateChildOption(groupIndex, optIndex, { label: e.target.value })
//                     }
//                     placeholder="e.g. Jaipur, Jodhpur, Udaipur"
//                     className="flex-1"
//                   />
//                   <Input
//                     value={option.value}
//                     onChange={(e) =>
//                       updateChildOption(groupIndex, optIndex, { value: e.target.value })
//                     }
//                     placeholder="e.g. jaipur, jodhpur"
//                     className="w-44"
//                   />
//                   <Button
//                     variant="ghost"
//                     size="icon"
//                     className="text-red-600 hover:text-red-700 hover:bg-red-50"
//                     onClick={() => removeChildOption(groupIndex, optIndex)}
//                   >
//                     <X className="h-4 w-4" />
//                   </Button>
//                 </div>
//               ))}

//               <Button
//                 variant="outline"
//                 size="sm"
//                 className="mt-2 w-full"
//                 onClick={() => addChildOption(groupIndex)}
//               >
//                 <Plus className="h-4 w-4 mr-2" />
//                 Add child option
//               </Button>
//             </div>
//           </Card>
//         ))}
//       </div>

//       <Button onClick={addGroup} variant="outline" className="w-full">
//         <Plus className="h-4 w-4 mr-2" />
//         Add New Group (for another parent value)
//       </Button>

//       <div className="p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
//         <strong>Example usage:</strong><br />
//         Parent field = "State"<br />
//         Group 1: parentValue = "Rajasthan" → options: Jaipur, Jodhpur, Udaipur, Kota<br />
//         Group 2: parentValue = "Gujarat"   → options: Ahmedabad, Surat, Vadodara, Rajkot
//       </div>
//     </div>
//   )
// }

// // ────────────────────────────────────────────────────────────────
// //  MAIN FIELD SETTINGS COMPONENT
// // ────────────────────────────────────────────────────────────────

// interface FieldSettingsProps {
//   field: FormField
//   open: boolean
//   onOpenChange: (open: boolean) => void
//   onUpdate: (updates: Partial<FormField>) => void
//   allFormFields?: FormField[]           // ← NEW: required for parent field selection
// }

// export default function FieldSettings({
//   field,
//   open,
//   onOpenChange,
//   onUpdate,
//   allFormFields,
// }: FieldSettingsProps) {
//   const { toast } = useToast()
//   const [localField, setLocalField] = useState<FormField>(field)
//   const [lookupSources, setLookupSources] = useState<any[]>([])
//   const [loadingSources, setLoadingSources] = useState(false)
//   const [sourceOpen, setSourceOpen] = useState(false)
//   const [availableFields, setAvailableFields] = useState<string[]>([])
//   const [loadingFields, setLoadingFields] = useState(false)
//   const [hasChanges, setHasChanges] = useState(false)
//   const [saving, setSaving] = useState(false)

//   useEffect(() => {
//     setLocalField(field)
//     setHasChanges(false)
//   }, [field])

//   useEffect(() => {
//     if (localField.type === "lookup") {
//       loadLookupSources()
//     }
//   }, [localField.type])

//   useEffect(() => {
//     if (localField.lookup?.sourceId) {
//       loadAvailableFields(localField.lookup.sourceId)
//     }
//   }, [localField.lookup?.sourceId])

//   const loadLookupSources = async () => {
//     setLoadingSources(true)
//     try {
//       const response = await fetch("/api/lookup/sources")
//       if (response.ok) {
//         const result = await response.json()
//         if (result.success) {
//           setLookupSources(result.data || [])
//         }
//       }
//     } catch (error) {
//       console.error("Error loading lookup sources:", error)
//       toast({
//         title: "Error",
//         description: "Failed to load lookup sources",
//         variant: "destructive",
//       })
//     } finally {
//       setLoadingSources(false)
//     }
//   }

//   const loadAvailableFields = async (sourceId: string) => {
//     setLoadingFields(true)
//     try {
//       const response = await fetch(`/api/lookup/fields?sourceId=${sourceId}`)
//       if (response.ok) {
//         const result = await response.json()
//         if (result.success) {
//           setAvailableFields(result.data || [])
//         }
//       }
//     } catch (error) {
//       console.error("Error loading available fields:", error)
//       setAvailableFields(["id", "name", "title", "label", "description", "email"])
//     } finally {
//       setLoadingFields(false)
//     }
//   }

//   const handleFieldUpdate = (updates: Partial<FormField>) => {
//     const updatedField = { ...localField, ...updates }
//     setLocalField(updatedField)
//     setHasChanges(true)
//   }

//   const handleValidationChange = (key: string, value: any) => {
//     const newValidation = { ...localField.validation, [key]: value }
//     handleFieldUpdate({ validation: newValidation })
//   }

//   const handlePropertiesChange = (key: string, value: any) => {
//     const newProperties = { ...localField.properties, [key]: value }
//     handleFieldUpdate({ properties: newProperties })
//   }

//   const handleLookupChange = (key: string, value: any) => {
//     const currentLookup = localField.lookup || {}
//     const newLookup = { ...currentLookup, [key]: value }
//     handleFieldUpdate({ lookup: newLookup })
//   }

//   const handleFieldMappingUpdate = (mappingKey: string, value: string) => {
//     const currentLookup = localField.lookup || {}
//     const currentMapping = currentLookup.fieldMapping || {
//       display: "name",
//       value: "id",
//       store: "name",
//     }
//     const newLookup = {
//       ...currentLookup,
//       fieldMapping: {
//         ...currentMapping,
//         [mappingKey]: value,
//       },
//     }
//     handleFieldUpdate({ lookup: newLookup })
//   }

//   const handleSourceSelect = (sourceId: string) => {
//     const source = lookupSources.find((s) => s.id === sourceId)
//     const newLookup = {
//       sourceId: sourceId,
//       sourceType: source?.type as "form" | "module" | "static",
//       multiple: localField.lookup?.multiple || false,
//       searchable: localField.lookup?.searchable !== false,
//       fieldMapping: {
//         display: "name",
//         value: "id",
//         store: "name",
//         description: "description",
//       },
//     }
//     handleFieldUpdate({ lookup: newLookup })
//     setSourceOpen(false)
//   }

//   const handleSave = async () => {
//     setSaving(true)
//     try {
//       onUpdate(localField)
//       setHasChanges(false)
//       onOpenChange(false)
//       toast({
//         title: "Success",
//         description: "Field settings saved successfully",
//       })
//     } catch (error) {
//       toast({
//         title: "Error",
//         description: "Failed to save field settings",
//         variant: "destructive",
//       })
//     } finally {
//       setSaving(false)
//     }
//   }

//   const handleClose = () => {
//     if (hasChanges) {
//       const confirmClose = window.confirm("You have unsaved changes. Are you sure you want to close?")
//       if (!confirmClose) return
//     }
//     onOpenChange(false)
//   }

//   const addOption = () => {
//     const newOption: FieldOption = {
//       id: `opt_${Date.now()}`,
//       label: "New Option",
//       value: `option_${(localField.options || []).length + 1}`,
//       order: (localField.options || []).length,
//     }
//     handleFieldUpdate({ options: [...(localField.options || []), newOption] })
//   }

//   const updateOption = (index: number, updates: Partial<FieldOption>) => {
//     const newOptions = [...(localField.options || [])]
//     newOptions[index] = { ...newOptions[index], ...updates }
//     handleFieldUpdate({ options: newOptions })
//   }

//   const removeOption = (index: number) => {
//     const newOptions = (localField.options || []).filter((_, i) => i !== index)
//     handleFieldUpdate({ options: newOptions })
//   }

//   const getSourceIcon = (type: string) => {
//     switch (type) {
//       case "form":
//         return <FileText className="h-4 w-4" />
//       case "module":
//         return <Database className="h-4 w-4" />
//       case "static":
//         return <Zap className="h-4 w-4" />
//       default:
//         return <Database className="h-4 w-4" />
//     }
//   }

//   const getSourceTypeLabel = (type: string) => {
//     switch (type) {
//       case "form":
//         return "Form"
//       case "module":
//         return "Module"
//       case "static":
//         return "Built-in"
//       default:
//         return "Unknown"
//     }
//   }

//   const selectedSource = lookupSources.find((source) => source.id === localField.lookup?.sourceId)

//   const isLocationField = ["location", "newlocation"].includes(localField.type ?? "")

//   const supportsPattern = ["text", "textarea", "email", "url", "tel", "password", "number"].includes(
//     localField.type ?? ""
//   )

//   return (
//     <Dialog open={open} onOpenChange={handleClose}>
//       <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2">
//             <Settings className="h-5 w-5" />
//             Field Settings - {localField.label || "Unnamed"}
//             {hasChanges && <Badge variant="secondary">Unsaved Changes</Badge>}
//           </DialogTitle>
//         </DialogHeader>

//         <Tabs defaultValue="general" className="flex-1 overflow-hidden">
//           <TabsList className="grid w-full grid-cols-4">
//             <TabsTrigger value="general">General</TabsTrigger>
//             <TabsTrigger value="validation">Validation</TabsTrigger>
//             <TabsTrigger value="options">Options</TabsTrigger>
//             <TabsTrigger value="advanced">Advanced</TabsTrigger>
//           </TabsList>

//           <ScrollArea className="h-[350px] mt-4 border rounded-lg">
//             <TabsContent value="general" className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Basic Information</CardTitle>
//                   <CardDescription>Configure the basic properties of your field</CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                   <div className="grid grid-cols-2 gap-4">
//                     <div className="space-y-2">
//                       <Label htmlFor="label">Label</Label>
//                       <Input
//                         id="label"
//                         value={localField.label}
//                         onChange={(e) => handleFieldUpdate({ label: e.target.value })}
//                         placeholder="Field label"
//                       />
//                     </div>
//                     <div className="space-y-2">
//                       <Label htmlFor="placeholder">Placeholder</Label>
//                       <Input
//                         id="placeholder"
//                         value={localField.placeholder || ""}
//                         onChange={(e) => handleFieldUpdate({ placeholder: e.target.value })}
//                         placeholder="Placeholder text"
//                       />
//                     </div>
//                   </div>
//                   <div className="space-y-2">
//                     <Label htmlFor="description">Description</Label>
//                     <Textarea
//                       id="description"
//                       value={localField.description || ""}
//                       onChange={(e) => handleFieldUpdate({ description: e.target.value })}
//                       placeholder="Field description or help text"
//                       rows={3}
//                     />
//                   </div>
//                   <div className="grid grid-cols-2 gap-4">
//                     <div className="space-y-2">
//                       <Label htmlFor="width">Width</Label>
//                       <Select
//                         value={localField.width}
//                         onValueChange={(value: "full" | "half" | "third" | "quarter") =>
//                           handleFieldUpdate({ width: value })
//                         }
//                       >
//                         <SelectTrigger>
//                           <SelectValue />
//                         </SelectTrigger>
//                         <SelectContent>
//                           <SelectItem value="full">Full Width</SelectItem>
//                           <SelectItem value="half">Half Width</SelectItem>
//                           <SelectItem value="third">Third Width</SelectItem>
//                           <SelectItem value="quarter">Quarter Width</SelectItem>
//                         </SelectContent>
//                       </Select>
//                     </div>
//                     <div className="space-y-2">
//                       <Label htmlFor="defaultValue">Default Value</Label>
//                       <Input
//                         id="defaultValue"
//                         value={localField.defaultValue || ""}
//                         onChange={(e) => handleFieldUpdate({ defaultValue: e.target.value })}
//                         placeholder="Default value"
//                       />
//                     </div>
//                   </div>
//                   <div className="flex items-center justify-between">
//                     <div className="space-y-0.5">
//                       <Label>Visible</Label>
//                       <p className="text-sm text-muted-foreground">Show this field in the form</p>
//                     </div>
//                     <Switch
//                       checked={localField.visible ?? true}
//                       onCheckedChange={(checked) => handleFieldUpdate({ visible: checked })}
//                     />
//                   </div>
//                   <div className="flex items-center justify-between">
//                     <div className="space-y-0.5">
//                       <Label>Read Only</Label>
//                       <p className="text-sm text-muted-foreground">Make this field read-only</p>
//                     </div>
//                     <Switch
//                       checked={localField.readonly ?? false}
//                       onCheckedChange={(checked) => handleFieldUpdate({ readonly: checked })}
//                     />
//                   </div>

//                   {localField.type === "date" && (
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Auto-fetch Current Date</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Automatically set the current date as the default value
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.autoFetchDate ?? false}
//                         onCheckedChange={(checked) => handlePropertiesChange("autoFetchDate", checked)}
//                       />
//                     </div>
//                   )}

//                   {localField.type === "time" && (
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Auto-fetch Current Time</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Automatically set the current time as the default value
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.autoFetchTime ?? false}
//                         onCheckedChange={(checked) => handlePropertiesChange("autoFetchTime", checked)}
//                       />
//                     </div>
//                   )}

//                   {isLocationField && (
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Auto-fetch Current Location</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Automatically fill the user’s GPS location (address + coordinates)
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.autoFetchLocation ?? false}
//                         onCheckedChange={(checked) => handlePropertiesChange("autoFetchLocation", checked)}
//                       />
//                     </div>
//                   )}
//                 </CardContent>
//               </Card>

//               {localField.type === "lookup" && (
//                 <Card>
//                   <CardHeader>
//                     <CardTitle>Lookup Configuration</CardTitle>
//                     <CardDescription>Configure the data source and field mapping for this lookup field</CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-6">
//                     <div className="space-y-2">
//                       <Label>Data Source</Label>
//                       <Popover open={sourceOpen} onOpenChange={setSourceOpen}>
//                         <PopoverTrigger asChild>
//                           <Button
//                             variant="outline"
//                             role="combobox"
//                             aria-expanded={sourceOpen}
//                             className="w-full justify-between bg-transparent"
//                             disabled={loadingSources}
//                           >
//                             {selectedSource ? (
//                               <div className="flex items-center gap-2">
//                                 {getSourceIcon(selectedSource.type)}
//                                 <span>{selectedSource.name}</span>
//                                 <Badge variant="secondary" className="ml-auto">
//                                   {getSourceTypeLabel(selectedSource.type)}
//                                 </Badge>
//                               </div>
//                             ) : (
//                               "Select data source..."
//                             )}
//                             <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
//                           </Button>
//                         </PopoverTrigger>
//                         <PopoverContent className="w-full p-0" align="start">
//                           <Command>
//                             <CommandInput placeholder="Search data sources..." />
//                             <CommandList>
//                               <CommandEmpty>No data sources found.</CommandEmpty>
//                               <CommandGroup heading="Forms">
//                                 {lookupSources
//                                   .filter((source) => source.type === "form")
//                                   .map((source) => (
//                                     <CommandItem
//                                       key={source.id}
//                                       value={source.id}
//                                       onSelect={() => handleSourceSelect(source.id)}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2 flex-1">
//                                         <FileText className="h-4 w-4" />
//                                         <div className="flex flex-col">
//                                           <span className="font-medium">{source.name}</span>
//                                           <span className="text-xs text-muted-foreground">{source.description}</span>
//                                         </div>
//                                         <Badge variant="outline" className="ml-auto">
//                                           {source.recordCount} records
//                                         </Badge>
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                               <CommandGroup heading="Modules">
//                                 {lookupSources
//                                   .filter((source) => source.type === "module")
//                                   .map((source) => (
//                                     <CommandItem
//                                       key={source.id}
//                                       value={source.id}
//                                       onSelect={() => handleSourceSelect(source.id)}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2 flex-1">
//                                         <Database className="h-4 w-4" />
//                                         <div className="flex flex-col">
//                                           <span className="font-medium">{source.name}</span>
//                                           <span className="text-xs text-muted-foreground">{source.description}</span>
//                                         </div>
//                                         <Badge variant="outline" className="ml-auto">
//                                           {source.recordCount} records
//                                         </Badge>
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                               <CommandGroup heading="Built-in Sources">
//                                 {lookupSources
//                                   .filter((source) => source.type === "static")
//                                   .map((source) => (
//                                     <CommandItem
//                                       key={source.id}
//                                       value={source.id}
//                                       onSelect={() => handleSourceSelect(source.id)}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2 flex-1">
//                                         <Zap className="h-4 w-4" />
//                                         <div className="flex flex-col">
//                                           <span className="font-medium">{source.name}</span>
//                                           <span className="text-xs text-muted-foreground">{source.description}</span>
//                                         </div>
//                                         <Badge variant="outline" className="ml-auto">
//                                           {source.recordCount} items
//                                         </Badge>
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                             </CommandList>
//                           </Command>
//                         </PopoverContent>
//                       </Popover>
//                     </div>

//                     {selectedSource && (
//                       <>
//                         <Separator />
//                         <div className="space-y-4">
//                           <div className="flex items-center gap-2">
//                             <Settings className="h-4 w-4" />
//                             <Label className="text-base font-medium">Field Mapping Configuration</Label>
//                             <Info className="h-4 w-4 text-muted-foreground" />
//                           </div>
//                           <p className="text-sm text-muted-foreground">
//                             Configure which fields from the source data to use for display, value, and storage
//                           </p>
//                           {loadingFields ? (
//                             <div className="flex items-center justify-center py-4">
//                               <Loader2 className="h-4 w-4 animate-spin mr-2" />
//                               <span className="text-sm">Loading available fields...</span>
//                             </div>
//                           ) : (
//                             <div className="grid grid-cols-2 gap-4">
//                               <div className="space-y-2">
//                                 <Label htmlFor="displayField" className="flex items-center gap-2">
//                                   Display Field
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.display || "name"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("display", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select display field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">Field to show in dropdown options</p>
//                               </div>
//                               <div className="space-y-2">
//                                 <Label htmlFor="valueField" className="flex items-center gap-2">
//                                   Value Field
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.value || "id"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("value", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select value field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">Field to use as internal option value</p>
//                               </div>
//                               <div className="space-y-2">
//                                 <Label htmlFor="storeField" className="flex items-center gap-2">
//                                   Store Field
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.store || "name"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("store", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select store field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">
//                                   Field value to actually store in record (instead of ID)
//                                 </p>
//                               </div>
//                               <div className="space-y-2">
//                                 <Label htmlFor="descriptionField" className="flex items-center gap-2">
//                                   Description Field (Optional)
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.description || "description"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("description", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select description field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     <SelectItem value="none">None</SelectItem>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">
//                                   Optional field to show as description under each option
//                                 </p>
//                               </div>
//                             </div>
//                           )}
//                         </div>
//                         <Separator />
//                       </>
//                     )}

//                     <div className="space-y-4">
//                       <div className="flex items-center justify-between">
//                         <div className="space-y-0.5">
//                           <Label>Multiple Selection</Label>
//                           <p className="text-sm text-muted-foreground">Allow selecting multiple values</p>
//                         </div>
//                         <Switch
//                           checked={localField.lookup?.multiple || false}
//                           onCheckedChange={(checked) => handleLookupChange("multiple", checked)}
//                         />
//                       </div>
//                       <div className="flex items-center justify-between">
//                         <div className="space-y-0.5">
//                           <Label>Searchable</Label>
//                           <p className="text-sm text-muted-foreground">Enable search functionality</p>
//                         </div>
//                         <Switch
//                           checked={localField.lookup?.searchable !== false}
//                           onCheckedChange={(checked) => handleLookupChange("searchable", checked)}
//                         />
//                       </div>
//                       <div className="space-y-2">
//                         <Label htmlFor="searchPlaceholder">Search Placeholder</Label>
//                         <Input
//                           id="searchPlaceholder"
//                           value={localField.lookup?.searchPlaceholder || ""}
//                           onChange={(e) => handleLookupChange("searchPlaceholder", e.target.value)}
//                           placeholder="Search..."
//                         />
//                       </div>
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </TabsContent>

//             <TabsContent value="validation" className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Validation Rules</CardTitle>
//                   <CardDescription>
//                     {supportsPattern
//                       ? "Configure required, length/range, pattern and custom error message"
//                       : "Set basic validation rules for this field"}
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-5">
//                   <div className="flex items-center justify-between">
//                     <div className="space-y-0.5">
//                       <Label>Required</Label>
//                       <p className="text-sm text-muted-foreground">This field must be filled</p>
//                     </div>
//                     <Switch
//                       checked={localField.validation?.required || false}
//                       onCheckedChange={(checked) => handleValidationChange("required", checked)}
//                     />
//                   </div>

//                   {["text", "textarea", "email", "url", "tel", "password"].includes(localField.type ?? "") && (
//                     <div className="grid grid-cols-2 gap-4">
//                       <div className="space-y-2">
//                         <Label htmlFor="minLength">Minimum Length</Label>
//                         <Input
//                           id="minLength"
//                           type="number"
//                           value={localField.validation?.minLength || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "minLength",
//                               e.target.value ? Number.parseInt(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="0"
//                         />
//                       </div>
//                       <div className="space-y-2">
//                         <Label htmlFor="maxLength">Maximum Length</Label>
//                         <Input
//                           id="maxLength"
//                           type="number"
//                           value={localField.validation?.maxLength || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "maxLength",
//                               e.target.value ? Number.parseInt(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="100"
//                         />
//                       </div>
//                     </div>
//                   )}

//                   {localField.type === "number" && (
//                     <div className="grid grid-cols-2 gap-4">
//                       <div className="space-y-2">
//                         <Label htmlFor="min">Minimum Value</Label>
//                         <Input
//                           id="min"
//                           type="number"
//                           value={localField.validation?.min || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "min",
//                               e.target.value ? Number.parseFloat(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="0"
//                         />
//                       </div>
//                       <div className="space-y-2">
//                         <Label htmlFor="max">Maximum Value</Label>
//                         <Input
//                           id="max"
//                           type="number"
//                           value={localField.validation?.max || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "max",
//                               e.target.value ? Number.parseFloat(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="100"
//                         />
//                       </div>
//                     </div>
//                   )}

//                   {supportsPattern && (
//                     <div className="space-y-2">
//                       <Label htmlFor="pattern">Pattern (Regex)</Label>
//                       <Input
//                         id="pattern"
//                         value={localField.validation?.pattern || ""}
//                         onChange={(e) => handleValidationChange("pattern", e.target.value)}
//                         placeholder={
//                           localField.type === "number"
//                             ? "^\\d{6}$ (exactly 6 digits)"
//                             : localField.type === "tel"
//                               ? "^[6-9]\\d{9}$ (Indian mobile)"
//                               : localField.type === "email"
//                                 ? "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
//                                 : "^[a-zA-Z0-9]+$ (alphanumeric only)"
//                         }
//                         className="font-mono"
//                       />
//                       <p className="text-xs text-muted-foreground">
//                         {localField.type === "number"
//                           ? "Useful for exact digit count, no decimals, or specific number formats (leave empty to disable)"
//                           : "Regular expression for custom validation (leave empty to disable)"}
//                       </p>
//                     </div>
//                   )}

//                   <div className="space-y-2">
//                     <Label htmlFor="message">Custom Error Message</Label>
//                     <Input
//                       id="message"
//                       value={localField.validation?.message || ""}
//                       onChange={(e) => handleValidationChange("message", e.target.value)}
//                       placeholder="This field is invalid"
//                     />
//                   </div>
//                 </CardContent>
//               </Card>
//             </TabsContent>

//             <TabsContent value="options" className="space-y-6">
//               {["select", "multi-select", "radio"].includes(localField.type ?? "") && (
//                 <Card>
//                   <CardHeader>
//                     <div className="flex items-center justify-between">
//                       <div>
//                         <CardTitle>Field Options</CardTitle>
//                         <CardDescription>
//                           {localField.isDependent
//                             ? "Configure dependent / cascading options"
//                             : "Configure static options"}
//                         </CardDescription>
//                       </div>
//                       <div className="flex items-center space-x-2">
//                         <Label htmlFor="dependent-toggle">Dependent Mode</Label>
//                         <Switch
//                           id="dependent-toggle"
//                           checked={localField.isDependent ?? false}
//                           onCheckedChange={(checked) =>
//                             handleFieldUpdate({
//                               isDependent: checked,
//                               options: checked ? undefined : localField.options ?? [],
//                               dependentGroups: checked ? localField.dependentGroups ?? [] : undefined,
//                               parentFieldId: checked ? localField.parentFieldId : undefined,
//                             })
//                           }
//                         />
//                       </div>
//                     </div>
//                   </CardHeader>
//                   <CardContent className="space-y-6 pt-6">
//                     {localField.isDependent ? (
//                       <DependentOptionsEditor
//                         field={localField}
//                         allFormFields={allFormFields}
//                         onUpdate={handleFieldUpdate}
//                       />
//                     ) : (
//                       <div className="space-y-3">
//                         {(localField.options || []).map((option, index) => (
//                           <div key={option.id} className="flex items-center gap-2 p-3 border rounded-lg">
//                             <div className="flex-1 grid grid-cols-2 gap-2">
//                               <Input
//                                 value={option.label}
//                                 onChange={(e) => updateOption(index, { label: e.target.value })}
//                                 placeholder="Option label"
//                               />
//                               <Input
//                                 value={option.value}
//                                 onChange={(e) => updateOption(index, { value: e.target.value })}
//                                 placeholder="Option value"
//                               />
//                             </div>
//                             <Button
//                               variant="outline"
//                               size="sm"
//                               onClick={() => removeOption(index)}
//                               className="text-red-600 hover:text-red-700"
//                             >
//                               <X className="h-4 w-4" />
//                             </Button>
//                           </div>
//                         ))}
//                         <Button onClick={addOption} variant="outline" className="w-full">
//                           <Plus className="h-4 w-4 mr-2" />
//                           Add Option
//                         </Button>
//                       </div>
//                     )}
//                   </CardContent>
//                 </Card>
//               )}

//               {localField.type === "file" && (
//                 <Card>
//                   <CardHeader>
//                     <CardTitle>File Upload Settings</CardTitle>
//                     <CardDescription>Configure file upload restrictions</CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-4">
//                     <div className="space-y-2">
//                       <Label htmlFor="accept">Accepted File Types</Label>
//                       <Input
//                         id="accept"
//                         value={localField.properties?.accept || ""}
//                         onChange={(e) => handlePropertiesChange("accept", e.target.value)}
//                         placeholder=".jpg,.png,.pdf"
//                       />
//                     </div>
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Multiple Files</Label>
//                         <p className="text-sm text-muted-foreground">Allow multiple file uploads</p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.multiple || false}
//                         onCheckedChange={(checked) => handlePropertiesChange("multiple", checked)}
//                       />
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </TabsContent>

//             <TabsContent value="advanced" className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Advanced Settings</CardTitle>
//                   <CardDescription>Advanced configuration options</CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                   <div className="space-y-2">
//                     <Label htmlFor="formula">Formula</Label>
//                     <Textarea
//                       id="formula"
//                       value={localField.formula || ""}
//                       onChange={(e) => handleFieldUpdate({ formula: e.target.value })}
//                       placeholder="Enter formula (e.g., field1 + field2)"
//                       rows={3}
//                     />
//                   </div>
//                   <Separator />
//                   <div className="space-y-2">
//                     <Label>Field Properties (JSON)</Label>
//                     <Textarea
//                       value={JSON.stringify(localField.properties || {}, null, 2)}
//                       onChange={(e) => {
//                         try {
//                           const properties = JSON.parse(e.target.value)
//                           handleFieldUpdate({ properties })
//                         } catch (error) {
//                           // Invalid JSON, ignore
//                         }
//                       }}
//                       placeholder="{}"
//                       rows={5}
//                       className="font-mono text-sm"
//                     />
//                   </div>
//                 </CardContent>
//               </Card>

//               {localField.type === "unique-id" && (
//                 <Card className="border-2 border-blue-200 bg-blue-50/30">
//                   <CardHeader className="pb-4">
//                     <CardTitle className="flex items-center gap-2">
//                       <Hash className="h-5 w-5 text-blue-600" />
//                       Unique ID Generation Settings
//                     </CardTitle>
//                     <CardDescription>
//                       Choose how unique identifiers should be generated for this field
//                     </CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-6">
//                     <div className="space-y-2">
//                       <Label>Generation Method</Label>
//                       <Select
//                         value={localField.properties?.uniqueIdMode || "uuid"}
//                         onValueChange={(value) => handlePropertiesChange("uniqueIdMode", value)}
//                       >
//                         <SelectTrigger>
//                           <SelectValue placeholder="Select generation method" />
//                         </SelectTrigger>
//                         <SelectContent>
//                           <SelectItem value="uuid">UUID v4 (recommended - 36 characters)</SelectItem>
//                           <SelectItem value="sequential">Sequential Number (1, 2, 3...)</SelectItem>
//                           <SelectItem value="prefix">Custom Prefix + Number</SelectItem>
//                         </SelectContent>
//                       </Select>
//                       <p className="text-xs text-muted-foreground mt-1">
//                         {localField.properties?.uniqueIdMode === "uuid" &&
//                           "Generates a random 36-character UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)"}
//                         {localField.properties?.uniqueIdMode === "sequential" &&
//                           "Increments a number for each new record"}
//                         {localField.properties?.uniqueIdMode === "prefix" &&
//                           "Adds your custom prefix before a sequential number"}
//                       </p>
//                     </div>

//                     {localField.properties?.uniqueIdMode === "prefix" && (
//                       <div className="space-y-2">
//                         <Label htmlFor="prefix">Custom Prefix</Label>
//                         <Input
//                           id="prefix"
//                           value={localField.properties?.uniqueIdPrefix || ""}
//                           onChange={(e) => handlePropertiesChange("uniqueIdPrefix", e.target.value)}
//                           placeholder="INV-, ORDER-, TICKET-"
//                           maxLength={10}
//                         />
//                         <p className="text-xs text-muted-foreground">
//                           Example: "INV-" → INV-000001, INV-000002...
//                         </p>
//                       </div>
//                     )}

//                     {(localField.properties?.uniqueIdMode === "sequential" ||
//                       localField.properties?.uniqueIdMode === "prefix") && (
//                       <>
//                         <div className="grid grid-cols-2 gap-4">
//                           <div className="space-y-2">
//                             <Label htmlFor="startNumber">Start From</Label>
//                             <Input
//                               id="startNumber"
//                               type="number"
//                               min="1"
//                               value={localField.properties?.uniqueIdStart || "1"}
//                               onChange={(e) =>
//                                 handlePropertiesChange("uniqueIdStart", Number(e.target.value) || 1)
//                               }
//                             />
//                           </div>
//                           <div className="space-y-2">
//                             <Label htmlFor="minDigits">Minimum Digits (zero padding)</Label>
//                             <Input
//                               id="minDigits"
//                               type="number"
//                               min="1"
//                               max="10"
//                               value={localField.properties?.uniqueIdMinDigits || "6"}
//                               onChange={(e) =>
//                                 handlePropertiesChange("uniqueIdMinDigits", Number(e.target.value) || 6)
//                               }
//                             />
//                             <p className="text-xs text-muted-foreground">
//                               Example: 6 digits → 000001, 000042
//                             </p>
//                           </div>
//                         </div>
//                       </>
//                     )}

//                     <div className="flex items-center justify-between pt-4 border-t">
//                       <div className="space-y-0.5">
//                         <Label>Hidden Field</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Hide this field from users (still generated automatically)
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.hidden ?? true}
//                         onCheckedChange={(checked) => handlePropertiesChange("hidden", checked)}
//                       />
//                     </div>

//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Read Only</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Prevent manual editing of the generated ID
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.readonly !== false}
//                         onCheckedChange={(checked) => handleFieldUpdate({ readonly: checked })}
//                       />
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </TabsContent>
//           </ScrollArea>
//         </Tabs>

//         <div className="flex justify-between items-center gap-2 pt-4 border-t">
//           <div className="text-sm text-muted-foreground">
//             {hasChanges && "You have unsaved changes"}
//           </div>
//           <div className="flex gap-2">
//             <Button variant="outline" onClick={handleClose}>
//               Cancel
//             </Button>
//             <Button onClick={handleSave} disabled={saving || !hasChanges}>
//               {saving ? (
//                 <>
//                   <Loader2 className="h-4 w-4 mr-2 animate-spin" />
//                   Saving...
//                 </>
//               ) : (
//                 <>
//                   <Save className="h-4 w-4 mr-2" />
//                   Save Changes
//                 </>
//               )}
//             </Button>
//           </div>
//         </div>
//       </DialogContent>
//     </Dialog>
//   )
// }


// "use client"

// import { useState, useEffect } from "react"
// import { Button } from "@/components/ui/button"
// import { Input } from "@/components/ui/input"
// import { Label } from "@/components/ui/label"
// import { Textarea } from "@/components/ui/textarea"
// import { Switch } from "@/components/ui/switch"
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select"
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog"
// import { Badge } from "@/components/ui/badge"
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card"
// import { Separator } from "@/components/ui/separator"
// import { ScrollArea } from "@/components/ui/scroll-area"
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
// import {
//   Check,
//   ChevronsUpDown,
//   Settings,
//   X,
//   Plus,
//   Database,
//   FileText,
//   Zap,
//   Info,
//   Loader2,
//   Save,
//   Hash,
// } from "lucide-react"
// import { cn } from "@/lib/utils"
// import { useToast } from "@/hooks/use-toast"
// import type { FormField, FieldOption } from "@/types/form-builder"

// // ────────────────────────────────────────────────────────────────
// //  IMPORTANT: ADD THESE TYPES TO YOUR types/form-builder.ts FILE
// // ────────────────────────────────────────────────────────────────

// export interface DependentOptionGroup {
//   parentValue: string           // e.g. "Rajasthan", "Gujarat"
//   options: FieldOption[]        // child options shown when parent matches
// }

// // You should extend your existing FormField interface like this:

// // export interface FormField {
// //   id: string
// //   type: string
// //   label: string
// //   placeholder?: string
// //   description?: string
// //   defaultValue?: string
// //   visible?: boolean
// //   readonly?: boolean
// //   width?: "full" | "half" | "third" | "quarter"
// //   options?: FieldOption[]
// //   properties?: Record<string, any>
// //   validation?: {
// //     required?: boolean
// //     minLength?: number
// //     maxLength?: number
// //     min?: number
// //     max?: number
// //     pattern?: string
// //     message?: string
// //   }
// //   formula?: string
// //   lookup?: any
// //   // ── NEW properties for dependent / cascading dropdowns ──
// //   isDependent?: boolean
// //   parentFieldId?: string
// //   dependentGroups?: DependentOptionGroup[]
// // }

// // ────────────────────────────────────────────────────────────────
// //  DEPENDENT OPTIONS EDITOR SUB-COMPONENT
// // ────────────────────────────────────────────────────────────────

// interface DependentOptionsEditorProps {
//   field: FormField
//   allFormFields: FormField[]
//   onUpdate: (updates: Partial<FormField>) => void
// }

// function DependentOptionsEditor({
//   field,
//   allFormFields = [],
//   onUpdate,
// }: DependentOptionsEditorProps) {
//   const possibleParents = allFormFields.filter(
//   (f) =>
//     ["select", "multi-select", "radio"].includes(f.type || "") &&   // ← these are the real types
//     f.id !== field.id
// )
//     console.log("this is the field id", field.type)
//     console.log("All fields collected:", allFormFields.map(f => f.type));

//   const addGroup = () => {
//     const newGroup: DependentOptionGroup = {
//       parentValue: "",
//       options: [
//         {
//           id: `opt_${Date.now()}`,
//           label: "New Option",
//           value: `val_${Date.now()}`,
//           order: 0,
//         },
//       ],
//     }
//     onUpdate({
//       dependentGroups: [...(field.dependentGroups || []), newGroup],
//     })
//   }

//   const updateGroup = (groupIndex: number, updates: Partial<DependentOptionGroup>) => {
//     const groups = [...(field.dependentGroups || [])]
//     groups[groupIndex] = { ...groups[groupIndex], ...updates }
//     onUpdate({ dependentGroups: groups })
//   }

//   const removeGroup = (groupIndex: number) => {
//     const groups = (field.dependentGroups || []).filter((_, i) => i !== groupIndex)
//     onUpdate({ dependentGroups: groups })
//   }

//   const addChildOption = (groupIndex: number) => {
//     const group = field.dependentGroups?.[groupIndex]
//     if (!group) return

//     const newOption: FieldOption = {
//       id: `opt_${Date.now()}`,
//       label: "New Child Option",
//       value: `child_${group.options.length + 1}`,
//       order: group.options.length,
//     }

//     const newOptions = [...group.options, newOption]
//     updateGroup(groupIndex, { options: newOptions })
//   }

//   const updateChildOption = (
//     groupIndex: number,
//     optionIndex: number,
//     updates: Partial<FieldOption>
//   ) => {
//     const group = field.dependentGroups?.[groupIndex]
//     if (!group) return

//     const newOptions = [...group.options]
//     newOptions[optionIndex] = { ...newOptions[optionIndex], ...updates }
//     updateGroup(groupIndex, { options: newOptions })
//   }

//   const removeChildOption = (groupIndex: number, optionIndex: number) => {
//     const group = field.dependentGroups?.[groupIndex]
//     if (!group) return

//     const newOptions = group.options.filter((_, i) => i !== optionIndex)
//     updateGroup(groupIndex, { options: newOptions })
//   }

//   return (
//     <div className="space-y-6">
//       <div className="space-y-2">
//         <Label>Parent Field (controls this dropdown)</Label>
//         <Select
//           value={field.parentFieldId || ""}
//           onValueChange={(value) => onUpdate({ parentFieldId: value })}
//         >
//           <SelectTrigger>
//             <SelectValue placeholder="Select which field controls the options" />
//           </SelectTrigger>
//           <SelectContent>
//   {possibleParents.map((parent) => (
//     <SelectItem key={parent.id} value={parent.id}>
//       {parent.label} ({parent.type})
//     </SelectItem>
//   ))}

//   {possibleParents.length === 0 && (
//     <div className="px-2 py-1.5 text-sm text-muted-foreground pointer-events-none">
//       No other dropdown, radio or multi-select fields found yet.
//       <br />
//       Add one first, then come back to set dependency.
//     </div>
//   )}
// </SelectContent>
//         </Select>
//         <p className="text-xs text-muted-foreground">
//           This field will show different options depending on what is selected in the parent field.
//         </p>
//       </div>

//       <div className="space-y-4">
//         {(field.dependentGroups || []).map((group, groupIndex) => (
//           <Card key={groupIndex} className="p-4 border border-gray-200">
//             <div className="flex items-start justify-between mb-4">
//               <div className="flex-1 space-y-1.5">
//                 <Label>When parent value is</Label>
//                 <Input
//                   value={group.parentValue}
//                   onChange={(e) =>
//                     updateGroup(groupIndex, { parentValue: e.target.value })
//                   }
//                   placeholder="e.g. Rajasthan, Gujarat, Maharashtra"
//                 />
//               </div>
//               <Button
//                 variant="ghost"
//                 size="icon"
//                 className="text-red-600 hover:text-red-700 hover:bg-red-50"
//                 onClick={() => removeGroup(groupIndex)}
//               >
//                 <X className="h-5 w-5" />
//               </Button>
//             </div>

//             <div className="space-y-3 pl-4 border-l-2 border-gray-200">
//               <p className="text-sm font-medium text-gray-700">
//                 Options shown when the above value is selected:
//               </p>

//               {group.options.map((option, optIndex) => (
//                 <div key={option.id} className="flex items-center gap-2">
//                   <Input
//                     value={option.label}
//                     onChange={(e) =>
//                       updateChildOption(groupIndex, optIndex, { label: e.target.value })
//                     }
//                     placeholder="e.g. Jaipur, Jodhpur, Udaipur"
//                     className="flex-1"
//                   />
//                   <Input
//                     value={option.value}
//                     onChange={(e) =>
//                       updateChildOption(groupIndex, optIndex, { value: e.target.value })
//                     }
//                     placeholder="e.g. jaipur, jodhpur"
//                     className="w-44"
//                   />
//                   <Button
//                     variant="ghost"
//                     size="icon"
//                     className="text-red-600 hover:text-red-700 hover:bg-red-50"
//                     onClick={() => removeChildOption(groupIndex, optIndex)}
//                   >
//                     <X className="h-4 w-4" />
//                   </Button>
//                 </div>
//               ))}

//               <Button
//                 variant="outline"
//                 size="sm"
//                 className="mt-2 w-full"
//                 onClick={() => addChildOption(groupIndex)}
//               >
//                 <Plus className="h-4 w-4 mr-2" />
//                 Add child option
//               </Button>
//             </div>
//           </Card>
//         ))}
//       </div>

//       <Button onClick={addGroup} variant="outline" className="w-full">
//         <Plus className="h-4 w-4 mr-2" />
//         Add New Group (for another parent value)
//       </Button>

//       <div className="p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
//         <strong>Example usage:</strong><br />
//         Parent field = "State"<br />
//         Group 1: parentValue = "Rajasthan" → options: Jaipur, Jodhpur, Udaipur, Kota<br />
//         Group 2: parentValue = "Gujarat"   → options: Ahmedabad, Surat, Vadodara, Rajkot
//       </div>
//     </div>
//   )
// }

// // ────────────────────────────────────────────────────────────────
// //  MAIN FIELD SETTINGS COMPONENT
// // ────────────────────────────────────────────────────────────────

// interface FieldSettingsProps {
//   field: FormField
//   open: boolean
//   onOpenChange: (open: boolean) => void
//   onUpdate: (updates: Partial<FormField>) => void
//   allFormFields?: FormField[]           // ← NEW: required for parent field selection
// }

// export default function FieldSettings({
//   field,
//   open,
//   onOpenChange,
//   onUpdate,
//   allFormFields,
// }: FieldSettingsProps) {
//   const { toast } = useToast()
//   const [localField, setLocalField] = useState<FormField>(field)
//   const [lookupSources, setLookupSources] = useState<any[]>([])
//   const [loadingSources, setLoadingSources] = useState(false)
//   const [sourceOpen, setSourceOpen] = useState(false)
//   const [availableFields, setAvailableFields] = useState<string[]>([])
//   const [loadingFields, setLoadingFields] = useState(false)
//   const [hasChanges, setHasChanges] = useState(false)
//   const [saving, setSaving] = useState(false)

//   useEffect(() => {
//     setLocalField(field)
//     setHasChanges(false)
//   }, [field])

//   useEffect(() => {
//     if (localField.type === "lookup") {
//       loadLookupSources()
//     }
//   }, [localField.type])

//   useEffect(() => {
//     if (localField.lookup?.sourceId) {
//       loadAvailableFields(localField.lookup.sourceId)
//     }
//   }, [localField.lookup?.sourceId])

//   const loadLookupSources = async () => {
//     setLoadingSources(true)
//     try {
//       const response = await fetch("/api/lookup/sources")
//       if (response.ok) {
//         const result = await response.json()
//         if (result.success) {
//           setLookupSources(result.data || [])
//         }
//       }
//     } catch (error) {
//       console.error("Error loading lookup sources:", error)
//       toast({
//         title: "Error",
//         description: "Failed to load lookup sources",
//         variant: "destructive",
//       })
//     } finally {
//       setLoadingSources(false)
//     }
//   }

//   const loadAvailableFields = async (sourceId: string) => {
//     setLoadingFields(true)
//     try {
//       const response = await fetch(`/api/lookup/fields?sourceId=${sourceId}`)
//       if (response.ok) {
//         const result = await response.json()
//         if (result.success) {
//           setAvailableFields(result.data || [])
//         }
//       }
//     } catch (error) {
//       console.error("Error loading available fields:", error)
//       setAvailableFields(["id", "name", "title", "label", "description", "email"])
//     } finally {
//       setLoadingFields(false)
//     }
//   }

//   const handleFieldUpdate = (updates: Partial<FormField>) => {
//     const updatedField = { ...localField, ...updates }
//     setLocalField(updatedField)
//     setHasChanges(true)
//   }

//   const handleValidationChange = (key: string, value: any) => {
//     const newValidation = { ...localField.validation, [key]: value }
//     handleFieldUpdate({ validation: newValidation })
//   }

//   const handlePropertiesChange = (key: string, value: any) => {
//     const newProperties = { ...localField.properties, [key]: value }
//     handleFieldUpdate({ properties: newProperties })
//   }

//   const handleLookupChange = (key: string, value: any) => {
//     const currentLookup = localField.lookup || {}
//     const newLookup = { ...currentLookup, [key]: value }
//     handleFieldUpdate({ lookup: newLookup })
//   }

//   const handleFieldMappingUpdate = (mappingKey: string, value: string) => {
//     const currentLookup = localField.lookup || {}
//     const currentMapping = currentLookup.fieldMapping || {
//       display: "name",
//       value: "id",
//       store: "name",
//     }
//     const newLookup = {
//       ...currentLookup,
//       fieldMapping: {
//         ...currentMapping,
//         [mappingKey]: value,
//       },
//     }
//     handleFieldUpdate({ lookup: newLookup })
//   }

//   const handleSourceSelect = (sourceId: string) => {
//     const source = lookupSources.find((s) => s.id === sourceId)
//     const newLookup = {
//       sourceId: sourceId,
//       sourceType: source?.type as "form" | "module" | "static",
//       multiple: localField.lookup?.multiple || false,
//       searchable: localField.lookup?.searchable !== false,
//       fieldMapping: {
//         display: "name",
//         value: "id",
//         store: "name",
//         description: "description",
//       },
//     }
//     handleFieldUpdate({ lookup: newLookup })
//     setSourceOpen(false)
//   }

//   const handleSave = async () => {
//     setSaving(true)
//     try {
//       onUpdate(localField)
//       setHasChanges(false)
//       onOpenChange(false)
//       toast({
//         title: "Success",
//         description: "Field settings saved successfully",
//       })
//     } catch (error) {
//       toast({
//         title: "Error",
//         description: "Failed to save field settings",
//         variant: "destructive",
//       })
//     } finally {
//       setSaving(false)
//     }
//   }

//   const handleClose = () => {
//     if (hasChanges) {
//       const confirmClose = window.confirm("You have unsaved changes. Are you sure you want to close?")
//       if (!confirmClose) return
//     }
//     onOpenChange(false)
//   }

//   const addOption = () => {
//     const newOption: FieldOption = {
//       id: `opt_${Date.now()}`,
//       label: "New Option",
//       value: `option_${(localField.options || []).length + 1}`,
//       order: (localField.options || []).length,
//     }
//     handleFieldUpdate({ options: [...(localField.options || []), newOption] })
//   }

//   const updateOption = (index: number, updates: Partial<FieldOption>) => {
//     const newOptions = [...(localField.options || [])]
//     newOptions[index] = { ...newOptions[index], ...updates }
//     handleFieldUpdate({ options: newOptions })
//   }

//   const removeOption = (index: number) => {
//     const newOptions = (localField.options || []).filter((_, i) => i !== index)
//     handleFieldUpdate({ options: newOptions })
//   }

//   const getSourceIcon = (type: string) => {
//     switch (type) {
//       case "form":
//         return <FileText className="h-4 w-4" />
//       case "module":
//         return <Database className="h-4 w-4" />
//       case "static":
//         return <Zap className="h-4 w-4" />
//       default:
//         return <Database className="h-4 w-4" />
//     }
//   }

//   const getSourceTypeLabel = (type: string) => {
//     switch (type) {
//       case "form":
//         return "Form"
//       case "module":
//         return "Module"
//       case "static":
//         return "Built-in"
//       default:
//         return "Unknown"
//     }
//   }

//   const selectedSource = lookupSources.find((source) => source.id === localField.lookup?.sourceId)

//   const isLocationField = ["location", "newlocation"].includes(localField.type ?? "")

//   const supportsPattern = ["text", "textarea", "email", "url", "tel", "password", "number"].includes(
//     localField.type ?? ""
//   )

//   return (
//     <Dialog open={open} onOpenChange={handleClose}>
//       <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2">
//             <Settings className="h-5 w-5" />
//             Field Settings - {localField.label || "Unnamed"}
//             {hasChanges && <Badge variant="secondary">Unsaved Changes</Badge>}
//           </DialogTitle>
//         </DialogHeader>

//         <Tabs defaultValue="general" className="flex-1 overflow-hidden">
//           <TabsList className="grid w-full grid-cols-4">
//             <TabsTrigger value="general">General</TabsTrigger>
//             <TabsTrigger value="validation">Validation</TabsTrigger>
//             <TabsTrigger value="options">Options</TabsTrigger>
//             <TabsTrigger value="advanced">Advanced</TabsTrigger>
//           </TabsList>

//           <ScrollArea className="h-[350px] mt-4 border rounded-lg">
//             <TabsContent value="general" className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Basic Information</CardTitle>
//                   <CardDescription>Configure the basic properties of your field</CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                   <div className="grid grid-cols-2 gap-4">
//                     <div className="space-y-2">
//                       <Label htmlFor="label">Label</Label>
//                       <Input
//                         id="label"
//                         value={localField.label}
//                         onChange={(e) => handleFieldUpdate({ label: e.target.value })
//                         }
//                         placeholder="Field label"
//                       />
//                     </div>
//                     <div className="space-y-2">
//                       <Label htmlFor="placeholder">Placeholder</Label>
//                       <Input
//                         id="placeholder"
//                         value={localField.placeholder || ""}
//                         onChange={(e) => handleFieldUpdate({ placeholder: e.target.value })
//                         }
//                         placeholder="Placeholder text"
//                       />
//                     </div>
//                   </div>
//                   <div className="space-y-2">
//                     <Label htmlFor="description">Description</Label>
//                     <Textarea
//                       id="description"
//                       value={localField.description || ""}
//                       onChange={(e) => handleFieldUpdate({ description: e.target.value })
//                       }
//                       placeholder="Field description or help text"
//                       rows={3}
//                     />
//                   </div>
//                   <div className="grid grid-cols-2 gap-4">
//                     <div className="space-y-2">
//                       <Label htmlFor="width">Width</Label>
//                       <Select
//                         value={localField.width}
//                         onValueChange={(value: "full" | "half" | "third" | "quarter") =>
//                           handleFieldUpdate({ width: value })
//                         }
//                       >
//                         <SelectTrigger>
//                           <SelectValue />
//                         </SelectTrigger>
//                         <SelectContent>
//                           <SelectItem value="full">Full Width</SelectItem>
//                           <SelectItem value="half">Half Width</SelectItem>
//                           <SelectItem value="third">Third Width</SelectItem>
//                           <SelectItem value="quarter">Quarter Width</SelectItem>
//                         </SelectContent>
//                       </Select>
//                     </div>
//                     <div className="space-y-2">
//                       <Label htmlFor="defaultValue">Default Value</Label>
//                       <Input
//                         id="defaultValue"
//                         value={localField.defaultValue || ""}
//                         onChange={(e) => handleFieldUpdate({ defaultValue: e.target.value })
//                         }
//                         placeholder="Default value"
//                       />
//                     </div>
//                   </div>
//                   <div className="flex items-center justify-between">
//                     <div className="space-y-0.5">
//                       <Label>Visible</Label>
//                       <p className="text-sm text-muted-foreground">Show this field in the form</p>
//                     </div>
//                     <Switch
//                       checked={localField.visible ?? true}
//                       onCheckedChange={(checked) => handleFieldUpdate({ visible: checked })}
//                     />
//                   </div>
//                   <div className="flex items-center justify-between">
//                     <div className="space-y-0.5">
//                       <Label>Read Only</Label>
//                       <p className="text-sm text-muted-foreground">Make this field read-only</p>
//                     </div>
//                     <Switch
//                       checked={localField.readonly ?? false}
//                       onCheckedChange={(checked) => handleFieldUpdate({ readonly: checked })}
//                     />
//                   </div>

//                   {localField.type === "date" && (
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Auto-fetch Current Date</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Automatically set the current date as the default value
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.autoFetchDate ?? false}
//                         onCheckedChange={(checked) => handlePropertiesChange("autoFetchDate", checked)}
//                       />
//                     </div>
//                   )}

//                   {localField.type === "time" && (
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Auto-fetch Current Time</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Automatically set the current time as the default value
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.autoFetchTime ?? false}
//                         onCheckedChange={(checked) => handlePropertiesChange("autoFetchTime", checked)}
//                       />
//                     </div>
//                   )}

//                   {isLocationField && (
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Auto-fetch Current Location</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Automatically fill the user’s GPS location (address + coordinates)
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.autoFetchLocation ?? false}
//                         onCheckedChange={(checked) => handlePropertiesChange("autoFetchLocation", checked)}
//                       />
//                     </div>
//                   )}
//                 </CardContent>
//               </Card>

//               {localField.type === "lookup" && (
//                 <Card>
//                   <CardHeader>
//                     <CardTitle>Lookup Configuration</CardTitle>
//                     <CardDescription>Configure the data source and field mapping for this lookup field</CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-6">
//                     <div className="space-y-2">
//                       <Label>Data Source</Label>
//                       <Popover open={sourceOpen} onOpenChange={setSourceOpen}>
//                         <PopoverTrigger asChild>
//                           <Button
//                             variant="outline"
//                             role="combobox"
//                             aria-expanded={sourceOpen}
//                             className="w-full justify-between bg-transparent"
//                             disabled={loadingSources}
//                           >
//                             {selectedSource ? (
//                               <div className="flex items-center gap-2">
//                                 {getSourceIcon(selectedSource.type)}
//                                 <span>{selectedSource.name}</span>
//                                 <Badge variant="secondary" className="ml-auto">
//                                   {getSourceTypeLabel(selectedSource.type)}
//                                 </Badge>
//                               </div>
//                             ) : (
//                               "Select data source..."
//                             )}
//                             <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
//                           </Button>
//                         </PopoverTrigger>
//                         <PopoverContent className="w-full p-0" align="start">
//                           <Command>
//                             <CommandInput placeholder="Search data sources..." />
//                             <CommandList>
//                               <CommandEmpty>No data sources found.</CommandEmpty>
//                               <CommandGroup heading="Forms">
//                                 {lookupSources
//                                   .filter((source) => source.type === "form")
//                                   .map((source) => (
//                                     <CommandItem
//                                       key={source.id}
//                                       value={source.id}
//                                       onSelect={() => handleSourceSelect(source.id)}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2 flex-1">
//                                         <FileText className="h-4 w-4" />
//                                         <div className="flex flex-col">
//                                           <span className="font-medium">{source.name}</span>
//                                           <span className="text-xs text-muted-foreground">{source.description}</span>
//                                         </div>
//                                         <Badge variant="outline" className="ml-auto">
//                                           {source.recordCount} records
//                                         </Badge>
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                               <CommandGroup heading="Modules">
//                                 {lookupSources
//                                   .filter((source) => source.type === "module")
//                                   .map((source) => (
//                                     <CommandItem
//                                       key={source.id}
//                                       value={source.id}
//                                       onSelect={() => handleSourceSelect(source.id)}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2 flex-1">
//                                         <Database className="h-4 w-4" />
//                                         <div className="flex flex-col">
//                                           <span className="font-medium">{source.name}</span>
//                                           <span className="text-xs text-muted-foreground">{source.description}</span>
//                                         </div>
//                                         <Badge variant="outline" className="ml-auto">
//                                           {source.recordCount} records
//                                         </Badge>
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                               <CommandGroup heading="Built-in Sources">
//                                 {lookupSources
//                                   .filter((source) => source.type === "static")
//                                   .map((source) => (
//                                     <CommandItem
//                                       key={source.id}
//                                       value={source.id}
//                                       onSelect={() => handleSourceSelect(source.id)}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2 flex-1">
//                                         <Zap className="h-4 w-4" />
//                                         <div className="flex flex-col">
//                                           <span className="font-medium">{source.name}</span>
//                                           <span className="text-xs text-muted-foreground">{source.description}</span>
//                                         </div>
//                                         <Badge variant="outline" className="ml-auto">
//                                           {source.recordCount} items
//                                         </Badge>
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                             </CommandList>
//                           </Command>
//                         </PopoverContent>
//                       </Popover>
//                     </div>

//                     {selectedSource && (
//                       <>
//                         <Separator />
//                         <div className="space-y-4">
//                           <div className="flex items-center gap-2">
//                             <Settings className="h-4 w-4" />
//                             <Label className="text-base font-medium">Field Mapping Configuration</Label>
//                             <Info className="h-4 w-4 text-muted-foreground" />
//                           </div>
//                           <p className="text-sm text-muted-foreground">
//                             Configure which fields from the source data to use for display, value, and storage
//                           </p>
//                           {loadingFields ? (
//                             <div className="flex items-center justify-center py-4">
//                               <Loader2 className="h-4 w-4 animate-spin mr-2" />
//                               <span className="text-sm">Loading available fields...</span>
//                             </div>
//                           ) : (
//                             <div className="grid grid-cols-2 gap-4">
//                               <div className="space-y-2">
//                                 <Label htmlFor="displayField" className="flex items-center gap-2">
//                                   Display Field
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.display || "name"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("display", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select display field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">Field to show in dropdown options</p>
//                               </div>
//                               <div className="space-y-2">
//                                 <Label htmlFor="valueField" className="flex items-center gap-2">
//                                   Value Field
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.value || "id"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("value", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select value field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">Field to use as internal option value</p>
//                               </div>
//                               <div className="space-y-2">
//                                 <Label htmlFor="storeField" className="flex items-center gap-2">
//                                   Store Field
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.store || "name"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("store", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select store field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">
//                                   Field value to actually store in record (instead of ID)
//                                 </p>
//                               </div>
//                               <div className="space-y-2">
//                                 <Label htmlFor="descriptionField" className="flex items-center gap-2">
//                                   Description Field (Optional)
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.description || "description"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("description", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select description field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     <SelectItem value="none">None</SelectItem>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">
//                                   Optional field to show as description under each option
//                                 </p>
//                               </div>
//                             </div>
//                           )}
//                         </div>
//                         <Separator />
//                       </>
//                     )}

//                     <div className="space-y-4">
//                       <div className="flex items-center justify-between">
//                         <div className="space-y-0.5">
//                           <Label>Multiple Selection</Label>
//                           <p className="text-sm text-muted-foreground">Allow selecting multiple values</p>
//                         </div>
//                         <Switch
//                           checked={localField.lookup?.multiple || false}
//                           onCheckedChange={(checked) => handleLookupChange("multiple", checked)}
//                         />
//                       </div>
//                       <div className="flex items-center justify-between">
//                         <div className="space-y-0.5">
//                           <Label>Searchable</Label>
//                           <p className="text-sm text-muted-foreground">Enable search functionality</p>
//                         </div>
//                         <Switch
//                           checked={localField.lookup?.searchable !== false}
//                           onCheckedChange={(checked) => handleLookupChange("searchable", checked)}
//                         />
//                       </div>
//                       <div className="space-y-2">
//                         <Label htmlFor="searchPlaceholder">Search Placeholder</Label>
//                         <Input
//                           id="searchPlaceholder"
//                           value={localField.lookup?.searchPlaceholder || ""}
//                           onChange={(e) => handleLookupChange("searchPlaceholder", e.target.value)}
//                           placeholder="Search..."
//                         />
//                       </div>
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </TabsContent>

//             <TabsContent value="validation" className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Validation Rules</CardTitle>
//                   <CardDescription>
//                     {supportsPattern
//                       ? "Configure required, length/range, pattern and custom error message"
//                       : "Set basic validation rules for this field"}
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-5">
//                   <div className="flex items-center justify-between">
//                     <div className="space-y-0.5">
//                       <Label>Required</Label>
//                       <p className="text-sm text-muted-foreground">This field must be filled</p>
//                     </div>
//                     <Switch
//                       checked={localField.validation?.required || false}
//                       onCheckedChange={(checked) => handleValidationChange("required", checked)}
//                     />
//                   </div>

//                   {["text", "textarea", "email", "url", "tel", "password"].includes(localField.type ?? "") && (
//                     <div className="grid grid-cols-2 gap-4">
//                       <div className="space-y-2">
//                         <Label htmlFor="minLength">Minimum Length</Label>
//                         <Input
//                           id="minLength"
//                           type="number"
//                           value={localField.validation?.minLength || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "minLength",
//                               e.target.value ? Number.parseInt(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="0"
//                         />
//                       </div>
//                       <div className="space-y-2">
//                         <Label htmlFor="maxLength">Maximum Length</Label>
//                         <Input
//                           id="maxLength"
//                           type="number"
//                           value={localField.validation?.maxLength || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "maxLength",
//                               e.target.value ? Number.parseInt(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="100"
//                         />
//                       </div>
//                     </div>
//                   )}

//                   {localField.type === "number" && (
//                     <div className="grid grid-cols-2 gap-4">
//                       <div className="space-y-2">
//                         <Label htmlFor="min">Minimum Value</Label>
//                         <Input
//                           id="min"
//                           type="number"
//                           value={localField.validation?.min || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "min",
//                               e.target.value ? Number.parseFloat(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="0"
//                         />
//                       </div>
//                       <div className="space-y-2">
//                         <Label htmlFor="max">Maximum Value</Label>
//                         <Input
//                           id="max"
//                           type="number"
//                           value={localField.validation?.max || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "max",
//                               e.target.value ? Number.parseFloat(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="100"
//                         />
//                       </div>
//                     </div>
//                   )}

//                   {supportsPattern && (
//                     <div className="space-y-2">
//                       <Label htmlFor="pattern">Pattern (Regex)</Label>
//                       <Input
//                         id="pattern"
//                         value={localField.validation?.pattern || ""}
//                         onChange={(e) => handleValidationChange("pattern", e.target.value)}
//                         placeholder={
//                           localField.type === "number"
//                             ? "^\\d{6}$ (exactly 6 digits)"
//                             : localField.type === "tel"
//                               ? "^[6-9]\\d{9}$ (Indian mobile)"
//                               : localField.type === "email"
//                                 ? "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
//                                 : "^[a-zA-Z0-9]+$ (alphanumeric only)"
//                         }
//                         className="font-mono"
//                       />
//                       <p className="text-xs text-muted-foreground">
//                         {localField.type === "number"
//                           ? "Useful for exact digit count, no decimals, or specific number formats (leave empty to disable)"
//                           : "Regular expression for custom validation (leave empty to disable)"}
//                       </p>
//                     </div>
//                   )}

//                   <div className="space-y-2">
//                     <Label htmlFor="message">Custom Error Message</Label>
//                     <Input
//                       id="message"
//                       value={localField.validation?.message || ""}
//                       onChange={(e) => handleValidationChange("message", e.target.value)}
//                       placeholder="This field is invalid"
//                     />
//                   </div>
//                 </CardContent>
//               </Card>
//             </TabsContent>

//             <TabsContent value="options" className="space-y-6">
//               {["select", "multi-select", "radio"].includes(localField.type ?? "") && (
//                 <Card>
//                   <CardHeader>
//                     <div className="flex items-center justify-between">
//                       <div>
//                         <CardTitle>Field Options</CardTitle>
//                         <CardDescription>
//                           {localField.isDependent
//                             ? "Configure dependent / cascading options"
//                             : "Configure static options"}
//                         </CardDescription>
//                       </div>
//                       <div className="flex items-center space-x-2">
//                         <Label htmlFor="dependent-toggle">Dependent Mode</Label>
//                         <Switch
//                           id="dependent-toggle"
//                           checked={localField.isDependent ?? false}
//                           onCheckedChange={(checked) =>
//                             handleFieldUpdate({
//                               isDependent: checked,
//                               options: checked ? undefined : localField.options ?? [],
//                               dependentGroups: checked ? localField.dependentGroups ?? [] : undefined,
//                               parentFieldId: checked ? localField.parentFieldId : undefined,
//                             })
//                           }
//                         />
//                       </div>
//                     </div>
//                   </CardHeader>
//                   <CardContent className="space-y-6 pt-6">
//                     {localField.isDependent ? (
//                       <DependentOptionsEditor
//                         field={localField}
//                         allFormFields={allFormFields}
//                         onUpdate={handleFieldUpdate}
//                       />
//                     ) : (
//                       <div className="space-y-3">
//                         {(localField.options || []).map((option, index) => (
//                           <div key={option.id} className="flex items-center gap-2 p-3 border rounded-lg">
//                             <div className="flex-1 grid grid-cols-2 gap-2">
//                               <Input
//                                 value={option.label}
//                                 onChange={(e) => updateOption(index, { label: e.target.value })}
//                                 placeholder="Option label"
//                               />
//                               <Input
//                                 value={option.value}
//                                 onChange={(e) => updateOption(index, { value: e.target.value })}
//                                 placeholder="Option value"
//                               />
//                             </div>
//                             <Button
//                               variant="outline"
//                               size="sm"
//                               onClick={() => removeOption(index)}
//                               className="text-red-600 hover:text-red-700"
//                             >
//                               <X className="h-4 w-4" />
//                             </Button>
//                           </div>
//                         ))}
//                         <Button onClick={addOption} variant="outline" className="w-full">
//                           <Plus className="h-4 w-4 mr-2" />
//                           Add Option
//                         </Button>
//                       </div>
//                     )}
//                   </CardContent>
//                 </Card>
//               )}

//               {localField.type === "file" && (
//                 <Card>
//                   <CardHeader>
//                     <CardTitle>File Upload Settings</CardTitle>
//                     <CardDescription>Configure file upload restrictions</CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-4">
//                     <div className="space-y-2">
//                       <Label htmlFor="accept">Accepted File Types</Label>
//                       <Input
//                         id="accept"
//                         value={localField.properties?.accept || ""}
//                         onChange={(e) => handlePropertiesChange("accept", e.target.value)}
//                         placeholder=".jpg,.png,.pdf"
//                       />
//                     </div>
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Multiple Files</Label>
//                         <p className="text-sm text-muted-foreground">Allow multiple file uploads</p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.multiple || false}
//                         onCheckedChange={(checked) => handlePropertiesChange("multiple", checked)}
//                       />
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </TabsContent>

//             <TabsContent value="advanced" className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Advanced Settings</CardTitle>
//                   <CardDescription>Advanced configuration options</CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                   <div className="space-y-2">
//                     <Label htmlFor="formula">Formula</Label>
//                     <Textarea
//                       id="formula"
//                       value={localField.formula || ""}
//                       onChange={(e) => handleFieldUpdate({ formula: e.target.value })}
//                       placeholder="Enter formula (e.g., field1 + field2)"
//                       rows={3}
//                     />
//                   </div>
//                   <Separator />
//                   <div className="space-y-2">
//                     <Label>Field Properties (JSON)</Label>
//                     <Textarea
//                       value={JSON.stringify(localField.properties || {}, null, 2)}
//                       onChange={(e) => {
//                         try {
//                           const properties = JSON.parse(e.target.value)
//                           handleFieldUpdate({ properties })
//                         } catch (error) {
//                           // Invalid JSON, ignore
//                         }
//                       }}
//                       placeholder="{}"
//                       rows={5}
//                       className="font-mono text-sm"
//                     />
//                   </div>
//                 </CardContent>
//               </Card>

//               {localField.type === "unique-id" && (
//                 <Card className="border-2 border-blue-200 bg-blue-50/30">
//                   <CardHeader className="pb-4">
//                     <CardTitle className="flex items-center gap-2">
//                       <Hash className="h-5 w-5 text-blue-600" />
//                       Unique ID Generation Settings
//                     </CardTitle>
//                     <CardDescription>
//                       Choose how unique identifiers should be generated for this field
//                     </CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-6">
//                     <div className="space-y-2">
//                       <Label>Generation Method</Label>
//                       <Select
//                         value={localField.properties?.uniqueIdMode || "uuid"}
//                         onValueChange={(value) => handlePropertiesChange("uniqueIdMode", value)}
//                       >
//                         <SelectTrigger>
//                           <SelectValue placeholder="Select generation method" />
//                         </SelectTrigger>
//                         <SelectContent>
//                           <SelectItem value="uuid">UUID v4 (recommended - 36 characters)</SelectItem>
//                           <SelectItem value="sequential">Sequential Number (1, 2, 3...)</SelectItem>
//                           <SelectItem value="prefix">Custom Prefix + Number</SelectItem>
//                         </SelectContent>
//                       </Select>
//                       <p className="text-xs text-muted-foreground mt-1">
//                         {localField.properties?.uniqueIdMode === "uuid" &&
//                           "Generates a random 36-character UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)"}
//                         {localField.properties?.uniqueIdMode === "sequential" &&
//                           "Increments a number for each new record"}
//                         {localField.properties?.uniqueIdMode === "prefix" &&
//                           "Adds your custom prefix before a sequential number"}
//                       </p>
//                     </div>

//                     {localField.properties?.uniqueIdMode === "prefix" && (
//                       <div className="space-y-2">
//                         <Label htmlFor="prefix">Custom Prefix</Label>
//                         <Input
//                           id="prefix"
//                           value={localField.properties?.uniqueIdPrefix || ""}
//                           onChange={(e) => handlePropertiesChange("uniqueIdPrefix", e.target.value)}
//                           placeholder="INV-, ORDER-, TICKET-"
//                           maxLength={10}
//                         />
//                         <p className="text-xs text-muted-foreground">
//                           Example: "INV-" → INV-000001, INV-000002...
//                         </p>
//                       </div>
//                     )}

//                     {(localField.properties?.uniqueIdMode === "sequential" ||
//                       localField.properties?.uniqueIdMode === "prefix") && (
//                       <>
//                         <div className="grid grid-cols-2 gap-4">
//                           <div className="space-y-2">
//                             <Label htmlFor="startNumber">Start From</Label>
//                             <Input
//                               id="startNumber"
//                               type="number"
//                               min="1"
//                               value={localField.properties?.uniqueIdStart || "1"}
//                               onChange={(e) =>
//                                 handlePropertiesChange("uniqueIdStart", Number(e.target.value) || 1)
//                               }
//                             />
//                           </div>
//                           <div className="space-y-2">
//                             <Label htmlFor="minDigits">Minimum Digits (zero padding)</Label>
//                             <Input
//                               id="minDigits"
//                               type="number"
//                               min="1"
//                               max="10"
//                               value={localField.properties?.uniqueIdMinDigits || "6"}
//                               onChange={(e) =>
//                                 handlePropertiesChange("uniqueIdMinDigits", Number(e.target.value) || 6)
//                               }
//                             />
//                             <p className="text-xs text-muted-foreground">
//                               Example: 6 digits → 000001, 000042
//                             </p>
//                           </div>
//                         </div>
//                       </>
//                     )}

//                     <div className="flex items-center justify-between pt-4 border-t">
//                       <div className="space-y-0.5">
//                         <Label>Hidden Field</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Hide this field from users (still generated automatically)
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.hidden ?? true}
//                         onCheckedChange={(checked) => handlePropertiesChange("hidden", checked)}
//                       />
//                     </div>

//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Read Only</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Prevent manual editing of the generated ID
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.readonly !== false}
//                         onCheckedChange={(checked) => handleFieldUpdate({ readonly: checked })}
//                       />
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </TabsContent>
//           </ScrollArea>
//         </Tabs>

//         <div className="flex justify-between items-center gap-2 pt-4 border-t">
//           <div className="text-sm text-muted-foreground">
//             {hasChanges && "You have unsaved changes"}
//           </div>
//           <div className="flex gap-2">
//             <Button variant="outline" onClick={handleClose}>
//               Cancel
//             </Button>
//             <Button onClick={handleSave} disabled={saving || !hasChanges}>
//               {saving ? (
//                 <>
//                   <Loader2 className="h-4 w-4 mr-2 animate-spin" />
//                   Saving...
//                 </>
//               ) : (
//                 <>
//                   <Save className="h-4 w-4 mr-2" />
//                   Save Changes
//                 </>
//               )}
//             </Button>
//           </div>
//         </div>
//       </DialogContent>
//     </Dialog>
//   )
// }


// "use client"

// import { useState, useEffect } from "react"
// import { Button } from "@/components/ui/button"
// import { Input } from "@/components/ui/input"
// import { Label } from "@/components/ui/label"
// import { Textarea } from "@/components/ui/textarea"
// import { Switch } from "@/components/ui/switch"
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select"
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog"
// import { Badge } from "@/components/ui/badge"
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card"
// import { Separator } from "@/components/ui/separator"
// import { ScrollArea } from "@/components/ui/scroll-area"
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
// import {
//   Check,
//   ChevronsUpDown,
//   Settings,
//   X,
//   Plus,
//   Database,
//   FileText,
//   Zap,
//   Info,
//   Loader2,
//   Save,
//   Hash,
// } from "lucide-react"
// import { cn } from "@/lib/utils"
// import { useToast } from "@/hooks/use-toast"
// import type { FormField, FieldOption } from "@/types/form-builder"

// // ────────────────────────────────────────────────────────────────
// //  IMPORTANT: ADD THESE TYPES TO YOUR types/form-builder.ts FILE
// // ────────────────────────────────────────────────────────────────

// export interface DependentOptionGroup {
//   parentValue: string           // e.g. "Rajasthan", "Gujarat"
//   options: FieldOption[]        // child options shown when parent matches
// }

// // You should extend your existing FormField interface like this:

// // export interface FormField {
// //   id: string
// //   type: string
// //   label: string
// //   placeholder?: string
// //   description?: string
// //   defaultValue?: string
// //   visible?: boolean
// //   readonly?: boolean
// //   width?: "full" | "half" | "third" | "quarter"
// //   options?: FieldOption[]
// //   properties?: Record<string, any>
// //   validation?: {
// //     required?: boolean
// //     minLength?: number
// //     maxLength?: number
// //     min?: number
// //     max?: number
// //     pattern?: string
// //     message?: string
// //   }
// //   formula?: string
// //   lookup?: any
// //   // ── NEW properties for dependent / cascading dropdowns ──
// //   isDependent?: boolean
// //   parentFieldId?: string
// //   dependentGroups?: DependentOptionGroup[]
// // }

// // ────────────────────────────────────────────────────────────────
// //  DEPENDENT OPTIONS EDITOR SUB-COMPONENT
// // ────────────────────────────────────────────────────────────────

// interface DependentOptionsEditorProps {
//   field: FormField
//   allFormFields: FormField[]
//   onUpdate: (updates: Partial<FormField>) => void
// }

// function DependentOptionsEditor({
//   field,
//   allFormFields = [],
//   onUpdate,
// }: DependentOptionsEditorProps) {
//   const possibleParents = allFormFields.filter(
//   (f) =>
//     ["select", "multi-select", "radio"].includes(f.type || "") &&   // ← these are the real types
//     f.id !== field.id
// )
//     console.log("this is the field id", field.type)
//     console.log("All fields collected:", allFormFields.map(f => f.type));

//   const addGroup = () => {
//     const newGroup: DependentOptionGroup = {
//       parentValue: "",
//       options: [
//         {
//           id: `opt_${Date.now()}`,
//           label: "New Option",
//           value: `val_${Date.now()}`,
//           order: 0,
//         },
//       ],
//     }
//     onUpdate({
//       dependentGroups: [...(field.dependentGroups || []), newGroup],
//     })
//   }

//   const updateGroup = (groupIndex: number, updates: Partial<DependentOptionGroup>) => {
//     const groups = [...(field.dependentGroups || [])]
//     groups[groupIndex] = { ...groups[groupIndex], ...updates }
//     onUpdate({ dependentGroups: groups })
//   }

//   const removeGroup = (groupIndex: number) => {
//     const groups = (field.dependentGroups || []).filter((_, i) => i !== groupIndex)
//     onUpdate({ dependentGroups: groups })
//   }

//   const addChildOption = (groupIndex: number) => {
//     const group = field.dependentGroups?.[groupIndex]
//     if (!group) return

//     const newOption: FieldOption = {
//       id: `opt_${Date.now()}`,
//       label: "New Child Option",
//       value: `child_${group.options.length + 1}`,
//       order: group.options.length,
//     }

//     const newOptions = [...group.options, newOption]
//     updateGroup(groupIndex, { options: newOptions })
//   }

//   const updateChildOption = (
//     groupIndex: number,
//     optionIndex: number,
//     updates: Partial<FieldOption>
//   ) => {
//     const group = field.dependentGroups?.[groupIndex]
//     if (!group) return

//     const newOptions = [...group.options]
//     newOptions[optionIndex] = { ...newOptions[optionIndex], ...updates }
//     updateGroup(groupIndex, { options: newOptions })
//   }

//   const removeChildOption = (groupIndex: number, optionIndex: number) => {
//     const group = field.dependentGroups?.[groupIndex]
//     if (!group) return

//     const newOptions = group.options.filter((_, i) => i !== optionIndex)
//     updateGroup(groupIndex, { options: newOptions })
//   }

//   return (
//     <div className="space-y-6">
//       <div className="space-y-2">
//         <Label>Parent Field (controls this dropdown)</Label>
//         <Select
//           value={field.parentFieldId || ""}
//           onValueChange={(value) => onUpdate({ parentFieldId: value })}
//         >
//           <SelectTrigger>
//             <SelectValue placeholder="Select which field controls the options" />
//           </SelectTrigger>
//           <SelectContent>
//   {possibleParents.map((parent) => (
//     <SelectItem key={parent.id} value={parent.id}>
//       {parent.label} ({parent.type})
//     </SelectItem>
//   ))}

//   {possibleParents.length === 0 && (
//     <div className="px-2 py-1.5 text-sm text-muted-foreground pointer-events-none">
//       No other dropdown, radio or multi-select fields found yet.
//       <br />
//       Add one first, then come back to set dependency.
//     </div>
//   )}
// </SelectContent>
//         </Select>
//         <p className="text-xs text-muted-foreground">
//           This field will show different options depending on what is selected in the parent field.
//         </p>
//       </div>

//       <div className="space-y-4">
//         {(field.dependentGroups || []).map((group, groupIndex) => (
//           <Card key={groupIndex} className="p-4 border border-gray-200">
//             <div className="flex items-start justify-between mb-4">
//               <div className="flex-1 space-y-1.5">
//                 <Label>When parent value is</Label>
//                 <Input
//                   value={group.parentValue}
//                   onChange={(e) =>
//                     updateGroup(groupIndex, { parentValue: e.target.value })
//                   }
//                   placeholder="e.g. Rajasthan, Gujarat, Maharashtra"
//                 />
//               </div>
//               <Button
//                 variant="ghost"
//                 size="icon"
//                 className="text-red-600 hover:text-red-700 hover:bg-red-50"
//                 onClick={() => removeGroup(groupIndex)}
//               >
//                 <X className="h-5 w-5" />
//               </Button>
//             </div>

//             <div className="space-y-3 pl-4 border-l-2 border-gray-200">
//               <p className="text-sm font-medium text-gray-700">
//                 Options shown when the above value is selected:
//               </p>

//               {group.options.map((option, optIndex) => (
//                 <div key={option.id} className="flex items-center gap-2">
//                   <Input
//                     value={option.label}
//                     onChange={(e) =>
//                       updateChildOption(groupIndex, optIndex, { label: e.target.value })
//                     }
//                     placeholder="e.g. Jaipur, Jodhpur, Udaipur"
//                     className="flex-1"
//                   />
//                   <Input
//                     value={option.value}
//                     onChange={(e) =>
//                       updateChildOption(groupIndex, optIndex, { value: e.target.value })
//                     }
//                     placeholder="e.g. jaipur, jodhpur"
//                     className="w-44"
//                   />
//                   <Button
//                     variant="ghost"
//                     size="icon"
//                     className="text-red-600 hover:text-red-700 hover:bg-red-50"
//                     onClick={() => removeChildOption(groupIndex, optIndex)}
//                   >
//                     <X className="h-4 w-4" />
//                   </Button>
//                 </div>
//               ))}

//               <Button
//                 variant="outline"
//                 size="sm"
//                 className="mt-2 w-full"
//                 onClick={() => addChildOption(groupIndex)}
//               >
//                 <Plus className="h-4 w-4 mr-2" />
//                 Add child option
//               </Button>
//             </div>
//           </Card>
//         ))}
//       </div>

//       <Button onClick={addGroup} variant="outline" className="w-full">
//         <Plus className="h-4 w-4 mr-2" />
//         Add New Group (for another parent value)
//       </Button>

//       <div className="p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
//         <strong>Example usage:</strong><br />
//         Parent field = "State"<br />
//         Group 1: parentValue = "Rajasthan" → options: Jaipur, Jodhpur, Udaipur, Kota<br />
//         Group 2: parentValue = "Gujarat"   → options: Ahmedabad, Surat, Vadodara, Rajkot
//       </div>
//     </div>
//   )
// }

// // ────────────────────────────────────────────────────────────────
// //  MAIN FIELD SETTINGS COMPONENT
// // ────────────────────────────────────────────────────────────────

// interface FieldSettingsProps {
//   field: FormField
//   open: boolean
//   onOpenChange: (open: boolean) => void
//   onUpdate: (updates: Partial<FormField>) => void
//   allFormFields?: FormField[]           // ← NEW: required for parent field selection
// }

// export default function FieldSettings({
//   field,
//   open,
//   onOpenChange,
//   onUpdate,
//   allFormFields,
// }: FieldSettingsProps) {
//   const { toast } = useToast()
//   const [localField, setLocalField] = useState<FormField>(field)
//   const [lookupSources, setLookupSources] = useState<any[]>([])
//   const [loadingSources, setLoadingSources] = useState(false)
//   const [sourceOpen, setSourceOpen] = useState(false)
//   const [availableFields, setAvailableFields] = useState<string[]>([])
//   const [loadingFields, setLoadingFields] = useState(false)
//   const [hasChanges, setHasChanges] = useState(false)
//   const [saving, setSaving] = useState(false)

//   useEffect(() => {
//     setLocalField(field)
//     setHasChanges(false)
//   }, [field])

//   useEffect(() => {
//     if (localField.type === "lookup") {
//       loadLookupSources()
//     }
//   }, [localField.type])

//   useEffect(() => {
//     if (localField.lookup?.sourceId) {
//       loadAvailableFields(localField.lookup.sourceId)
//     }
//   }, [localField.lookup?.sourceId])

//   const loadLookupSources = async () => {
//     setLoadingSources(true)
//     try {
//       const response = await fetch("/api/lookup/sources")
//       if (response.ok) {
//         const result = await response.json()
//         if (result.success) {
//           setLookupSources(result.data || [])
//         }
//       }
//     } catch (error) {
//       console.error("Error loading lookup sources:", error)
//       toast({
//         title: "Error",
//         description: "Failed to load lookup sources",
//         variant: "destructive",
//       })
//     } finally {
//       setLoadingSources(false)
//     }
//   }

//   const loadAvailableFields = async (sourceId: string) => {
//     setLoadingFields(true)
//     try {
//       const response = await fetch(`/api/lookup/fields?sourceId=${sourceId}`)
//       if (response.ok) {
//         const result = await response.json()
//         if (result.success) {
//           setAvailableFields(result.data || [])
//         }
//       }
//     } catch (error) {
//       console.error("Error loading available fields:", error)
//       setAvailableFields(["id", "name", "title", "label", "description", "email"])
//     } finally {
//       setLoadingFields(false)
//     }
//   }

//   const handleFieldUpdate = (updates: Partial<FormField>) => {
//     const updatedField = { ...localField, ...updates }
//     setLocalField(updatedField)
//     setHasChanges(true)
//   }

//   const handleValidationChange = (key: string, value: any) => {
//     const newValidation = { ...localField.validation, [key]: value }
//     handleFieldUpdate({ validation: newValidation })
//   }

//   const handlePropertiesChange = (key: string, value: any) => {
//     const newProperties = { ...localField.properties, [key]: value }
//     handleFieldUpdate({ properties: newProperties })
//   }

//   const handleLookupChange = (key: string, value: any) => {
//     const currentLookup = localField.lookup || {}
//     const newLookup = { ...currentLookup, [key]: value }
//     handleFieldUpdate({ lookup: newLookup })
//   }

//   const handleFieldMappingUpdate = (mappingKey: string, value: string) => {
//     const currentLookup = localField.lookup || {}
//     const currentMapping = currentLookup.fieldMapping || {
//       display: "name",
//       value: "id",
//       store: "name",
//     }
//     const newLookup = {
//       ...currentLookup,
//       fieldMapping: {
//         ...currentMapping,
//         [mappingKey]: value,
//       },
//     }
//     handleFieldUpdate({ lookup: newLookup })
//   }

//   const handleSourceSelect = (sourceId: string) => {
//     const source = lookupSources.find((s) => s.id === sourceId)
//     const newLookup = {
//       sourceId: sourceId,
//       sourceType: source?.type as "form" | "module" | "static",
//       multiple: localField.lookup?.multiple || false,
//       searchable: localField.lookup?.searchable !== false,
//       fieldMapping: {
//         display: "name",
//         value: "id",
//         store: "name",
//         description: "description",
//       },
//     }
//     handleFieldUpdate({ lookup: newLookup })
//     setSourceOpen(false)
//   }

//   const handleSave = async () => {
//     setSaving(true)
//     try {
//       onUpdate(localField)
//       setHasChanges(false)
//       onOpenChange(false)
//       toast({
//         title: "Success",
//         description: "Field settings saved successfully",
//       })
//     } catch (error) {
//       toast({
//         title: "Error",
//         description: "Failed to save field settings",
//         variant: "destructive",
//       })
//     } finally {
//       setSaving(false)
//     }
//   }

//   const handleClose = () => {
//     if (hasChanges) {
//       const confirmClose = window.confirm("You have unsaved changes. Are you sure you want to close?")
//       if (!confirmClose) return
//     }
//     onOpenChange(false)
//   }

//   const addOption = () => {
//     const newOption: FieldOption = {
//       id: `opt_${Date.now()}`,
//       label: "New Option",
//       value: `option_${(localField.options || []).length + 1}`,
//       order: (localField.options || []).length,
//     }
//     handleFieldUpdate({ options: [...(localField.options || []), newOption] })
//   }

//   const updateOption = (index: number, updates: Partial<FieldOption>) => {
//     const newOptions = [...(localField.options || [])]
//     newOptions[index] = { ...newOptions[index], ...updates }
//     handleFieldUpdate({ options: newOptions })
//   }

//   const removeOption = (index: number) => {
//     const newOptions = (localField.options || []).filter((_, i) => i !== index)
//     handleFieldUpdate({ options: newOptions })
//   }

//   const getSourceIcon = (type: string) => {
//     switch (type) {
//       case "form":
//         return <FileText className="h-4 w-4" />
//       case "module":
//         return <Database className="h-4 w-4" />
//       case "static":
//         return <Zap className="h-4 w-4" />
//       default:
//         return <Database className="h-4 w-4" />
//     }
//   }

//   const getSourceTypeLabel = (type: string) => {
//     switch (type) {
//       case "form":
//         return "Form"
//       case "module":
//         return "Module"
//       case "static":
//         return "Built-in"
//       default:
//         return "Unknown"
//     }
//   }

//   const selectedSource = lookupSources.find((source) => source.id === localField.lookup?.sourceId)

//   const isLocationField = ["location", "newlocation"].includes(localField.type ?? "")

//   const supportsPattern = ["text", "textarea", "email", "url", "tel", "password", "number"].includes(
//     localField.type ?? ""
//   )

//   return (
//     <Dialog open={open} onOpenChange={handleClose}>
//       <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2">
//             <Settings className="h-5 w-5" />
//             Field Settings - {localField.label || "Unnamed"}
//             {hasChanges && <Badge variant="secondary">Unsaved Changes</Badge>}
//           </DialogTitle>
//         </DialogHeader>

//         <Tabs defaultValue="general" className="flex-1 overflow-hidden">
//           <TabsList className="grid w-full grid-cols-4">
//             <TabsTrigger value="general">General</TabsTrigger>
//             <TabsTrigger value="validation">Validation</TabsTrigger>
//             <TabsTrigger value="options">Options</TabsTrigger>
//             <TabsTrigger value="advanced">Advanced</TabsTrigger>
//           </TabsList>

//           <ScrollArea className="h-[350px] mt-4 border rounded-lg">
//             <TabsContent value="general" className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Basic Information</CardTitle>
//                   <CardDescription>Configure the basic properties of your field</CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                   <div className="grid grid-cols-2 gap-4">
//                     <div className="space-y-2">
//                       <Label htmlFor="label">Label</Label>
//                       <Input
//                         id="label"
//                         value={localField.label}
//                         onChange={(e) => handleFieldUpdate({ label: e.target.value })}
//                         placeholder="Field label"
//                       />
//                     </div>
//                     <div className="space-y-2">
//                       <Label htmlFor="placeholder">Placeholder</Label>
//                       <Input
//                         id="placeholder"
//                         value={localField.placeholder || ""}
//                         onChange={(e) => handleFieldUpdate({ placeholder: e.target.value })}
//                         placeholder="Placeholder text"
//                       />
//                     </div>
//                   </div>
//                   <div className="space-y-2">
//                     <Label htmlFor="description">Description</Label>
//                     <Textarea
//                       id="description"
//                       value={localField.description || ""}
//                       onChange={(e) => handleFieldUpdate({ description: e.target.value })}
//                       placeholder="Field description or help text"
//                       rows={3}
//                     />
//                   </div>
//                   <div className="grid grid-cols-2 gap-4">
//                     <div className="space-y-2">
//                       <Label htmlFor="width">Width</Label>
//                       <Select
//                         value={localField.width}
//                         onValueChange={(value: "full" | "half" | "third" | "quarter") =>
//                           handleFieldUpdate({ width: value })
//                         }
//                       >
//                         <SelectTrigger>
//                           <SelectValue />
//                         </SelectTrigger>
//                         <SelectContent>
//                           <SelectItem value="full">Full Width</SelectItem>
//                           <SelectItem value="half">Half Width</SelectItem>
//                           <SelectItem value="third">Third Width</SelectItem>
//                           <SelectItem value="quarter">Quarter Width</SelectItem>
//                         </SelectContent>
//                       </Select>
//                     </div>
//                     <div className="space-y-2">
//                       <Label htmlFor="defaultValue">Default Value</Label>
//                       <Input
//                         id="defaultValue"
//                         value={localField.defaultValue || ""}
//                         onChange={(e) => handleFieldUpdate({ defaultValue: e.target.value })}
//                         placeholder="Default value"
//                       />
//                     </div>
//                   </div>
//                   <div className="flex items-center justify-between">
//                     <div className="space-y-0.5">
//                       <Label>Visible</Label>
//                       <p className="text-sm text-muted-foreground">Show this field in the form</p>
//                     </div>
//                     <Switch
//                       checked={localField.visible ?? true}
//                       onCheckedChange={(checked) => handleFieldUpdate({ visible: checked })}
//                     />
//                   </div>
//                   <div className="flex items-center justify-between">
//                     <div className="space-y-0.5">
//                       <Label>Read Only</Label>
//                       <p className="text-sm text-muted-foreground">Make this field read-only</p>
//                     </div>
//                     <Switch
//                       checked={localField.readonly ?? false}
//                       onCheckedChange={(checked) => handleFieldUpdate({ readonly: checked })}
//                     />
//                   </div>

//                   {localField.type === "date" && (
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Auto-fetch Current Date</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Automatically set the current date as the default value
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.autoFetchDate ?? false}
//                         onCheckedChange={(checked) => handlePropertiesChange("autoFetchDate", checked)}
//                       />
//                     </div>
//                   )}

//                   {localField.type === "time" && (
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Auto-fetch Current Time</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Automatically set the current time as the default value
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.autoFetchTime ?? false}
//                         onCheckedChange={(checked) => handlePropertiesChange("autoFetchTime", checked)}
//                       />
//                     </div>
//                   )}

//                   {isLocationField && (
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Auto-fetch Current Location</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Automatically fill the user’s GPS location (address + coordinates)
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.autoFetchLocation ?? false}
//                         onCheckedChange={(checked) => handlePropertiesChange("autoFetchLocation", checked)}
//                       />
//                     </div>
//                   )}
//                 </CardContent>
//               </Card>

//               {localField.type === "lookup" && (
//                 <Card>
//                   <CardHeader>
//                     <CardTitle>Lookup Configuration</CardTitle>
//                     <CardDescription>Configure the data source and field mapping for this lookup field</CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-6">
//                     <div className="space-y-2">
//                       <Label>Data Source</Label>
//                       <Popover open={sourceOpen} onOpenChange={setSourceOpen}>
//                         <PopoverTrigger asChild>
//                           <Button
//                             variant="outline"
//                             role="combobox"
//                             aria-expanded={sourceOpen}
//                             className="w-full justify-between bg-transparent"
//                             disabled={loadingSources}
//                           >
//                             {selectedSource ? (
//                               <div className="flex items-center gap-2">
//                                 {getSourceIcon(selectedSource.type)}
//                                 <span>{selectedSource.name}</span>
//                                 <Badge variant="secondary" className="ml-auto">
//                                   {getSourceTypeLabel(selectedSource.type)}
//                                 </Badge>
//                               </div>
//                             ) : (
//                               "Select data source..."
//                             )}
//                             <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
//                           </Button>
//                         </PopoverTrigger>
//                         <PopoverContent className="w-full p-0" align="start">
//                           <Command>
//                             <CommandInput placeholder="Search data sources..." />
//                             <CommandList>
//                               <CommandEmpty>No data sources found.</CommandEmpty>
//                               <CommandGroup heading="Forms">
//                                 {lookupSources
//                                   .filter((source) => source.type === "form")
//                                   .map((source) => (
//                                     <CommandItem
//                                       key={source.id}
//                                       value={source.id}
//                                       onSelect={() => handleSourceSelect(source.id)}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2 flex-1">
//                                         <FileText className="h-4 w-4" />
//                                         <div className="flex flex-col">
//                                           <span className="font-medium">{source.name}</span>
//                                           <span className="text-xs text-muted-foreground">{source.description}</span>
//                                         </div>
//                                         <Badge variant="outline" className="ml-auto">
//                                           {source.recordCount} records
//                                         </Badge>
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                               <CommandGroup heading="Modules">
//                                 {lookupSources
//                                   .filter((source) => source.type === "module")
//                                   .map((source) => (
//                                     <CommandItem
//                                       key={source.id}
//                                       value={source.id}
//                                       onSelect={() => handleSourceSelect(source.id)}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2 flex-1">
//                                         <Database className="h-4 w-4" />
//                                         <div className="flex flex-col">
//                                           <span className="font-medium">{source.name}</span>
//                                           <span className="text-xs text-muted-foreground">{source.description}</span>
//                                         </div>
//                                         <Badge variant="outline" className="ml-auto">
//                                           {source.recordCount} records
//                                         </Badge>
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                               <CommandGroup heading="Built-in Sources">
//                                 {lookupSources
//                                   .filter((source) => source.type === "static")
//                                   .map((source) => (
//                                     <CommandItem
//                                       key={source.id}
//                                       value={source.id}
//                                       onSelect={() => handleSourceSelect(source.id)}
//                                     >
//                                       <Check
//                                         className={cn(
//                                           "mr-2 h-4 w-4",
//                                           selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
//                                         )}
//                                       />
//                                       <div className="flex items-center gap-2 flex-1">
//                                         <Zap className="h-4 w-4" />
//                                         <div className="flex flex-col">
//                                           <span className="font-medium">{source.name}</span>
//                                           <span className="text-xs text-muted-foreground">{source.description}</span>
//                                         </div>
//                                         <Badge variant="outline" className="ml-auto">
//                                           {source.recordCount} items
//                                         </Badge>
//                                       </div>
//                                     </CommandItem>
//                                   ))}
//                               </CommandGroup>
//                             </CommandList>
//                           </Command>
//                         </PopoverContent>
//                       </Popover>
//                     </div>

//                     {selectedSource && (
//                       <>
//                         <Separator />
//                         <div className="space-y-4">
//                           <div className="flex items-center gap-2">
//                             <Settings className="h-4 w-4" />
//                             <Label className="text-base font-medium">Field Mapping Configuration</Label>
//                             <Info className="h-4 w-4 text-muted-foreground" />
//                           </div>
//                           <p className="text-sm text-muted-foreground">
//                             Configure which fields from the source data to use for display, value, and storage
//                           </p>
//                           {loadingFields ? (
//                             <div className="flex items-center justify-center py-4">
//                               <Loader2 className="h-4 w-4 animate-spin mr-2" />
//                               <span className="text-sm">Loading available fields...</span>
//                             </div>
//                           ) : (
//                             <div className="grid grid-cols-2 gap-4">
//                               <div className="space-y-2">
//                                 <Label htmlFor="displayField" className="flex items-center gap-2">
//                                   Display Field
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.display || "name"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("display", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select display field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">Field to show in dropdown options</p>
//                               </div>
//                               <div className="space-y-2">
//                                 <Label htmlFor="valueField" className="flex items-center gap-2">
//                                   Value Field
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.value || "id"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("value", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select value field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">Field to use as internal option value</p>
//                               </div>
//                               <div className="space-y-2">
//                                 <Label htmlFor="storeField" className="flex items-center gap-2">
//                                   Store Field
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.store || "name"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("store", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select store field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">
//                                   Field value to actually store in record (instead of ID)
//                                 </p>
//                               </div>
//                               <div className="space-y-2">
//                                 <Label htmlFor="descriptionField" className="flex items-center gap-2">
//                                   Description Field (Optional)
//                                   <Info className="h-3 w-3 text-muted-foreground" />
//                                 </Label>
//                                 <Select
//                                   value={localField.lookup?.fieldMapping?.description || "description"}
//                                   onValueChange={(value) => handleFieldMappingUpdate("description", value)}
//                                 >
//                                   <SelectTrigger>
//                                     <SelectValue placeholder="Select description field" />
//                                   </SelectTrigger>
//                                   <SelectContent>
//                                     <SelectItem value="none">None</SelectItem>
//                                     {availableFields.map((fieldName) => (
//                                       <SelectItem key={fieldName} value={fieldName}>
//                                         {fieldName}
//                                       </SelectItem>
//                                     ))}
//                                   </SelectContent>
//                                 </Select>
//                                 <p className="text-xs text-muted-foreground">
//                                   Optional field to show as description under each option
//                                 </p>
//                               </div>
//                             </div>
//                           )}
//                         </div>
//                         <Separator />
//                       </>
//                     )}

//                     <div className="space-y-4">
//                       <div className="flex items-center justify-between">
//                         <div className="space-y-0.5">
//                           <Label>Multiple Selection</Label>
//                           <p className="text-sm text-muted-foreground">Allow selecting multiple values</p>
//                         </div>
//                         <Switch
//                           checked={localField.lookup?.multiple || false}
//                           onCheckedChange={(checked) => handleLookupChange("multiple", checked)}
//                         />
//                       </div>
//                       <div className="flex items-center justify-between">
//                         <div className="space-y-0.5">
//                           <Label>Searchable</Label>
//                           <p className="text-sm text-muted-foreground">Enable search functionality</p>
//                         </div>
//                         <Switch
//                           checked={localField.lookup?.searchable !== false}
//                           onCheckedChange={(checked) => handleLookupChange("searchable", checked)}
//                         />
//                       </div>
//                       <div className="space-y-2">
//                         <Label htmlFor="searchPlaceholder">Search Placeholder</Label>
//                         <Input
//                           id="searchPlaceholder"
//                           value={localField.lookup?.searchPlaceholder || ""}
//                           onChange={(e) => handleLookupChange("searchPlaceholder", e.target.value)}
//                           placeholder="Search..."
//                         />
//                       </div>
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </TabsContent>

//             <TabsContent value="validation" className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Validation Rules</CardTitle>
//                   <CardDescription>
//                     {supportsPattern
//                       ? "Configure required, length/range, pattern and custom error message"
//                       : "Set basic validation rules for this field"}
//                   </CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-5">
//                   <div className="flex items-center justify-between">
//                     <div className="space-y-0.5">
//                       <Label>Required</Label>
//                       <p className="text-sm text-muted-foreground">This field must be filled</p>
//                     </div>
//                     <Switch
//                       checked={localField.validation?.required || false}
//                       onCheckedChange={(checked) => handleValidationChange("required", checked)}
//                     />
//                   </div>

//                   {["text", "textarea", "email", "url", "tel", "password"].includes(localField.type ?? "") && (
//                     <div className="grid grid-cols-2 gap-4">
//                       <div className="space-y-2">
//                         <Label htmlFor="minLength">Minimum Length</Label>
//                         <Input
//                           id="minLength"
//                           type="number"
//                           value={localField.validation?.minLength || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "minLength",
//                               e.target.value ? Number.parseInt(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="0"
//                         />
//                       </div>
//                       <div className="space-y-2">
//                         <Label htmlFor="maxLength">Maximum Length</Label>
//                         <Input
//                           id="maxLength"
//                           type="number"
//                           value={localField.validation?.maxLength || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "maxLength",
//                               e.target.value ? Number.parseInt(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="100"
//                         />
//                       </div>
//                     </div>
//                   )}

//                   {localField.type === "number" && (
//                     <div className="grid grid-cols-2 gap-4">
//                       <div className="space-y-2">
//                         <Label htmlFor="min">Minimum Value</Label>
//                         <Input
//                           id="min"
//                           type="number"
//                           value={localField.validation?.min || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "min",
//                               e.target.value ? Number.parseFloat(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="0"
//                         />
//                       </div>
//                       <div className="space-y-2">
//                         <Label htmlFor="max">Maximum Value</Label>
//                         <Input
//                           id="max"
//                           type="number"
//                           value={localField.validation?.max || ""}
//                           onChange={(e) =>
//                             handleValidationChange(
//                               "max",
//                               e.target.value ? Number.parseFloat(e.target.value) : undefined
//                             )
//                           }
//                           placeholder="100"
//                         />
//                       </div>
//                     </div>
//                   )}

//                   {supportsPattern && (
//                     <div className="space-y-2">
//                       <Label htmlFor="pattern">Pattern (Regex)</Label>
//                       <Input
//                         id="pattern"
//                         value={localField.validation?.pattern || ""}
//                         onChange={(e) => handleValidationChange("pattern", e.target.value)}
//                         placeholder={
//                           localField.type === "number"
//                             ? "^\\d{6}$ (exactly 6 digits)"
//                             : localField.type === "tel"
//                               ? "^[6-9]\\d{9}$ (Indian mobile)"
//                               : localField.type === "email"
//                                 ? "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
//                                 : "^[a-zA-Z0-9]+$ (alphanumeric only)"
//                         }
//                         className="font-mono"
//                       />
//                       <p className="text-xs text-muted-foreground">
//                         {localField.type === "number"
//                           ? "Useful for exact digit count, no decimals, or specific number formats (leave empty to disable)"
//                           : "Regular expression for custom validation (leave empty to disable)"}
//                       </p>
//                     </div>
//                   )}

//                   <div className="space-y-2">
//                     <Label htmlFor="message">Custom Error Message</Label>
//                     <Input
//                       id="message"
//                       value={localField.validation?.message || ""}
//                       onChange={(e) => handleValidationChange("message", e.target.value)}
//                       placeholder="This field is invalid"
//                     />
//                   </div>
//                 </CardContent>
//               </Card>
//             </TabsContent>

//             <TabsContent value="options" className="space-y-6">
//               {["select", "multi-select", "radio"].includes(localField.type ?? "") && (
//                 <Card>
//                   <CardHeader>
//                     <div className="flex items-center justify-between">
//                       <div>
//                         <CardTitle>Field Options</CardTitle>
//                         <CardDescription>
//                           {localField.isDependent
//                             ? "Configure dependent / cascading options"
//                             : "Configure static options"}
//                         </CardDescription>
//                       </div>
//                       <div className="flex items-center space-x-2">
//                         <Label htmlFor="dependent-toggle">Dependent Mode</Label>
//                         <Switch
//                           id="dependent-toggle"
//                           checked={localField.isDependent ?? false}
//                           onCheckedChange={(checked) =>
//                             handleFieldUpdate({
//                               isDependent: checked,
//                               options: checked ? undefined : localField.options ?? [],
//                               dependentGroups: checked ? localField.dependentGroups ?? [] : undefined,
//                               parentFieldId: checked ? localField.parentFieldId : undefined,
//                             })
//                           }
//                         />
//                       </div>
//                     </div>
//                   </CardHeader>
//                   <CardContent className="space-y-6 pt-6">
//                     {localField.isDependent ? (
//                       <DependentOptionsEditor
//                         field={localField}
//                         allFormFields={allFormFields}
//                         onUpdate={handleFieldUpdate}
//                       />
//                     ) : (
//                       <div className="space-y-3">
//                         {(localField.options || []).map((option, index) => (
//                           <div key={option.id} className="flex items-center gap-2 p-3 border rounded-lg">
//                             <div className="flex-1 grid grid-cols-2 gap-2">
//                               <Input
//                                 value={option.label}
//                                 onChange={(e) => updateOption(index, { label: e.target.value })}
//                                 placeholder="Option label"
//                               />
//                               <Input
//                                 value={option.value}
//                                 onChange={(e) => updateOption(index, { value: e.target.value })}
//                                 placeholder="Option value"
//                               />
//                             </div>
//                             <Button
//                               variant="outline"
//                               size="sm"
//                               onClick={() => removeOption(index)}
//                               className="text-red-600 hover:text-red-700"
//                             >
//                               <X className="h-4 w-4" />
//                             </Button>
//                           </div>
//                         ))}
//                         <Button onClick={addOption} variant="outline" className="w-full">
//                           <Plus className="h-4 w-4 mr-2" />
//                           Add Option
//                         </Button>
//                       </div>
//                     )}
//                   </CardContent>
//                 </Card>
//               )}

//               {localField.type === "file" && (
//                 <Card>
//                   <CardHeader>
//                     <CardTitle>File Upload Settings</CardTitle>
//                     <CardDescription>Configure file upload restrictions</CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-4">
//                     <div className="space-y-2">
//                       <Label htmlFor="accept">Accepted File Types</Label>
//                       <Input
//                         id="accept"
//                         value={localField.properties?.accept || ""}
//                         onChange={(e) => handlePropertiesChange("accept", e.target.value)}
//                         placeholder=".jpg,.png,.pdf"
//                       />
//                     </div>
//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Multiple Files</Label>
//                         <p className="text-sm text-muted-foreground">Allow multiple file uploads</p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.multiple || false}
//                         onCheckedChange={(checked) => handlePropertiesChange("multiple", checked)}
//                       />
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </TabsContent>

//             <TabsContent value="advanced" className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Advanced Settings</CardTitle>
//                   <CardDescription>Advanced configuration options</CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                   <div className="space-y-2">
//                     <Label htmlFor="formula">Formula</Label>
//                     <Textarea
//                       id="formula"
//                       value={localField.formula || ""}
//                       onChange={(e) => handleFieldUpdate({ formula: e.target.value })}
//                       placeholder="Enter formula (e.g., field1 + field2)"
//                       rows={3}
//                     />
//                   </div>
//                   <Separator />
//                   <div className="space-y-2">
//                     <Label>Field Properties (JSON)</Label>
//                     <Textarea
//                       value={JSON.stringify(localField.properties || {}, null, 2)}
//                       onChange={(e) => {
//                         try {
//                           const properties = JSON.parse(e.target.value)
//                           handleFieldUpdate({ properties })
//                         } catch (error) {
//                           // Invalid JSON, ignore
//                         }
//                       }}
//                       placeholder="{}"
//                       rows={5}
//                       className="font-mono text-sm"
//                     />
//                   </div>
//                 </CardContent>
//               </Card>

//               {localField.type === "unique-id" && (
//                 <Card className="border-2 border-blue-200 bg-blue-50/30">
//                   <CardHeader className="pb-4">
//                     <CardTitle className="flex items-center gap-2">
//                       <Hash className="h-5 w-5 text-blue-600" />
//                       Unique ID Generation Settings
//                     </CardTitle>
//                     <CardDescription>
//                       Choose how unique identifiers should be generated for this field
//                     </CardDescription>
//                   </CardHeader>
//                   <CardContent className="space-y-6">
//                     <div className="space-y-2">
//                       <Label>Generation Method</Label>
//                       <Select
//                         value={localField.properties?.uniqueIdMode || "uuid"}
//                         onValueChange={(value) => handlePropertiesChange("uniqueIdMode", value)}
//                       >
//                         <SelectTrigger>
//                           <SelectValue placeholder="Select generation method" />
//                         </SelectTrigger>
//                         <SelectContent>
//                           <SelectItem value="uuid">UUID v4 (recommended - 36 characters)</SelectItem>
//                           <SelectItem value="sequential">Sequential Number (1, 2, 3...)</SelectItem>
//                           <SelectItem value="prefix">Custom Prefix + Number</SelectItem>
//                         </SelectContent>
//                       </Select>
//                       <p className="text-xs text-muted-foreground mt-1">
//                         {localField.properties?.uniqueIdMode === "uuid" &&
//                           "Generates a random 36-character UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)"}
//                         {localField.properties?.uniqueIdMode === "sequential" &&
//                           "Increments a number for each new record"}
//                         {localField.properties?.uniqueIdMode === "prefix" &&
//                           "Adds your custom prefix before a sequential number"}
//                       </p>
//                     </div>

//                     {localField.properties?.uniqueIdMode === "prefix" && (
//                       <div className="space-y-2">
//                         <Label htmlFor="prefix">Custom Prefix</Label>
//                         <Input
//                           id="prefix"
//                           value={localField.properties?.uniqueIdPrefix || ""}
//                           onChange={(e) => handlePropertiesChange("uniqueIdPrefix", e.target.value)}
//                           placeholder="INV-, ORDER-, TICKET-"
//                           maxLength={10}
//                         />
//                         <p className="text-xs text-muted-foreground">
//                           Example: "INV-" → INV-000001, INV-000002...
//                         </p>
//                       </div>
//                     )}

//                     {(localField.properties?.uniqueIdMode === "sequential" ||
//                       localField.properties?.uniqueIdMode === "prefix") && (
//                       <>
//                         <div className="grid grid-cols-2 gap-4">
//                           <div className="space-y-2">
//                             <Label htmlFor="startNumber">Start From</Label>
//                             <Input
//                               id="startNumber"
//                               type="number"
//                               min="1"
//                               value={localField.properties?.uniqueIdStart || "1"}
//                               onChange={(e) =>
//                                 handlePropertiesChange("uniqueIdStart", Number(e.target.value) || 1)
//                               }
//                             />
//                           </div>
//                           <div className="space-y-2">
//                             <Label htmlFor="minDigits">Minimum Digits (zero padding)</Label>
//                             <Input
//                               id="minDigits"
//                               type="number"
//                               min="1"
//                               max="10"
//                               value={localField.properties?.uniqueIdMinDigits || "6"}
//                               onChange={(e) =>
//                                 handlePropertiesChange("uniqueIdMinDigits", Number(e.target.value) || 6)
//                               }
//                             />
//                             <p className="text-xs text-muted-foreground">
//                               Example: 6 digits → 000001, 000042
//                             </p>
//                           </div>
//                         </div>
//                       </>
//                     )}

//                     <div className="flex items-center justify-between pt-4 border-t">
//                       <div className="space-y-0.5">
//                         <Label>Hidden Field</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Hide this field from users (still generated automatically)
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.properties?.hidden ?? true}
//                         onCheckedChange={(checked) => handlePropertiesChange("hidden", checked)}
//                       />
//                     </div>

//                     <div className="flex items-center justify-between">
//                       <div className="space-y-0.5">
//                         <Label>Read Only</Label>
//                         <p className="text-sm text-muted-foreground">
//                           Prevent manual editing of the generated ID
//                         </p>
//                       </div>
//                       <Switch
//                         checked={localField.readonly !== false}
//                         onCheckedChange={(checked) => handleFieldUpdate({ readonly: checked })}
//                       />
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </TabsContent>
//           </ScrollArea>
//         </Tabs>

//         <div className="flex justify-between items-center gap-2 pt-4 border-t">
//           <div className="text-sm text-muted-foreground">
//             {hasChanges && "You have unsaved changes"}
//           </div>
//           <div className="flex gap-2">
//             <Button variant="outline" onClick={handleClose}>
//               Cancel
//             </Button>
//             <Button onClick={handleSave} disabled={saving || !hasChanges}>
//               {saving ? (
//                 <>
//                   <Loader2 className="h-4 w-4 mr-2 animate-spin" />
//                   Saving...
//                 </>
//               ) : (
//                 <>
//                   <Save className="h-4 w-4 mr-2" />
//                   Save Changes
//                 </>
//               )}
//             </Button>
//           </div>
//         </div>
//       </DialogContent>
//     </Dialog>
//   )
// }


"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import {
  Check,
  ChevronsUpDown,
  Settings,
  X,
  Plus,
  Database,
  FileText,
  Zap,
  Info,
  Loader2,
  Save,
  Hash,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import type { FormField, FieldOption } from "@/types/form-builder"

// ────────────────────────────────────────────────────────────────
//  IMPORTANT: ADD THESE TYPES TO YOUR types/form-builder.ts FILE
// ────────────────────────────────────────────────────────────────

export interface DependentOptionGroup {
  parentValue: string           // e.g. "Rajasthan", "Gujarat"
  options: FieldOption[]        // child options shown when parent matches
}

// You should extend your existing FormField interface like this:

// export interface FormField {
//   id: string
//   type: string
//   label: string
//   placeholder?: string
//   description?: string
//   defaultValue?: string
//   visible?: boolean
//   readonly?: boolean
//   width?: "full" | "half" | "third" | "quarter"
//   options?: FieldOption[]
//   properties?: Record<string, any>
//   validation?: {
//     required?: boolean
//     minLength?: number
//     maxLength?: number
//     min?: number
//     max?: number
//     pattern?: string
//     message?: string
//   }
//   formula?: string
//   lookup?: any
//   // ── NEW properties for dependent / cascading dropdowns ──
//   isDependent?: boolean
//   parentFieldId?: string
//   dependentGroups?: DependentOptionGroup[]
// }

// ────────────────────────────────────────────────────────────────
//  DEPENDENT OPTIONS EDITOR SUB-COMPONENT
// ────────────────────────────────────────────────────────────────

interface DependentOptionsEditorProps {
  field: FormField
  allFormFields: FormField[]
  onUpdate: (updates: Partial<FormField>) => void
}

function DependentOptionsEditor({
  field,
  allFormFields,
  onUpdate,
}: DependentOptionsEditorProps) {
  const possibleParents = allFormFields.filter(f => {
    if (f.id === field.id) return false;

    // Make type comparison very tolerant
    const t = String(f.type || "").trim().toLowerCase();

    return (
      t === "select" ||
      t === "dropdown" ||
      t === "single-select" ||
      t === "multi-select" ||
      t === "multiselect" ||
      t === "choice" ||
      t === "radio" ||
      t === "radiogroup" ||
      t.includes("select") ||     // catches almost everything
      t.includes("radio")
    );
  });

  console.log("DependentOptionsEditor - received field type:", field.type)
  console.log("DependentOptionsEditor - received allFormFields count:", allFormFields.length)
  console.log("DependentOptionsEditor - all fields collected:", allFormFields.map(f => ({
    id: f.id,
    label: f.label || "(no label)",
    type: f.type || "(no type)"
  })))
  console.log("DependentOptionsEditor - possible parents:", possibleParents.map(p => `${p.label} (${p.type})`))

  const addGroup = () => {
    const newGroup: DependentOptionGroup = {
      parentValue: "",
      options: [
        {
          id: `opt_${Date.now()}`,
          label: "New Option",
          value: `val_${Date.now()}`,
          order: 0,
        },
      ],
    }
    onUpdate({
      dependentGroups: [...(field.dependentGroups || []), newGroup],
    })
  }

  const updateGroup = (groupIndex: number, updates: Partial<DependentOptionGroup>) => {
    const groups = [...(field.dependentGroups || [])]
    groups[groupIndex] = { ...groups[groupIndex], ...updates }
    onUpdate({ dependentGroups: groups })
  }

  const removeGroup = (groupIndex: number) => {
    const groups = (field.dependentGroups || []).filter((_, i) => i !== groupIndex)
    onUpdate({ dependentGroups: groups })
  }

  const addChildOption = (groupIndex: number) => {
    const group = field.dependentGroups?.[groupIndex]
    if (!group) return

    const newOption: FieldOption = {
      id: `opt_${Date.now()}`,
      label: "New Child Option",
      value: `child_${group.options.length + 1}`,
      order: group.options.length,
    }

    const newOptions = [...group.options, newOption]
    updateGroup(groupIndex, { options: newOptions })
  }

  const updateChildOption = (
    groupIndex: number,
    optionIndex: number,
    updates: Partial<FieldOption>
  ) => {
    const group = field.dependentGroups?.[groupIndex]
    if (!group) return

    const newOptions = [...group.options]
    newOptions[optionIndex] = { ...newOptions[optionIndex], ...updates }
    updateGroup(groupIndex, { options: newOptions })
  }

  const removeChildOption = (groupIndex: number, optionIndex: number) => {
    const group = field.dependentGroups?.[groupIndex]
    if (!group) return

    const newOptions = group.options.filter((_, i) => i !== optionIndex)
    updateGroup(groupIndex, { options: newOptions })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Parent Field (controls this dropdown)</Label>
        <Select
          value={field.parentFieldId || ""}
          onValueChange={(value) => onUpdate({ parentFieldId: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select which field controls the options" />
          </SelectTrigger>
          <SelectContent>
            {possibleParents.map((parent) => (
              <SelectItem key={parent.id} value={parent.id}>
                {parent.label} ({parent.type})
              </SelectItem>
            ))}

            {possibleParents.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground pointer-events-none">
                No other dropdown, radio or multi-select fields found yet.
                <br />
                Add one first, then come back to set dependency.
              </div>
            )}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          This field will show different options depending on what is selected in the parent field.
        </p>
      </div>

      <div className="space-y-4">
        {(field.dependentGroups || []).map((group, groupIndex) => (
          <Card key={groupIndex} className="p-4 border border-gray-200">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 space-y-1.5">
                <Label>When parent value is</Label>
                <Input
                  value={group.parentValue}
                  onChange={(e) =>
                    updateGroup(groupIndex, { parentValue: e.target.value })
                  }
                  placeholder="e.g. Rajasthan, Gujarat, Maharashtra"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => removeGroup(groupIndex)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-3 pl-4 border-l-2 border-gray-200">
              <p className="text-sm font-medium text-gray-700">
                Options shown when the above value is selected:
              </p>

              {group.options.map((option, optIndex) => (
                <div key={option.id} className="flex items-center gap-2">
                  <Input
                    value={option.label}
                    onChange={(e) =>
                      updateChildOption(groupIndex, optIndex, { label: e.target.value })
                    }
                    placeholder="e.g. Jaipur, Jodhpur, Udaipur"
                    className="flex-1"
                  />
                  <Input
                    value={option.value}
                    onChange={(e) =>
                      updateChildOption(groupIndex, optIndex, { value: e.target.value })
                    }
                    placeholder="e.g. jaipur, jodhpur"
                    className="w-44"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => removeChildOption(groupIndex, optIndex)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => addChildOption(groupIndex)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add child option
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Button onClick={addGroup} variant="outline" className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Add New Group (for another parent value)
      </Button>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
        <strong>Example usage:</strong><br />
        Parent field = "State"<br />
        Group 1: parentValue = "Rajasthan" → options: Jaipur, Jodhpur, Udaipur, Kota<br />
        Group 2: parentValue = "Gujarat"   → options: Ahmedabad, Surat, Vadodara, Rajkot
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
//  MAIN FIELD SETTINGS COMPONENT
// ────────────────────────────────────────────────────────────────

interface FieldSettingsProps {
  field: FormField
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (updates: Partial<FormField>) => void
  allFormFields?: FormField[]           // ← NEW: required for parent field selection
}

export default function FieldSettings({
  field,
  open,
  onOpenChange,
  onUpdate,
  allFormFields,
}: FieldSettingsProps) {
  const { toast } = useToast()
  const [localField, setLocalField] = useState<FormField>(field)
  const [lookupSources, setLookupSources] = useState<any[]>([])
  const [loadingSources, setLoadingSources] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [availableFields, setAvailableFields] = useState<string[]>([])
  const [loadingFields, setLoadingFields] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)

  // Debug: log every time FieldSettings receives props
  console.log("FieldSettings rendered - received allFormFields count:", allFormFields?.length ?? 0)
  console.log("FieldSettings received field id:", field.id, "type:", field.type)

  useEffect(() => {
    setLocalField(field)
    setHasChanges(false)
  }, [field])

  useEffect(() => {
    if (localField.type === "lookup") {
      loadLookupSources()
    }
  }, [localField.type])

  useEffect(() => {
    if (localField.lookup?.sourceId) {
      loadAvailableFields(localField.lookup.sourceId)
    }
  }, [localField.lookup?.sourceId])

  const loadLookupSources = async () => {
    setLoadingSources(true)
    try {
      const response = await fetch("/api/lookup/sources")
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setLookupSources(result.data || [])
        }
      }
    } catch (error) {
      console.error("Error loading lookup sources:", error)
      toast({
        title: "Error",
        description: "Failed to load lookup sources",
        variant: "destructive",
      })
    } finally {
      setLoadingSources(false)
    }
  }

  const loadAvailableFields = async (sourceId: string) => {
    setLoadingFields(true)
    try {
      const response = await fetch(`/api/lookup/fields?sourceId=${sourceId}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setAvailableFields(result.data || [])
        }
      }
    } catch (error) {
      console.error("Error loading available fields:", error)
      setAvailableFields(["id", "name", "title", "label", "description", "email"])
    } finally {
      setLoadingFields(false)
    }
  }

  const handleFieldUpdate = (updates: Partial<FormField>) => {
    const updatedField = { ...localField, ...updates }
    setLocalField(updatedField)
    setHasChanges(true)
  }

  const handleValidationChange = (key: string, value: any) => {
    const newValidation = { ...localField.validation, [key]: value }
    handleFieldUpdate({ validation: newValidation })
  }

  const handlePropertiesChange = (key: string, value: any) => {
    const newProperties = { ...localField.properties, [key]: value }
    handleFieldUpdate({ properties: newProperties })
  }

  const handleLookupChange = (key: string, value: any) => {
    const currentLookup = localField.lookup || {}
    const newLookup = { ...currentLookup, [key]: value }
    handleFieldUpdate({ lookup: newLookup })
  }

  const handleFieldMappingUpdate = (mappingKey: string, value: string) => {
    const currentLookup = localField.lookup || {}
    const currentMapping = currentLookup.fieldMapping || {
      display: "name",
      value: "id",
      store: "name",
    }
    const newLookup = {
      ...currentLookup,
      fieldMapping: {
        ...currentMapping,
        [mappingKey]: value,
      },
    }
    handleFieldUpdate({ lookup: newLookup })
  }

  const handleSourceSelect = (sourceId: string) => {
    const source = lookupSources.find((s) => s.id === sourceId)
    const newLookup = {
      sourceId: sourceId,
      sourceType: source?.type as "form" | "module" | "static",
      multiple: localField.lookup?.multiple || false,
      searchable: localField.lookup?.searchable !== false,
      fieldMapping: {
        display: "name",
        value: "id",
        store: "name",
        description: "description",
      },
    }
    handleFieldUpdate({ lookup: newLookup })
    setSourceOpen(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      onUpdate(localField)
      setHasChanges(false)
      onOpenChange(false)
      toast({
        title: "Success",
        description: "Field settings saved successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save field settings",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (hasChanges) {
      const confirmClose = window.confirm("You have unsaved changes. Are you sure you want to close?")
      if (!confirmClose) return
    }
    onOpenChange(false)
  }

  const addOption = () => {
    const newOption: FieldOption = {
      id: `opt_${Date.now()}`,
      label: "New Option",
      value: `option_${(localField.options || []).length + 1}`,
      order: (localField.options || []).length,
    }
    handleFieldUpdate({ options: [...(localField.options || []), newOption] })
  }

  const updateOption = (index: number, updates: Partial<FieldOption>) => {
    const newOptions = [...(localField.options || [])]
    newOptions[index] = { ...newOptions[index], ...updates }
    handleFieldUpdate({ options: newOptions })
  }

  const removeOption = (index: number) => {
    const newOptions = (localField.options || []).filter((_, i) => i !== index)
    handleFieldUpdate({ options: newOptions })
  }

  const getSourceIcon = (type: string) => {
    switch (type) {
      case "form":
        return <FileText className="h-4 w-4" />
      case "module":
        return <Database className="h-4 w-4" />
      case "static":
        return <Zap className="h-4 w-4" />
      default:
        return <Database className="h-4 w-4" />
    }
  }

  const getSourceTypeLabel = (type: string) => {
    switch (type) {
      case "form":
        return "Form"
      case "module":
        return "Module"
      case "static":
        return "Built-in"
      default:
        return "Unknown"
    }
  }

  const selectedSource = lookupSources.find((source) => source.id === localField.lookup?.sourceId)

  const isLocationField = ["location", "newlocation"].includes(localField.type ?? "")

  const supportsPattern = ["text", "textarea", "email", "url", "tel", "password", "number"].includes(
    localField.type ?? ""
  )

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Field Settings - {localField.label || "Unnamed"}
            {hasChanges && <Badge variant="secondary">Unsaved Changes</Badge>}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="validation">Validation</TabsTrigger>
            <TabsTrigger value="options">Options</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[350px] mt-4 border rounded-lg">
            <TabsContent value="general" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>Configure the basic properties of your field</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="label">Label</Label>
                      <Input
                        id="label"
                        value={localField.label}
                        onChange={(e) => handleFieldUpdate({ label: e.target.value })}
                        placeholder="Field label"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="placeholder">Placeholder</Label>
                      <Input
                        id="placeholder"
                        value={localField.placeholder || ""}
                        onChange={(e) => handleFieldUpdate({ placeholder: e.target.value })}
                        placeholder="Placeholder text"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={localField.description || ""}
                      onChange={(e) => handleFieldUpdate({ description: e.target.value })}
                      placeholder="Field description or help text"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="width">Width</Label>
                      <Select
                        value={localField.width}
                        onValueChange={(value: "full" | "half" | "third" | "quarter") =>
                          handleFieldUpdate({ width: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full">Full Width</SelectItem>
                          <SelectItem value="half">Half Width</SelectItem>
                          <SelectItem value="third">Third Width</SelectItem>
                          <SelectItem value="quarter">Quarter Width</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defaultValue">Default Value</Label>
                      <Input
                        id="defaultValue"
                        value={localField.defaultValue || ""}
                        onChange={(e) => handleFieldUpdate({ defaultValue: e.target.value })}
                        placeholder="Default value"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Visible</Label>
                      <p className="text-sm text-muted-foreground">Show this field in the form</p>
                    </div>
                    <Switch
                      checked={localField.visible ?? true}
                      onCheckedChange={(checked) => handleFieldUpdate({ visible: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Read Only</Label>
                      <p className="text-sm text-muted-foreground">Make this field read-only</p>
                    </div>
                    <Switch
                      checked={localField.readonly ?? false}
                      onCheckedChange={(checked) => handleFieldUpdate({ readonly: checked })}
                    />
                  </div>

                  {localField.type === "date" && (
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Auto-fetch Current Date</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically set the current date as the default value
                        </p>
                      </div>
                      <Switch
                        checked={localField.properties?.autoFetchDate ?? false}
                        onCheckedChange={(checked) => handlePropertiesChange("autoFetchDate", checked)}
                      />
                    </div>
                  )}

                  {localField.type === "time" && (
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Auto-fetch Current Time</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically set the current time as the default value
                        </p>
                      </div>
                      <Switch
                        checked={localField.properties?.autoFetchTime ?? false}
                        onCheckedChange={(checked) => handlePropertiesChange("autoFetchTime", checked)}
                      />
                    </div>
                  )}

                  {isLocationField && (
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Auto-fetch Current Location</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically fill the user’s GPS location (address + coordinates)
                        </p>
                      </div>
                      <Switch
                        checked={localField.properties?.autoFetchLocation ?? false}
                        onCheckedChange={(checked) => handlePropertiesChange("autoFetchLocation", checked)}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {localField.type === "lookup" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Lookup Configuration</CardTitle>
                    <CardDescription>Configure the data source and field mapping for this lookup field</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>Data Source</Label>
                      <Popover open={sourceOpen} onOpenChange={setSourceOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={sourceOpen}
                            className="w-full justify-between bg-transparent"
                            disabled={loadingSources}
                          >
                            {selectedSource ? (
                              <div className="flex items-center gap-2">
                                {getSourceIcon(selectedSource.type)}
                                <span>{selectedSource.name}</span>
                                <Badge variant="secondary" className="ml-auto">
                                  {getSourceTypeLabel(selectedSource.type)}
                                </Badge>
                              </div>
                            ) : (
                              "Select data source..."
                            )}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search data sources..." />
                            <CommandList>
                              <CommandEmpty>No data sources found.</CommandEmpty>
                              <CommandGroup heading="Forms">
                                {lookupSources
                                  .filter((source) => source.type === "form")
                                  .map((source) => (
                                    <CommandItem
                                      key={source.id}
                                      value={source.id}
                                      onSelect={() => handleSourceSelect(source.id)}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
                                        )}
                                      />
                                      <div className="flex items-center gap-2 flex-1">
                                        <FileText className="h-4 w-4" />
                                        <div className="flex flex-col">
                                          <span className="font-medium">{source.name}</span>
                                          <span className="text-xs text-muted-foreground">{source.description}</span>
                                        </div>
                                        <Badge variant="outline" className="ml-auto">
                                          {source.recordCount} records
                                        </Badge>
                                      </div>
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                              <CommandGroup heading="Modules">
                                {lookupSources
                                  .filter((source) => source.type === "module")
                                  .map((source) => (
                                    <CommandItem
                                      key={source.id}
                                      value={source.id}
                                      onSelect={() => handleSourceSelect(source.id)}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
                                        )}
                                      />
                                      <div className="flex items-center gap-2 flex-1">
                                        <Database className="h-4 w-4" />
                                        <div className="flex flex-col">
                                          <span className="font-medium">{source.name}</span>
                                          <span className="text-xs text-muted-foreground">{source.description}</span>
                                        </div>
                                        <Badge variant="outline" className="ml-auto">
                                          {source.recordCount} records
                                        </Badge>
                                      </div>
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                              <CommandGroup heading="Built-in Sources">
                                {lookupSources
                                  .filter((source) => source.type === "static")
                                  .map((source) => (
                                    <CommandItem
                                      key={source.id}
                                      value={source.id}
                                      onSelect={() => handleSourceSelect(source.id)}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          selectedSource?.id === source.id ? "opacity-100" : "opacity-0",
                                        )}
                                      />
                                      <div className="flex items-center gap-2 flex-1">
                                        <Zap className="h-4 w-4" />
                                        <div className="flex flex-col">
                                          <span className="font-medium">{source.name}</span>
                                          <span className="text-xs text-muted-foreground">{source.description}</span>
                                        </div>
                                        <Badge variant="outline" className="ml-auto">
                                          {source.recordCount} items
                                        </Badge>
                                      </div>
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {selectedSource && (
                      <>
                        <Separator />
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            <Label className="text-base font-medium">Field Mapping Configuration</Label>
                            <Info className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Configure which fields from the source data to use for display, value, and storage
                          </p>
                          {loadingFields ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              <span className="text-sm">Loading available fields...</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="displayField" className="flex items-center gap-2">
                                  Display Field
                                  <Info className="h-3 w-3 text-muted-foreground" />
                                </Label>
                                <Select
                                  value={localField.lookup?.fieldMapping?.display || "name"}
                                  onValueChange={(value) => handleFieldMappingUpdate("display", value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select display field" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableFields.map((fieldName) => (
                                      <SelectItem key={fieldName} value={fieldName}>
                                        {fieldName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Field to show in dropdown options</p>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="valueField" className="flex items-center gap-2">
                                  Value Field
                                  <Info className="h-3 w-3 text-muted-foreground" />
                                </Label>
                                <Select
                                  value={localField.lookup?.fieldMapping?.value || "id"}
                                  onValueChange={(value) => handleFieldMappingUpdate("value", value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select value field" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableFields.map((fieldName) => (
                                      <SelectItem key={fieldName} value={fieldName}>
                                        {fieldName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Field to use as internal option value</p>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="storeField" className="flex items-center gap-2">
                                  Store Field
                                  <Info className="h-3 w-3 text-muted-foreground" />
                                </Label>
                                <Select
                                  value={localField.lookup?.fieldMapping?.store || "name"}
                                  onValueChange={(value) => handleFieldMappingUpdate("store", value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select store field" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableFields.map((fieldName) => (
                                      <SelectItem key={fieldName} value={fieldName}>
                                        {fieldName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  Field value to actually store in record (instead of ID)
                                </p>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="descriptionField" className="flex items-center gap-2">
                                  Description Field (Optional)
                                  <Info className="h-3 w-3 text-muted-foreground" />
                                </Label>
                                <Select
                                  value={localField.lookup?.fieldMapping?.description || "description"}
                                  onValueChange={(value) => handleFieldMappingUpdate("description", value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select description field" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {availableFields.map((fieldName) => (
                                      <SelectItem key={fieldName} value={fieldName}>
                                        {fieldName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  Optional field to show as description under each option
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                        <Separator />
                      </>
                    )}

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Multiple Selection</Label>
                          <p className="text-sm text-muted-foreground">Allow selecting multiple values</p>
                        </div>
                        <Switch
                          checked={localField.lookup?.multiple || false}
                          onCheckedChange={(checked) => handleLookupChange("multiple", checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Searchable</Label>
                          <p className="text-sm text-muted-foreground">Enable search functionality</p>
                        </div>
                        <Switch
                          checked={localField.lookup?.searchable !== false}
                          onCheckedChange={(checked) => handleLookupChange("searchable", checked)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="searchPlaceholder">Search Placeholder</Label>
                        <Input
                          id="searchPlaceholder"
                          value={localField.lookup?.searchPlaceholder || ""}
                          onChange={(e) => handleLookupChange("searchPlaceholder", e.target.value)}
                          placeholder="Search..."
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="validation" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Validation Rules</CardTitle>
                  <CardDescription>
                    {supportsPattern
                      ? "Configure required, length/range, pattern and custom error message"
                      : "Set basic validation rules for this field"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Required</Label>
                      <p className="text-sm text-muted-foreground">This field must be filled</p>
                    </div>
                    <Switch
                      checked={localField.validation?.required || false}
                      onCheckedChange={(checked) => handleValidationChange("required", checked)}
                    />
                  </div>

                  {["text", "textarea", "email", "url", "tel", "password"].includes(localField.type ?? "") && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="minLength">Minimum Length</Label>
                        <Input
                          id="minLength"
                          type="number"
                          value={localField.validation?.minLength || ""}
                          onChange={(e) =>
                            handleValidationChange(
                              "minLength",
                              e.target.value ? Number.parseInt(e.target.value) : undefined
                            )
                          }
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="maxLength">Maximum Length</Label>
                        <Input
                          id="maxLength"
                          type="number"
                          value={localField.validation?.maxLength || ""}
                          onChange={(e) =>
                            handleValidationChange(
                              "maxLength",
                              e.target.value ? Number.parseInt(e.target.value) : undefined
                            )
                          }
                          placeholder="100"
                        />
                      </div>
                    </div>
                  )}

                  {localField.type === "number" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="min">Minimum Value</Label>
                        <Input
                          id="min"
                          type="number"
                          value={localField.validation?.min || ""}
                          onChange={(e) =>
                            handleValidationChange(
                              "min",
                              e.target.value ? Number.parseFloat(e.target.value) : undefined
                            )
                          }
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="max">Maximum Value</Label>
                        <Input
                          id="max"
                          type="number"
                          value={localField.validation?.max || ""}
                          onChange={(e) =>
                            handleValidationChange(
                              "max",
                              e.target.value ? Number.parseFloat(e.target.value) : undefined
                            )
                          }
                          placeholder="100"
                        />
                      </div>
                    </div>
                  )}

                  {supportsPattern && (
                    <div className="space-y-2">
                      <Label htmlFor="pattern">Pattern (Regex)</Label>
                      <Input
                        id="pattern"
                        value={localField.validation?.pattern || ""}
                        onChange={(e) => handleValidationChange("pattern", e.target.value)}
                        placeholder={
                          localField.type === "number"
                            ? "^\\d{6}$ (exactly 6 digits)"
                            : localField.type === "tel"
                              ? "^[6-9]\\d{9}$ (Indian mobile)"
                              : localField.type === "email"
                                ? "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
                                : "^[a-zA-Z0-9]+$ (alphanumeric only)"
                        }
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        {localField.type === "number"
                          ? "Useful for exact digit count, no decimals, or specific number formats (leave empty to disable)"
                          : "Regular expression for custom validation (leave empty to disable)"}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="message">Custom Error Message</Label>
                    <Input
                      id="message"
                      value={localField.validation?.message || ""}
                      onChange={(e) => handleValidationChange("message", e.target.value)}
                      placeholder="This field is invalid"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="options" className="space-y-6">
              {["select", "multi-select", "radio"].includes(localField.type ?? "") && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Field Options</CardTitle>
                        <CardDescription>
                          {localField.isDependent
                            ? "Configure dependent / cascading options"
                            : "Configure static options"}
                        </CardDescription>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Label htmlFor="dependent-toggle">Dependent Mode</Label>
                        <Switch
                          id="dependent-toggle"
                          checked={localField.isDependent ?? false}
                          onCheckedChange={(checked) =>
                            handleFieldUpdate({
                              isDependent: checked,
                              options: checked ? undefined : localField.options ?? [],
                              dependentGroups: checked ? localField.dependentGroups ?? [] : undefined,
                              parentFieldId: checked ? localField.parentFieldId : undefined,
                            })
                          }
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-6">
                    {localField.isDependent ? (
                      <DependentOptionsEditor
                        field={localField}
                        allFormFields={allFormFields ?? []}
                        onUpdate={handleFieldUpdate}
                      />
                    ) : (
                      <div className="space-y-3">
                        {(localField.options || []).map((option, index) => (
                          <div key={option.id} className="flex items-center gap-2 p-3 border rounded-lg">
                            <div className="flex-1 grid grid-cols-2 gap-2">
                              <Input
                                value={option.label}
                                onChange={(e) => updateOption(index, { label: e.target.value })}
                                placeholder="Option label"
                              />
                              <Input
                                value={option.value}
                                onChange={(e) => updateOption(index, { value: e.target.value })}
                                placeholder="Option value"
                              />
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeOption(index)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button onClick={addOption} variant="outline" className="w-full">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Option
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {localField.type === "file" && (
                <Card>
                  <CardHeader>
                    <CardTitle>File Upload Settings</CardTitle>
                    <CardDescription>Configure file upload restrictions</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="accept">Accepted File Types</Label>
                      <Input
                        id="accept"
                        value={localField.properties?.accept || ""}
                        onChange={(e) => handlePropertiesChange("accept", e.target.value)}
                        placeholder=".jpg,.png,.pdf"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Multiple Files</Label>
                        <p className="text-sm text-muted-foreground">Allow multiple file uploads</p>
                      </div>
                      <Switch
                        checked={localField.properties?.multiple || false}
                        onCheckedChange={(checked) => handlePropertiesChange("multiple", checked)}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="advanced" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Advanced Settings</CardTitle>
                  <CardDescription>Advanced configuration options</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="formula">Formula</Label>
                    <Textarea
                      id="formula"
                      value={localField.formula || ""}
                      onChange={(e) => handleFieldUpdate({ formula: e.target.value })}
                      placeholder="Enter formula (e.g., field1 + field2)"
                      rows={3}
                    />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Field Properties (JSON)</Label>
                    <Textarea
                      value={JSON.stringify(localField.properties || {}, null, 2)}
                      onChange={(e) => {
                        try {
                          const properties = JSON.parse(e.target.value)
                          handleFieldUpdate({ properties })
                        } catch (error) {
                          // Invalid JSON, ignore
                        }
                      }}
                      placeholder="{}"
                      rows={5}
                      className="font-mono text-sm"
                    />
                  </div>
                </CardContent>
              </Card>

              {localField.type === "unique-id" && (
                <Card className="border-2 border-blue-200 bg-blue-50/30">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2">
                      <Hash className="h-5 w-5 text-blue-600" />
                      Unique ID Generation Settings
                    </CardTitle>
                    <CardDescription>
                      Choose how unique identifiers should be generated for this field
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>Generation Method</Label>
                      <Select
                        value={localField.properties?.uniqueIdMode || "uuid"}
                        onValueChange={(value) => handlePropertiesChange("uniqueIdMode", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select generation method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="uuid">UUID v4 (recommended - 36 characters)</SelectItem>
                          <SelectItem value="sequential">Sequential Number (1, 2, 3...)</SelectItem>
                          <SelectItem value="prefix">Custom Prefix + Number</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {localField.properties?.uniqueIdMode === "uuid" &&
                          "Generates a random 36-character UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)"}
                        {localField.properties?.uniqueIdMode === "sequential" &&
                          "Increments a number for each new record"}
                        {localField.properties?.uniqueIdMode === "prefix" &&
                          "Adds your custom prefix before a sequential number"}
                      </p>
                    </div>

                    {localField.properties?.uniqueIdMode === "prefix" && (
                      <div className="space-y-2">
                        <Label htmlFor="prefix">Custom Prefix</Label>
                        <Input
                          id="prefix"
                          value={localField.properties?.uniqueIdPrefix || ""}
                          onChange={(e) => handlePropertiesChange("uniqueIdPrefix", e.target.value)}
                          placeholder="INV-, ORDER-, TICKET-"
                          maxLength={10}
                        />
                        <p className="text-xs text-muted-foreground">
                          Example: "INV-" → INV-000001, INV-000002...
                        </p>
                      </div>
                    )}

                    {(localField.properties?.uniqueIdMode === "sequential" ||
                      localField.properties?.uniqueIdMode === "prefix") && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="startNumber">Start From</Label>
                              <Input
                                id="startNumber"
                                type="number"
                                min="1"
                                value={localField.properties?.uniqueIdStart || "1"}
                                onChange={(e) =>
                                  handlePropertiesChange("uniqueIdStart", Number(e.target.value) || 1)
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="minDigits">Minimum Digits (zero padding)</Label>
                              <Input
                                id="minDigits"
                                type="number"
                                min="1"
                                max="10"
                                value={localField.properties?.uniqueIdMinDigits || "6"}
                                onChange={(e) =>
                                  handlePropertiesChange("uniqueIdMinDigits", Number(e.target.value) || 6)
                                }
                              />
                              <p className="text-xs text-muted-foreground">
                                Example: 6 digits → 000001, 000042
                              </p>
                            </div>
                          </div>
                        </>
                      )}

                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="space-y-0.5">
                        <Label>Hidden Field</Label>
                        <p className="text-sm text-muted-foreground">
                          Hide this field from users (still generated automatically)
                        </p>
                      </div>
                      <Switch
                        checked={localField.properties?.hidden ?? true}
                        onCheckedChange={(checked) => handlePropertiesChange("hidden", checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Read Only</Label>
                        <p className="text-sm text-muted-foreground">
                          Prevent manual editing of the generated ID
                        </p>
                      </div>
                      <Switch
                        checked={localField.readonly !== false}
                        onCheckedChange={(checked) => handleFieldUpdate({ readonly: checked })}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-between items-center gap-2 pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {hasChanges && "You have unsaved changes"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !hasChanges}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}