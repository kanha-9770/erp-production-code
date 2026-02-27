// "use client";

// import { useState, useRef, useEffect } from "react";
// import { useDroppable } from "@dnd-kit/core";
// import {
//   useSortable,
//   SortableContext,
//   horizontalListSortingStrategy,
// } from "@dnd-kit/sortable";
// import { CSS } from "@dnd-kit/utilities";

// import { Card, CardContent } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuSeparator,
//   DropdownMenuTrigger,
// } from "@/components/ui/dropdown-menu";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogFooter,
// } from "@/components/ui/dialog";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";

// import {
//   MoreHorizontal,
//   Trash2,
//   ChevronDown,
//   ChevronRight,
//   Settings,
//   Lock,
//   Copy,
//   ShieldCheck,
//   Loader2,
// } from "lucide-react";

// import FieldSettings from "@/components/field-settings";
// import type { FormField, Subform } from "@/types/item-types";
// import { useToast } from "@/hooks/use-toast";

// // Types for Permissions (Matching your original logic)
// interface PermissionDefinition { id: string; name: string; category: string; resource: string; }
// interface RolePermission { id: string; name: string; permission: string; }

// interface SubformComponentProps {
//   subform: Subform;
//   onUpdateSubform: (updates: Partial<Subform>) => void;
//   onDeleteSubform: () => void;
//   onUpdateField: (fieldId: string, updates: Partial<FormField>) => Promise<void>;
//   onDeleteField: (fieldId: string) => void;
//   onCopyField?: (field: FormField) => void;
//   formId?: string;
// }

// export default function SubformComponent({
//   subform,
//   onUpdateSubform,
//   onDeleteSubform,
//   onUpdateField,
//   onDeleteField,
//   onCopyField,
//   formId = "",
// }: SubformComponentProps) {
//   const [isExpanded, setIsExpanded] = useState(!subform.collapsed ?? true);
//   const { toast } = useToast();

//   const { setNodeRef: setDroppableRef, isOver } = useDroppable({
//     id: `subform-dropzone-${subform.id}`,
//     data: {
//       isSubformDropzone: true,
//       type: "SubformDropzone",
//       subform: subform,
//       subformId: subform.id,
//     },
//   });

//   const addField = async (type: string) => {
//     try {
//       const payload = {
//         subformId: subform.id,
//         type,
//         label: `${type === 'textarea' ? 'Multi-Line' : 'Single Line'} ${subform.fields.length + 1}`,
//         order: subform.fields.length,
//       };
//       const res = await fetch("/api/fields", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
//       if (!res.ok) throw new Error();
//       const { data } = await res.json();
//       onUpdateSubform({ fields: [...subform.fields, data] });
//       toast({ title: "Field added" });
//     } catch (err) {
//       toast({ variant: "destructive", title: "Error", description: "Failed to add field" });
//     }
//   };

//   const sortableIds = subform.fields.map((f) => f.id);

//   return (
//     <div className="mb-8">
//       <div className="flex items-center gap-2 mb-3">
//         <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsExpanded(!isExpanded)}>
//           {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
//         </Button>
//         <h3 className="text-base font-semibold">{subform.name}</h3>
//       </div>

//       {isExpanded && (
//         <div className={`border rounded-[4px] overflow-hidden shadow-sm transition-all duration-200 ${isOver ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-200' : 'border-slate-300 bg-white'}`}>
//           <div ref={setDroppableRef} className="overflow-x-auto custom-scrollbar w-full">
//             <div className="flex min-w-max border-b border-slate-200">
//               <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
//                 {subform.fields.map((field) => (
//                   <TabularFieldHeader
//                     key={field.id}
//                     field={field}
//                     onUpdate={onUpdateField}
//                     onDelete={() => onDeleteField(field.id)}
//                     onCopy={() => onCopyField?.(field)}
//                   />
//                 ))}
//               </SortableContext>

//               {/* Add Field Button - Image Layout */}
//               <div className="flex items-center justify-center min-w-[140px] border-l border-slate-200 bg-white p-4 h-[90px]">
//                 <DropdownMenu>
//                   <DropdownMenuTrigger asChild>
//                     <Button variant="link" className="text-[#515ada] font-normal hover:no-underline">Add Field</Button>
//                   </DropdownMenuTrigger>
//                   <DropdownMenuContent>
//                     <DropdownMenuItem onClick={() => addField("text")}>Single Line</DropdownMenuItem>
//                     <DropdownMenuItem onClick={() => addField("textarea")}>Multi-Line</DropdownMenuItem>
//                     <DropdownMenuItem onClick={() => addField("number")}>Number</DropdownMenuItem>
//                   </DropdownMenuContent>
//                 </DropdownMenu>
//               </div>
//             </div>

