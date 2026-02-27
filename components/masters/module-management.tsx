"use client"

import type React from "react"

import { useState } from "react"
import type { Module, Submodule } from "@/lib/types"
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
import { Plus, Edit, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ModuleManagementProps {
  modules: Module[]
  submodules: Submodule[]
  onModulesChange: (modules: Module[]) => void
  onSubmodulesChange: (submodules: Submodule[]) => void
}

export function ModuleManagement({ modules, submodules, onModulesChange, onSubmodulesChange }: ModuleManagementProps) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [isModuleDialogOpen, setIsModuleDialogOpen] = useState(false)
  const [isSubmoduleDialogOpen, setIsSubmoduleDialogOpen] = useState(false)
  const [editingModule, setEditingModule] = useState<Module | null>(null)
  const [editingSubmodule, setEditingSubmodule] = useState<Submodule | null>(null)
  const [selectedModuleForSubmodule, setSelectedModuleForSubmodule] = useState<string>("")
  const { toast } = useToast()
  const supabase = createClient()

  const toggleModule = (moduleId: string) => {
    const newExpanded = new Set(expandedModules)
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId)
    } else {
      newExpanded.add(moduleId)
    }
    setExpandedModules(newExpanded)
  }

  const handleSaveModule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const data = {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      description: formData.get("description") as string,
      is_active: formData.get("is_active") === "on",
    }

    try {
      if (editingModule) {
        const { data: updated, error } = await supabase
          .from("modules")
          .update(data)
          .eq("id", editingModule.id)
          .select()
          .single()

        if (error) throw error

        onModulesChange(modules.map((m) => (m.id === editingModule.id ? updated : m)))
        toast({ title: "Module updated successfully" })
      } else {
        const { data: created, error } = await supabase.from("modules").insert([data]).select().single()

        if (error) throw error

        onModulesChange([...modules, created])
        toast({ title: "Module created successfully" })
      }

      setIsModuleDialogOpen(false)
      setEditingModule(null)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleSaveSubmodule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const data = {
      module_id: formData.get("module_id") as string,
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      description: formData.get("description") as string,
      is_active: formData.get("is_active") === "on",
    }

    try {
      if (editingSubmodule) {
        const { data: updated, error } = await supabase
          .from("submodules")
          .update(data)
          .eq("id", editingSubmodule.id)
          .select()
          .single()

        if (error) throw error

        onSubmodulesChange(submodules.map((s) => (s.id === editingSubmodule.id ? updated : s)))
        toast({ title: "Submodule updated successfully" })
      } else {
        const { data: created, error } = await supabase.from("submodules").insert([data]).select().single()

        if (error) throw error

        onSubmodulesChange([...submodules, created])
        toast({ title: "Submodule created successfully" })
      }

      setIsSubmoduleDialogOpen(false)
      setEditingSubmodule(null)
      setSelectedModuleForSubmodule("")
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleDeleteModule = async (module: Module) => {
    if (!confirm(`Are you sure you want to delete ${module.name}?`)) return

    try {
      const { error } = await supabase.from("modules").delete().eq("id", module.id)

      if (error) throw error

      onModulesChange(modules.filter((m) => m.id !== module.id))
      onSubmodulesChange(submodules.filter((s) => s.module_id !== module.id))
      toast({ title: "Module deleted successfully" })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleDeleteSubmodule = async (submodule: Submodule) => {
    if (!confirm(`Are you sure you want to delete ${submodule.name}?`)) return

    try {
      const { error } = await supabase.from("submodules").delete().eq("id", submodule.id)

      if (error) throw error

      onSubmodulesChange(submodules.filter((s) => s.id !== submodule.id))
      toast({ title: "Submodule deleted successfully" })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const getSubmodulesForModule = (moduleId: string) => {
    return submodules.filter((s) => s.module_id === moduleId)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Dialog
          open={isModuleDialogOpen}
          onOpenChange={(open) => {
            setIsModuleDialogOpen(open)
            if (!open) setEditingModule(null)
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Module
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSaveModule}>
              <DialogHeader>
                <DialogTitle>{editingModule ? "Edit Module" : "Add Module"}</DialogTitle>
                <DialogDescription>
                  {editingModule ? "Update module details" : "Create a new module for your ERP system"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" defaultValue={editingModule?.name} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" name="code" defaultValue={editingModule?.code} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" defaultValue={editingModule?.description || ""} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="is_active" name="is_active" defaultChecked={editingModule?.is_active ?? true} />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{editingModule ? "Update" : "Create"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isSubmoduleDialogOpen}
          onOpenChange={(open) => {
            setIsSubmoduleDialogOpen(open)
            if (!open) {
              setEditingSubmodule(null)
              setSelectedModuleForSubmodule("")
            }
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add Submodule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSaveSubmodule}>
              <DialogHeader>
                <DialogTitle>{editingSubmodule ? "Edit Submodule" : "Add Submodule"}</DialogTitle>
                <DialogDescription>
                  {editingSubmodule ? "Update submodule details" : "Create a new submodule under a module"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="module_id">Parent Module</Label>
                  <Select
                    name="module_id"
                    defaultValue={editingSubmodule?.module_id || selectedModuleForSubmodule}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a module" />
                    </SelectTrigger>
                    <SelectContent>
                      {modules.map((module) => (
                        <SelectItem key={module.id} value={module.id}>
                          {module.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" defaultValue={editingSubmodule?.name} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" name="code" defaultValue={editingSubmodule?.code} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" defaultValue={editingSubmodule?.description || ""} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="is_active" name="is_active" defaultChecked={editingSubmodule?.is_active ?? true} />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{editingSubmodule ? "Update" : "Create"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {modules.map((module) => {
          const moduleSubmodules = getSubmodulesForModule(module.id)
          const isExpanded = expandedModules.has(module.id)

          return (
            <div key={module.id} className="border rounded-lg">
              <div className="flex items-center justify-between p-4 bg-muted/50">
                <div className="flex items-center gap-3 flex-1">
                  <Button variant="ghost" size="sm" onClick={() => toggleModule(module.id)}>
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{module.name}</h3>
                      <Badge variant="secondary">{module.code}</Badge>
                      {!module.is_active && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    {module.description && <p className="text-sm text-muted-foreground mt-1">{module.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{moduleSubmodules.length} submodules</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingModule(module)
                      setIsModuleDialogOpen(true)
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteModule(module)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {isExpanded && moduleSubmodules.length > 0 && (
                <div className="p-4 space-y-2 border-t">
                  {moduleSubmodules.map((submodule) => (
                    <div
                      key={submodule.id}
                      className="flex items-center justify-between p-3 bg-background border rounded-md ml-8"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm">{submodule.name}</h4>
                          <Badge variant="secondary" className="text-xs">
                            {submodule.code}
                          </Badge>
                          {!submodule.is_active && (
                            <Badge variant="outline" className="text-xs">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        {submodule.description && (
                          <p className="text-xs text-muted-foreground mt-1">{submodule.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingSubmodule(submodule)
                            setIsSubmoduleDialogOpen(true)
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteSubmodule(submodule)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
