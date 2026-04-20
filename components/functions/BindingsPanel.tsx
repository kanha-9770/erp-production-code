"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Pencil, Power, PowerOff } from "lucide-react";
import {
  useListBindingsQuery,
  useGetBindingsTreeQuery,
  useUpdateBindingMutation,
  useDeleteBindingMutation,
  type FunctionBinding,
} from "@/lib/api/functions";
import { BindingFormDialog, type FieldOption } from "@/components/functions/BindingFormDialog";

interface BindingsPanelProps {
  functionId: string;
}

interface DialogState {
  open: boolean;
  binding?: FunctionBinding & { functionId: string };
  fields?: FieldOption[];
}

export function BindingsPanel({ functionId }: BindingsPanelProps) {
  const { data, isLoading, isFetching } = useListBindingsQuery(functionId, {
    skip: !functionId,
  });
  // The tree carries each form's fields. We piggy-back on it to resolve
  // field options when editing, so the picker dropdown is populated.
  const { data: treeData } = useGetBindingsTreeQuery(undefined, { skip: !functionId });
  const [updateBinding] = useUpdateBindingMutation();
  const [deleteBinding, deleteState] = useDeleteBindingMutation();

  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [error, setError] = useState<string | null>(null);

  const bindings = data?.data ?? [];
  const tree = treeData?.data ?? [];

  // Build a fieldId → fields-of-the-binding's-form map so we can resolve a
  // picker list from any binding's scope.
  const formIdToFields = useMemo(() => {
    const m = new Map<string, FieldOption[]>();
    for (const mod of tree) {
      for (const f of mod.forms) m.set(f.id, f.fields);
    }
    return m;
  }, [tree]);

  const fieldIdToFormId = useMemo(() => {
    const m = new Map<string, string>();
    for (const mod of tree) {
      for (const f of mod.forms) for (const fld of f.fields) m.set(fld.id, f.id);
    }
    return m;
  }, [tree]);

  const moduleIdToFields = useMemo(() => {
    const m = new Map<string, FieldOption[]>();
    for (const mod of tree) m.set(mod.id, mod.forms.flatMap((f) => f.fields));
    return m;
  }, [tree]);

  const fieldsForBinding = (b: FunctionBinding): FieldOption[] => {
    if (b.fieldId) {
      const formId = fieldIdToFormId.get(b.fieldId);
      return formId ? formIdToFields.get(formId) || [] : [];
    }
    if (b.formId) return formIdToFields.get(b.formId) || [];
    if (b.moduleId) return moduleIdToFields.get(b.moduleId) || [];
    return [];
  };

  const handleDelete = async (b: FunctionBinding) => {
    if (!confirm(`Delete binding for "${b.event}"?`)) return;
    try {
      await deleteBinding({ functionId, bindingId: b.id }).unwrap();
    } catch (e: any) {
      setError(e?.data?.error || e?.message || "Failed to delete binding");
    }
  };

  const handleToggle = async (b: FunctionBinding) => {
    try {
      await updateBinding({
        functionId,
        bindingId: b.id,
        body: { active: !b.active },
      }).unwrap();
    } catch (e: any) {
      setError(e?.data?.error || e?.message || "Failed to toggle binding");
    }
  };

  if (!functionId) {
    return (
      <div className="p-4 text-xs text-[var(--ed-fg-3)]">
        Save the function first to manage bindings.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--ed-fg-2)] font-medium">
          {bindings.length} binding{bindings.length === 1 ? "" : "s"}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() =>
            setDialog({
              open: true,
              binding: undefined,
              fields: [],
            })
          }
        >
          <Plus className="h-3 w-3 mr-1" /> Add Binding
        </Button>
      </div>

      {error && (
        <div className="text-[11px] text-[var(--ed-red,#f56565)] bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
          {error}
        </div>
      )}

      {(isLoading || isFetching) && bindings.length === 0 ? (
        <div className="text-[11px] text-[var(--ed-fg-3)]">Loading bindings…</div>
      ) : bindings.length === 0 ? (
        <div className="text-[11px] text-[var(--ed-fg-3)]">
          No bindings yet. Add one to make this function fire from a form.
          <br />
          Or open <a href="/settings/apis" className="underline">Settings → APIs and SDKs</a> to
          attach it from a module/form's prebuilt slot.
        </div>
      ) : (
        <div className="space-y-1.5">
          {bindings.map((b) => (
            <div
              key={b.id}
              className="border border-[var(--ed-border)] rounded p-2 text-[11px] space-y-1 bg-[var(--ed-bg)]"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-[var(--ed-fg)]">{b.event}</div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() =>
                      setDialog({
                        open: true,
                        binding: b as FunctionBinding & { functionId: string },
                        fields: fieldsForBinding(b),
                      })
                    }
                  >
                    <Pencil className="h-3 w-3 mr-0.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => handleToggle(b)}
                  >
                    {b.active ? (
                      <PowerOff className="h-3 w-3" />
                    ) : (
                      <Power className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px] text-red-500 hover:text-red-400"
                    onClick={() => handleDelete(b)}
                    disabled={deleteState.isLoading}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="text-[var(--ed-fg-2)] font-mono break-all">
                {b.fieldId
                  ? `field: ${b.fieldId}`
                  : b.formId
                  ? `form: ${b.formId}`
                  : `module: ${b.moduleId}`}
              </div>
              <div className="text-[var(--ed-fg-3)]">
                in: {Object.keys(b.inputMapping || {}).join(", ") || "(none)"} · out:{" "}
                {Object.keys(b.outputMapping || {}).join(", ") || "(none)"}
                {!b.active && " · disabled"}
              </div>
            </div>
          ))}
        </div>
      )}

      <BindingFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ open })}
        binding={dialog.binding}
        availableFields={dialog.fields}
        initialFunctionId={functionId}
      />
    </div>
  );
}
