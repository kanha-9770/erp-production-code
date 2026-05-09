"use client"

/**
 * Reusable picker for the workflow email templates defined in
 * `lib/workflow/email-templates.ts`.
 *
 * Opens as a modal-style Dialog with three columns:
 *   1. Category list on the left
 *   2. Template list (filtered by category + search) in the middle
 *   3. Live HTML preview on the right
 *
 * The "Use this template" button in the footer calls `onApply({subject, body})`
 * — the parent decides whether the picked template REPLACES the current
 * subject/body or just inserts. Replacing is the only sane default given the
 * templates are full-message designs.
 */

import { useMemo, useState } from "react"
import { FileText, Mail, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  EMAIL_TEMPLATES,
  getTemplatesForAction,
  type EmailTemplate,
  type EmailTemplateCategory,
} from "@/lib/workflow/email-templates"

interface EmailTemplatePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Filter the list to only templates that make sense for this action type. */
  actionType?: "Email Notification" | "Report Export"
  /** Called when the user clicks "Use this template". */
  onApply: (picked: { subject: string; body: string; templateId: string; templateName: string }) => void
}

const ALL_CATEGORIES: EmailTemplateCategory[] = [
  "Reports",
  "Notifications",
  "HR",
  "Sales",
  "Operations",
  "Approvals",
  "Reminders",
  "Finance",
  "IT",
  "Marketing",
]

export function EmailTemplatePicker({
  open,
  onOpenChange,
  actionType,
  onApply,
}: EmailTemplatePickerProps) {
  const [activeCategory, setActiveCategory] = useState<EmailTemplateCategory | "All">("All")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const allowed = useMemo(() => {
    return actionType ? getTemplatesForAction(actionType) : EMAIL_TEMPLATES
  }, [actionType])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allowed.filter((t) => {
      if (activeCategory !== "All" && t.category !== activeCategory) return false
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q)
      )
    })
  }, [allowed, activeCategory, search])

  const selected: EmailTemplate | null = useMemo(() => {
    if (!selectedId) return filtered[0] || null
    return allowed.find((t) => t.id === selectedId) || filtered[0] || null
  }, [allowed, filtered, selectedId])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: allowed.length }
    for (const t of allowed) counts[t.category] = (counts[t.category] || 0) + 1
    return counts
  }, [allowed])

  const apply = () => {
    if (!selected) return
    onApply({
      subject: selected.subject,
      body: selected.body,
      templateId: selected.id,
      templateName: selected.name,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-indigo-700" />
            Choose an email template
            {actionType && (
              <Badge className="text-[10px] bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                {actionType}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[180px_280px_1fr] h-[520px]">
          {/* ── Category sidebar ───────────────────────────────────── */}
          <div className="border-r bg-muted/20 overflow-y-auto py-2">
            {(["All", ...ALL_CATEGORIES] as const).map((cat) => {
              const count = categoryCounts[cat] || 0
              if (count === 0) return null
              const isActive = activeCategory === cat
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat as any)}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-muted/50 transition-colors ${
                    isActive ? "bg-muted text-foreground font-medium" : "text-muted-foreground"
                  }`}
                >
                  <span>{cat}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
                </button>
              )
            })}
          </div>

          {/* ── Template list ───────────────────────────────────────── */}
          <div className="border-r flex flex-col overflow-hidden">
            <div className="px-2 py-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-7 text-xs pl-7"
                  placeholder="Search templates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground text-center">
                  No templates match your filter.
                </p>
              ) : (
                filtered.map((t) => {
                  const isActive = (selected?.id || filtered[0]?.id) === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full text-left px-3 py-2 border-b text-xs flex items-start gap-2 hover:bg-muted/40 transition-colors ${
                        isActive ? "bg-indigo-50 border-l-2 border-l-indigo-500" : ""
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5 mt-0.5 text-indigo-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">{t.name}</div>
                        <div className="text-[10px] text-muted-foreground line-clamp-2">
                          {t.description}
                        </div>
                        <div className="mt-1">
                          <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal">
                            {t.category}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* ── Preview pane ────────────────────────────────────────── */}
          <div className="flex flex-col overflow-hidden bg-muted/10">
            {selected ? (
              <>
                <div className="border-b px-4 py-2.5 bg-background">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Subject</div>
                  <div className="text-sm font-medium truncate">{selected.subject}</div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div
                    className="bg-white border rounded text-[13px]"
                    // Templates ship trusted HTML — they're our own constants,
                    // not user input. Safe to render as-is for the preview.
                    dangerouslySetInnerHTML={{ __html: selected.body }}
                  />
                </div>
                <div className="border-t px-4 py-2 bg-background flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    Placeholders like <code>{"{{Field Name}}"}</code> resolve at send time using the record's values. Edit freely after applying.
                  </p>
                </div>
              </>
            ) : (
              <p className="p-6 text-sm text-muted-foreground text-center">
                Pick a template from the list to preview it here.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="px-4 py-2.5 border-t gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!selected}
            onClick={apply}
          >
            Use this template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
