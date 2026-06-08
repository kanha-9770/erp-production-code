"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { Upload, ArrowLeft, Loader2, Check, AlertCircle, ChevronRight, ChevronDown, Download, FileText, Folder, Search, Table2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import PageBackLink from "@/components/shared/page-back-link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useGetImportTargetsQuery } from "@/lib/api/modules"
import { useGetFormDetailQuery } from "@/lib/api/forms"
import {
  useCreateImportJobMutation,
  useAddImportMappingMutation,
} from "@/lib/api/forms"
import {
  getStaticModules,
  getImportableStaticFormEntries,
  STATIC_FORMS,
} from "@/lib/static-page-fields"
// ── Import-target tree types ────────────────────────────────────────────────
interface TreeFormLeaf {
  id: string
  name: string
  isPublished?: boolean
  // Listed but not selectable — e.g. a page that has no database backend yet.
  disabled?: boolean
  note?: string
}
interface ImportTreeNode {
  id: string          // module id; static module id (static-mod:…); or "__static__"
  name: string
  isStatic: boolean
  forms: TreeFormLeaf[]
  children: ImportTreeNode[]
  sortOrder: number
}
import {
  FileUpload,
  type ParsedFilePreview,
} from "@/components/data-migration/file-upload"
import { ImportFlow, type LandedRow } from "@/components/data-migration/import-flow"
import { FailedRowsEditor } from "@/components/data-migration/failed-rows-editor"
import { motion } from "framer-motion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import Link from "next/link"

type ImportStep = "select" | "upload" | "map" | "result"

// Prune a tree to nodes/forms matching `q`. A module that matches keeps all its
// forms; otherwise only matching forms (and matching descendants) are kept.
// Returns null when nothing under this node matches.
function filterTreeNode(node: ImportTreeNode, q: string): ImportTreeNode | null {
  const selfMatch = node.name.toLowerCase().includes(q)
  const forms = selfMatch ? node.forms : node.forms.filter((f) => f.name.toLowerCase().includes(q))
  const children = node.children
    .map((c) => filterTreeNode(c, q))
    .filter((c): c is ImportTreeNode => c !== null)
  if (selfMatch || forms.length > 0 || children.length > 0) {
    return { ...node, forms, children }
  }
  return null
}

