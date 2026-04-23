"use client"

import { useMemo, useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, Loader2, Plus, Search, Zap } from "lucide-react"
import {
  useGetBindingsTreeQuery,
  useCreateBindingMutation,
  type BindingEvent,
} from "@/lib/api/functions"

interface QuickBindPopoverProps {
  functionId: string
  onCreated?: () => void
}

type ScopePick =
  | { kind: "field"; id: string; label: string; formName: string; moduleName: string }
  | { kind: "form"; id: string; label: string; moduleName: string }
  | { kind: "module"; id: string; label: string }

// Recommended event per scope kind. Matches the most common "just make this
// function run here" intent: fields react to user typing, forms react to save,
// modules are explicit triggers.
const DEFAULT_EVENT: Record<ScopePick["kind"], BindingEvent> = {
  field: "onFieldChange",
  form: "beforeSubmit",
  module: "manual",
}

const EVENTS_FOR: Record<ScopePick["kind"], BindingEvent[]> = {
  field: ["onFieldChange", "onFieldBlur"],
  form: ["beforeSubmit", "afterCreate", "afterUpdate"],
  module: ["manual", "afterCreate", "afterUpdate"],
}

/**
 * One-click binding creation. Opens a popover, user picks a scope (module /
 * form / field) from a searchable tree, then picks an event — the binding is
 * created immediately with empty input/output mappings. The runtime's
 * auto-mode (bindingRunner.ts) then exposes every form field by API Name
 * without any configuration.
 *
 * Empty mappings self-sync: adding or renaming a field on the form is picked
 * up automatically. The advanced dialog is still available via the Edit
 * pencil for bindings that need explicit mappings or a condition.
 */
export function QuickBindPopover({ functionId, onCreated }: QuickBindPopoverProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<ScopePick | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: treeData, isLoading } = useGetBindingsTreeQuery(undefined, {
    skip: !open,
  })
  const [createBinding, createState] = useCreateBindingMutation()

  const tree = treeData?.data ?? []

  // Flat, searchable list of bindable scopes. Built once per tree change so
  // typing in the search box doesn't re-walk the whole module/form graph.
  const scopes = useMemo<ScopePick[]>(() => {
    const out: ScopePick[] = []
    for (const mod of tree) {
      out.push({ kind: "module", id: mod.id, label: mod.name })
      for (const f of mod.forms) {
        out.push({ kind: "form", id: f.id, label: f.name, moduleName: mod.name })
        for (const fld of f.fields) {
          out.push({
            kind: "field",
            id: fld.id,
            label: fld.label,
            formName: f.name,
            moduleName: mod.name,
          })
        }
      }
    }
    return out
  }, [tree])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? scopes.filter((s) => {
        const parts = [s.label]
        if (s.kind === "field") parts.push(s.formName, s.moduleName)
        if (s.kind === "form") parts.push(s.moduleName)
        return parts.join(" ").toLowerCase().includes(q)
      })
    : scopes

  const reset = () => {
    setScope(null)
    setQuery("")
    setError(null)
  }

  const handleBind = async (picked: ScopePick, event: BindingEvent) => {
    setError(null)
    try {
      await createBinding({
        functionId,
        body: {
          event,
          formId: picked.kind === "form" ? picked.id : null,
          fieldId: picked.kind === "field" ? picked.id : null,
          moduleId: picked.kind === "module" ? picked.id : null,
          inputMapping: {},
          outputMapping: {},
          active: true,
          order: 0,
        },
      }).unwrap()
      setOpen(false)
      reset()
      onCreated?.()
    } catch (e: any) {
      setError(e?.data?.error || e?.message || "Failed to create binding")
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" /> Add Binding
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        {scope ? (
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <button
                onClick={reset}
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                ← Back
              </button>
              <span>·</span>
              <Badge variant="secondary" className="text-[10px]">
                {scope.kind}
              </Badge>
              <span className="truncate font-medium text-foreground">{scope.label}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Fields map automatically by API Name. Click an event to bind.
            </p>
            <div className="grid gap-1">
              {EVENTS_FOR[scope.kind].map((ev) => {
                const isDefault = ev === DEFAULT_EVENT[scope.kind]
                return (
                  <Button
                    key={ev}
                    size="sm"
                    variant={isDefault ? "default" : "outline"}
                    className="h-8 justify-start text-xs"
                    disabled={createState.isLoading}
                    onClick={() => handleBind(scope, ev)}
                  >
                    {createState.isLoading ? (
                      <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3 mr-1.5" />
                    )}
                    {ev}
                    {isDefault && (
                      <span className="ml-auto text-[10px] opacity-70">recommended</span>
                    )}
                  </Button>
                )
              })}
            </div>
            {error && (
              <div className="text-[11px] text-red-600 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search module, form, or field…"
                className="h-8 text-xs pl-7"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="text-[11px] text-muted-foreground p-2">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="text-[11px] text-muted-foreground p-2">
                  {q ? `Nothing matches "${query}".` : "No modules or forms yet."}
                </div>
              ) : (
                filtered.slice(0, 100).map((s) => (
                  <button
                    key={`${s.kind}:${s.id}`}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2 text-xs"
                    onClick={() => setScope(s)}
                  >
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 shrink-0 w-[50px] justify-center"
                    >
                      {s.kind}
                    </Badge>
                    <span className="truncate flex-1">
                      <span className="text-foreground">{s.label}</span>
                      {s.kind === "field" && (
                        <span className="text-muted-foreground ml-1.5">· {s.formName}</span>
                      )}
                      {s.kind !== "module" && (
                        <span className="text-muted-foreground ml-1.5">
                          · {(s as any).moduleName}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  </button>
                ))
              )}
            </div>
            <p className="text-[10px] text-muted-foreground px-2 pb-1 leading-tight">
              Zero config. Every field is auto-exposed to the script as{" "}
              <code className="font-mono text-[10px]">ctx.input.&lt;API_Name&gt;</code>.
              Edit later if you need to restrict.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
