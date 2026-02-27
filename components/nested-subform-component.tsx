"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { useDroppable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { GripVertical, MoreHorizontal, Trash2, ChevronDown, ChevronRight, Plus, Check, X, Edit3, Layers, AlertTriangle } from 'lucide-react'
import FieldComponent from "./field-component"
import type { FormField, Subform } from "@/types/form-builder"
import { useToast } from "@/hooks/use-toast"

interface NestedSubformComponentProps {
  subform: Subform
  onUpdateSubform: (updates: Partial<Subform>) => void
  onDeleteSubform: () => void
  onUpdateField: (fieldId: string, updates: Partial<FormField>) => Promise<void>
  onDeleteField: (fieldId: string) => void
  onAddSubform?: (parentSubformId: string) => Promise<Subform | void>
  isOverlay?: boolean
  maxNestingLevel?: number
}
// Enhanced color schemes for deep nesting
const DEEP_NESTING_COLORS = [
  {
    bg: "bg-indigo-50/40",
    border: "border-l-indigo-500",
    accent: "text-indigo-800",
    hover: "hover:bg-indigo-50",
    headerBg: "bg-indigo-25",
    levelBadge: "bg-indigo-100 text-indigo-800 border-indigo-300",
    statsBadge: "bg-cyan-50 text-cyan-700 border-cyan-200",
    leftBorder: "border-l-4 border-l-indigo-500",
    pathBadge: "bg-indigo-50 text-indigo-700 border-indigo-300"
  },
  {
    bg: "bg-teal-50/40",
    border: "border-l-teal-500",
    accent: "text-teal-800",
    hover: "hover:bg-teal-50",
    headerBg: "bg-teal-25",
    levelBadge: "bg-teal-100 text-teal-800 border-teal-300",
    statsBadge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    leftBorder: "border-l-4 border-l-teal-500",
    pathBadge: "bg-teal-50 text-teal-700 border-teal-300"
  },
  {
    bg: "bg-amber-50/40",
    border: "border-l-amber-500",
    accent: "text-amber-800",
    hover: "hover:bg-amber-50",
    headerBg: "bg-amber-25",
    levelBadge: "bg-amber-100 text-amber-800 border-amber-300",
    statsBadge: "bg-yellow-50 text-yellow-700 border-yellow-200",
    leftBorder: "border-l-4 border-l-amber-500",
    pathBadge: "bg-amber-50 text-amber-700 border-amber-300"
  },
  {
    bg: "bg-rose-50/40",
    border: "border-l-rose-500",
    accent: "text-rose-800",
    hover: "hover:bg-rose-50",
    headerBg: "bg-rose-25",
    levelBadge: "bg-rose-100 text-rose-800 border-rose-300",
    statsBadge: "bg-pink-50 text-pink-700 border-pink-200",
    leftBorder: "border-l-4 border-l-rose-500",
    pathBadge: "bg-rose-50 text-rose-700 border-rose-300"
  },
  {
    bg: "bg-violet-50/40",
    border: "border-l-violet-500",
    accent: "text-violet-800",
    hover: "hover:bg-violet-50",
    headerBg: "bg-violet-25",
    levelBadge: "bg-violet-100 text-violet-800 border-violet-300",
    statsBadge: "bg-purple-50 text-purple-700 border-purple-200",
    leftBorder: "border-l-4 border-l-violet-500",
    pathBadge: "bg-violet-50 text-violet-700 border-violet-300"
  },
]