//             {/* Empty Row Placeholder */}
//             <div className="flex min-w-max h-12 bg-white">
//               {subform.fields.map((f) => <div key={f.id} className="min-w-[280px] border-r border-slate-100" />)}
//               <div className="min-w-[140px]" />
//             </div>
//           </div>
//         </div>
//       )}

//       <style jsx global>{`
//         .custom-scrollbar::-webkit-scrollbar { height: 10px; }
//         .custom-scrollbar::-webkit-scrollbar-track { background: #f8f9fa; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: #888; border-radius: 5px; border: 2px solid #f8f9fa; }
//       `}</style>
//     </div>
//   );
// }

// function TabularFieldHeader({ field, onUpdate, onDelete, onCopy }: any) {
//   const [showSettings, setShowSettings] = useState(false);
//   const [showPermissions, setShowPermissions] = useState(false);
//   const { toast } = useToast();

//   // --- PERMISSION LOGIC (From your original code) ---
//   const [permissions, setPermissions] = useState<RolePermission[]>([]);
//   const [availablePermissions, setAvailablePermissions] = useState<PermissionDefinition[]>([]);
//   const [permissionsLoading, setPermissionsLoading] = useState(false);
//   const [hasLoadedPermissions, setHasLoadedPermissions] = useState(false);

//   useEffect(() => {
//     if (showPermissions && !hasLoadedPermissions) {
//       const fetchPermissions = async () => {
//         setPermissionsLoading(true);
//         try {
//           const res = await fetch(`/api/permissions/field/${field.id}`);
//           if (!res.ok) throw new Error();
//           const data = await res.json();
//           setPermissions(data.profiles ?? []);
//           setAvailablePermissions(data.availablePermissions ?? []);
//           setHasLoadedPermissions(true);
//         } catch (err) {
//           toast({ variant: "destructive", title: "Error", description: "Failed to load permissions" });
//         } finally {
//           setPermissionsLoading(false);
//         }
//       };
//       fetchPermissions();
//     }
//   }, [showPermissions, hasLoadedPermissions, field.id, toast]);

//   const handlePermissionChange = async (roleId: string, permissionId: string) => {
//     try {
//       const res = await fetch(`/api/permissions/field/${field.id}`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ roleId, permissionId }),
//       });
//       if (!res.ok) throw new Error();
//       setPermissions(prev => prev.map(p => p.id === roleId ? { ...p, permission: permissionId } : p));
//       toast({ title: "Success", description: "Permission updated" });
//     } catch {
//       toast({ variant: "destructive", title: "Error", description: "Save failed" });
//     }
//   };

//   const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
//     id: field.id,
//     data: {
//       type: "Field",
//       field: field,
//     },
//   });
//   const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1 };

//   return (
//     <>
//       <div
//         ref={setNodeRef}
//         style={style}
//         {...attributes}
//         {...listeners}
//         className={`min-w-[280px] p-4 bg-[#f8f9fb] border-r border-slate-200 h-[90px] flex flex-col justify-between group cursor-move ${isDragging ? 'opacity-40' : ''}`}
//       >
//         <div className="flex justify-between items-start">
//           <span className="font-medium text-[#374151] text-[15px] truncate pr-2">{field.label}</span>
//           <DropdownMenu>
//             <DropdownMenuTrigger asChild>
//               <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 opacity-0 group-hover:opacity-100"><MoreHorizontal className="h-4 w-4" /></Button>
//             </DropdownMenuTrigger>
//             <DropdownMenuContent align="end">
//               <DropdownMenuItem onClick={() => setShowSettings(true)}><Settings className="mr-2 h-4 w-4" /> Settings</DropdownMenuItem>
//               <DropdownMenuItem onClick={() => setShowPermissions(true)}><Lock className="mr-2 h-4 w-4" /> Permissions</DropdownMenuItem>
//               <DropdownMenuItem onClick={onCopy}><Copy className="mr-2 h-4 w-4" /> Duplicate</DropdownMenuItem>
//               <DropdownMenuSeparator />
//               <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
//             </DropdownMenuContent>
//           </DropdownMenu>
//         </div>
//         <div className="text-[#a1b0cb] text-[13px]">{field.type === 'textarea' ? 'Multi-Line' : 'Single Line'}</div>
//       </div>

