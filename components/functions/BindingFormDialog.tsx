"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Save, Plus, Trash2, Code2, FormInput } from "lucide-react"
import {
  useGetFunctionsQuery,
  useCreateBindingMutation,
  useUpdateBindingMutation,
  type BindingEvent,
  type CreateBindingBody,
  type FunctionBinding,
} from "@/lib/api/functions"

const EVENT_OPTIONS: { value: BindingEvent; label: string; helper: string }[] = [
  { value: "onFieldChange", label: "On field change", helper: "Fires when a watched field's value changes (debounced 300ms)." },
  { value: "onFieldBlur", label: "On field blur", helper: "Fires when a watched field loses focus." },
  { value: "beforeSubmit", label: "Before submit", helper: "Awaited. Returning {ok:false, error} blocks the submission." },
  { value: "afterCreate", label: "After create", helper: "Fire-and-forget after a new record is created." },
  { value: "afterUpdate", label: "After update", helper: "Fire-and-forget after an existing record is updated." },
  { value: "manual", label: "Manual", helper: "Only run via explicit API call." },
]

const SPECIAL_TOKENS: { value: string; label: string; description: string }[] = [
  { value: "$userId", label: "$userId", description: "Current user's id" },
  { value: "$organizationId", label: "$organizationId", description: "Current org id" },
  { value: "$recordId", label: "$recordId", description: "Persisted record id (after* events)" },
  { value: "$formData", label: "$formData", description: "Whole form snapshot as object" },
  { value: "$recordData", label: "$recordData", description: "Whole structured record (after* events)" },
  { value: "$triggerFieldId", label: "$triggerFieldId", description: "Field that fired the event" },
]

export type ScopeKind = "form" | "field" | "module"

export interface FieldOption {
  id: string
  label: string
  type: string
  /** Section title or "<Subform> (subform)". Used to group the dropdown. */
  group: string
  /** Stable PascalCase API Name (e.g. "Ad_Adcopy_ID"). Display identifier. */
  apiName: string
}

export interface BindingFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing binding to edit. Omit to create. */
  binding?: FunctionBinding & { functionId: string }
  /** Pre-fill (and lock) the scope from the slot the user clicked. */
  initialScope?: { kind: ScopeKind; id: string; lock?: boolean; label?: string }
  /** Pre-fill (and lock) the event. */
  initialEvent?: { value: BindingEvent; lock?: boolean }
  /** Pre-pick (and optionally lock) the function. */
  initialFunctionId?: string
  /** Field options for the picker. Should be the fields visible to the
   *  scope: a single form's fields when scope is form/field, or all fields
   *  across the module's forms when scope is module. */
  availableFields?: FieldOption[]
  onSaved?: (saved: FunctionBinding) => void
}

interface MappingRow {
  /** Stable React key — random per row, never sent to server. */
  rid: string
  key: string
  value: string
}

interface DraftState {
  functionId: string
  event: BindingEvent
  scopeKind: ScopeKind
  scopeId: string
  inputRows: MappingRow[]
  outputRows: MappingRow[]
  conditionText: string
  active: boolean
  order: number
  rawMode: boolean
  rawInputText: string
  rawOutputText: string
}

const newRid = () => Math.random().toString(36).slice(2, 9)

function toRows(obj: Record<string, string> | null | undefined): MappingRow[] {
  if (!obj || typeof obj !== "object") return []
  return Object.entries(obj).map(([k, v]) => ({
    rid: newRid(),
    key: k,
    value: typeof v === "string" ? v : JSON.stringify(v),
  }))
}

function rowsToObject(rows: MappingRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) {
    if (r.key.trim()) out[r.key.trim()] = r.value
  }
  return out
}

/** Build a fresh row per field, key=apiName, value=fieldId. Used to seed
 *  new bindings so the user can save without configuring anything. */
function rowsForFields(fields: FieldOption[]): MappingRow[] {
  return fields.map((f) => ({ rid: newRid(), key: f.apiName, value: f.id }))
}

