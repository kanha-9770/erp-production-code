"use client"

import { useEffect, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Loader2,
  Check,
  Users,
  Building2,
  Boxes,
  Package,
  ShieldAlert,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ERP_MODULES, type ErpModuleDef } from "@/lib/erp-modules"

function moduleIcon(name: string) {
  switch (name) {
    case "users":
      return Users
    case "building2":
      return Building2
    case "boxes":
      return Boxes
    case "package":
      return Package
    default:
      return Building2
  }
}

export default function ErpModulesSettingsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [original, setOriginal] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [orgName, setOrgName] = useState<string>("")
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/organizations/modules", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) {
          if (!cancelled) setForbidden(true)
          return null
        }
        return r.ok ? r.json() : null
      })
      .then((data) => {
        if (cancelled || !data?.success) return
        const list: string[] = Array.isArray(data.organization?.selectedModules)
          ? data.organization.selectedModules
          : []
        setOriginal(list)
        setSelected(list)
        setOrgName(data.organization?.name ?? "")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const dirty = useMemo(() => {
    if (original.length !== selected.length) return true
    const a = [...original].sort()
    const b = [...selected].sort()
    return a.some((v, i) => v !== b[i])
  }, [original, selected])

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/organizations/modules", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedModules: selected }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to save module selection")
      }
      // Refresh the auth-meta cookie so middleware picks up the new
      // module set without requiring the user to log out.
      await fetch("/api/auth/refresh-meta", {
        method: "POST",
        credentials: "include",
      }).catch(() => null)

      setOriginal(json.organization?.selectedModules ?? selected)
      toast({
        title: "Saved",
        description: "Module selection updated. The sidebar will refresh.",
      })
      // Hard reload so the sidebar re-fetches user + anchors with the new
      // module set applied.
      setTimeout(() => {
        window.location.reload()
      }, 400)
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Could not update module selection.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (forbidden) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            <div>
              <CardTitle>Admins only</CardTitle>
              <CardDescription>
                Only organization administrators can change which modules are
                active.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ERP Modules</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which modules {orgName ? <strong>{orgName}</strong> : "your org"} uses.
          Disabled modules are hidden from the sidebar and their URLs are blocked.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {ERP_MODULES.map((m) => (
              <ModuleRow
                key={m.id}
                module={m}
                selected={selected.includes(m.id)}
                onToggle={() => toggle(m.id)}
                disabled={saving}
              />
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t">
            {selected.length === 0 && (
              <p className="text-xs text-amber-600 mr-auto">
                Nothing selected — sidebar will only show Settings / Profile.
              </p>
            )}
            <Button
              variant="outline"
              onClick={() => setSelected(original)}
              disabled={!dirty || saving}
            >
              Reset
            </Button>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function ModuleRow({
  module: m,
  selected,
  onToggle,
  disabled,
}: {
  module: ErpModuleDef
  selected: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const Icon = moduleIcon(m.icon)
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "flex items-start gap-4 rounded-lg border p-4 text-left transition-all",
        "hover:border-blue-300 hover:bg-blue-50/40",
        selected
          ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500/30"
          : "border-slate-200 bg-white",
        disabled && "opacity-60 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
          selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{m.label}</span>
          {m.recommended && (
            <span className="text-[10px] uppercase tracking-wide font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
              Recommended
            </span>
          )}
        </span>
        <span className="block text-xs text-slate-500 mt-0.5">{m.description}</span>
        <span className="block text-[11px] text-slate-400 mt-1.5 font-mono">
          {m.routePrefixes.join("  ·  ")}
        </span>
      </span>
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border mt-0.5",
          selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"
        )}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  )
}