//       {/* Settings Dialog */}
//       {showSettings && (
//         <FieldSettings
//           field={field}
//           open={showSettings}
//           onOpenChange={setShowSettings}
//           onUpdate={(updates) => onUpdate(field.id, updates)}
//         />
//       )}

//       {/* Permissions Dialog (Restored Logic) */}
//       <Dialog open={showPermissions} onOpenChange={setShowPermissions}>
//         <DialogContent className="sm:max-w-xl">
//           <DialogHeader>
//             <DialogTitle className="flex items-center gap-2">
//               <ShieldCheck className="h-5 w-5 text-primary" /> Permissions — {field.label}
//             </DialogTitle>
//           </DialogHeader>

//           {permissionsLoading ? (
//             <div className="py-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
//           ) : (
//             <div className="space-y-2 py-4 max-h-[50vh] overflow-y-auto">
//               {permissions.map((role) => (
//                 <div key={role.id} className="flex items-center justify-between gap-4 p-2 rounded-md hover:bg-muted transition-colors">
//                   <span className="font-medium">{role.name}</span>
//                   <Select value={role.permission} onValueChange={(v) => handlePermissionChange(role.id, v)}>
//                     <SelectTrigger className="w-48"><SelectValue placeholder="Select Access" /></SelectTrigger>
//                     <SelectContent>
//                       <SelectItem value="NONE">No access (Hidden)</SelectItem>
//                       {availablePermissions.map((perm) => (
//                         <SelectItem key={perm.id} value={perm.id}>{perm.name.replace(/_/g, " ")}</SelectItem>
//                       ))}
//                     </SelectContent>
//                   </Select>
//                 </div>
//               ))}
//             </div>
//           )}
//           <DialogFooter><Button variant="outline" onClick={() => setShowPermissions(false)}>Close</Button></DialogFooter>
//         </DialogContent>
//       </Dialog>
//     </>
//   );
// }


// "use client";

// import { useEffect, useState } from "react";
// import { useDroppable } from "@dnd-kit/core";
// import {
//   useSortable,
//   SortableContext,
//   horizontalListSortingStrategy,
// } from "@dnd-kit/sortable";
// import { CSS } from "@dnd-kit/utilities";

// import { Button } from "@/components/ui/button";
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuSeparator,
//   DropdownMenuTrigger,
// } from "@/components/ui/dropdown-menu";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogFooter,
// } from "@/components/ui/dialog";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";

// import {
//   MoreHorizontal,
//   Trash2,
//   ChevronDown,
//   ChevronRight,
//   Settings,
//   Lock,
//   Copy,
//   ShieldCheck,
//   Loader2,
// } from "lucide-react";

// import FieldSettings from "@/components/field-settings";
// import type { FormField, Subform } from "@/types/item-types";
// import { useToast } from "@/hooks/use-toast";

// // Types for Permissions (Matching your original logic)
// interface PermissionDefinition { id: string; name: string; category: string; resource: string; }
// interface RolePermission { id: string; name: string; permission: string; }

// interface SubformComponentProps {
//   subform: Subform;
//   onUpdateSubform: (updates: Partial<Subform>) => void;
//   onDeleteSubform: () => void;
//   onUpdateField: (fieldId: string, updates: Partial<FormField>) => Promise<void>;
//   onDeleteField: (fieldId: string) => void;
//   onCopyField?: (field: FormField) => void;
//   formId?: string;
// }

// export default function SubformComponent({
//   subform,
//   onUpdateSubform,
//   onDeleteSubform,
//   onUpdateField,
//   onDeleteField,
//   onCopyField,
//   formId = "",
// }: SubformComponentProps) {
//   const [isExpanded, setIsExpanded] = useState(!subform.collapsed ?? true);
//   const { toast } = useToast();

//   const { setNodeRef: setDroppableRef, isOver } = useDroppable({
//     id: `subform-dropzone-${subform.id}`,
//     data: {
//       isSubformDropzone: true,
//       type: "SubformDropzone",
//       subform: subform,
//       subformId: subform.id,
//     },
//   });