export default function NestedSubformComponent({
  subform,
  onUpdateSubform,
  onDeleteSubform,
  onUpdateField,
  onDeleteField,
  onAddSubform,
  isOverlay = false,
  maxNestingLevel = 5,
}: NestedSubformComponentProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState(subform.name)
  const [isExpanded, setIsExpanded] = useState(!subform.collapsed)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const level = subform.level || 0
  const colorScheme = DEEP_NESTING_COLORS[level % DEEP_NESTING_COLORS.length]
  const canNestDeeper = level < maxNestingLevel && onAddSubform

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subform.id,
    data: {
      type: "Subform",
      subform,
      level,
    },
    disabled: isOverlay || isEditingName,
  })

  // CRITICAL: Enhanced useDroppable for nested subforms
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `subform-${subform.id}`,
    data: {
      type: "Subform",
      isSubformDropzone: true, // CRITICAL FLAG
      subform: {
        id: subform.id,
        name: subform.name,
        sectionId: subform.sectionId,
        level: subform.level || 0,
        parentSubformId: subform.parentSubformId
      },
      level: subform.level || 0,
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1000 : 1,
  }

  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditingName])

  useEffect(() => {
    setEditName(subform.name)
  }, [subform.name])

  useEffect(() => {
    setIsExpanded(!subform.collapsed)
  }, [subform.collapsed])

  const handleNameSave = () => {
    const trimmedName = editName.trim()
    if (trimmedName && trimmedName !== subform.name) {
      onUpdateSubform({ name: trimmedName })
    } else {
      setEditName(subform.name)
    }
    setIsEditingName(false)
  }

  const handleNameCancel = () => {
    setEditName(subform.name)
    setIsEditingName(false)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === "Enter") {
      e.preventDefault()
      handleNameSave()
    } else if (e.key === "Escape") {
      e.preventDefault()
      handleNameCancel()
    }
  }

  const handleToggleExpanded = () => {
    const newCollapsed = !subform.collapsed
    setIsExpanded(!newCollapsed)
    onUpdateSubform({ collapsed: newCollapsed })
  }

  const handleDeleteSubform = () => {
    setShowDeleteDialog(false)
    onDeleteSubform()
    toast({
      title: "Nested subform deleted",
      description: `"${subform.name}" and all nested content have been removed`,
    })
  }

  const addField = async (fieldType: string) => {
    try {
      const newFieldData = {
        subformId: subform.id,
        type: fieldType,
        label: `New ${fieldType.charAt(0).toUpperCase() + fieldType.slice(1)}`,
        placeholder: "",
        description: "",
        defaultValue: "",
        options: [],
        validation: {},
        visible: true,
        readonly: false,
        width: "full",
        order: subform.fields.length,
      }

      console.log("Adding field to nested subform:", newFieldData)
      const response = await fetch("/api/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newFieldData),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to create field: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      if (result.success) {
        const newField: FormField = {
          ...result.data,
          conditional: null,
          styling: null,
          properties: null,
          rollup: null,
          lookup: null,
          formula: null,
        }

        // Update the subform with the new field
        onUpdateSubform({
          fields: [...subform.fields, newField],
        })
        toast({
          title: "Success",
          description: `Field added to nested subform successfully`
        })
      } else {
        throw new Error(result.error || "Failed to create field")
      }
    } catch (error: any) {
      console.error("Error adding field to nested subform:", error)
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const addNestedSubform = async () => {
    if (!canNestDeeper) {
      toast({
        title: "Maximum nesting reached",
        description: `Cannot nest deeper than ${maxNestingLevel} levels`,
        variant: "destructive"
      })
      return
    }

    if (!onAddSubform) {
      toast({
        title: "Error",
        description: "Nested subform creation is not available",
        variant: "destructive"
      })
      return
    }

    try {
      console.log("Creating deeply nested subform for parent:", subform.id)
      const createdSubform = await onAddSubform(subform.id)

      if (createdSubform && typeof createdSubform === 'object' && 'id' in createdSubform) {
        // Add the new nested subform to the current subform's children
        const newChildSubform = createdSubform as Subform
        const updatedChildSubforms = [...(subform.childSubforms || []), newChildSubform]

        onUpdateSubform({
          childSubforms: updatedChildSubforms,
        })

        toast({
          title: "Success",
          description: `Deeply nested subform added successfully`
        })
      } else {
        // If the function doesn't return the subform, we'll rely on the parent to refresh
        toast({
          title: "Success",
          description: `Deeply nested subform created successfully`
        })
      }
    } catch (error: any) {
      console.error("Error adding deeply nested subform:", error)
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  if (isOverlay) {
    return (
      <Card className={`border-2 shadow-2xl rotate-1 scale-105 ${colorScheme.border} ${colorScheme.bg}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Layers className={`w-4 h-4 ${colorScheme.accent}`} />
            <h3 className={`text-lg font-semibold ${colorScheme.accent}`}>{subform.name}</h3>
            <Badge variant="outline" className={`text-xs ${colorScheme.pathBadge} px-2 py-0 font-medium`}>
              Nested L{level}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className={`text-sm ${colorScheme.accent}`}>Moving nested subform...</div>
        </CardContent>
      </Card>
    )
  }

  // Combine fields and child subforms for rendering
  const allItems = [
    ...subform.fields.map(field => ({ type: 'field' as const, item: field, id: field.id, order: field.order })),
    ...(subform.childSubforms || []).map((childSubform: Subform) => ({ type: 'subform' as const, item: childSubform, id: childSubform.id, order: childSubform.order }))
  ].sort((a, b) => a.order - b.order)

  return (
    <>
      <Card
        ref={(node) => {
          setNodeRef(node)
          setDroppableRef(node)
        }}
        style={style}
        className={`group transition-all duration-300 bg-white border border-gray-200 rounded-lg shadow-sm ${colorScheme.leftBorder} ${isDragging
          ? `shadow-2xl scale-105 rotate-1 z-50`
          : `hover:shadow-md`
          } ${isOver ? `ring-2 ring-blue-300 ring-opacity-50 ${colorScheme.bg}` : ""}`}
      >
        {/* Nested Subform Header */}
        <CardHeader className={`pb-2 ${colorScheme.headerBg} border-b border-gray-100`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Deep Nesting Level Indicator */}
              {level > 0 && (
                <div className="flex items-center flex-shrink-0">
                  {Array.from({ length: level }).map((_, i) => (
                    <div key={i} className={`w-1 h-4 ${colorScheme.border} bg-current opacity-40 mr-1`} />
                  ))}
                </div>
              )}

              {/* Drag Handle */}
              {!isEditingName && (
                <div
                  {...attributes}
                  {...listeners}
                  className={`cursor-grab hover:cursor-grabbing p-1 rounded transition-all duration-200 flex-shrink-0 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100`}
                >
                  <GripVertical className="w-4 h-4" />
                </div>
              )}

              {/* Expand/Collapse Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleExpanded}
                className={`h-6 w-6 p-0 flex-shrink-0 text-gray-500 hover:text-gray-700`}
              >
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </Button>

              <Layers className={`w-4 h-4 ${colorScheme.accent} flex-shrink-0`} />

              {/* Editable Name */}
              <div className="flex-1 min-w-0">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      ref={inputRef}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={handleNameKeyDown}
                      onBlur={handleNameSave}
                      className={`text-sm font-semibold h-6 px-2 py-1 border ${colorScheme.border} focus:${colorScheme.border.replace('border-', 'border-')} flex-1`}
                      placeholder="Nested subform name"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNameSave()
                        }}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNameCancel()
                        }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <h4
                      className={`text-sm font-semibold cursor-pointer hover:text-blue-600 transition-colors duration-200 px-2 py-1 rounded flex items-center gap-1 truncate`}
                      onClick={() => setIsEditingName(true)}
                      title={`Click to edit: ${subform.name}`}
                    >
                      <span className="truncate">{subform.name}</span>
                      <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
                    </h4>
                  </div>
                )}
              </div>

              {/* Badges */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant="outline" className={`text-xs ${colorScheme.levelBadge} px-2 py-0 font-medium`}>
                  L{level}
                </Badge>
                <Badge variant="outline" className={`text-xs ${colorScheme.statsBadge} px-2 py-0`}>
                  {subform.fields.length} field{subform.fields.length !== 1 ? 's' : ''}
                </Badge>
                {(subform.childSubforms?.length || 0) > 0 && (
                  <Badge variant="outline" className={`text-xs bg-gray-50 text-gray-600 border-gray-200 px-2 py-0`}>
                    {subform.childSubforms?.length} deep
                  </Badge>
                )}
              </div>
            </div>

            {/* Actions Menu */}
            {!isEditingName && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600">
                      <MoreHorizontal className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => addField("text")}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Text Field
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addField("select")}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Select Field
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={addNestedSubform}
                      disabled={!canNestDeeper}
                    >
                      <Layers className="w-4 h-4 mr-2" />
                      Add Deeper Subform
                      {!canNestDeeper && <span className="text-xs text-gray-400 ml-1">(Max)</span>}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </CardHeader>

        {/* Nested Subform Content - Enhanced Drop Zone */}
        {isExpanded && (
          <CardContent className="p-3">
            {allItems.length > 0 ? (
              <div className="space-y-2">
                <SortableContext
                  items={allItems.map(item => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {allItems.map((item) => {
                    return item.type === 'field' ? (
                      <FieldComponent
                        key={item.id}
                        field={item.item as FormField}
                        isInSubform={true}
                        onUpdate={async (updates: Partial<FormField>) => {
                          await onUpdateField(item.id, updates)
                        }}
                        onDelete={() => onDeleteField(item.id)}
                        onCopy={(field) => {
                          console.log("Copy field:", field)
                        }}
                        fieldPath={`Nested Subform L${level}`}
                        subformPath={`L${level}`}
                      />
                    ) : (
                      // DEEPLY NESTED SUBFORM
                      <div key={item.id} className="relative">
                        <div className={`ml-6 ${colorScheme.bg} rounded-lg p-2`}>
                          <NestedSubformComponent
                            subform={item.item as Subform}
                            onUpdateSubform={(updates) => {
                              const updatedChildSubforms = (subform.childSubforms || []).map((child: Subform) =>
                                child.id === item.id ? { ...child, ...updates, updatedAt: new Date() } : child
                              )
                              onUpdateSubform({ childSubforms: updatedChildSubforms })
                            }}
                            onDeleteSubform={async () => {
                              try {
                                const response = await fetch(`/api/subforms/${item.id}`, {
                                  method: "DELETE",
                                })
                                if (!response.ok) {
                                  throw new Error("Failed to delete deeply nested subform")
                                }
                                const updatedChildSubforms = (subform.childSubforms || []).filter((child: Subform) => child.id !== item.id)
                                onUpdateSubform({ childSubforms: updatedChildSubforms })
                                toast({ title: "Success", description: "Deeply nested subform deleted successfully" })
                              } catch (error: any) {
                                console.error("Error deleting deeply nested subform:", error)
                                toast({ title: "Error", description: error.message, variant: "destructive" })
                              }
                            }}
                            onUpdateField={onUpdateField}
                            onDeleteField={onDeleteField}
                            onAddSubform={onAddSubform}
                            maxNestingLevel={maxNestingLevel}
                          />
                        </div>
                      </div>
                    )
                  })}
                </SortableContext>
              </div>
            ) : (
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-all duration-200 ${isOver ? `border-blue-400 bg-blue-50 ring-2 ring-blue-200` : `border-gray-300 bg-gray-50`
                  }`}
              >
                <Layers className={`w-5 h-5 mx-auto mb-2 ${isOver ? 'text-blue-600' : colorScheme.accent}`} />
                <p className={`text-xs mb-2 ${isOver ? 'text-blue-700 font-medium' : colorScheme.accent}`}>
                  {isOver ? `Drop field here in nested subform` : 'Empty nested subform'}
                </p>
                <p className={`text-xs mb-3 ${isOver ? 'text-blue-600' : colorScheme.accent} opacity-75`}>
                  {isOver ? 'Release to add field to this nested subform' : 'Drop fields or create deeper subforms here'}
                </p>
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addField("text")}
                    className={`text-xs h-7 ${colorScheme.border} ${colorScheme.accent} ${colorScheme.hover}`}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Field
                  </Button>
                  {canNestDeeper && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addNestedSubform}
                      className={`text-xs h-7 ${colorScheme.border} ${colorScheme.accent} ${colorScheme.hover}`}
                    >
                      <Layers className="w-3 h-3 mr-1" />
                      Deeper
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Delete Nested Subform
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete the nested subform <strong>"{subform.name}"</strong>
                <span> (Level {level})</span>?
              </p>
              {(subform.fields.length > 0 || (subform.childSubforms?.length || 0) > 0) && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-red-800 font-medium">This will permanently delete:</p>
                  <ul className="mt-2 text-sm text-red-700 list-disc list-inside space-y-1">
                    <li>The nested subform and all its settings</li>
                    {subform.fields.length > 0 && (
                      <li>
                        All {subform.fields.length} field{subform.fields.length !== 1 ? "s" : ""} in this nested subform
                      </li>
                    )}
                    {(subform.childSubforms?.length || 0) > 0 && (
                      <li>
                        All {subform.childSubforms?.length} deeper nested subform{(subform.childSubforms?.length || 0) !== 1 ? "s" : ""} and their content
                      </li>
                    )}
                    <li>All form record data for these fields and deeper nested subforms</li>
                  </ul>
                </div>
              )}
              <p className="text-sm font-medium text-red-800">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSubform} className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
              Delete Nested Subform
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
