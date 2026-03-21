"use client"

import { useCallback } from "react"
import {
  useGetOrgModulesQuery,
  useMoveFormMutation,
  useMoveModuleMutation,
  usePublishFormMutation,
  useDeleteFormMutation,
  useCreateModuleFormMutation,
  useUpdateFormMetaMutation,
  useCreateModuleMutation,
  useUpdateModuleMutation,
  useDeleteModuleMutation,
} from "@/lib/api/modules"
import { baseApi } from "@/lib/api/baseApi"
import { useAppDispatch } from "@/lib/hooks/redux"

interface Form {
  id: string
  name: string
  isPublished: boolean
}

interface Module {
  id: string
  name: string
  parentId: string | null
  children?: Module[]
  forms?: Form[]
}

export function useOptimisticModules(organizationId: string | null) {
  const dispatch = useAppDispatch()

  const { data, error, isLoading, refetch } = useGetOrgModulesQuery(
    organizationId!,
    { skip: !organizationId }
  )

  const modules: Module[] = data?.data || []

  const [moveFormApi] = useMoveFormMutation()
  const [moveModuleApi] = useMoveModuleMutation()
  const [publishFormApi] = usePublishFormMutation()
  const [deleteFormApi] = useDeleteFormMutation()
  const [createFormApi] = useCreateModuleFormMutation()
  const [updateFormApi] = useUpdateFormMetaMutation()
  const [createModuleApi] = useCreateModuleMutation()
  const [updateModuleApi] = useUpdateModuleMutation()
  const [deleteModuleApi] = useDeleteModuleMutation()

  // Helper: optimistically patch the cached org-modules query
  const patchModules = useCallback(
    (updater: (draft: Module[]) => void) => {
      if (!organizationId) return { undo: () => {} }
      const patchResult = dispatch(
        baseApi.util.updateQueryData("getOrgModules", organizationId, (draft: any) => {
          if (draft?.data) updater(draft.data)
        })
      )
      return patchResult
    },
    [dispatch, organizationId]
  )

  // ── Move form ──────────────────────────────────────────────────────────────

  const moveFormOptimistic = useCallback(
    async (formId: string, targetModuleId: string | null) => {
      let movedForm: Form | undefined

      const patch = patchModules((mods) => {
        for (const mod of mods) {
          const idx = mod.forms?.findIndex((f: Form) => f.id === formId) ?? -1
          if (idx >= 0) {
            movedForm = mod.forms![idx]
            mod.forms!.splice(idx, 1)
            break
          }
        }
        if (movedForm && targetModuleId) {
          const target = mods.find((m: Module) => m.id === targetModuleId)
          if (target) {
            if (!target.forms) target.forms = []
            target.forms.push(movedForm)
          }
        }
      })

      try {
        await moveFormApi({ formId, newModuleId: targetModuleId }).unwrap()
        refetch()
      } catch {
        patch.undo()
        throw new Error("Move failed")
      }
    },
    [patchModules, moveFormApi, refetch]
  )

  // ── Move module ────────────────────────────────────────────────────────────

  const moveModuleOptimistic = useCallback(
    async (moduleId: string, newParentId: string | null) => {
      if (newParentId === moduleId) return

      const patch = patchModules((mods) => {
        let moved: Module | undefined

        // Remove from current position
        const removeFromTree = (items: Module[]): Module[] => {
          return items.filter((item) => {
            if (item.id === moduleId) {
              moved = { ...item, parentId: newParentId }
              return false
            }
            if (item.children) {
              item.children = removeFromTree(item.children)
            }
            return true
          })
        }

        const remaining = removeFromTree(mods)
        mods.length = 0
        mods.push(...remaining)

        if (!moved) return

        if (newParentId === null) {
          mods.push(moved)
        } else {
          const insertIntoTree = (items: Module[]) => {
            for (const item of items) {
              if (item.id === newParentId) {
                if (!item.children) item.children = []
                item.children.push(moved!)
                return true
              }
              if (item.children && insertIntoTree(item.children)) return true
            }
            return false
          }
          insertIntoTree(mods)
        }
      })

      try {
        await moveModuleApi({ moduleId, parentId: newParentId }).unwrap()
        refetch()
      } catch {
        patch.undo()
        throw new Error("Move failed")
      }
    },
    [patchModules, moveModuleApi, refetch]
  )

  // ── Publish form ───────────────────────────────────────────────────────────

  const publishFormOptimistic = useCallback(
    async (formId: string, isPublished: boolean) => {
      const patch = patchModules((mods) => {
        for (const mod of mods) {
          if (mod.forms) {
            const form = mod.forms.find((f: Form) => f.id === formId)
            if (form) {
              form.isPublished = !isPublished
              break
            }
          }
        }
      })

      try {
        await publishFormApi({ formId, isPublished: !isPublished }).unwrap()
        refetch()
      } catch {
        patch.undo()
        throw new Error("Publish failed")
      }
    },
    [patchModules, publishFormApi, refetch]
  )

  // ── Delete form ────────────────────────────────────────────────────────────

  const deleteFormOptimistic = useCallback(
    async (formId: string) => {
      const patch = patchModules((mods) => {
        for (const mod of mods) {
          if (mod.forms) {
            mod.forms = mod.forms.filter((f: Form) => f.id !== formId)
          }
        }
      })

      try {
        await deleteFormApi(formId).unwrap()
        refetch()
      } catch {
        patch.undo()
        throw new Error("Delete failed")
      }
    },
    [patchModules, deleteFormApi, refetch]
  )

  // ── Create form ────────────────────────────────────────────────────────────

  const createFormOptimistic = useCallback(
    async (moduleId: string, formData: { name: string; description: string }) => {
      const tempId = `temp-${Date.now()}`

      const patch = patchModules((mods) => {
        const mod = mods.find((m: Module) => m.id === moduleId)
        if (mod) {
          if (!mod.forms) mod.forms = []
          mod.forms.push({ id: tempId, name: formData.name, isPublished: false })
        }
      })

      try {
        await createFormApi({ moduleId, body: formData }).unwrap()
        refetch()
      } catch {
        patch.undo()
        throw new Error("Create failed")
      }
    },
    [patchModules, createFormApi, refetch]
  )

  // ── Update form ────────────────────────────────────────────────────────────

  const updateFormOptimistic = useCallback(
    async (formId: string, _moduleId: string, formData: { name: string; description: string }) => {
      const patch = patchModules((mods) => {
        for (const mod of mods) {
          if (mod.forms) {
            const form = mod.forms.find((f: Form) => f.id === formId)
            if (form) {
              form.name = formData.name
              break
            }
          }
        }
      })

      try {
        await updateFormApi({ formId, body: formData }).unwrap()
        refetch()
      } catch {
        patch.undo()
        throw new Error("Update failed")
      }
    },
    [patchModules, updateFormApi, refetch]
  )

  // ── Create module ──────────────────────────────────────────────────────────

  const createModuleOptimistic = useCallback(
    async (moduleData: {
      name: string
      description: string
      parentId: string | null
      organizationId: string
    }) => {
      const tempId = `temp-${Date.now()}`

      const patch = patchModules((mods) => {
        const newModule: Module = {
          id: tempId,
          name: moduleData.name,
          parentId: moduleData.parentId,
          children: [],
          forms: [],
        }

        if (moduleData.parentId === null) {
          mods.push(newModule)
        } else {
          const insertIntoTree = (items: Module[]): boolean => {
            for (const item of items) {
              if (item.id === moduleData.parentId) {
                if (!item.children) item.children = []
                item.children.push(newModule)
                return true
              }
              if (item.children && insertIntoTree(item.children)) return true
            }
            return false
          }
          insertIntoTree(mods)
        }
      })

      try {
        await createModuleApi(moduleData).unwrap()
        refetch()
      } catch {
        patch.undo()
        throw new Error("Create failed")
      }
    },
    [patchModules, createModuleApi, refetch]
  )

  // ── Update module ──────────────────────────────────────────────────────────

  const updateModuleOptimistic = useCallback(
    async (
      moduleId: string,
      moduleData: { name: string; description: string; parentId: string | null }
    ) => {
      const patch = patchModules((mods) => {
        const updateInTree = (items: Module[]) => {
          for (const item of items) {
            if (item.id === moduleId) {
              item.name = moduleData.name
              return
            }
            if (item.children) updateInTree(item.children)
          }
        }
        updateInTree(mods)
      })

      try {
        await updateModuleApi({ moduleId, body: moduleData }).unwrap()
        refetch()
      } catch {
        patch.undo()
        throw new Error("Update failed")
      }
    },
    [patchModules, updateModuleApi, refetch]
  )

  // ── Delete module ──────────────────────────────────────────────────────────

  const deleteModuleOptimistic = useCallback(
    async (moduleId: string) => {
      const patch = patchModules((mods) => {
        const removeFromTree = (items: Module[]): Module[] => {
          return items.filter((item) => {
            if (item.id === moduleId) return false
            if (item.children) {
              item.children = removeFromTree(item.children)
            }
            return true
          })
        }
        const remaining = removeFromTree(mods)
        mods.length = 0
        mods.push(...remaining)
      })

      try {
        await deleteModuleApi(moduleId).unwrap()
        refetch()
      } catch {
        patch.undo()
        throw new Error("Delete failed")
      }
    },
    [patchModules, deleteModuleApi, refetch]
  )

  return {
    modules,
    isLoading,
    error,
    mutate: refetch,
    moveFormOptimistic,
    moveModuleOptimistic,
    publishFormOptimistic,
    deleteFormOptimistic,
    createFormOptimistic,
    updateFormOptimistic,
    createModuleOptimistic,
    updateModuleOptimistic,
    deleteModuleOptimistic,
  }
}
