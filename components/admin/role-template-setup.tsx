"use client"

/**
 * Quick Setup — simple role permission setup.
 *
 * Two choices on one row: WHICH role, and WHAT to apply (a template OR copy
 * another role — one grouped dropdown). The choice resolves to a checklist of
 * pages + actions, all ticked by default; untick anything you don't want, then
 * Apply. Calls /api/role-templates/apply with the explicit list.
 *
 * MERGE-only: applying adds the ticked access, never removes — safe to try.
 */

import { useMemo, useState } from "react"
import {
  useGetRolesQuery,
  useApplyRoleGrantsMutation,
  useLazyGetRoleGrantsQuery,
} from "@/lib/api/permissions"
import { ROLE_TEMPLATES, ACTION_LABEL } from "@/lib/permissions/role-templates"
import { STATIC_PAGES } from "@/lib/static-pages"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, FileText, ListChecks, Check, Info } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type RoleRow = { id: string; name: string; isAdmin?: boolean; userCount?: number }
type Item = { value: string; label: string }
type Bundle = { title: string; pages: Item[]; actions: Item[] }

// Hoisted to module scope so it does NOT remount on every keystroke/tick
// (a component defined inside the parent is a new type each render → remounts,
// which drops scroll position and feels janky).
function Checklist({
  title,
  icon: Icon,
  items,
  selected,
  onToggle,
  onSetAll,
}: {
  title: string
  icon: any
  items: Item[]
  selected: Set<string>
  onToggle: (value: string) => void
  onSetAll: (on: boolean) => void
}) {
  const chosen = items.filter((i) => selected.has(i.value)).length
  const allOn = items.length > 0 && chosen === items.length
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
          <Icon className="h-3 w-3" /> {title}
        </p>
        <Badge variant="outline" className="text-[10px] font-normal">
          {chosen}/{items.length}
        </Badge>
        {items.length > 0 && (
          <button
            type="button"
            className="ml-auto text-[11px] text-primary hover:underline"
            onClick={() => onSetAll(!allOn)}
          >
            {allOn ? "Clear all" : "Select all"}
          </button>
        )}
      </div>
      <ScrollArea className="h-52 rounded-md border p-1">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-2 py-3">None.</p>
        ) : (
          <ul>
            {items.map((i) => (
              <li key={i.value}>
                <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={selected.has(i.value)} onCheckedChange={() => onToggle(i.value)} />
                  <span className="text-xs truncate" title={i.value}>
                    {i.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}

export function RoleTemplateSetup() {
  const { data: rolesResp, isLoading: rolesLoading } = useGetRolesQuery()
  const [apply, { isLoading: applying }] = useApplyRoleGrantsMutation()
  const [fetchGrants, { isFetching: grantsLoading }] = useLazyGetRoleGrantsQuery()
  const { toast } = useToast()

  const roles = (rolesResp?.data ?? []) as unknown as RoleRow[]
  const assignableRoles = useMemo(() => roles.filter((r) => !r.isAdmin), [roles])

  const [targetRoleId, setTargetRoleId] = useState<string>("")
  const [sourceKey, setSourceKey] = useState<string>("") // "tpl:<id>" | "role:<id>"
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [selPages, setSelPages] = useState<Set<string>>(new Set())
  const [selActions, setSelActions] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  const pageLabel = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of STATIC_PAGES) m.set(p.path, p.label)
    return m
  }, [])

  const targetRole = assignableRoles.find((r) => r.id === targetRoleId) ?? null

  const loadBundle = (b: Bundle) => {
    setBundle(b)
    setSelPages(new Set(b.pages.map((p) => p.value)))
    setSelActions(new Set(b.actions.map((a) => a.value)))
  }

  const onPickSource = async (key: string) => {
    setSourceKey(key)
    setBundle(null)
    const [kind, id] = key.split(":")
    if (kind === "tpl") {
      const t = ROLE_TEMPLATES.find((x) => x.id === id)
      if (!t) return
      loadBundle({
        title: t.label,
        pages: t.routes.map((p) => ({ value: p, label: pageLabel.get(p) ?? p })),
        actions: t.actions.map((a) => ({ value: a, label: ACTION_LABEL[a] ?? a })),
      })
    } else if (kind === "role") {
      try {
        const res = await fetchGrants(id).unwrap()
        const src = assignableRoles.find((r) => r.id === id)
        loadBundle({ title: `Copy of ${src?.name ?? "role"}`, pages: res.routes, actions: res.actions })
      } catch {
        setSourceKey("")
        toast({ variant: "destructive", title: "Could not load that role's grants" })
      }
    }
  }

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) =>
    setter((prev) => {
      const next = new Set(prev)
      next.has(value) ? next.delete(value) : next.add(value)
      return next
    })

  const runApply = async () => {
    if (!targetRole || !bundle) return
    try {
      const res = await apply({
        targetRoleId: targetRole.id,
        routes: Array.from(selPages),
        actions: Array.from(selActions),
      }).unwrap()
      toast({
        title: "Permissions applied",
        description:
          `${bundle.title} → ${targetRole.name}: granted ${res.routesGranted} page(s) and ` +
          `${res.actionsGranted} action(s).` +
          (res.routesGranted === 0 && res.actionsGranted === 0
            ? " (Role already had everything ticked.)"
            : ""),
      })
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Could not apply",
        description: e?.data?.error ?? "Please try again.",
      })
    } finally {
      setConfirmOpen(false)
    }
  }

  if (rolesLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading roles…
      </div>
    )
  }

  const selectedCount = selPages.size + selActions.size
  const copyRoles = assignableRoles.filter((r) => r.id !== targetRoleId)

  return (
    <div className="space-y-5">
      {/* Two choices: which role + what to apply */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Role to set up</label>
          <Select value={targetRoleId} onValueChange={setTargetRoleId}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select a role…" />
            </SelectTrigger>
            <SelectContent>
              {assignableRoles.length === 0 ? (
                <div className="px-2 py-3 text-sm text-muted-foreground">No non-admin roles.</div>
              ) : (
                assignableRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {typeof r.userCount === "number" ? ` · ${r.userCount} users` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Apply</label>
          <Select value={sourceKey} onValueChange={onPickSource} disabled={!targetRole}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={targetRole ? "Pick a template or copy a role…" : "Pick a role first"} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Templates</SelectLabel>
                {ROLE_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={`tpl:${t.id}`}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              {copyRoles.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Copy from another role</SelectLabel>
                  {copyRoles.map((r) => (
                    <SelectItem key={r.id} value={`role:${r.id}`}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Untick anything you don&apos;t want. Applying only <strong>adds</strong> the ticked access —
        it never removes anything.
      </p>

      {grantsLoading && (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading grants…
        </div>
      )}

      {bundle && !grantsLoading && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-4">
              <Checklist
                title="Pages"
                icon={FileText}
                items={bundle.pages}
                selected={selPages}
                onToggle={(v) => toggle(setSelPages, v)}
                onSetAll={(on) => setSelPages(on ? new Set(bundle.pages.map((p) => p.value)) : new Set())}
              />
              <Checklist
                title="Actions"
                icon={ListChecks}
                items={bundle.actions}
                selected={selActions}
                onToggle={(v) => toggle(setSelActions, v)}
                onSetAll={(on) => setSelActions(on ? new Set(bundle.actions.map((a) => a.value)) : new Set())}
              />
            </div>

            <div className="flex items-center gap-3 pt-1 border-t">
              <span className="text-sm text-muted-foreground">
                <strong className="text-foreground">{selectedCount}</strong> selected
              </span>
              <Button
                className="ml-auto"
                disabled={!targetRole || selectedCount === 0 || applying}
                onClick={() => setConfirmOpen(true)}
              >
                {applying ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                Apply to {targetRole?.name}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply to {targetRole?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Grants <strong>{selPages.size} page(s)</strong> and{" "}
              <strong>{selActions.size} action(s)</strong> to <strong>{targetRole?.name}</strong>.
              Existing access is kept — nothing is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); runApply() }} disabled={applying}>
              {applying ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