//   const addField = async (type: string) => {
//     try {
//       const payload = {
//         subformId: subform.id,
//         type,
//         label: `${type === 'textarea' ? 'Multi-Line' : 'Single Line'} ${subform.fields.length + 1}`,
//         order: subform.fields.length,
//       };
//       const res = await fetch("/api/fields", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
//       if (!res.ok) throw new Error();
//       const { data } = await res.json();
//       onUpdateSubform({ fields: [...subform.fields, data] });
//       toast({ title: "Field added" });
//     } catch (err) {
//       toast({ variant: "destructive", title: "Error", description: "Failed to add field" });
//     }
//   };

//   const sortableIds = subform.fields.map((f) => f.id);

//   return (
//     <div className="mb-8">
//       <div className="flex items-center gap-2 mb-3">
//         <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsExpanded(!isExpanded)}>
//           {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
//         </Button>
//         <h3 className="text-base font-semibold">{subform.name}</h3>
//       </div>

//       {isExpanded && (
//         <div className={`border rounded-[4px] overflow-hidden shadow-sm transition-all duration-200 ${isOver ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-200' : 'border-slate-300 bg-white'}`}>
//           {/* The scrollable area — only this part should scroll horizontally */}
//           <div
//             ref={setDroppableRef}
//             className="overflow-x-auto overflow-y-hidden"
//             style={{ scrollbarWidth: "thin" }}
//           >
//             {/* Inner container that can become wider than the viewport */}
//             <div className="inline-flex min-w-full">
//               <div className="flex border-b border-slate-200">
//                 <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
//                   {subform.fields.map((field) => (
//                     <TabularFieldHeader
//                       key={field.id}
//                       field={field}
//                       onUpdate={onUpdateField}
//                       onDelete={() => onDeleteField(field.id)}
//                       onCopy={() => onCopyField?.(field)}
//                     />
//                   ))}
//                 </SortableContext>

//                 {/* Add Field Button */}
//                 <div className="flex items-center justify-center min-w-[140px] border-l border-slate-200 bg-white p-4 h-[90px]">
//                   <DropdownMenu>
//                     <DropdownMenuTrigger asChild>
//                       <Button variant="link" className="text-[#515ada] font-normal hover:no-underline">Add Field</Button>
//                     </DropdownMenuTrigger>
//                     <DropdownMenuContent>
//                       <DropdownMenuItem onClick={() => addField("text")}>Single Line</DropdownMenuItem>
//                       <DropdownMenuItem onClick={() => addField("textarea")}>Multi-Line</DropdownMenuItem>
//                       <DropdownMenuItem onClick={() => addField("number")}>Number</DropdownMenuItem>
//                     </DropdownMenuContent>
//                   </DropdownMenu>
//                 </div>
//               </div>

//               {/* Empty Row Placeholder */}
//               <div className="flex min-w-full h-12 bg-white">
//                 {subform.fields.map((f) => (
//                   <div key={f.id} className="min-w-[280px] border-r border-slate-100" />
//                 ))}
//                 <div className="min-w-[140px]" />
//               </div>
//             </div>
//           </div>
//         </div>
//       )}

//       <style jsx global>{`
//         /* Webkit browsers (Chrome, Safari, Edge, Opera) */
//         .overflow-x-auto::-webkit-scrollbar {
//           height: 8px;
//         }
//         .overflow-x-auto::-webkit-scrollbar-track {
//           background: #f1f5f9;
//           border-radius: 4px;
//         }
//         .overflow-x-auto::-webkit-scrollbar-thumb {
//           background: #94a3b8;
//           border-radius: 4px;
//         }
//         .overflow-x-auto::-webkit-scrollbar-thumb:hover {
//           background: #64748b;
//         }

//         /* Firefox */
//         .overflow-x-auto {
//           scrollbar-width: thin;
//           scrollbar-color: #94a3b8 #f1f5f9;
//         }
//       `}</style>
//     </div>
//   );
// }

// function TabularFieldHeader({ field, onUpdate, onDelete, onCopy }: any) {
//   const [showSettings, setShowSettings] = useState(false);
//   const [showPermissions, setShowPermissions] = useState(false);
//   const { toast } = useToast();

//   // --- PERMISSION LOGIC (From your original code) ---
//   const [permissions, setPermissions] = useState<RolePermission[]>([]);
//   const [availablePermissions, setAvailablePermissions] = useState<PermissionDefinition[]>([]);
//   const [permissionsLoading, setPermissionsLoading] = useState(false);
//   const [hasLoadedPermissions, setHasLoadedPermissions] = useState(false);

