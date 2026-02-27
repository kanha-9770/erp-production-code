"use client"

import type React from "react"

import { useState, useEffect } from "react"
import type { Module, Submodule, MasterDataType, MasterDataValue } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Plus, Edit, Trash2, List } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface MasterDataManagementProps {
  modules: Module[]
  submodules: Submodule[]
  masterDataTypes: MasterDataType[]
  onMasterDataTypesChange: (types: MasterDataType[]) => void
}

export function MasterDataManagement({
  modules,
  submodules,
  masterDataTypes,
  onMasterDataTypesChange,
}: MasterDataManagementProps) {
  const [selectedModule, setSelectedModule] = useState<string>("")
  const [selectedSubmodule, setSelectedSubmodule] = useState<string>("")
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false)
  const [isValueDialogOpen, setIsValueDialogOpen] = useState(false)
  const [editingType, setEditingType] = useState<MasterDataType | null>(null)
  const [editingValue, setEditingValue] = useState<MasterDataValue | null>(null)
  const [selectedType, setSelectedType] = useState<MasterDataType | null>(null)
  const [values, setValues] = useState<MasterDataValue[]>([])
  const { toast } = useToast()
  const supabase = createClient()

  const filteredTypes = masterDataTypes.filter((type) => {
    if (selectedSubmodule) {
      return type.submodule_id === selectedSubmodule
    }
    if (selectedModule) {
      return type.module_id === selectedModule
    }
    return true
  })

  const availableSubmodules = selectedModule ? submodules.filter((s) => s.module_id === selectedModule) : []

  useEffect(() => {
    if (selectedType) {
      loadValues(selectedType.id)
    }
  }, [selectedType])

  const loadValues = async (typeId: string) => {
    const { data, error } = await supabase
      .from("master_data_values")
      .select("*")
      .eq("master_data_type_id", typeId)
      .order("display_order", { ascending: true })

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
      return
    }

    setValues(data || [])
  }

  const handleSaveType = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const parentType = formData.get("parent_type") as string
    const data = {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      description: formData.get("description") as string,
      is_active: formData.get("is_active") === "on",
      module_id: parentType === "module" ? (formData.get("parent_id") as string) : null,
      submodule_id: parentType === "submodule" ? (formData.get("parent_id") as string) : null,
    }

    try {
      if (editingType) {
        const { data: updated, error } = await supabase
          .from("master_data_types")
          .update(data)
          .eq("id", editingType.id)
          .select()
          .single()

        if (error) throw error

        onMasterDataTypesChange(masterDataTypes.map((t) => (t.id === editingType.id ? updated : t)))
        toast({ title: "Master data type updated successfully" })
      } else {
        const { data: created, error } = await supabase.from("master_data_types").insert([data]).select().single()

        if (error) throw error

        onMasterDataTypesChange([...masterDataTypes, created])
        toast({ title: "Master data type created successfully" })
      }

      setIsTypeDialogOpen(false)
      setEditingType(null)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleSaveValue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedType) return

    const formData = new FormData(event.currentTarget)
    const data = {
      master_data_type_id: selectedType.id,
      value: formData.get("value") as string,
      code: formData.get("code") as string,
      description: formData.get("description") as string,
      is_active: formData.get("is_active") === "on",
    }

    try {
      if (editingValue) {
        const { data: updated, error } = await supabase
          .from("master_data_values")
          .update(data)
          .eq("id", editingValue.id)
          .select()
          .single()

        if (error) throw error

        setValues(values.map((v) => (v.id === editingValue.id ? updated : v)))
        toast({ title: "Value updated successfully" })
      } else {
        const { data: created, error } = await supabase.from("master_data_values").insert([data]).select().single()

        if (error) throw error

        setValues([...values, created])
        toast({ title: "Value created successfully" })
      }

      setIsValueDialogOpen(false)
      setEditingValue(null)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleDeleteType = async (type: MasterDataType) => {
    if (!confirm(`Are you sure you want to delete ${type.name}?`)) return

    try {
      const { error } = await supabase.from("master_data_types").delete().eq("id", type.id)

      if (error) throw error

      onMasterDataTypesChange(masterDataTypes.filter((t) => t.id !== type.id))
      if (selectedType?.id === type.id) {
        setSelectedType(null)
        setValues([])
      }
      toast({ title: "Master data type deleted successfully" })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleDeleteValue = async (value: MasterDataValue) => {
    if (!confirm(`Are you sure you want to delete ${value.value}?`)) return

    try {
      const { error } = await supabase.from("master_data_values").delete().eq("id", value.id)

      if (error) throw error

      setValues(values.filter((v) => v.id !== value.id))
      toast({ title: "Value deleted successfully" })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const getTypeName = (type: MasterDataType) => {
    if (type.module_id) {
      const module = modules.find((m) => m.id === type.module_id)
      return `${type.name} (${module?.name})`
    }
    if (type.submodule_id) {
      const submodule = submodules.find((s) => s.id === type.submodule_id)
      const module = modules.find((m) => m.id === submodule?.module_id)
      return `${type.name} (${module?.name} > ${submodule?.name})`
    }
    return type.name
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Master Data Types</h3>
          <Dialog
            open={isTypeDialogOpen}
            onOpenChange={(open) => {
              setIsTypeDialogOpen(open)
              if (!open) setEditingType(null)
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Type
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSaveType}>
                <DialogHeader>
                  <DialogTitle>{editingType ? "Edit Master Data Type" : "Add Master Data Type"}</DialogTitle>
                  <DialogDescription>
                    Define a new dropdown/master data type for a module or submodule
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="parent_type">Belongs To</Label>
                    <Select name="parent_type" defaultValue="module" required>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="module">Module</SelectItem>
                        <SelectItem value="submodule">Submodule</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="parent_id">Select Parent</Label>
                    <Select
                      name="parent_id"
                      defaultValue={editingType?.module_id || editingType?.submodule_id || ""}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a module or submodule" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1.5 text-sm font-semibold">Modules</div>
                        {modules.map((module) => (
                          <SelectItem key={module.id} value={module.id}>
                            {module.name}
                          </SelectItem>
                        ))}
                        <div className="px-2 py-1.5 text-sm font-semibold mt-2">Submodules</div>
                        {submodules.map((submodule) => {
                          const module = modules.find((m) => m.id === submodule.module_id)
                          return (
                            <SelectItem key={submodule.id} value={submodule.id}>
                              {module?.name} {">"} {submodule.name}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      name="name"
                      defaultValue={editingType?.name}
                      placeholder="e.g., Department, Designation"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="code">Code</Label>
                    <Input
                      id="code"
                      name="code"
                      defaultValue={editingType?.code}
                      placeholder="e.g., DEPT, DESIG"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" defaultValue={editingType?.description || ""} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="is_active" name="is_active" defaultChecked={editingType?.is_active ?? true} />
                    <Label htmlFor="is_active">Active</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">{editingType ? "Update" : "Create"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-2">
          <Select
            value={selectedModule}
            onValueChange={(value) => {
              setSelectedModule(value)
              setSelectedSubmodule("")
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filter by module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              {modules.map((module) => (
                <SelectItem key={module.id} value={module.id}>
                  {module.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {availableSubmodules.length > 0 && (
            <Select value={selectedSubmodule} onValueChange={setSelectedSubmodule}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter by submodule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Submodules</SelectItem>
                {availableSubmodules.map((submodule) => (
                  <SelectItem key={submodule.id} value={submodule.id}>
                    {submodule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {filteredTypes.map((type) => (
            <div
              key={type.id}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedType?.id === type.id ? "bg-primary/10 border-primary" : "bg-card hover:bg-muted/50"
              }`}
              onClick={() => setSelectedType(type)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{type.name}</h4>
                    <Badge variant="secondary">{type.code}</Badge>
                    {!type.is_active && <Badge variant="outline">Inactive</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{getTypeName(type)}</p>
                  {type.description && <p className="text-xs text-muted-foreground mt-1">{type.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingType(type)
                      setIsTypeDialogOpen(true)
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteType(type)
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {selectedType ? `Values for ${selectedType.name}` : "Select a type"}
          </h3>
          {selectedType && (
            <Dialog
              open={isValueDialogOpen}
              onOpenChange={(open) => {
                setIsValueDialogOpen(open)
                if (!open) setEditingValue(null)
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Value
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleSaveValue}>
                  <DialogHeader>
                    <DialogTitle>{editingValue ? "Edit Value" : "Add Value"}</DialogTitle>
                    <DialogDescription>Add a new dropdown value for {selectedType.name}</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="value">Value</Label>
                      <Input id="value" name="value" defaultValue={editingValue?.value} required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="code">Code</Label>
                      <Input id="code" name="code" defaultValue={editingValue?.code} required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea id="description" name="description" defaultValue={editingValue?.description || ""} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch id="is_active" name="is_active" defaultChecked={editingValue?.is_active ?? true} />
                      <Label htmlFor="is_active">Active</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit">{editingValue ? "Update" : "Create"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {selectedType ? (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Value</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {values.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No values added yet. Click "Add Value" to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  values.map((value) => (
                    <TableRow key={value.id}>
                      <TableCell className="font-medium">{value.value}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{value.code}</Badge>
                      </TableCell>
                      <TableCell>
                        {value.is_active ? (
                          <Badge variant="default">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingValue(value)
                              setIsValueDialogOpen(true)
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteValue(value)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="border rounded-lg p-12 text-center text-muted-foreground">
            <List className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Select a master data type from the left to view and manage its values</p>
          </div>
        )}
      </div>
    </div>
  )
}