function makeDraft(args: {
  binding?: BindingFormDialogProps["binding"]
  initialScope?: BindingFormDialogProps["initialScope"]
  initialEvent?: BindingFormDialogProps["initialEvent"]
  initialFunctionId?: string
  availableFields?: FieldOption[]
}): DraftState {
  const { binding, initialScope, initialEvent, initialFunctionId, availableFields } = args

  if (binding) {
    // EDIT — load whatever was saved. Don't auto-mutate existing bindings.
    const scopeKind: ScopeKind = binding.fieldId ? "field" : binding.formId ? "form" : "module"
    const inputObj = (binding.inputMapping ?? {}) as Record<string, string>
    const outputObj = (binding.outputMapping ?? {}) as Record<string, string>
    return {
      functionId: binding.functionId,
      event: binding.event,
      scopeKind,
      scopeId: (binding.fieldId || binding.formId || binding.moduleId || "") as string,
      inputRows: toRows(inputObj),
      outputRows: toRows(outputObj),
      conditionText: binding.condition ? JSON.stringify(binding.condition, null, 2) : "",
      active: binding.active,
      order: binding.order,
      rawMode: false,
      rawInputText: JSON.stringify(inputObj, null, 2),
      rawOutputText: JSON.stringify(outputObj, null, 2),
    }
  }

  // NEW — pre-populate one row per available field so the binding is
  // "configured" the moment the dialog opens. The user just picks a
  // function and clicks Create. They can still trim, rename, or wipe rows
  // (the runtime auto-mode covers an empty mapping as a safety net).
  const seededInput = rowsForFields(availableFields || [])
  const seededOutput = rowsForFields(availableFields || [])
  return {
    functionId: initialFunctionId || "",
    event: initialEvent?.value || "onFieldChange",
    scopeKind: initialScope?.kind || "form",
    scopeId: initialScope?.id || "",
    inputRows: seededInput,
    outputRows: seededOutput,
    conditionText: "",
    active: true,
    order: 0,
    rawMode: false,
    rawInputText: JSON.stringify(rowsToObject(seededInput), null, 2),
    rawOutputText: JSON.stringify(rowsToObject(seededOutput), null, 2),
  }
}