//   useEffect(() => {
//     if (showPermissions && !hasLoadedPermissions) {
//       const fetchPermissions = async () => {
//         setPermissionsLoading(true);
//         try {
//           const res = await fetch(`/api/permissions/field/${field.id}`);
//           if (!res.ok) throw new Error();
//           const data = await res.json();
//           setPermissions(data.profiles ?? []);
//           setAvailablePermissions(data.availablePermissions ?? []);
//           setHasLoadedPermissions(true);
//         } catch (err) {
//           toast({ variant: "destructive", title: "Error", description: "Failed to load permissions" });
//         } finally {
//           setPermissionsLoading(false);
//         }
//       };
//       fetchPermissions();
//     }
//   }, [showPermissions, hasLoadedPermissions, field.id, toast]);

//   const handlePermissionChange = async (roleId: string, permissionId: string) => {
//     try {
//       const res = await fetch(`/api/permissions/field/${field.id}`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ roleId, permissionId }),
//       });
//       if (!res.ok) throw new Error();
//       setPermissions(prev => prev.map(p => p.id === roleId ? { ...p, permission: permissionId } : p));
//       toast({ title: "Success", description: "Permission updated" });
//     } catch {
//       toast({ variant: "destructive", title: "Error", description: "Save failed" });
//     }
//   };

//   const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
//     id: field.id,
//     data: {
//       type: "Field",
//       field: field,
//     },
//   });
//   const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1 };

//   return (
//     <>
//       <div
//         ref={setNodeRef}
//         style={style}
//         {...attributes}
//         {...listeners}
//         className={`min-w-[280px] p-4 bg-[#f8f9fb] border-r border-slate-200 h-[90px] flex flex-col justify-between group cursor-move ${isDragging ? 'opacity-40' : ''}`}
//       >
//         <div className="flex justify-between items-start">
//           <span className="font-medium text-[#374151] text-[15px] truncate pr-2">{field.label}</span>
//           <DropdownMenu>
//             <DropdownMenuTrigger asChild>
//               <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 opacity-0 group-hover:opacity-100"><MoreHorizontal className="h-4 w-4" /></Button>
//             </DropdownMenuTrigger>
//             <DropdownMenuContent align="end">
//               <DropdownMenuItem onClick={() => setShowSettings(true)}><Settings className="mr-2 h-4 w-4" /> Settings</DropdownMenuItem>
//               <DropdownMenuItem onClick={() => setShowPermissions(true)}><Lock className="mr-2 h-4 w-4" /> Permissions</DropdownMenuItem>
//               <DropdownMenuItem onClick={onCopy}><Copy className="mr-2 h-4 w-4" /> Duplicate</DropdownMenuItem>
//               <DropdownMenuSeparator />
//               <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
//             </DropdownMenuContent>
//           </DropdownMenu>
//         </div>
//         <div className="text-[#a1b0cb] text-[13px]">{field.type === 'textarea' ? 'Multi-Line' : 'Single Line'}</div>
//       </div>

//       {/* Settings Dialog */}
//       {showSettings && (
//         <FieldSettings
//           field={field}
//           open={showSettings}
//           onOpenChange={setShowSettings}
//           onUpdate={(updates) => onUpdate(field.id, updates)}
//         />
//       )}

//       {/* Permissions Dialog (Restored Logic) */}
//       <Dialog open={showPermissions} onOpenChange={setShowPermissions}>
//         <DialogContent className="sm:max-w-xl">
//           <DialogHeader>
//             <DialogTitle className="flex items-center gap-2">
//               <ShieldCheck className="h-5 w-5 text-primary" /> Permissions — {field.label}
//             </DialogTitle>
//           </DialogHeader>

//           {permissionsLoading ? (
//             <div className="py-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
//           ) : (
//             <div className="space-y-2 py-4 max-h-[50vh] overflow-y-auto">
//               {permissions.map((role) => (
//                 <div key={role.id} className="flex items-center justify-between gap-4 p-2 rounded-md hover:bg-muted transition-colors">
//                   <span className="font-medium">{role.name}</span>
//                   <Select value={role.permission} onValueChange={(v) => handlePermissionChange(role.id, v)}>
//                     <SelectTrigger className="w-48"><SelectValue placeholder="Select Access" /></SelectTrigger>
//                     <SelectContent>
//                       <SelectItem value="NONE">No access (Hidden)</SelectItem>
//                       {availablePermissions.map((perm) => (
//                         <SelectItem key={perm.id} value={perm.id}>{perm.name.replace(/_/g, " ")}</SelectItem>
//                       ))}
//                     </SelectContent>
//                   </Select>
//                 </div>
//               ))}
//             </div>
//           )}
//           <DialogFooter><Button variant="outline" onClick={() => setShowPermissions(false)}>Close</Button></DialogFooter>
//         </DialogContent>
//       </Dialog>
//     </>
//   );
// }


