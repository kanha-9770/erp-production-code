"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Search,
  ArrowLeft,
  HelpCircle,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Check,
} from "lucide-react"
import {
  useGetBindingsTreeQuery,
  useDeleteBindingMutation,
  useUpdateBindingMutation,
  type BindingEvent,
  type FunctionBinding,
} from "@/lib/api/functions"
import { BindingFormDialog, type FieldOption } from "@/components/functions/BindingFormDialog"

// Top tabs
type TopTab = "crmApi" | "sdks"
// Sub-tabs under CRM API
type SubTab = "dashboard" | "credits" | "apiNames"

const EVENT_BADGE: Record<string, string> = {
  onFieldChange: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  onFieldBlur: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  beforeSubmit: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  afterCreate: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  afterUpdate: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  manual: "bg-slate-500/15 text-slate-700 border-slate-500/30",
}

// API-name slug for a module/field — mirrors Zoho's PascalCase + underscore
// convention so the column reads the way an integrator expects.
function apiSlug(s: string): string {
  return (s || "")
    .trim()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("_")
}

interface DialogState {
  open: boolean
  binding?: FunctionBinding & { functionId: string }
  scope?: { kind: "form" | "field" | "module"; id: string; label: string }
  event?: BindingEvent
  fields?: FieldOption[]
}

export default function ApisAndSdksPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: treeData, isLoading } = useGetBindingsTreeQuery()
  const [updateBinding] = useUpdateBindingMutation()
  const [deleteBinding, deleteState] = useDeleteBindingMutation()

  const [topTab, setTopTab] = useState<TopTab>("crmApi")
  const [subTab, setSubTab] = useState<SubTab>("apiNames")
  const [search, setSearch] = useState("")
  const [formFilter, setFormFilter] = useState<string>("all")
  const [openFieldId, setOpenFieldId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ open: false })

  // Drill state lives in the URL so the browser back button works naturally.
  const moduleIdInUrl = searchParams.get("moduleId") || ""
  const tree = treeData?.data || []
  const selectedModule = useMemo(
    () => tree.find((m) => m.id === moduleIdInUrl) || null,
    [tree, moduleIdInUrl]
  )

  const goToModule = (id: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set("moduleId", id)
    router.push(`/settings/apis?${params.toString()}`)
    setSearch("")
    setFormFilter("all")
  }
  const goBack = () => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.delete("moduleId")
    const qs = params.toString()
    router.push(`/settings/apis${qs ? `?${qs}` : ""}`)
    setSearch("")
  }

  return (
    <div className="container mx-auto py-4 max-w-6xl">
      {/* ── Top tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 border-b">
        <button
          onClick={() => setTopTab("crmApi")}
          className={`px-1 pb-3 text-base font-medium border-b-2 -mb-px transition-colors ${
            topTab === "crmApi"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          CRM API
        </button>
        <button
          onClick={() => setTopTab("sdks")}
          className={`px-1 pb-3 text-base font-medium border-b-2 -mb-px transition-colors ${
            topTab === "sdks"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          SDKs
        </button>
      </div>

      {topTab === "sdks" ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          SDKs documentation will appear here.
        </div>
      ) : (
        <div className="pt-6 space-y-4">
          {/* ── Sub-tab pills ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
              {(
                [
                  { value: "dashboard", label: "Dashboard" },
                  { value: "credits", label: "Credits" },
                  { value: "apiNames", label: "API names" },
                ] as { value: SubTab; label: string }[]
              ).map((t) => (
                <button
                  key={t.value}
                  onClick={() => setSubTab(t.value)}
                  className={`px-4 py-1 text-sm rounded transition-colors ${
                    subTab === t.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <HelpCircle className="h-4 w-4" /> Help
            </button>
          </div>

          {subTab === "dashboard" && <DashboardStub tree={tree} />}
          {subTab === "credits" && <CreditsStub />}

          {subTab === "apiNames" && (
            <>
              {/* Helper text — back arrow when drilled in */}
              <div className="flex items-center gap-2">
                {selectedModule && (
                  <button
                    onClick={goBack}
                    className="text-muted-foreground hover:text-foreground"
                    title="Back to modules"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <p className="text-sm text-muted-foreground">
                  You can access the necessary API names here to support your integration needs.
                </p>
              </div>

              {/* Filters row */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={selectedModule ? "Search Fields or Data Types" : "Search"}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
                <span className="text-sm text-muted-foreground">Filter By:</span>
                {selectedModule ? (
                  <>
                    <Select
                      value={selectedModule.id}
                      onValueChange={(v) => goToModule(v)}
                    >
                      <SelectTrigger className="h-9 w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tree.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={formFilter} onValueChange={setFormFilter}>
                      <SelectTrigger className="h-9 w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Forms</SelectItem>
                        {selectedModule.forms.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <Select value="modules" onValueChange={() => {}}>
                    <SelectTrigger className="h-9 w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="modules">Modules</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Body */}
              {isLoading ? (
                <div className="text-sm text-muted-foreground py-12 text-center">
                  Loading…
                </div>
              ) : selectedModule ? (
                <FieldsTable
                  module={selectedModule}
                  formFilter={formFilter}
                  search={search}
                  onOpenField={(fieldId) => setOpenFieldId(fieldId)}
                />
              ) : (
                <ModulesTable tree={tree} search={search} onPick={goToModule} />
              )}
            </>
          )}
        </div>
      )}

      {/* ── Field bindings drawer ────────────────────────────────────── */}
      <FieldBindingsSheet
        openFieldId={openFieldId}
        onClose={() => setOpenFieldId(null)}
        tree={tree}
        onAdd={(scope, fields) =>
          setDialog({
            open: true,
            scope,
            fields,
            event: "onFieldChange",
          })
        }
        onEdit={(b, fields) =>
          setDialog({
            open: true,
            binding: b as FunctionBinding & { functionId: string },
            fields,
          })
        }
        onToggle={async (b) => {
          try {
            await updateBinding({
              functionId: b.functionId,
              bindingId: b.id,
              body: { active: !b.active },
            }).unwrap()
          } catch (e: any) {
            alert(e?.data?.error || e?.message || "Failed")
          }
        }}
        onDelete={async (b) => {
          if (!confirm("Delete this binding?")) return
          try {
            await deleteBinding({ functionId: b.functionId, bindingId: b.id }).unwrap()
          } catch (e: any) {
            alert(e?.data?.error || e?.message || "Failed")
          }
        }}
        deleting={deleteState.isLoading}
      />

      {/* ── Binding editor dialog ────────────────────────────────────── */}
      <BindingFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ open })}
        binding={dialog.binding}
        availableFields={dialog.fields}
        initialScope={
          dialog.scope
            ? { kind: dialog.scope.kind, id: dialog.scope.id, label: dialog.scope.label, lock: true }
            : undefined
        }
        initialEvent={dialog.event ? { value: dialog.event } : undefined}
      />
    </div>
  )
}