// Recursive tree row. A module row expands to reveal its forms and child
// modules; clicking a form selects it for import.
function ModuleTreeNode({
  node, depth, expanded, onToggle, selectedFormId, onSelectForm, forceOpen,
}: {
  node: ImportTreeNode
  depth: number
  expanded: Set<string>
  onToggle: (id: string) => void
  selectedFormId: string
  onSelectForm: (moduleId: string, form: TreeFormLeaf) => void
  forceOpen: boolean
}) {
  const hasChildren = node.children.length > 0
  const hasForms = node.forms.length > 0
  const isExpandable = hasChildren || hasForms
  const isOpen = forceOpen || expanded.has(node.id)
  const indent = depth * 16

  return (
    <div>
      <button
        type="button"
        onClick={() => isExpandable && onToggle(node.id)}
        className="w-full flex items-center gap-1.5 py-1.5 px-2 rounded hover:bg-muted/60 text-left text-sm"
        style={{ paddingLeft: indent + 8 }}
      >
        {isExpandable ? (
          isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Folder className="h-3.5 w-3.5 shrink-0 text-blue-500/80" />
        <span className="font-medium truncate">{node.name}</span>
        {hasForms && (
          <span className="text-[10px] text-muted-foreground/70 ml-1">
            {node.forms.length} {node.forms.length === 1 ? "form" : "forms"}
          </span>
        )}
      </button>

      {isOpen && (
        <div>
          {node.forms.map((f) => {
            if (f.disabled) {
              // Listed for visibility but not importable (e.g. no DB backend yet).
              return (
                <div
                  key={f.id}
                  className="w-full flex items-center gap-1.5 py-1.5 px-2 rounded text-sm text-muted-foreground/60 cursor-not-allowed"
                  style={{ paddingLeft: indent + 8 + 22 }}
                  title={f.note}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  <span className="truncate">{f.name}</span>
                  {f.note && <span className="ml-1 text-[10px] italic">({f.note})</span>}
                </div>
              )
            }
            const selected = selectedFormId === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelectForm(node.id, f)}
                className={`w-full flex items-center gap-1.5 py-1.5 px-2 rounded text-left text-sm ${
                  selected ? "bg-blue-100 text-blue-900" : "hover:bg-muted/60"
                }`}
                style={{ paddingLeft: indent + 8 + 22 }}
              >
                <FileText className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-blue-700" : "text-muted-foreground"}`} />
                <span className="truncate">{f.name}</span>
                {f.isPublished === false && (
                  <span className="text-amber-600 ml-1 text-[10px]">(draft)</span>
                )}
                {selected && <Check className="h-3.5 w-3.5 ml-auto text-blue-700 shrink-0" />}
              </button>
            )
          })}
          {node.children.map((c) => (
            <ModuleTreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selectedFormId={selectedFormId}
              onSelectForm={onSelectForm}
              forceOpen={forceOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Animate a number from 0 → target with an ease-out curve (realistic count-up).
function useCountUp(target: number, ms = 700): number {
  const [val, setVal] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(Math.round(from + (target - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return val
}

// Small pill summarising one outcome count on the result screen — pops in and
// counts up so the numbers feel alive (theme/colours unchanged).
function StatChip({ label, value, color, index = 0 }: { label: string; value: number; color: "green" | "blue" | "violet" | "red" | "muted"; index?: number }) {
  const cls: Record<string, string> = {
    green: "bg-green-50 text-green-700 border-green-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    red: "bg-red-50 text-red-700 border-red-200",
    muted: "bg-muted text-muted-foreground border-border",
  }
  const shown = useCountUp(value)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 22, delay: index * 0.06 }}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 ${cls[color]}`}
    >
      <span className="font-bold tabular-nums">{shown.toLocaleString()}</span>
      <span className="text-xs">{label}</span>
    </motion.div>
  )
}

// Serialize a large static-import body WITHOUT blocking the UI thread:
// stringify rows in batches, yielding to the event loop between them. We keep
// this as ONE request on purpose — the server does a single dedup query + bulk
// insert for the whole file, so splitting it into multiple HTTP requests would
// regress that optimization back toward the old per-chunk latency.
async function buildStaticImportBody(
  formId: string,
  mappings: { sourceColumn: string; targetCoreKey: string }[],
  rows: Record<string, string>[],
): Promise<string> {
  const parts: string[] = [
    `{"formId":${JSON.stringify(formId)},"mappings":${JSON.stringify(mappings)},"rows":[`,
  ]
  const BATCH = 5000
  for (let i = 0; i < rows.length; i += BATCH) {
    const end = Math.min(i + BATCH, rows.length)
    let s = ""
    for (let j = i; j < end; j++) s += (j === 0 ? "" : ",") + JSON.stringify(rows[j])
    parts.push(s)
    if (end < rows.length) await new Promise<void>((r) => setTimeout(r, 0)) // yield to the UI
  }
  parts.push("]}")
  return parts.join("")
}

export default function ImportPage() {
  const { toast } = useToast()
  const [step, setStep] = useState<ImportStep>("select")
  const [selectedModuleId, setSelectedModuleId] = useState("")
  const [selectedFormId, setSelectedFormId] = useState("")
  const [uploadedFile, setUploadedFile] = useState<{ file: File; preview: ParsedFilePreview } | null>(null)
  const [mappings, setMappings] = useState<{ sourceColumn: string; targetFieldId: string }[]>([])
  const [importResult, setImportResult] = useState<{ imported: number; created?: number; updated?: number; failed: number; skipped: number } | null>(null)
  // Rows that failed to import, with their error + original source values — so
  // the user can fix them inline and retry just those (static imports).
  const [failedRows, setFailedRows] = useState<{ rowIndex: number; error: string; row: Record<string, string> }[]>([])
  const [isRetrying, setIsRetrying] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; percent: number; phase?: string } | null>(null)
  // Which mapped field acts as the unique business key. When set, re-importing
  // the same key updates the existing record instead of creating a duplicate.
  const [keyFieldId, setKeyFieldId] = useState("")
  // The job currently being processed/polled — used for the error-report
  // download and for reattaching after a page reload.
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  // One-time auto-expand of the whole tree once the module feed arrives.
  const didInitExpand = useRef(false)

  // ── "Sheet → table" live-flow state ──
  // The parsed row objects for the active import, so the flow view can sample
  // the most-recently-landed rows by index without re-deriving them each tick.
  const importRowsRef = useRef<Record<string, string>[]>([])
  const [landedRows, setLandedRows] = useState<LandedRow[]>([])
  const [importStartedAt, setImportStartedAt] = useState<number | null>(null)

  // RTK Query
  // Static forms (id starts with `static:`) skip the formDetail fetch since
  // they aren't form-builder Forms — we pull their fields from
  // lib/static-page-fields instead.
  const isStaticForm = selectedFormId.startsWith("static:")

  // The module tree is built from /api/import/targets, which derives the org
  // SERVER-SIDE from the session and returns EVERY active org module (with
  // parent_id for nesting) plus all forms per module in one payload. We avoid
  // the lite feed here because it needs a client-supplied organizationId that
  // may not be populated yet on first render — which silently dropped all
  // dynamic modules. This source has no such dependency.
  const { data: modulesData, isLoading: loadingModules } = useGetImportTargetsQuery()

  const { data: formDetail, isLoading: loadingForm } = useGetFormDetailQuery(selectedFormId, {
    skip: !selectedFormId || isStaticForm,
  })
  const [createImportJob] = useCreateImportJobMutation()
  const [addImportMapping] = useAddImportMappingMutation()

  // Tree-picker UI state.
  // "Static Pages" is expanded by default so every static page is visible on
  // load without an extra click.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(["__static__"]))
  const [treeSearch, setTreeSearch] = useState("")
  const [selectedFormName, setSelectedFormName] = useState("")

  // Build the import-target tree from /api/import/targets: every active org
  // module (module_id / module_name / parent_id / sort_order) nested into a
  // hierarchy, each with its forms attached, plus a "Static Pages" group.
  const importTree = useMemo<ImportTreeNode[]>(() => {
    const rows = (modulesData?.modules || []) as any[]
    const nodeById = new Map<string, ImportTreeNode>()
    for (const m of rows) {
      nodeById.set(m.module_id, {
        id: m.module_id,
        name: m.module_name,
        isStatic: false,
        forms: (m.forms || []).map((f: any) => ({ id: f.id, name: f.name, isPublished: f.isPublished })),
        children: [],
        sortOrder: m.sort_order ?? 0,
      })
    }
    const roots: ImportTreeNode[] = []
    for (const m of rows) {
      const node = nodeById.get(m.module_id)!
      const parent = m.parent_id ? nodeById.get(m.parent_id) : null
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    const sortNodes = (arr: ImportTreeNode[]) => {
      arr.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))
      arr.forEach((n) => sortNodes(n.children))
    }
    sortNodes(roots)

    // Static pages: flattened to directly-clickable items under one header so
    // every page is visible with a single expand (each static module has one
    // importable form, so an intermediate module node would just be noise).
    const staticForms: TreeFormLeaf[] = []
    for (const sm of getStaticModules()) {
      const entries = getImportableStaticFormEntries(sm.name)
      for (const f of entries) {
        staticForms.push({ id: f.id, name: entries.length > 1 ? `${sm.name} – ${f.name}` : sm.name })
      }
    }
    staticForms.sort((a, b) => a.name.localeCompare(b.name))

    const staticGroup: ImportTreeNode = {
      id: "__static__", name: "Static Pages", isStatic: true, forms: staticForms, children: [], sortOrder: -1,
    }

    // Static Pages FIRST so all of them are visible at the top, above the
    // (potentially long, auto-expanded) dynamic module tree.
    return [staticGroup, ...roots]
  }, [modulesData])

  // Auto-expand the whole tree once, when the module feed first arrives, so the
  // full module structure (every module + its forms) is visible on load — just
  // like the sidebar. The user can still collapse afterwards.
  useEffect(() => {
    if (didInitExpand.current) return
    if (!modulesData) return // wait for the real module feed before expanding
    const ids = new Set<string>()
    const collect = (nodes: ImportTreeNode[]) => {
      for (const n of nodes) {
        ids.add(n.id)
        collect(n.children)
      }
    }
    collect(importTree)
    setExpandedIds(ids)
    didInitExpand.current = true
  }, [modulesData, importTree])

  // Apply the search filter (and force-expand when searching).
  const q = treeSearch.trim().toLowerCase()
  const visibleTree = useMemo<ImportTreeNode[]>(() => {
    if (!q) return importTree
    return importTree
      .map((n) => filterTreeNode(n, q))
      .filter((n): n is ImportTreeNode => n !== null)
  }, [importTree, q])

  const toggleNode = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleSelectTreeForm = (moduleId: string, form: TreeFormLeaf) => {
    setSelectedModuleId(moduleId)
    setSelectedFormId(form.id)
    setSelectedFormName(form.name)
  }

  // Get form fields for mapping (sections + all subforms). For static forms
  // we use the registry instead of formDetail — same shape (id / label /
  // type / group) so the rest of the wizard doesn't have to care.
  const formFields = useMemo(() => {
    if (isStaticForm) {
      const entry = STATIC_FORMS.find((f) => f.formId === selectedFormId)
      if (!entry) return []
      return entry.fields.map((f) => ({
        // For static forms the "field id" the wizard tracks is the coreKey
        // itself — that's what the static-import endpoint reads to write
        // the right Prisma column.
        id: f.coreKey,
        label: f.label,
        type: f.type,
        group: entry.formName,
      }))
    }
    if (!formDetail?.data) return []
    const fields: { id: string; label: string; type: string; group?: string }[] = []

    // Section fields
    for (const section of formDetail.data.sections || []) {
      for (const f of section.fields || []) {
        fields.push({ id: f.id, label: f.label, type: f.type, group: section.title || "Section" })
      }
    }

    // Subform fields (recursive)
    const collectSubformFields = (subforms: any[], parentName?: string) => {
      for (const sf of subforms || []) {
        const sfName = parentName ? `${parentName} / ${sf.name}` : sf.name || "Subform"
        for (const f of sf.fields || []) {
          fields.push({ id: f.id, label: f.label, type: f.type, group: sfName })
        }
        if (sf.childSubforms?.length) {
          collectSubformFields(sf.childSubforms, sfName)
        }
      }
    }
    collectSubformFields(formDetail.data.subforms || [])

    return fields
  }, [formDetail, selectedFormId, isStaticForm])

  // Auto-map columns to fields. Matches on (in priority order): exact label,
  // exact id/coreKey, normalised label (lowercase + non-alphanum stripped),
  // normalised id. For static forms the id IS the coreKey, so a CSV column
  // header like "employeeName" matches the Employee Name field, and "Primary
  // Email" matches "primaryEmail".
  const autoMap = () => {
    const hdrs = uploadedFile?.preview.headers
    if (!hdrs || !Array.isArray(hdrs) || hdrs.length === 0 || formFields.length === 0) return
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
    const newMappings: { sourceColumn: string; targetFieldId: string }[] = []
    const usedFieldIds = new Set<string>()
    for (const header of hdrs) {
      const headerLower = header.toLowerCase().trim()
      const headerNorm = norm(header)
      const match = formFields.find((f: any) => {
        if (usedFieldIds.has(f.id)) return false
        const label = String(f.label || "").toLowerCase().trim()
        const id = String(f.id || "").toLowerCase().trim()
        if (label === headerLower) return true
        if (id === headerLower) return true
        if (norm(label) === headerNorm) return true
        if (norm(id) === headerNorm) return true
        return false
      })
      if (match) {
        usedFieldIds.add(match.id)
        newMappings.push({ sourceColumn: header, targetFieldId: match.id })
      }
    }
    setMappings(newMappings)
  }

  // Auto-map when file is uploaded and formFields are ready
  useEffect(() => {
    if (uploadedFile && formFields.length > 0 && step === "map" && mappings.length === 0) {
      autoMap()
    }
  }, [uploadedFile, formFields, step])

  const handleFileUpload = (file: File, preview: ParsedFilePreview) => {
    setUploadedFile({ file, preview })
    setMappings([])
    setStep("map")
  }

  // Static-page imports now stream through ONE request (/api/static-import/stream)
  // which does a single dedup query + bulk inserts server-side — no client-side
  // chunking needed. Dynamic (form-builder) imports still stage in batches:
  const STAGE_BATCH = 2000 // Rows per /api/import/stage upload request

  // Poll the server-side job status until it reaches a terminal state. Driven
  // entirely off the DB, so it keeps working even after a page reload, and the
  // import itself continues server-side regardless of this poller.
  const pollJobStatus = (jobId: string) => {
    const tick = async () => {
      try {
        const res = await fetch(`/api/import/status?importJobId=${jobId}`, { credentials: "include" })
        const json = await res.json()
        if (!mountedRef.current) return
        if (!json.success) throw new Error(json.error || "Status check failed")
        const j = json.job
        setImportProgress({ current: j.processedRows, total: j.totalRows, percent: j.percent, phase: "import" })
        if (j.isTerminal) {
          setImportResult({ imported: j.successRows, failed: j.failedRows, skipped: j.skippedRows })
          setIsProcessing(false)
          try { localStorage.removeItem("erp:activeImportJob") } catch {}
          return
        }
        pollRef.current = setTimeout(tick, 1500)
      } catch {
        // Transient error (e.g. brief network blip) — keep polling; the job is
        // unaffected because it runs server-side.
        if (mountedRef.current) pollRef.current = setTimeout(tick, 3000)
      }
    }
    tick()
  }

  // Clean up the poll timer and reattach to an in-flight job after a reload.
  useEffect(() => {
    mountedRef.current = true
    try {
      const saved = localStorage.getItem("erp:activeImportJob")
      if (saved) {
        const { id } = JSON.parse(saved)
        if (id) {
          setActiveJobId(id)
          setIsProcessing(true)
          setStep("result")
          pollJobStatus(id)
        }
      }
    } catch {}
    return () => {
      mountedRef.current = false
      if (pollRef.current) clearTimeout(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  type StaticDone = {
    created: number; updated: number; skipped: number; failed: number; imported: number
    errors: { rowIndex: number; error: string }[]
  }

  // Stream a set of source rows through /api/static-import/stream, driving the
  // live "sheet → table" flow, and resolve with the per-row breakdown. Reused
  // by the initial import AND by "retry failed rows" (which passes the edited
  // subset). The server confirms rows in big batches (one round-trip each), so
  // we ease the DISPLAYED count toward the latest server checkpoint on a timer
  // — the bar + rows feel continuous without ever faking uncommitted progress.
  const streamStaticImport = (rowObjects: Record<string, string>[]): Promise<StaticDone> => {
    const totalRows = rowObjects.length
    importRowsRef.current = rowObjects
    setImportProgress({ current: 0, total: totalRows, percent: 0, phase: "import" })

    return new Promise<StaticDone>((resolve, reject) => {
      const serverRef = { current: 0 }
      const displayRef = { current: 0 }
      let done: StaticDone | null = null
      let err: Error | null = null
      let settled = false

      const tick = () => {
        if (settled || !mountedRef.current) return
        if (err) { settled = true; reject(err); return }
        const target = serverRef.current
        let cur = displayRef.current
        if (cur < target) {
          cur = Math.min(target, cur + Math.max(1, Math.ceil((target - cur) * 0.2)))
          displayRef.current = cur
          setImportProgress({ current: cur, total: totalRows, percent: totalRows ? Math.round((cur / totalRows) * 100) : 100, phase: "import" })
        }
        if (done && displayRef.current >= totalRows) {
          settled = true
          setImportProgress({ current: totalRows, total: totalRows, percent: 100, phase: "import" })
          resolve(done)
          return
        }
        setTimeout(tick, 50)
      }
      tick()

      ;(async () => {
        try {
          // Build the body off the critical path (cooperative, yielding) so a
          // 50k-row stringify doesn't freeze the page; still ONE request.
          const body = await buildStaticImportBody(
            selectedFormId,
            mappings.map((m) => ({ sourceColumn: m.sourceColumn, targetCoreKey: m.targetFieldId })),
            rowObjects,
          )
          const res = await fetch("/api/static-import/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body,
          })
          if (!res.ok || !res.body) {
            const j = await res.json().catch(() => null)
            throw new Error(j?.error || `Request failed (${res.status})`)
          }
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buf = ""
          for (;;) {
            const r = await reader.read()
            if (r.done) break
            buf += decoder.decode(r.value, { stream: true })
            const lines = buf.split("\n")
            buf = lines.pop() || ""
            for (const line of lines) {
              if (!line.trim()) continue
              let ev: any
              try { ev = JSON.parse(line) } catch { continue }
              if (ev.type === "progress") serverRef.current = Math.max(serverRef.current, ev.processed || 0)
              else if (ev.type === "done") {
                serverRef.current = totalRows
                done = {
                  created: ev.created || 0, updated: ev.updated || 0, skipped: ev.skipped || 0,
                  failed: ev.failed || 0, imported: ev.imported || 0, errors: ev.errors || [],
                }
              } else if (ev.type === "error") throw new Error(ev.error || "Import failed")
            }
          }
          if (!done) { done = { created: 0, updated: 0, skipped: 0, failed: totalRows, imported: 0, errors: [] }; serverRef.current = totalRows }
        } catch (e: any) {
          err = e instanceof Error ? e : new Error(String(e))
        }
      })()
    })
  }

  // Apply a stream result: record the breakdown + rebuild the failed-rows list
  // (mapped back to their source values so they can be edited). `prev` !=
  // undefined means this was a retry — accumulate onto the prior totals.
  const applyStaticResult = (
    result: StaticDone,
    rows: Record<string, string>[],
    prev?: { imported: number; created?: number; updated?: number; failed: number; skipped: number } | null,
  ) => {
    const failed = (result.errors || [])
      .map((e) => ({ rowIndex: e.rowIndex, error: e.error, row: rows[e.rowIndex] }))
      .filter((f) => f.row) as { rowIndex: number; error: string; row: Record<string, string> }[]
    setFailedRows(failed)
    setImportResult(prev
      ? {
          imported: prev.imported + result.imported,
          created: (prev.created || 0) + result.created,
          updated: (prev.updated || 0) + result.updated,
          skipped: prev.skipped + result.skipped,
          failed: result.failed,
        }
      : { imported: result.imported, created: result.created, updated: result.updated, skipped: result.skipped, failed: result.failed })
    setIsProcessing(false)
    toast({
      title: result.failed > 0 ? "Finished with errors" : "Import complete",
      description: `${result.imported.toLocaleString()} imported${result.skipped ? `, ${result.skipped.toLocaleString()} skipped` : ""}${result.failed ? `, ${result.failed.toLocaleString()} failed` : ""}`,
      variant: result.failed > 0 ? "destructive" : undefined,
    })
  }

  // Re-run ONLY the (possibly edited) rows that failed. Shows the flow again,
  // then merges the new outcome onto the running totals.
  const retryFailedRows = async (editedRows: Record<string, string>[]) => {
    if (!editedRows.length) return
    const prev = importResult
    const prevFailed = failedRows
    setIsRetrying(true)
    setImportResult(null) // re-show the live flow for the retry pass
    setFailedRows([])
    setLandedRows([])
    setImportStartedAt(Date.now())
    setIsProcessing(true)
    try {
      const result = await streamStaticImport(editedRows)
      applyStaticResult(result, editedRows, prev)
    } catch (e: any) {
      toast({ title: "Retry failed", description: e?.message || "Something went wrong", variant: "destructive" })
      setImportResult(prev) // restore the prior result + failures so the editor reappears
      setFailedRows(prevFailed)
      setIsProcessing(false)
      setImportProgress(null)
    } finally {
      setIsRetrying(false)
    }
  }

  const handleImport = async () => {
    if (!uploadedFile || mappings.length === 0 || !selectedFormId) return
    setIsProcessing(true)
    setImportProgress(null)
    setImportResult(null)
    setFailedRows([])
    setLandedRows([])
    setImportStartedAt(Date.now())

    // Static-page import — single streaming request (smart upsert by key,
    // skips unchanged rows, returns a created/updated/skipped/failed breakdown).
    if (isStaticForm) {
      const { headers, allRows } = uploadedFile.preview
      const allDataRows = allRows || uploadedFile.preview.rows
      const rowObjects = allDataRows.map((row) => {
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => { obj[h] = row[i] || "" })
        return obj
      })
      setStep("result")
      try {
        const result = await streamStaticImport(rowObjects)
        applyStaticResult(result, rowObjects)
      } catch (error: any) {
        toast({ title: "Import failed", description: error?.message || "Something went wrong", variant: "destructive" })
        setIsProcessing(false)
        setImportProgress(null)
      }
      return
    }

    // ── Dynamic (form-builder) import: durable, server-side background job ──
    // We stage every row into the server first, then kick off a background
    // worker and poll for progress. This survives the tab closing or the
    // network dropping mid-import, and is resumable.
    try {
      setImportResult(null)

      // Step 1: Create the job. Choosing a key column switches it to upsert so
      // re-importing the same key updates instead of duplicating.
      const jobResult = await createImportJob({
        moduleId: selectedModuleId,
        formId: selectedFormId,
        fileName: uploadedFile.file.name,
        fileSize: uploadedFile.file.size,
        totalRows: uploadedFile.preview.totalRows,
        duplicateHandling: keyFieldId ? "upsert" : "insert",
      }).unwrap()

      if (!jobResult.success) throw new Error(jobResult.error || "Failed to create import job")

      const importJobId = jobResult.importJobId || jobResult.data?.id || jobResult.data
      if (!importJobId) throw new Error("No import job ID returned")
      setActiveJobId(importJobId)

      // Step 2: Save mappings, flagging the chosen unique key column (if any).
      await addImportMapping({
        importJobId,
        mappings: mappings.map((m) => ({
          sourceColumn: m.sourceColumn,
          targetFieldId: m.targetFieldId,
          isKey: keyFieldId ? m.targetFieldId === keyFieldId : false,
        })),
      }).unwrap()

      // Step 3: Convert rows to objects.
      const { headers, allRows } = uploadedFile.preview
      const allDataRows = allRows || uploadedFile.preview.rows
      const rowObjects = allDataRows.map((row) => {
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => { obj[h] = row[i] || "" })
        return obj
      })
      const totalRows = rowObjects.length
      // Feed the live flow so rows visibly "land" as the background job advances.
      importRowsRef.current = rowObjects

      // Step 4: Stage all rows server-side in batches (the durable queue). This
      // is shown as the first 20% of progress.
      setImportProgress({ current: 0, total: totalRows, percent: 0, phase: "stage" })
      for (let off = 0; off < totalRows; off += STAGE_BATCH) {
        const batch = rowObjects.slice(off, off + STAGE_BATCH)
        const res = await fetch("/api/import/stage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ importJobId, rows: batch, startRowNumber: off }),
        })
        const json = await res.json()
        if (!json.success) throw new Error(json.error || "Failed to stage rows")
        const staged = Math.min(off + batch.length, totalRows)
        setImportProgress({ current: staged, total: totalRows, percent: Math.round((staged / totalRows) * 20), phase: "stage" })
      }

      // Step 5: Start the background worker (returns immediately).
      const startRes = await fetch("/api/import/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ importJobId }),
      })
      const startJson = await startRes.json()
      if (!startJson.success) throw new Error(startJson.error || "Failed to start import")

      // Step 6: Move to the result view and poll until done. Persist the job so
      // a page reload reattaches to it.
      try { localStorage.setItem("erp:activeImportJob", JSON.stringify({ id: importJobId })) } catch {}
      setStep("result")
      pollJobStatus(importJobId)
    } catch (error: any) {
      const errorMsg = error?.data?.error || error?.data?.details || error?.message || "Something went wrong"
      toast({ title: "Import Failed", description: errorMsg, variant: "destructive" })
      setIsProcessing(false)
      setImportProgress(null)
    }
  }

  const resetWizard = () => {
    if (pollRef.current) clearTimeout(pollRef.current)
    try { localStorage.removeItem("erp:activeImportJob") } catch {}
    setStep("select")
    setSelectedModuleId("")
    setSelectedFormId("")
    setSelectedFormName("")
    setTreeSearch("")
    setUploadedFile(null)
    setMappings([])
    setKeyFieldId("")
    setActiveJobId(null)
    setImportResult(null)
    setFailedRows([])
    setIsRetrying(false)
    setImportProgress(null)
    setIsProcessing(false)
    setLandedRows([])
    setImportStartedAt(null)
    importRowsRef.current = []
  }

  // Fields that are currently mapped — these are the candidates for the unique
  // key column used by upsert.
  const mappedKeyOptions = useMemo(() => {
    return mappings
      .map((m) => formFields.find((f: any) => f.id === m.targetFieldId))
      .filter(Boolean) as { id: string; label: string; type: string }[]
  }, [mappings, formFields])

  // If the chosen key field stops being mapped, clear it.
  useEffect(() => {
    if (keyFieldId && !mappedKeyOptions.some((f) => f.id === keyFieldId)) {
      setKeyFieldId("")
    }
  }, [mappedKeyOptions, keyFieldId])

  // ── Destination columns (mapped target fields, in mapping order, deduped) ──
  // Drives both the map-step "how it lands" preview and the live flow table.
  const targetColumns = useMemo(() => {
    const seen = new Set<string>()
    const cols: { id: string; label: string }[] = []
    for (const m of mappings) {
      if (seen.has(m.targetFieldId)) continue
      seen.add(m.targetFieldId)
      const f = formFields.find((x: any) => x.id === m.targetFieldId)
      cols.push({ id: m.targetFieldId, label: f?.label || m.targetFieldId })
    }
    return cols
  }, [mappings, formFields])

  // target field id → the source column feeding it (first wins).
  const targetToSource = useMemo(() => {
    const m: Record<string, string> = {}
    for (const mp of mappings) if (!(mp.targetFieldId in m)) m[mp.targetFieldId] = mp.sourceColumn
    return m
  }, [mappings])

  // Mapped source columns (with their field label) — the editable columns shown
  // in the failed-rows editor.
  const editorColumns = useMemo(
    () => mappings.map((m) => ({
      sourceColumn: m.sourceColumn,
      label: (formFields.find((f: any) => f.id === m.targetFieldId)?.label as string) || m.sourceColumn,
    })),
    [mappings, formFields],
  )

  // Download the failed rows (their source values + error) as a CSV to fix offline.
  const downloadFailedCsv = () => {
    if (!failedRows.length) return
    const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const header = ["error", ...editorColumns.map((c) => c.label)]
    const lines = [header.map(esc).join(",")]
    for (const f of failedRows) {
      lines.push([f.error, ...editorColumns.map((c) => f.row[c.sourceColumn] ?? "")].map(esc).join(","))
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `import-errors-${selectedFormName || "rows"}.csv`.replace(/[^\w.-]+/g, "-")
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── One-click auto-fix for mechanically-fixable failures ──
  // A "Missing <key>" error (e.g. "Missing itemCode") on a row whose key column
  // is mapped but blank can be resolved by generating a unique code. This maps
  // such an error to the source column that needs filling.
  const autoFixColumnForError = (error: string): string | null => {
    const m = error.match(/^Missing\s+(\w+)/) // "Missing itemCode" / "Missing docNo"
    if (!m) return null
    return targetToSource[m[1]] || null
  }
  // Monotonic + random so generated codes never collide (with each other or,
  // practically, with existing rows) — each becomes a fresh record on retry.
  const genCodeRef = useRef(0)
  const generateImportCode = (): string => {
    genCodeRef.current += 1
    const prefix = ((selectedFormName || "AUTO").replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()) || "AUTO"
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
    return `${prefix}-${rand}${String(genCodeRef.current).padStart(4, "0")}`
  }

  // Map a raw source-row object to destination cells (aligned to targetColumns).
  // Kept in a ref so the progress effect can use the latest mapping without
  // re-subscribing on every tick.
  const rowToCellsRef = useRef<(o: Record<string, string>) => string[]>(() => [])
  rowToCellsRef.current = (obj: Record<string, string>) =>
    targetColumns.map((c) => obj[targetToSource[c.id]] ?? "")

  // First few rows, transformed into the destination shape — the static
  // preview shown in the Map step ("this is what lands in the table").
  const previewObjs = useMemo(() => {
    if (!uploadedFile) return [] as Record<string, string>[]
    const { headers, rows } = uploadedFile.preview
    return rows.slice(0, 8).map((r) => {
      const o: Record<string, string> = {}
      headers.forEach((h, i) => { o[h] = r[i] || "" })
      return o
    })
  }, [uploadedFile])

  // Keep a rolling window of the most-recently-landed rows in sync with
  // progress, for BOTH import paths (client-chunked + polled background job).
  // Skipped during the staging phase (nothing is in the table yet).
  useEffect(() => {
    const cur = importProgress?.current ?? 0
    if (importProgress?.phase === "stage") { setLandedRows([]); return }
    const rows = importRowsRef.current
    if (!rows.length || cur <= 0) return
    const N = 8
    const startIdx = Math.max(0, cur - N)
    const slice = rows.slice(startIdx, cur)
    setLandedRows(slice.map((obj, i) => ({ key: String(startIdx + i), cells: rowToCellsRef.current(obj) })))
  }, [importProgress?.current, importProgress?.phase])

  const getMappingForColumn = (col: string) => mappings.find((m) => m.sourceColumn === col)?.targetFieldId || ""

  const updateMapping = (sourceColumn: string, targetFieldId: string) => {
    setMappings((prev) => {
      const filtered = prev.filter((m) => m.sourceColumn !== sourceColumn)
      if (targetFieldId && targetFieldId !== "__none__") {
        return [...filtered, { sourceColumn, targetFieldId }]
      }
      return filtered
    })
  }

  const steps: { key: ImportStep; label: string }[] = [
    { key: "select", label: "Select" },
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map" },
    { key: "result", label: "Done" },
  ]

  const currentStepIndex = steps.findIndex((s) => s.key === step)

  return (
    <div className="min-h-screen bg-background">
      {/* ─── MOBILE-RESPONSIVE HEADER ─── */}
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 relative space-y-2">
          <PageBackLink href="/settings/import" label="Data Migration" />
          {/* Row 1: icon + title + desktop step indicator */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold leading-tight">Import Data</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight hidden sm:block">
                Import records from CSV or Excel files
              </p>
            </div>

            {/* Desktop step indicator (hidden on mobile) */}
            <div className="ml-auto hidden sm:flex items-center gap-1 text-xs">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center gap-1 shrink-0">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <Badge variant={step === s.key ? "default" : "secondary"} className="text-[10px] px-2 py-0 whitespace-nowrap">
                    {s.label}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile step progress bar (hidden on desktop) */}
          <div className="flex items-start justify-between mt-4 px-2 sm:hidden">
            {steps.map((s, i) => {
              const isCompleted = i < currentStepIndex
              const isActive = s.key === step
              return (
                <div key={s.key} className="flex flex-1 items-start">
                  {/* Step circle + label */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`
                        w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold
                        transition-all duration-300 shrink-0
                        ${isCompleted
                          ? "bg-blue-600 text-white"
                          : isActive
                            ? "bg-blue-600 text-white ring-4 ring-blue-100"
                            : "bg-gray-100 text-gray-400 border border-gray-200"
                        }
                      `}
                    >
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span
                      className={`
                        text-[10px] mt-1 font-medium whitespace-nowrap
                        ${isActive ? "text-blue-600" : isCompleted ? "text-gray-700" : "text-gray-400"}
                      `}
                    >
                      {s.label}
                    </span>
                  </div>

                  {/* Connecting line (not after the last step) */}
                  {i < steps.length - 1 && (
                    <div className="flex-1 mt-3.5 mx-1">
                      <div className="h-[2px] w-full rounded-full bg-gray-200 relative">
                        <div
                          className={`
                            absolute inset-y-0 left-0 rounded-full transition-all duration-500
                            ${i < currentStepIndex ? "w-full bg-blue-600" : "w-0 bg-blue-600"}
                          `}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 max-w-4xl space-y-5">
        {/* Step 1: Select Module & Form */}
        {step === "select" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Select Module & Form</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Expand a module to see its forms, then click a form to import into it.
              </p>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={treeSearch}
                  onChange={(e) => setTreeSearch(e.target.value)}
                  placeholder="Search modules or forms…"
                  className="pl-8 h-9 text-sm"
                />
              </div>

              {/* Module / form tree */}
              <div className="border rounded-lg max-h-[440px] overflow-auto p-1">
                {loadingModules ? (
                  <div className="flex items-center gap-2 px-3 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading modules…
                  </div>
                ) : visibleTree.length === 0 ? (
                  <div className="px-3 py-8 text-sm text-muted-foreground text-center">
                    {q ? "No modules or forms match your search." : "No modules found."}
                  </div>
                ) : (
                  visibleTree.map((node) => (
                    <ModuleTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      expanded={expandedIds}
                      onToggle={toggleNode}
                      selectedFormId={selectedFormId}
                      onSelectForm={handleSelectTreeForm}
                      forceOpen={!!q}
                    />
                  ))
                )}
              </div>

              {/* Selected + Continue */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                <span className="text-xs text-muted-foreground text-center sm:text-left">
                  {selectedFormId
                    ? <>Selected: <span className="font-medium text-foreground">{selectedFormName || selectedFormId}</span></>
                    : "Pick a form to continue"}
                </span>
                <Button disabled={!selectedFormId || loadingForm} onClick={() => setStep("upload")} size="sm">
                  {loadingForm ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Upload File */}
        {step === "upload" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload CSV or Excel File</CardTitle>
            </CardHeader>
            <CardContent>
              <FileUpload
                onFileUpload={handleFileUpload}
                uploadedFile={uploadedFile}
                onFileRemove={() => setUploadedFile(null)}
              />
              <div className="flex justify-between mt-4">
                <Button variant="outline" size="sm" onClick={() => setStep("select")}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Map Fields */}
        {step === "map" && uploadedFile && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-base">Map Columns to Fields</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {mappings.length}/{uploadedFile.preview.headers.length} mapped
                  </Badge>
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={autoMap}>
                    Auto-Map
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Desktop table view */}
              <div className="border rounded-lg overflow-hidden hidden sm:block">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="text-xs w-[40%]">File Column</TableHead>
                      <TableHead className="text-xs w-[15%]">Sample</TableHead>
                      <TableHead className="text-xs">Map To Form Field</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadedFile.preview.headers.map((header, idx) => {
                      const sampleValues = uploadedFile.preview.rows.slice(0, 3).map((r) => r[idx]).filter(Boolean)
                      const currentTarget = getMappingForColumn(header)
                      return (
                        <TableRow key={header}>
                          <TableCell className="text-xs font-medium">{header}</TableCell>
                          <TableCell className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                            {sampleValues[0] || "—"}
                          </TableCell>
                          <TableCell>
                            <Select value={currentTarget || "__none__"} onValueChange={(v) => updateMapping(header, v)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Skip" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Skip —</SelectItem>
                                {formFields.map((f: any) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.label} <span className="text-muted-foreground">({f.type})</span>
                                    {f.group && <span className="text-muted-foreground/60 ml-1 text-[10px]">[{f.group}]</span>}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card view for mapping */}
              <div className="space-y-3 sm:hidden">
                {uploadedFile.preview.headers.map((header, idx) => {
                  const sampleValues = uploadedFile.preview.rows.slice(0, 3).map((r) => r[idx]).filter(Boolean)
                  const currentTarget = getMappingForColumn(header)
                  return (
                    <div key={header} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{header}</span>
                        {currentTarget && currentTarget !== "__none__" && (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        )}
                      </div>
                      {sampleValues[0] && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          Sample: {sampleValues[0]}
                        </p>
                      )}
                      <Select value={currentTarget || "__none__"} onValueChange={(v) => updateMapping(header, v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Skip" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Skip —</SelectItem>
                          {formFields.map((f: any) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.label} <span className="text-muted-foreground">({f.type})</span>
                              {f.group && <span className="text-muted-foreground/60 ml-1 text-[10px]">[{f.group}]</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
              </div>

              {/* Unique key column — enables idempotent upsert (dynamic forms only) */}
              {!isStaticForm && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                  <Label className="text-xs font-medium">Unique key column (optional)</Label>
                  <Select value={keyFieldId || "__none__"} onValueChange={(v) => setKeyFieldId(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None — always insert new rows" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None — always insert new rows</SelectItem>
                      {mappedKeyOptions.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    {keyFieldId
                      ? "Re-importing a row with the same value here updates the existing record instead of creating a duplicate."
                      : "Pick a column (e.g. Employee Code, Email) to make re-imports update existing records instead of duplicating them."}
                  </p>
                </div>
              )}

              {/* Destination preview — what the mapped rows look like once they
                  land in the table. Updates live as mappings change. */}
              {targetColumns.length > 0 && previewObjs.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/40 text-xs font-medium">
                    <FileText className="h-3.5 w-3.5 text-emerald-600" />
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Table2 className="h-3.5 w-3.5 text-blue-600" />
                    <span className="truncate">Preview — how your data lands in {selectedFormName || "the table"}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">first {previewObjs.length} rows</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted/30">
                          {targetColumns.map((c) => (
                            <th key={c.id} className="px-2 py-1.5 text-left font-medium whitespace-nowrap border-b">
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewObjs.map((obj, ri) => {
                          const cells = rowToCellsRef.current(obj)
                          return (
                            <tr key={ri} className="border-b last:border-b-0 hover:bg-muted/20">
                              {cells.map((val, ci) => (
                                <td
                                  key={ci}
                                  className="px-2 py-1.5 max-w-[180px] truncate text-muted-foreground"
                                  title={val}
                                >
                                  {val || <span className="text-muted-foreground/40">—</span>}
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Progress bar (staging phase, before background processing starts) */}
              {isProcessing && importProgress && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {importProgress.phase === "stage" ? "Uploading" : "Importing"} {importProgress.current} of {importProgress.total} rows...
                    </span>
                    <span className="font-medium">{importProgress.percent}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${importProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => setStep("upload")} disabled={isProcessing}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                  <span className="text-xs text-muted-foreground text-center sm:text-left">
                    {uploadedFile.preview.totalRows} rows to import
                  </span>
                  <Button
                    onClick={handleImport}
                    disabled={mappings.length === 0 || isProcessing}
                    size="sm"
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {isProcessing ? "Importing..." : `Import ${uploadedFile.preview.totalRows} Records`}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Result — shows live progress while the background job runs,
            then a summary (with an error-report download) when it finishes. */}
        {step === "result" && (
          <Card>
            <CardContent className="py-8">
              {!importResult ? (
                /* ── Running: the live "sheet → table" flow ── */
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <h2 className="text-lg font-bold">Importing your data…</h2>
                  </div>
                  <ImportFlow
                    fileName={uploadedFile?.file.name || "your file"}
                    targetLabel={selectedFormName || selectedFormId || "Destination"}
                    columns={targetColumns}
                    landedRows={landedRows}
                    processed={importProgress?.current ?? 0}
                    total={importProgress?.total ?? uploadedFile?.preview.totalRows ?? 0}
                    percent={importProgress?.percent ?? 0}
                    phase={importProgress?.phase}
                    startedAt={importStartedAt}
                    done={false}
                  />
                  {!isStaticForm && (
                    <p className="text-xs text-muted-foreground text-center">
                      This runs on the server — you can safely close this page or navigate away.
                      The import will keep going and you can come back to check on it.
                    </p>
                  )}
                </div>
              ) : (
                /* ── Done — breakdown + (static) inline fix-and-retry ── */
                <div className="space-y-5">
                  <div className="text-center space-y-3">
                    <motion.div
                      initial={{ scale: 0, rotate: -12 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18 }}
                      className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${importResult.failed > 0 ? "bg-amber-100" : "bg-green-100"}`}
                    >
                      {importResult.failed > 0
                        ? <AlertCircle className="h-8 w-8 text-amber-600" />
                        : <Check className="h-8 w-8 text-green-600" />}
                    </motion.div>
                    <h2 className="text-xl font-bold">
                      {importResult.failed > 0 ? "Imported — some rows need fixing" : "Import complete"}
                    </h2>
                    <div className="flex flex-wrap justify-center gap-2">
                      <StatChip label="Imported" value={importResult.imported} color="green" index={0} />
                      {importResult.created != null && importResult.created > 0 && <StatChip label="Created" value={importResult.created} color="blue" index={1} />}
                      {importResult.updated != null && importResult.updated > 0 && <StatChip label="Updated" value={importResult.updated} color="violet" index={2} />}
                      {importResult.skipped > 0 && <StatChip label="Skipped" value={importResult.skipped} color="muted" index={3} />}
                      {importResult.failed > 0 && <StatChip label="Failed" value={importResult.failed} color="red" index={4} />}
                    </div>
                    {importResult.skipped > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Skipped rows were already up to date or duplicate keys in the file — no duplicates were created.
                      </p>
                    )}
                  </div>

                  {/* Static imports: edit the bad rows in place and retry just them. */}
                  {isStaticForm && failedRows.length > 0 && (
                    <FailedRowsEditor
                      rows={failedRows}
                      columns={editorColumns}
                      onRetry={retryFailedRows}
                      onDownloadCsv={downloadFailedCsv}
                      autoFixColumnForError={autoFixColumnForError}
                      generateValue={generateImportCode}
                      busy={isRetrying}
                    />
                  )}

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                    {importResult.failed > 0 && activeJobId && (
                      <Button asChild variant="outline">
                        <a href={`/api/import/errors?importJobId=${activeJobId}`}>
                          <Download className="h-4 w-4 mr-2" /> Download Error Report
                        </a>
                      </Button>
                    )}
                    <Button onClick={resetWizard} variant="outline">
                      Import more data
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
