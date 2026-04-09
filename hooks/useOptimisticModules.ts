"use client"

import { useCallback } from "react"
import {
  useGetOrgModulesQuery,
  useMoveFormMutation,
  useMoveModuleMutation,
  useReorderModuleMutation,
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
  const [reorderModuleApi] = useReorderModuleMutation()
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

  // Helper: find a form in the full module tree (including nested children)
  const findFormInTree = (
    mods: Module[],
    formId: string
  ): { mod: Module; form: Form; index: number } | null => {
    for (const mod of mods) {
      if (mod.forms) {
        const idx = mod.forms.findIndex((f: Form) => f.id === formId)
        if (idx >= 0) return { mod, form: mod.forms[idx], index: idx }
      }
      if (mod.children) {
        const found = findFormInTree(mod.children, formId)
        if (found) return found
      }
    }
    return null
  }

  // Helper: find a module in the full tree
  const findModuleInTree = (mods: Module[], moduleId: string): Module | null => {
    for (const mod of mods) {
      if (mod.id === moduleId) return mod
      if (mod.children) {
        const found = findModuleInTree(mod.children, moduleId)
        if (found) return found
      }
    }
    return null
  }

  // ── Move form ──────────────────────────────────────────────────────────────

  const moveFormOptimistic = useCallback(
    async (formId: string, targetModuleId: string | null) => {
      let movedForm: Form | undefined

      const patch = patchModules((mods) => {
        const found = findFormInTree(mods, formId)
        if (found) {
          movedForm = found.form
          found.mod.forms!.splice(found.index, 1)
        }
        if (movedForm && targetModuleId) {
          const target = findModuleInTree(mods, targetModuleId)
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
        refetch()
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
        refetch()
      }
    },
    [patchModules, moveModuleApi, refetch]
  )

  // ── Reorder module ─────────────────────────────────────────────────────────
  // Atomic: re-parent (if changed) AND insert at a specific index in the new
  // parent's children list. The full child list (including the moved id) is
  // sent to the server so it can reindex sortOrder atomically in one txn.

  const reorderModuleOptimistic = useCallback(
    async (
      moduleId: string,
      newParentId: string | null,
      newIndex: number
    ) => {
      if (newParentId === moduleId) return

      // Build the optimistic patch and capture the new sibling order
      let orderedSiblingIds: string[] = []

      const patch = patchModules((mods) => {
        let moved: Module | undefined

        // Remove the moved module from anywhere in the tree
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

        // Insert into the new parent (or root) at the requested index
        if (newParentId === null) {
          const safeIndex = Math.max(0, Math.min(newIndex, mods.length))
          mods.splice(safeIndex, 0, moved)
          orderedSiblingIds = mods.map((m) => m.id)
        } else {
          const insertIntoTree = (items: Module[]): boolean => {
            for (const item of items) {
              if (item.id === newParentId) {
                if (!item.children) item.children = []
                const safeIndex = Math.max(
                  0,
                  Math.min(newIndex, item.children.length)
                )
                item.children.splice(safeIndex, 0, moved!)
                orderedSiblingIds = item.children.map((c) => c.id)
                return true
              }
              if (item.children && insertIntoTree(item.children)) return true
            }
            return false
          }
          insertIntoTree(mods)
        }
      })

      if (orderedSiblingIds.length === 0) {
        // Nothing was moved (id not found) — bail out cleanly
        return
      }

      try {
        await reorderModuleApi({
          moduleId,
          newParentId,
          orderedSiblingIds,
        }).unwrap()
        // Don't refetch immediately — the optimistic state already matches
        // what the server now holds. A background refetch will reconcile.
        refetch()
      } catch (err) {
        patch.undo()
        refetch()
        throw err
      }
    },
    [patchModules, reorderModuleApi, refetch]
  )

  // ── Publish form ───────────────────────────────────────────────────────────

  const publishFormOptimistic = useCallback(
    async (formId: string, isPublished: boolean) => {
      const patch = patchModules((mods) => {
        const found = findFormInTree(mods, formId)
        if (found) {
          found.form.isPublished = !isPublished
        }
      })

      try {
        await publishFormApi({ formId, body: isPublished ? { unpublish: true } : {},}).unwrap()
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
        const found = findFormInTree(mods, formId)
        if (found) {
          found.mod.forms = found.mod.forms!.filter((f: Form) => f.id !== formId)
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
        const mod = findModuleInTree(mods, moduleId)
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
        const found = findFormInTree(mods, formId)
        if (found) {
          found.form.name = formData.name
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
    reorderModuleOptimistic,
    publishFormOptimistic,
    deleteFormOptimistic,
    createFormOptimistic,
    updateFormOptimistic,
    createModuleOptimistic,
    updateModuleOptimistic,
    deleteModuleOptimistic,
  }
}
