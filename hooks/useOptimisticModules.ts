import useSWR from "swr";
import { useCallback } from "react";

interface Form {
  id: string;
  name: string;
  isPublished: boolean;
}

interface Module {
  id: string;
  name: string;
  parentId: string | null;
  children?: Module[];
  forms?: Form[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useOptimisticModules(organizationId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    organizationId ? `/api/modules?organizationId=${organizationId}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    },
  );

  const modules = data?.data || [];

  // Optimistic update for moving form
  const moveFormOptimistic = useCallback(
    async (formId: string, targetModuleId: string | null) => {
      const backup = JSON.parse(JSON.stringify(modules)); // Deep clone

      try {
        // Update UI immediately
        const updatedModules = modules.map((mod: Module) => {
          const newMod = { ...mod };
          if (newMod.forms?.some((f: Form) => f.id === formId)) {
            newMod.forms = newMod.forms.filter((f: Form) => f.id !== formId);
          }
          if (
            newMod.id === targetModuleId &&
            !newMod.forms?.some((f: Form) => f.id === formId)
          ) {
            const form = backup
              .flatMap((m: Module) => m.forms || [])
              .find((f: Form) => f.id === formId);
            if (form) {
              newMod.forms = [...(newMod.forms || []), form];
            }
          }
          return newMod;
        });

        mutate({ data: updatedModules }, false);

        // Make API call
        const res = await fetch(`/api/forms/${formId}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newModuleId: targetModuleId }),
        });

        if (!res.ok) throw new Error("Move failed");

        // Revalidate from server
        mutate();
      } catch (err) {
        // Rollback on error
        mutate({ data: backup }, false);
        throw err;
      }
    },
    [modules, mutate],
  );

  // Optimistic update for moving module
  const moveModuleOptimistic = useCallback(
    async (moduleId: string, newParentId: string | null) => {
      if (newParentId === moduleId) return;

      const backup = JSON.parse(JSON.stringify(modules));

      try {
        // Implement optimistic move
        const moveInTree = (mods: Module[]): Module[] => {
          let moved: Module | undefined;
          const removed = mods.filter((m) => {
            if (m.id === moduleId) {
              moved = { ...m, parentId: newParentId };
              return false;
            }
            if (m.children) {
              m.children = removeFromTree(m.children);
            }
            return true;
          });

          const removeFromTree = (items: Module[]): Module[] => {
            let found: Module | undefined;
            const result = items.filter((item) => {
              if (item.id === moduleId) {
                moved = { ...item, parentId: newParentId };
                return false;
              }
              if (item.children) {
                item.children = removeFromTree(item.children);
              }
              return true;
            });
            return result;
          };

          if (!moved) return mods;

          if (newParentId === null) {
            return [...removed, moved];
          }

          const insertIntoTree = (items: Module[]): Module[] => {
            return items.map((item) => {
              if (item.id === newParentId) {
                return {
                  ...item,
                  children: [...(item.children || []), moved!],
                };
              }
              if (item.children) {
                return { ...item, children: insertIntoTree(item.children) };
              }
              return item;
            });
          };

          return insertIntoTree(removed);
        };

        const updatedModules = moveInTree(JSON.parse(JSON.stringify(modules)));
        mutate({ data: updatedModules }, false);

        // Make API call
        const res = await fetch(`/api/modules/${moduleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: newParentId }),
        });

        if (!res.ok) throw new Error("Move failed");

        // Revalidate from server
        mutate();
      } catch (err) {
        // Rollback on error
        mutate({ data: backup }, false);
        throw err;
      }
    },
    [modules, mutate],
  );

  // Optimistic update for publishing form
  const publishFormOptimistic = useCallback(
    async (formId: string, isPublished: boolean) => {
      const backup = JSON.parse(JSON.stringify(modules));

      try {
        // Update UI immediately
        const updatedModules = modules.map((mod: Module) => {
          const newMod = { ...mod };
          if (newMod.forms) {
            newMod.forms = newMod.forms.map((f: Form) =>
              f.id === formId ? { ...f, isPublished: !isPublished } : f,
            );
          }
          return newMod;
        });

        mutate({ data: updatedModules }, false);

        // Make API call
        const res = await fetch(`/api/forms/${formId}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublished: !isPublished }),
        });

        if (!res.ok) throw new Error("Publish failed");

        // Revalidate from server
        mutate();
      } catch (err) {
        // Rollback on error
        mutate({ data: backup }, false);
        throw err;
      }
    },
    [modules, mutate],
  );

  // Optimistic update for deleting form
  const deleteFormOptimistic = useCallback(
    async (formId: string) => {
      const backup = JSON.parse(JSON.stringify(modules));

      try {
        // Update UI immediately
        const updatedModules = modules.map((mod: Module) => {
          const newMod = { ...mod };
          if (newMod.forms) {
            newMod.forms = newMod.forms.filter((f: Form) => f.id !== formId);
          }
          return newMod;
        });

        mutate({ data: updatedModules }, false);

        // Make API call
        const res = await fetch(`/api/forms/${formId}`, {
          method: "DELETE",
        });

        if (!res.ok) throw new Error("Delete failed");

        // Revalidate from server
        mutate();
      } catch (err) {
        // Rollback on error
        mutate({ data: backup }, false);
        throw err;
      }
    },
    [modules, mutate],
  );

  // Optimistic update for creating form
  const createFormOptimistic = useCallback(
    async (
      moduleId: string,
      formData: { name: string; description: string },
    ) => {
      const backup = JSON.parse(JSON.stringify(modules));
      const tempId = `temp-${Date.now()}`;

      try {
        // Update UI immediately with temp form
        const updatedModules = modules.map((mod: Module) => {
          if (mod.id === moduleId) {
            return {
              ...mod,
              forms: [
                ...(mod.forms || []),
                {
                  id: tempId,
                  name: formData.name,
                  isPublished: false,
                },
              ],
            };
          }
          return mod;
        });

        mutate({ data: updatedModules }, false);

        // Make API call
        const res = await fetch(`/api/modules/${moduleId}/forms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!res.ok) throw new Error("Create failed");

        // Revalidate from server
        mutate();
      } catch (err) {
        // Rollback on error
        mutate({ data: backup }, false);
        throw err;
      }
    },
    [modules, mutate],
  );

  // Optimistic update for updating form
  const updateFormOptimistic = useCallback(
    async (
      formId: string,
      moduleId: string,
      formData: { name: string; description: string },
    ) => {
      const backup = JSON.parse(JSON.stringify(modules));

      try {
        // Update UI immediately
        const updatedModules = modules.map((mod: Module) => {
          const newMod = { ...mod };
          if (newMod.forms) {
            newMod.forms = newMod.forms.map((f: Form) =>
              f.id === formId
                ? {
                    ...f,
                    name: formData.name,
                  }
                : f,
            );
          }
          return newMod;
        });

        mutate({ data: updatedModules }, false);

        // Make API call
        const res = await fetch(`/api/forms/${formId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!res.ok) throw new Error("Update failed");

        // Revalidate from server
        mutate();
      } catch (err) {
        // Rollback on error
        mutate({ data: backup }, false);
        throw err;
      }
    },
    [modules, mutate],
  );

  // Optimistic update for creating module
  const createModuleOptimistic = useCallback(
    async (moduleData: {
      name: string;
      description: string;
      parentId: string | null;
      organizationId: string;
    }) => {
      const backup = JSON.parse(JSON.stringify(modules));
      const tempId = `temp-${Date.now()}`;

      try {
        // Update UI immediately
        const newModule: Module = {
          id: tempId,
          name: moduleData.name,
          parentId: moduleData.parentId,
          children: [],
          forms: [],
        };

        let updatedModules: Module[];
        if (moduleData.parentId === null) {
          updatedModules = [...modules, newModule];
        } else {
          const insertModule = (items: Module[]): Module[] => {
            return items.map((item) => {
              if (item.id === moduleData.parentId) {
                return {
                  ...item,
                  children: [...(item.children || []), newModule],
                };
              }
              if (item.children) {
                return { ...item, children: insertModule(item.children) };
              }
              return item;
            });
          };
          updatedModules = insertModule(modules);
        }

        mutate({ data: updatedModules }, false);

        // Make API call
        const res = await fetch("/api/modules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(moduleData),
        });

        if (!res.ok) throw new Error("Create failed");

        // Revalidate from server
        mutate();
      } catch (err) {
        // Rollback on error
        mutate({ data: backup }, false);
        throw err;
      }
    },
    [modules, mutate],
  );

  // Optimistic update for updating module
  const updateModuleOptimistic = useCallback(
    async (
      moduleId: string,
      moduleData: {
        name: string;
        description: string;
        parentId: string | null;
      },
    ) => {
      const backup = JSON.parse(JSON.stringify(modules));

      try {
        // Simple update if parent doesn't change
        const updateInTree = (items: Module[]): Module[] => {
          return items.map((item) => {
            if (item.id === moduleId) {
              return {
                ...item,
                name: moduleData.name,
                description: moduleData.description,
              };
            }
            if (item.children) {
              return { ...item, children: updateInTree(item.children) };
            }
            return item;
          });
        };

        const updatedModules = updateInTree(modules);
        mutate({ data: updatedModules }, false);

        // Make API call
        const res = await fetch(`/api/modules/${moduleId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(moduleData),
        });

        if (!res.ok) throw new Error("Update failed");

        // Revalidate from server
        mutate();
      } catch (err) {
        // Rollback on error
        mutate({ data: backup }, false);
        throw err;
      }
    },
    [modules, mutate],
  );

  // Optimistic update for deleting module
  const deleteModuleOptimistic = useCallback(
    async (moduleId: string) => {
      const backup = JSON.parse(JSON.stringify(modules));

      try {
        // Update UI immediately
        const removeFromTree = (items: Module[]): Module[] => {
          return items
            .filter((item) => item.id !== moduleId)
            .map((item) => {
              if (item.children) {
                return { ...item, children: removeFromTree(item.children) };
              }
              return item;
            });
        };

        const updatedModules = removeFromTree(modules);
        mutate({ data: updatedModules }, false);

        // Make API call
        const res = await fetch(`/api/modules/${moduleId}`, {
          method: "DELETE",
        });

        if (!res.ok) throw new Error("Delete failed");

        // Revalidate from server
        mutate();
      } catch (err) {
        // Rollback on error
        mutate({ data: backup }, false);
        throw err;
      }
    },
    [modules, mutate],
  );

  return {
    modules,
    isLoading,
    error,
    mutate,
    moveFormOptimistic,
    moveModuleOptimistic,
    publishFormOptimistic,
    deleteFormOptimistic,
    createFormOptimistic,
    updateFormOptimistic,
    createModuleOptimistic,
    updateModuleOptimistic,
    deleteModuleOptimistic,
  };
}