"use client";

import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  useSortable,
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  MoreHorizontal,
  Trash2,
  ChevronDown,
  ChevronRight,
  Settings,
  Lock,
  Copy,
  ShieldCheck,
  Loader2,
} from "lucide-react";

import FieldSettings from "@/components/field-settings";
import type { FormField, Subform } from "@/types/item-types";
import { useToast } from "@/hooks/use-toast";

// Types for Permissions
interface PermissionDefinition { id: string; name: string; category: string; resource: string; }
interface RolePermission { id: string; name: string; permission: string; }

interface SubformComponentProps {
  subform: Subform;
  onUpdateSubform: (updates: Partial<Subform>) => void;
  onDeleteSubform: () => void;               // ← called by parent after successful delete
  onUpdateField: (fieldId: string, updates: Partial<FormField>) => Promise<void>;
  onDeleteField: (fieldId: string) => void;
  onCopyField?: (field: FormField) => void;
  formId?: string;
}

export default function SubformComponent({
  subform,
  onUpdateSubform,
  onDeleteSubform,
  onUpdateField,
  onDeleteField,
  onCopyField,
  formId = "",
}: SubformComponentProps) {
  const [isExpanded, setIsExpanded] = useState(!subform.collapsed ?? true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `subform-dropzone-${subform.id}`,
    data: {
      isSubformDropzone: true,
      type: "SubformDropzone",
      subform: subform,
      subformId: subform.id,
    },
  });

  const addField = async (type: string) => {
    try {
      const payload = {
        subformId: subform.id,
        type,
        label: `${type === 'textarea' ? 'Multi-Line' : 'Single Line'} ${subform.fields.length + 1}`,
        order: subform.fields.length,
      };
      const res = await fetch("/api/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      onUpdateSubform({ fields: [...subform.fields, data] });
      toast({ title: "Field added" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Failed to add field" });
    }
  };

  const handleDeleteSubform = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/subforms/${subform.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete subform");
      }

      toast({
        title: "Subform deleted",
        description: "The subform and all nested content have been removed.",
      });

      // Tell parent to remove this subform from the list
      onDeleteSubform();

    } catch (err: any) {
      console.error("[Subform Delete]", err);
      toast({
        variant: "destructive",
        title: "Deletion failed",
        description: err.message || "Could not delete subform. Please try again.",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const sortableIds = subform.fields.map((f) => f.id);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          <h3 className="text-base font-semibold">{subform.name}</h3>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>
              <Settings className="mr-2 h-4 w-4" /> Edit subform
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete subform
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isExpanded && (
        <div className={`border rounded-[4px] overflow-hidden shadow-sm transition-all duration-200 ${isOver ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-200' : 'border-slate-300 bg-white'}`}>
          {/* The scrollable area — only this part should scroll horizontally */}
          <div
            ref={setDroppableRef}
            className="overflow-x-auto overflow-y-hidden"
            style={{ scrollbarWidth: "thin" }}
          >
            {/* Inner container that can become wider than the viewport */}
            <div className="inline-flex min-w-full">
              <div className="flex border-b border-slate-200">
                <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
                  {subform.fields.map((field) => (
                    <TabularFieldHeader
                      key={field.id}
                      field={field}
                      onUpdate={onUpdateField}
                      onDelete={() => onDeleteField(field.id)}
                      onCopy={() => onCopyField?.(field)}
                    />
                  ))}
                </SortableContext>

                {/* Add Field Button */}
                <div className="flex items-center justify-center min-w-[140px] border-l border-slate-200 bg-white p-4 h-[90px]">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="link" className="text-[#515ada] font-normal hover:no-underline">Add Field</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => addField("text")}>Single Line</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addField("textarea")}>Multi-Line</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addField("number")}>Number</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Empty Row Placeholder */}
              <div className="flex min-w-full h-12 bg-white">
                {subform.fields.map((f) => (
                  <div key={f.id} className="min-w-[280px] border-r border-slate-100" />
                ))}
                <div className="min-w-[140px]" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Subform</DialogTitle>
            <DialogDescription className="pt-2">
              Are you sure you want to delete <span className="font-semibold text-foreground">"{subform.name}"</span>?<br />
              <span className="text-destructive font-medium">
                This will permanently delete the subform and <strong>all nested fields and child subforms</strong>.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSubform}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Subform"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        /* Webkit browsers (Chrome, Safari, Edge, Opera) */
        .overflow-x-auto::-webkit-scrollbar {
          height: 8px;
        }
        .overflow-x-auto::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        .overflow-x-auto::-webkit-scrollbar-thumb {
          background: #94a3b8;
          border-radius: 4px;
        }
        .overflow-x-auto::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }

        /* Firefox */
        .overflow-x-auto {
          scrollbar-width: thin;
          scrollbar-color: #94a3b8 #f1f5f9;
        }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────