// ─── Modules table (default API names view) ────────────────────────────────

function ModulesTable(props: {
  tree: ReturnType<typeof useGetBindingsTreeQuery>["data"] extends infer T
    ? T extends { data: infer D }
      ? D
      : any
    : any
  search: string
  onPick: (id: string) => void
}) {
  const { tree, search, onPick } = props
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tree
    return (tree as any[]).filter(
      (m) => m.name.toLowerCase().includes(q) || apiSlug(m.name).toLowerCase().includes(q)
    )
  }, [tree, search])

  return (
    <div className="border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="font-medium">Displayed In Tabs As</TableHead>
            <TableHead className="font-medium">API Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                {search ? "No modules match your search." : "No modules in this organization."}
              </TableCell>
            </TableRow>
          ) : (
            (filtered as any[]).map((m) => (
              <TableRow
                key={m.id}
                className="cursor-pointer"
                onClick={() => onPick(m.id)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="text-primary hover:underline">{m.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{apiSlug(m.name)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// ─── Fields table (drill-in) ───────────────────────────────────────────────

function FieldsTable(props: {
  module: any
  formFilter: string
  search: string
  onOpenField: (fieldId: string) => void
}) {
  const { module: mod, formFilter, search, onOpenField } = props

  // Flatten all fields across the module's forms into a single ordered list.
  // Each row carries a per-field binding count (count of bindings whose scope
  // is this exact field) for the rightmost column.
  const fieldRows = useMemo(() => {
    const rows: Array<{
      id: string
      label: string
      type: string
      group: string
      formId: string
      formName: string
      bindingCount: number
    }> = []
    for (const f of mod.forms) {
      if (formFilter !== "all" && f.id !== formFilter) continue
      // Count field-level bindings per fieldId by scanning all events.
      const fieldBindingCounts = new Map<string, number>()
      for (const ev of f.events) {
        for (const b of ev.bindings) {
          if (b.fieldId) {
            fieldBindingCounts.set(b.fieldId, (fieldBindingCounts.get(b.fieldId) || 0) + 1)
          }
        }
      }
      for (const fld of f.fields) {
        rows.push({
          id: fld.id,
          label: fld.label,
          type: fld.type,
          group: fld.group,
          formId: f.id,
          formName: f.name,
          bindingCount: fieldBindingCounts.get(fld.id) || 0,
        })
      }
    }
    return rows
  }, [mod, formFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return fieldRows
    return fieldRows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
    )
  }, [fieldRows, search])

  return (
    <div className="border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="font-medium">Field Label</TableHead>
            <TableHead className="font-medium">API Name</TableHead>
            <TableHead className="font-medium">Data Type</TableHead>
            <TableHead className="font-medium text-center">Bindings</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                {search ? "No fields match." : "No fields in this module."}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => onOpenField(r.id)}
              >
                <TableCell>
                  <div className="flex flex-col">
                    <span>{r.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {r.formName} · {r.group}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.id}</TableCell>
                <TableCell className="capitalize">{r.type}</TableCell>
                <TableCell className="text-center">
                  {r.bindingCount > 0 ? (
                    <Badge variant="secondary">{r.bindingCount}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// ─── Field bindings drawer ────────────────────────────────────────────────

function FieldBindingsSheet(props: {
  openFieldId: string | null
  onClose: () => void
  tree: any[]
  onAdd: (
    scope: { kind: "form" | "field" | "module"; id: string; label: string },
    fields: FieldOption[]
  ) => void
  onEdit: (b: any, fields: FieldOption[]) => void
  onToggle: (b: any) => void | Promise<void>
  onDelete: (b: any) => void | Promise<void>
  deleting: boolean
}) {
  const { openFieldId, onClose, tree } = props

  const ctx = useMemo(() => {
    if (!openFieldId) return null
    for (const m of tree) {
      for (const f of m.forms) {
        const fld = f.fields.find((x: any) => x.id === openFieldId)
        if (fld) {
          // Bindings on this field = scan every event's bindings for ones
          // whose fieldId matches.
          const bindings: any[] = []
          for (const ev of f.events) {
            for (const b of ev.bindings) {
              if (b.fieldId === openFieldId) bindings.push(b)
            }
          }
          return { module: m, form: f, field: fld, bindings, fields: f.fields as FieldOption[] }
        }
      }
    }
    return null
  }, [openFieldId, tree])

  return (
    <Sheet
      open={!!openFieldId}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="sm:max-w-md w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{ctx?.field.label || "Field"}</SheetTitle>
          <SheetDescription className="text-xs">
            {ctx ? (
              <>
                <span className="font-mono">{ctx.field.id}</span>
                <br />
                <span>
                  {ctx.module.name} · {ctx.form.name} · {ctx.field.type}
                </span>
              </>
            ) : (
              "—"
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Bindings ({ctx?.bindings.length ?? 0})
            </p>
            <Button
              size="sm"
              onClick={() => {
                if (!ctx) return
                props.onAdd(
                  { kind: "field", id: ctx.field.id, label: ctx.field.label },
                  ctx.fields
                )
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>

          {ctx && ctx.bindings.length === 0 ? (
            <div className="border border-dashed rounded p-4 text-center text-xs text-muted-foreground">
              No bindings on this field. Click <strong>Add</strong> to attach a function that runs
              when this field changes, blurs, or on submit.
            </div>
          ) : (
            <div className="space-y-2">
              {(ctx?.bindings || []).map((b: any) => (
                <div
                  key={b.id}
                  className="border rounded p-2 space-y-1.5 text-xs bg-muted/20"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge
                        variant="outline"
                        className={`${EVENT_BADGE[b.event] || ""} text-[10px] font-normal`}
                      >
                        {b.event}
                      </Badge>
                      <span className="font-medium truncate">
                        {b.function?.displayName || b.function?.name}
                      </span>
                      {!b.active && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          disabled
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => ctx && props.onEdit(b, ctx.fields)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => props.onToggle(b)}
                        title={b.active ? "Disable" : "Enable"}
                      >
                        {b.active ? (
                          <PowerOff className="h-3.5 w-3.5" />
                        ) : (
                          <Power className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-500 hover:text-red-600"
                        onClick={() => props.onDelete(b)}
                        disabled={props.deleting}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    in: {Object.keys(b.inputMapping || {}).length} · out:{" "}
                    {Object.keys(b.outputMapping || {}).length}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Stubs for the other two sub-tabs ─────────────────────────────────────

function DashboardStub(props: { tree: any[] }) {
  const totals = useMemo(() => {
    let modules = props.tree.length
    let forms = 0
    let fields = 0
    let bindings = 0
    let active = 0
    for (const m of props.tree) {
      forms += m.forms.length
      for (const f of m.forms) {
        fields += f.fields.length
        for (const ev of f.events) {
          bindings += ev.bindings.length
          active += ev.bindings.filter((b: any) => b.active).length
        }
      }
      for (const ev of m.events) {
        bindings += ev.bindings.length
        active += ev.bindings.filter((b: any) => b.active).length
      }
    }
    return { modules, forms, fields, bindings, active }
  }, [props.tree])
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {[
        { label: "Modules", value: totals.modules },
        { label: "Forms", value: totals.forms },
        { label: "Fields", value: totals.fields },
        { label: "Total bindings", value: totals.bindings },
        { label: "Active", value: totals.active },
      ].map((s) => (
        <div key={s.label} className="border rounded p-4 text-center">
          <div className="text-2xl font-semibold">{s.value}</div>
          <div className="text-xs text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

function CreditsStub() {
  return (
    <div className="border rounded p-6 text-sm text-muted-foreground">
      <div className="flex items-start gap-2">
        <Check className="h-4 w-4 mt-0.5 text-emerald-600" />
        <div>
          Function executions are unmetered for this organization. A future release will surface
          per-function usage and credit balances here.
        </div>
      </div>
    </div>
  )
}
