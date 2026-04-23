"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  useGetBindingsTreeQuery,
  useUpdateBindingMutation,
  useDeleteBindingMutation,
  type FunctionBinding,
} from "@/lib/api/functions"
import {
  useGetWorkflowRulesQuery,
  useUpdateWorkflowRuleMutation,
  useDeleteWorkflowRuleMutation,
  type WorkflowRuleData,
} from "@/lib/api/workflow-rules"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  BindingFormDialog,
  type FieldOption,
  type ScopeKind,
} from "@/components/functions/BindingFormDialog"
import {
  ArrowLeft,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Workflow,
  Zap,
  ChevronRight,
} from "lucide-react"

interface ScopeTarget {
  kind: ScopeKind
  id: string
  label: string
  /** Fields the dialog's picker can offer. Scope-dependent. */
  fields: FieldOption[]
}

/**
 * Module → Form → Fields automations panel.
 *
 * One page per module that surfaces every workflow + binding in the module,
 * grouped by scope. Each row has an inline "Add" action that opens the
 * existing binding dialog / workflow rule creator pre-scoped to that row,
 * so users never have to hand-paste ids. Reuses existing APIs — this is a
 * view layer only, no new CRUD logic.
 */
export default function ModuleAutomationsPage() {
  const params = useParams<{ moduleId: string }>()
  const router = useRouter()
  const moduleId = params?.moduleId || ""

  const { data: treeData, isLoading: treeLoading } = useGetBindingsTreeQuery()
  const mod = useMemo(
    () => (treeData?.data || []).find((m: any) => m.id === moduleId),
    [treeData, moduleId]
  )
  const moduleName = mod?.name || ""

  const { data: rulesData, isLoading: rulesLoading } = useGetWorkflowRulesQuery(
    moduleName,
    { skip: !moduleName }
  )
  const rules: WorkflowRuleData[] = rulesData?.data || []

  const [updateBinding] = useUpdateBindingMutation()
  const [deleteBinding] = useDeleteBindingMutation()
  const [updateRule] = useUpdateWorkflowRuleMutation()
  const [deleteRule] = useDeleteWorkflowRuleMutation()

  // Dialog state for creating a binding scoped to a given target.
  const [scopeTarget, setScopeTarget] = useState<ScopeTarget | null>(null)

  // ── Slice bindings by scope ──────────────────────────────────────────
  // The tree endpoint mixes form-scoped and field-scoped bindings under each
  // form's event slots. We split them apart so each field-row only shows its
  // own bindings and the form-row only shows form-scoped ones.
  const moduleBindings: FunctionBinding[] = useMemo(() => {
    if (!mod) return []
    return (mod.events || []).flatMap((e: any) => e.bindings || [])
  }, [mod])

  const formBindingsByFormId = useMemo(() => {
    const map = new Map<string, FunctionBinding[]>()
    for (const f of mod?.forms || []) {
      const all: FunctionBinding[] = (f.events || []).flatMap((e: any) => e.bindings || [])
      map.set(f.id, all.filter((b) => !b.fieldId))
    }
    return map
  }, [mod])

  const fieldBindingsByFieldId = useMemo(() => {
    const map = new Map<string, FunctionBinding[]>()
    for (const f of mod?.forms || []) {
      const all: FunctionBinding[] = (f.events || []).flatMap((e: any) => e.bindings || [])
      for (const b of all) {
        if (!b.fieldId) continue
        const list = map.get(b.fieldId) || []
        list.push(b)
        map.set(b.fieldId, list)
      }
    }
    return map
  }, [mod])

  // Build a FieldOption list per form so the dialog's picker is populated
  // correctly when the user opens it from a scoped row.
  const fieldOptionsByFormId = useMemo(() => {
    const map = new Map<string, FieldOption[]>()
    for (const f of mod?.forms || []) {
      map.set(
        f.id,
        (f.fields || []).map((fld: any) => ({
          id: fld.id,
          label: fld.label,
          type: fld.type,
          group: fld.group,
          apiName: fld.apiName,
        }))
      )
    }
    return map
  }, [mod])

  // ── Mutations ────────────────────────────────────────────────────────
  const toggleBinding = async (b: FunctionBinding) => {
    try {
      await updateBinding({
        functionId: b.functionId,
        bindingId: b.id,
        body: { active: !b.active },
      }).unwrap()
    } catch {}
  }
  const removeBinding = async (b: FunctionBinding) => {
    if (!confirm(`Delete this binding for "${b.event}"?`)) return
    try {
      await deleteBinding({ functionId: b.functionId, bindingId: b.id }).unwrap()
    } catch {}
  }
  const toggleRule = async (r: WorkflowRuleData) => {
    try {
      await updateRule({ id: r.id, active: !r.active }).unwrap()
    } catch {}
  }
  const removeRule = async (r: WorkflowRuleData) => {
    if (!confirm(`Delete workflow "${r.name}"?`)) return
    try {
      await deleteRule(r.id).unwrap()
    } catch {}
  }

  // ── Render ───────────────────────────────────────────────────────────
  if (treeLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }
  if (!mod) {
    return (
      <div className="p-6">
        <Link href="/settings/modules" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to modules
        </Link>
        <p className="mt-4 text-sm">Module not found.</p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/settings/modules"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="h-3 w-3" /> Modules
          </Link>
          <h1 className="text-lg font-semibold truncate">{mod.name} — Automations</h1>
          {mod.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{mod.description}</p>
          )}
        </div>
      </div>

      {/* ── Module-level: workflows ── */}
      <section className="border rounded-lg p-3 bg-card">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider">Workflows</h2>
            <span className="text-[10px] text-muted-foreground">
              fire on Create / Edit / Delete
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() =>
              router.push(
                `/settings/workflow-rules/create?module=${encodeURIComponent(moduleName)}`
              )
            }
          >
            <Plus className="h-3 w-3 mr-1" /> New Workflow
          </Button>
        </div>
        {rulesLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : rules.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">No workflows yet.</div>
        ) : (
          <div className="space-y-1.5">
            {rules.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                onToggle={() => toggleRule(r)}
                onDelete={() => removeRule(r)}
                onEdit={() =>
                  router.push(
                    `/settings/workflow-rules/create?id=${r.id}&module=${encodeURIComponent(
                      moduleName
                    )}&name=${encodeURIComponent(r.name)}`
                  )
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Module-level: bindings ── */}
      <section className="border rounded-lg p-3 bg-card">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider">
              Module bindings
            </h2>
            <span className="text-[10px] text-muted-foreground">
              scoped to the whole module
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() =>
              setScopeTarget({
                kind: "module",
                id: moduleId,
                label: mod.name,
                // Module-wide binding can reference any field in any form of the module.
                fields: Array.from(fieldOptionsByFormId.values()).flat(),
              })
            }
          >
            <Plus className="h-3 w-3 mr-1" /> Add Binding
          </Button>
        </div>
        {moduleBindings.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">No module bindings.</div>
        ) : (
          <div className="space-y-1.5">
            {moduleBindings.map((b) => (
              <BindingRow
                key={b.id}
                binding={b}
                onToggle={() => toggleBinding(b)}
                onDelete={() => removeBinding(b)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Forms + their fields ── */}
      {(mod.forms || []).map((f: any) => {
        const formBindings = formBindingsByFormId.get(f.id) || []
        const fieldOptions = fieldOptionsByFormId.get(f.id) || []
        return (
          <section key={f.id} className="border rounded-lg p-3 bg-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-sm font-semibold truncate">{f.name}</h2>
                {!f.isPublished && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    draft
                  </Badge>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() =>
                  setScopeTarget({
                    kind: "form",
                    id: f.id,
                    label: f.name,
                    fields: fieldOptions,
                  })
                }
              >
                <Plus className="h-3 w-3 mr-1" /> Form binding
              </Button>
            </div>

            {formBindings.length > 0 && (
              <div className="space-y-1.5 pl-2 border-l-2 border-muted">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Form-scoped
                </p>
                {formBindings.map((b) => (
                  <BindingRow
                    key={b.id}
                    binding={b}
                    onToggle={() => toggleBinding(b)}
                    onDelete={() => removeBinding(b)}
                  />
                ))}
              </div>
            )}

            {fieldOptions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground pl-2">
                  Fields
                </p>
                <div className="space-y-1.5">
                  {fieldOptions.map((fld) => {
                    const bs = fieldBindingsByFieldId.get(fld.id) || []
                    return (
                      <div
                        key={fld.id}
                        className="rounded border bg-background px-2.5 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-2">
                            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-xs truncate">{fld.label}</span>
                            <Badge
                              variant="secondary"
                              className="text-[9px] px-1 py-0 font-mono shrink-0"
                            >
                              {fld.apiName}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {fld.type}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[11px]"
                            onClick={() =>
                              setScopeTarget({
                                kind: "field",
                                id: fld.id,
                                label: fld.label,
                                fields: fieldOptions,
                              })
                            }
                          >
                            <Plus className="h-3 w-3 mr-0.5" /> Add
                          </Button>
                        </div>
                        {bs.length > 0 && (
                          <div className="mt-1.5 pl-5 space-y-1">
                            {bs.map((b) => (
                              <BindingRow
                                key={b.id}
                                binding={b}
                                compact
                                onToggle={() => toggleBinding(b)}
                                onDelete={() => removeBinding(b)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )
      })}

      {/* Create-binding dialog, scoped to whichever row the user clicked. */}
      <BindingFormDialog
        open={!!scopeTarget}
        onOpenChange={(open) => {
          if (!open) setScopeTarget(null)
        }}
        initialScope={
          scopeTarget
            ? { kind: scopeTarget.kind, id: scopeTarget.id, label: scopeTarget.label, lock: true }
            : undefined
        }
        availableFields={scopeTarget?.fields || []}
      />
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────

function BindingRow({
  binding,
  compact,
  onToggle,
  onDelete,
}: {
  binding: any
  compact?: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const fnName = binding.function?.displayName || binding.function?.name || "(deleted)"
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded ${
        compact ? "py-0.5" : "border bg-background px-2 py-1.5"
      }`}
    >
      <div className="min-w-0 flex items-center gap-1.5 text-[11px]">
        <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
          {binding.event}
        </Badge>
        <span className="truncate">{fnName}</span>
        {!binding.active && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0">
            disabled
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0"
          onClick={onToggle}
          title={binding.active ? "Disable" : "Enable"}
        >
          {binding.active ? (
            <PowerOff className="h-3 w-3" />
          ) : (
            <Power className="h-3 w-3" />
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0 text-destructive hover:text-destructive"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

function RuleRow({
  rule,
  onToggle,
  onDelete,
  onEdit,
}: {
  rule: WorkflowRuleData
  onToggle: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const actionSummary = (rule.instantActions || [])
    .map((a) => a.type)
    .join(", ") || "no actions"
  return (
    <div className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5">
      <div className="min-w-0 flex items-center gap-1.5 text-[11px]">
        <Badge variant="outline" className="text-[9px] px-1 py-0">
          {rule.recordAction || rule.executeBasedOn}
        </Badge>
        <span className="truncate font-medium">{rule.name}</span>
        <span className="truncate text-muted-foreground">· {actionSummary}</span>
        {!rule.active && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0">
            disabled
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0"
          onClick={onEdit}
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0"
          onClick={onToggle}
          title={rule.active ? "Disable" : "Enable"}
        >
          {rule.active ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0 text-destructive hover:text-destructive"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