// TabularFieldHeader remains unchanged
// ────────────────────────────────────────────────

function TabularFieldHeader({ field, onUpdate, onDelete, onCopy }: any) {
  const [showSettings, setShowSettings] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const { toast } = useToast();

  // --- PERMISSION LOGIC ---
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<PermissionDefinition[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [hasLoadedPermissions, setHasLoadedPermissions] = useState(false);

  useEffect(() => {
    if (showPermissions && !hasLoadedPermissions) {
      const fetchPermissions = async () => {
        setPermissionsLoading(true);
        try {
          const res = await fetch(`/api/permissions/field/${field.id}`);
          if (!res.ok) throw new Error();
          const data = await res.json();
          setPermissions(data.profiles ?? []);
          setAvailablePermissions(data.availablePermissions ?? []);
          setHasLoadedPermissions(true);
        } catch (err) {
          toast({ variant: "destructive", title: "Error", description: "Failed to load permissions" });
        } finally {
          setPermissionsLoading(false);
        }
      };
      fetchPermissions();
    }
  }, [showPermissions, hasLoadedPermissions, field.id, toast]);

  const handlePermissionChange = async (roleId: string, permissionId: string) => {
    try {
      const res = await fetch(`/api/permissions/field/${field.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, permissionId }),
      });
      if (!res.ok) throw new Error();
      setPermissions(prev => prev.map(p => p.id === roleId ? { ...p, permission: permissionId } : p));
      toast({ title: "Success", description: "Permission updated" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Save failed" });
    }
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: {
      type: "Field",
      field: field,
    },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1 };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`min-w-[280px] p-4 bg-[#f8f9fb] border-r border-slate-200 h-[90px] flex flex-col justify-between group cursor-move ${isDragging ? 'opacity-40' : ''}`}
      >
        <div className="flex justify-between items-start">
          <span className="font-medium text-[#374151] text-[15px] truncate pr-2">{field.label}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 opacity-0 group-hover:opacity-100"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowSettings(true)}><Settings className="mr-2 h-4 w-4" /> Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowPermissions(true)}><Lock className="mr-2 h-4 w-4" /> Permissions</DropdownMenuItem>
              <DropdownMenuItem onClick={onCopy}><Copy className="mr-2 h-4 w-4" /> Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="text-[#a1b0cb] text-[13px]">{field.type === 'textarea' ? 'Multi-Line' : 'Single Line'}</div>
      </div>

      {/* Settings Dialog */}
      {showSettings && (
        <FieldSettings
          field={field}
          open={showSettings}
          onOpenChange={setShowSettings}
          onUpdate={(updates) => onUpdate(field.id, updates)}
        />
      )}

      {/* Permissions Dialog */}
      <Dialog open={showPermissions} onOpenChange={setShowPermissions}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Permissions — {field.label}
            </DialogTitle>
          </DialogHeader>

          {permissionsLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-2 py-4 max-h-[50vh] overflow-y-auto">
              {permissions.map((role) => (
                <div key={role.id} className="flex items-center justify-between gap-4 p-2 rounded-md hover:bg-muted transition-colors">
                  <span className="font-medium">{role.name}</span>
                  <Select value={role.permission} onValueChange={(v) => handlePermissionChange(role.id, v)}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Select Access" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">No access (Hidden)</SelectItem>
                      {availablePermissions.map((perm) => (
                        <SelectItem key={perm.id} value={perm.id}>{perm.name.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowPermissions(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}