export function BindingFormDialog(props: BindingFormDialogProps) {
  const {
    open,
    onOpenChange,
    binding,
    initialScope,
    initialEvent,
    initialFunctionId,
    availableFields,
    onSaved,
  } = props

  const [draft, setDraft] = useState<DraftState>(() =>
    makeDraft({ binding, initialScope, initialEvent, initialFunctionId, availableFields })
  )
  const [error, setError] = useState<string | null>(null)

  // Reset whenever the dialog opens (or its inputs change). availableFields
  // is in the dep list so a new dialog opening on a different form gets the
  // right field list seeded into the rows.
  useEffect(() => {
    if (!open) return
    setDraft(makeDraft({ binding, initialScope, initialEvent, initialFunctionId, availableFields }))
    setError(null)
  }, [open, binding, initialScope, initialEvent, initialFunctionId, availableFields])

  const { data: functionsData } = useGetFunctionsQuery(undefined, { skip: !open })
  const functions = functionsData?.data || []

  const [createBinding, createState] = useCreateBindingMutation()
  const [updateBinding, updateState] = useUpdateBindingMutation()
  const saving = createState.isLoading || updateState.isLoading

  const helper = useMemo(
    () => EVENT_OPTIONS.find((e) => e.value === draft.event)?.helper ?? null,
    [draft.event]
  )

  // Group fields by section/subform for the picker dropdown.
  const fieldGroups = useMemo(() => {
    const groups = new Map<string, FieldOption[]>()
    for (const f of availableFields || []) {
      const arr = groups.get(f.group) || []
      arr.push(f)
      groups.set(f.group, arr)
    }
    return Array.from(groups.entries())
  }, [availableFields])

  // Quick lookup of field label by id — used to render the value chip.
  const fieldLabelById = useMemo(() => {
    const m = new Map<string, FieldOption>()
    for (const f of availableFields || []) m.set(f.id, f)
    return m
  }, [availableFields])

  const buildBody = (): { ok: true; body: CreateBindingBody } | { ok: false; error: string } => {
    if (!draft.functionId) return { ok: false, error: "Pick a function to bind." }
    if (!draft.scopeId) return { ok: false, error: `Scope ${draft.scopeKind} id is required` }

    let inputMapping: Record<string, string> = {}
    let outputMapping: Record<string, string> = {}

    if (draft.rawMode) {
      try {
        inputMapping = draft.rawInputText.trim() ? JSON.parse(draft.rawInputText) : {}
      } catch {
        return { ok: false, error: "Input mapping is not valid JSON" }
      }
      try {
        outputMapping = draft.rawOutputText.trim() ? JSON.parse(draft.rawOutputText) : {}
      } catch {
        return { ok: false, error: "Output mapping is not valid JSON" }
      }
    } else {
      // Validate row mode — every populated row must have a key AND a value.
      for (const r of draft.inputRows) {
        if (r.value && !r.key.trim()) {
          return { ok: false, error: "Every input row needs a script input key on the left." }
        }
      }
      for (const r of draft.outputRows) {
        if (r.value && !r.key.trim()) {
          return { ok: false, error: "Every output row needs a return-value key on the left." }
        }
      }
      inputMapping = rowsToObject(draft.inputRows.filter((r) => r.value || r.key.trim()))
      outputMapping = rowsToObject(draft.outputRows.filter((r) => r.value || r.key.trim()))
    }

    let condition: any = null
    if (draft.conditionText.trim()) {
      try {
        condition = JSON.parse(draft.conditionText)
      } catch {
        return { ok: false, error: "Condition is not valid JSON" }
      }
    }

    const body: CreateBindingBody = {
      event: draft.event,
      formId: draft.scopeKind === "form" ? draft.scopeId : null,
      fieldId: draft.scopeKind === "field" ? draft.scopeId : null,
      moduleId: draft.scopeKind === "module" ? draft.scopeId : null,
      inputMapping,
      outputMapping,
      condition,
      active: draft.active,
      order: draft.order,
    }
    return { ok: true, body }
  }

  const handleSave = async () => {
    const built = buildBody()
    if (!built.ok) {
      setError(built.error)
      return
    }
    setError(null)

    try {
      if (binding) {
        const res = await updateBinding({
          functionId: binding.functionId,
          bindingId: binding.id,
          body: built.body,
        }).unwrap()
        if (res.success && res.data) onSaved?.(res.data)
      } else {
        const res = await createBinding({
          functionId: draft.functionId,
          body: built.body,
        }).unwrap()
        if (res.success && res.data) onSaved?.(res.data)
      }
      onOpenChange(false)
    } catch (e: any) {
      setError(e?.data?.error || e?.message || "Failed to save binding")
    }
  }

  // Sync row → raw and raw → row when the user toggles modes, so they don't
  // lose work mid-edit.
  const enterRawMode = () => {
    setDraft((d) => ({
      ...d,
      rawMode: true,
      rawInputText: JSON.stringify(rowsToObject(d.inputRows), null, 2),
      rawOutputText: JSON.stringify(rowsToObject(d.outputRows), null, 2),
    }))
  }
  const exitRawMode = () => {
    setDraft((d) => {
      let nextInput = d.inputRows
      let nextOutput = d.outputRows
      try {
        nextInput = toRows(JSON.parse(d.rawInputText || "{}"))
      } catch {
        // keep prior rows on parse error — user can fix in raw mode
      }
      try {
        nextOutput = toRows(JSON.parse(d.rawOutputText || "{}"))
      } catch {
        // ditto
      }
      return { ...d, rawMode: false, inputRows: nextInput, outputRows: nextOutput }
    })
  }

  const scopeLocked = !!initialScope?.lock
  const eventLocked = !!initialEvent?.lock
  const isEdit = !!binding
  const hasFields = (availableFields?.length ?? 0) > 0

  // Force raw mode when there are no fields to pick from (e.g. module scope
  // and the page didn't pass fields). We don't want to lock the user out.
  const effectiveRawMode = draft.rawMode || !hasFields

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit binding" : "Configure binding"}</DialogTitle>
          <DialogDescription>
            {scopeLocked && initialScope?.label
              ? `Scope: ${initialScope.label}`
              : "Pick a function and configure how its inputs/outputs map to fields."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Function picker */}
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

          {/* Event */}
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Event</Label>
            <Select
              value={draft.event}
              onValueChange={(v) => setDraft({ ...draft, event: v as BindingEvent })}
              disabled={eventLocked}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_OPTIONS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
          </div>

          {/* Scope readout / picker */}
          {scopeLocked ? (
            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Badge variant="secondary">{initialScope?.kind}</Badge>
              <span className="font-mono">{initialScope?.label || initialScope?.id}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Scope</Label>
              <div className="flex gap-2">
                <Select
                  value={draft.scopeKind}
                  onValueChange={(v) => setDraft({ ...draft, scopeKind: v as ScopeKind })}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="form">Form</SelectItem>
                    <SelectItem value="field">Field</SelectItem>
                    <SelectItem value="module">Module</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={draft.scopeId}
                  onChange={(e) => setDraft({ ...draft, scopeId: e.target.value })}
                  placeholder={`<${draft.scopeKind} id>`}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* Mode toggle: row picker (default) vs raw JSON */}
          <div className="flex items-center justify-between border-t pt-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              I/O mapping
            </Label>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={effectiveRawMode ? "ghost" : "secondary"}
                className="h-7 text-[11px]"
                onClick={exitRawMode}
                disabled={!hasFields}
                title={hasFields ? "Pick fields from a list" : "No fields available — raw JSON only"}
              >
                <FormInput className="h-3 w-3 mr-1" /> Picker
              </Button>
              <Button
                size="sm"
                variant={effectiveRawMode ? "secondary" : "ghost"}
                className="h-7 text-[11px]"
                onClick={enterRawMode}
              >
                <Code2 className="h-3 w-3 mr-1" /> Raw JSON
              </Button>
            </div>
          </div>

          {effectiveRawMode ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Input mapping (JSON)</Label>
                <Textarea
                  value={draft.rawInputText}
                  onChange={(e) => setDraft({ ...draft, rawInputText: e.target.value })}
                  rows={5}
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Map script input keys → fieldId or special token ($userId, $recordId,
                  $organizationId, $formData, $recordData, $triggerFieldId).
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Output mapping (JSON)</Label>
                <Textarea
                  value={draft.rawOutputText}
                  onChange={(e) => setDraft({ ...draft, rawOutputText: e.target.value })}
                  rows={4}
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Map script return-value keys → fieldId. For beforeSubmit use{" "}
                  <code>{"{ ok, error }"}</code>.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <MappingTable
                title="Inputs"
                helper="Pre-filled with every form field by API Name. Trim what you don't want, or rename keys for shorter syntax."
                rows={draft.inputRows}
                onChange={(rows) => setDraft({ ...draft, inputRows: rows })}
                fieldGroups={fieldGroups}
                fieldLabelById={fieldLabelById}
                availableFields={availableFields}
                allowSpecialTokens
                emptyHint="No inputs yet."
                autoHint={
                  hasFields
                    ? "Every form field is still exposed as ctx.input.<API_Name> (runtime fallback). Click Reset to bring rows back."
                    : "ctx.input will be empty. Pick fields above or use Raw JSON to wire it manually."
                }
              />
              <MappingTable
                title="Outputs"
                helper="Pre-filled so the script can return { API_Name: value } for any field. Remove rows to restrict which fields the script may write."
                rows={draft.outputRows}
                onChange={(rows) => setDraft({ ...draft, outputRows: rows })}
                fieldGroups={fieldGroups}
                fieldLabelById={fieldLabelById}
                availableFields={availableFields}
                emptyHint="No outputs yet."
                autoHint={
                  hasFields
                    ? "Any { API_Name: value } in the script's return still populates the matching field (runtime fallback). Click Reset to bring rows back."
                    : "Returned values are ignored. Pick fields above to wire output."
                }
              />
            </div>
          )}

          {/* Condition */}
          <div className="space-y-1 border-t pt-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Condition (optional JSON)
            </Label>
            <Textarea
              value={draft.conditionText}
              onChange={(e) => setDraft({ ...draft, conditionText: e.target.value })}
              rows={2}
              className="text-xs font-mono"
              placeholder='{"field":"<fieldId>","equals":"value"}'
            />
            <p className="text-[10px] text-muted-foreground">
              Skip the binding when this equality check fails. Leave empty to always run.
            </p>
          </div>

          {/* Active + order */}
          <div className="flex items-center gap-4 border-t pt-3">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              Active
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              order
              <Input
                type="number"
                value={draft.order}
                onChange={(e) =>
                  setDraft({ ...draft, order: parseInt(e.target.value || "0", 10) })
                }
                className="h-7 w-16 text-xs"
              />
            </label>
          </div>

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
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            {isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Mapping table subcomponent ──────────────────────────────────────────

function MappingTable(props: {
  title: string
  helper: string
  rows: MappingRow[]
  onChange: (rows: MappingRow[]) => void
  fieldGroups: Array<[string, FieldOption[]]>
  fieldLabelById: Map<string, FieldOption>
  /** All fields available in this scope. Used by "Reset" to re-seed the
   *  rows back to one-per-field. Empty/undefined hides the Reset button. */
  availableFields?: FieldOption[]
  allowSpecialTokens?: boolean
  emptyHint: string
  autoHint?: string
}) {
  const addRow = () =>
    props.onChange([...props.rows, { rid: newRid(), key: "", value: "" }])
  const updateRow = (rid: string, patch: Partial<MappingRow>) =>
    props.onChange(props.rows.map((r) => (r.rid === rid ? { ...r, ...patch } : r)))
  const removeRow = (rid: string) =>
    props.onChange(props.rows.filter((r) => r.rid !== rid))

  // Re-seed rows back to one row per field (key=apiName, value=fieldId).
  // Useful after the user trims too aggressively.
  const resetToAllFields = () => {
    if (!props.availableFields || props.availableFields.length === 0) return
    props.onChange(
      props.availableFields.map((f) => ({ rid: newRid(), key: f.apiName, value: f.id }))
    )
  }

  // "Fully populated" = the row count matches the field count AND every
  // field is referenced exactly once. We hide Reset in that state because
  // it would be a no-op.
  const fullyPopulated =
    props.availableFields &&
    props.availableFields.length > 0 &&
    props.rows.length === props.availableFields.length &&
    props.availableFields.every((f) => props.rows.some((r) => r.value === f.id))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium">{props.title}</p>
          <p className="text-[10px] text-muted-foreground">{props.helper}</p>
        </div>
        <div className="flex items-center gap-1">
          {!fullyPopulated && props.availableFields && props.availableFields.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] text-muted-foreground"
              onClick={resetToAllFields}
              title="Re-seed rows with every form field"
            >
              Reset to all fields
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={addRow}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
      </div>

      {props.rows.length === 0 ? (
        <div className="text-[11px] border border-dashed rounded px-2.5 py-2 bg-emerald-500/5 border-emerald-500/30 text-foreground">
          <span className="font-medium text-emerald-700">Auto-mapped.</span>{" "}
          <span className="text-muted-foreground">{props.autoHint || props.emptyHint}</span>
        </div>
      ) : (
        <div className="space-y-1">
          {props.rows.map((row) => {
            const isToken = row.value.startsWith("$")
            const fieldMeta = !isToken ? props.fieldLabelById.get(row.value) : null
            return (
              <div key={row.rid} className="flex items-center gap-1.5">
                <Input
                  value={row.key}
                  onChange={(e) => updateRow(row.rid, { key: e.target.value })}
                  placeholder="key"
                  className="h-8 text-xs flex-1 max-w-[180px]"
                />
                <span className="text-muted-foreground text-xs">→</span>
                <Select
                  value={row.value}
                  onValueChange={(v) => {
                    // Convenience: when the user picks a field and hasn't
                    // typed a key yet, default the key to the field's
                    // apiName. They can override it freely; we never
                    // overwrite a key the user already typed.
                    const picked = props.fieldLabelById.get(v)
                    const nextKey =
                      row.key.trim() || (picked && !v.startsWith("$") ? picked.apiName : row.key)
                    updateRow(row.rid, { value: v, key: nextKey })
                  }}
                >
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Pick a field…">
                      {row.value && (
                        <span className="flex items-center gap-1.5 min-w-0">
                          {isToken ? (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                              {row.value}
                            </Badge>
                          ) : fieldMeta ? (
                            <>
                              <span className="truncate">{fieldMeta.label}</span>
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1 py-0 font-mono shrink-0"
                              >
                                {fieldMeta.apiName}
                              </Badge>
                            </>
                          ) : (
                            <span className="font-mono text-[10px] text-amber-600">
                              {row.value} (unknown)
                            </span>
                          )}
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {props.allowSpecialTokens && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase tracking-wider">
                          Context
                        </SelectLabel>
                        {SPECIAL_TOKENS.map((t) => (
                          <SelectItem key={t.value} value={t.value} className="text-xs">
                            <span className="font-mono">{t.label}</span>
                            <span className="text-[10px] text-muted-foreground ml-1.5">
                              {t.description}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {props.fieldGroups.length === 0 ? (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                        No form fields available.
                      </div>
                    ) : (
                      props.fieldGroups.map(([groupTitle, items]) => (
                        <SelectGroup key={groupTitle}>
                          <SelectLabel className="text-[10px] uppercase tracking-wider">
                            {groupTitle}
                          </SelectLabel>
                          {items.map((f) => (
                            <SelectItem key={f.id} value={f.id} className="text-xs">
                              <div className="flex items-center justify-between gap-2 w-full">
                                <span className="truncate">{f.label}</span>
                                <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                  {f.apiName}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeRow(row.rid)}
                  title="Remove row"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
