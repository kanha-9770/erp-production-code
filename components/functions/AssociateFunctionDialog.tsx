"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Save } from "lucide-react"
import {
  useGetFunctionsQuery,
  useCreateBindingMutation,
  useUpdateBindingMutation,
  type BindingEvent,
  type FunctionBinding,
} from "@/lib/api/functions"

/**
 * Module-level events only — the ones that make sense without a specific
 * field. Field-level events (`onFieldChange`, `onFieldBlur`) need a field
 * scope, so we hide them here. Power users can still create those via the
 * function editor's Bindings tab.
 */
const EVENTS: { value: BindingEvent; label: string; helper: string }[] = [
  { value: "beforeSubmit", label: "Before submit", helper: "Awaited before record save. Return { ok: false, error } to block." },
  { value: "afterCreate", label: "After create", helper: "Fire-and-forget after a new record is created." },
  { value: "afterUpdate", label: "After update", helper: "Fire-and-forget after an existing record is updated." },
  { value: "manual", label: "Manual", helper: "Only via explicit API call. Useful for buttons / scheduled jobs." },
]

export interface AssociateFunctionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, the dialog edits this existing binding. Otherwise it creates new. */
  binding?: FunctionBinding & { functionId: string }
  /** The module being associated. Always set — this dialog is module-scoped only. */
  moduleId: string
  moduleName: string
}

interface DraftState {
  functionId: string
  event: BindingEvent
  active: boolean
}

export function AssociateFunctionDialog(props: AssociateFunctionDialogProps) {
  const { open, onOpenChange, binding, moduleId, moduleName } = props

  const isEdit = !!binding
  const initial: DraftState = binding
    ? { functionId: binding.functionId, event: binding.event, active: binding.active }
    : { functionId: "", event: "afterCreate", active: true }

  const [draft, setDraft] = useState<DraftState>(initial)
  const [error, setError] = useState<string | null>(null)

  // Reset whenever the dialog opens with new inputs.
  useEffect(() => {
    if (!open) return
    setDraft(
      binding
        ? { functionId: binding.functionId, event: binding.event, active: binding.active }
        : { functionId: "", event: "afterCreate", active: true }
    )
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, binding])

  const { data: functionsData } = useGetFunctionsQuery(undefined, { skip: !open })
  const functions = functionsData?.data || []

  const [createBinding, createState] = useCreateBindingMutation()
  const [updateBinding, updateState] = useUpdateBindingMutation()
  const saving = createState.isLoading || updateState.isLoading

  const helper = EVENTS.find((e) => e.value === draft.event)?.helper

  const handleSave = async () => {
    if (!draft.functionId) {
      setError("Pick a function to associate.")
      return
    }
    setError(null)

    // Empty input/output mappings — the runtime auto-exposes every form
    // field as ctx.input.<API_Name> and auto-applies any { API_Name: value }
    // returned by the script. No row configuration ever needed.
    const body = {
      event: draft.event,
      moduleId,
      formId: null,
      fieldId: null,
      inputMapping: {},
      outputMapping: {},
      condition: null,
      active: draft.active,
      order: 0,
    }

    try {
      if (binding) {
        await updateBinding({
          functionId: binding.functionId,
          bindingId: binding.id,
          body,
        }).unwrap()
      } else {
        await createBinding({
          functionId: draft.functionId,
          body,
        }).unwrap()
      }
      onOpenChange(false)
    } catch (e: any) {
      setError(e?.data?.error || e?.message || "Failed to save association")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit association" : "Associate a function"}</DialogTitle>
          <DialogDescription>
            Module: <span className="font-medium text-foreground">{moduleName}</span>. The script
            will receive every field as <code className="text-xs">ctx.input.&lt;API_Name&gt;</code>{" "}
            automatically — no mapping needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Function
            </Label>
            <Select
              value={draft.functionId}
              onValueChange={(v) => setDraft({ ...draft, functionId: v })}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a function…" />
              </SelectTrigger>
              <SelectContent>
                {functions.map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.displayName || f.name}{" "}
                    <span className="text-xs text-muted-foreground ml-1">{f.language}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {functions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No functions yet — create one in Settings → Functions first.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">When</Label>
            <Select
              value={draft.event}
              onValueChange={(v) => setDraft({ ...draft, event: v as BindingEvent })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENTS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            Active
          </label>

          {error && (
            <div className="text-xs text-red-600 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            {isEdit ? "Update" : "Associate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
