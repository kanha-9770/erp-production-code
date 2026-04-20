"use client"

import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import {
  useGetFunctionsQuery,
  useUpdateFunctionMutation,
  useCreateFunctionMutation,
  useExecuteFunctionMutation,
} from "@/lib/api/functions"
import {
  X,
  Save,
  Terminal,
  Bug,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Search,
  Plus,
  Minus,
  WrapText,
  Copy,
  CornerDownLeft,
  Replace,
  History as HistoryIcon,
  Loader2,
  Settings2,
  Play,
  Palette,
  Wand2,
  MessageSquareText,
  Zap,
  Check,
} from "lucide-react"

// ── Sidebar snippet items ─────────────────────────────────────────────────

interface SnippetCategory {
  title: string
  items: { label: string; snippet: string }[]
}

const snippetCategories: SnippetCategory[] = [
  {
    title: "BASIC",
    items: [
      { label: "set variable", snippet: 'variableName = "";\n' },
      { label: "add comment", snippet: "// comment\n" },
      { label: "info", snippet: 'info "";\n' },
    ],
  },
  {
    title: "CONDITION",
    items: [
      { label: "if", snippet: "if (condition)\n{\n\t\n}\n" },
      { label: "else if", snippet: "else if (condition)\n{\n\t\n}\n" },
      { label: "else", snippet: "else\n{\n\t\n}\n" },
    ],
  },
  {
    title: "LOOPS",
    items: [
      { label: "for each", snippet: "for each item in collection\n{\n\t\n}\n" },
      { label: "while", snippet: "while (condition)\n{\n\t\n}\n" },
      { label: "break", snippet: "break;\n" },
      { label: "continue", snippet: "continue;\n" },
    ],
  },
  {
    title: "NOTIFICATIONS",
    items: [
      { label: "send mail", snippet: 'sendmail\n[\n\tfrom: "",\n\tto: "",\n\tsubject: "",\n\tmessage: ""\n];\n' },
    ],
  },
  {
    title: "INTEGRATIONS",
    items: [
      { label: "webhook", snippet: 'response = invokeUrl\n[\n\turl: "",\n\ttype: POST,\n\tparameters: {},\n\theaders: {}\n];\n' },
      { label: "open url", snippet: 'openUrl("", "same window");\n' },
      { label: "invoke API", snippet: 'response = invokeUrl\n[\n\turl: "",\n\ttype: GET\n];\n' },
    ],
  },
  {
    title: "COLLECTION",
    items: [
      { label: "create list", snippet: "myList = List();\n" },
      { label: "create map", snippet: "myMap = Map();\n" },
      { label: "add to list", snippet: 'myList.add("");\n' },
      { label: "put in map", snippet: 'myMap.put("key", "value");\n' },
    ],
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

const BRACKET_PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "`": "`",
}

const AI_HISTORY_KEY = "fn-editor-ai-history"
const THEME_KEY = "fn-editor-theme"

// ── Theme presets ─────────────────────────────────────────────────────────
// Each theme defines values for the editor's CSS variables. The root
// container reads `THEMES[active]` and emits the values via inline style.
// ──────────────────────────────────────────────────────────────────────────

interface EditorTheme {
  id: string
  label: string
  isDark: boolean
  vars: {
    bg: string
    bg2: string
    bg3: string
    border: string
    border2: string
    fg: string
    fg2: string
    fg3: string
    blue: string
    blue2: string
    green: string
    yellow: string
    red: string
    pink: string
  }
}

const THEMES: EditorTheme[] = [
  {
    id: "mocha",
    label: "Catppuccin Mocha",
    isDark: true,
    vars: {
      bg: "rgb(30,30,46)", bg2: "rgb(24,24,37)", bg3: "rgb(17,17,27)",
      border: "rgb(49,50,68)", border2: "rgb(69,71,90)",
      fg: "rgb(205,214,244)", fg2: "rgb(166,173,200)", fg3: "rgb(88,91,112)",
      blue: "rgb(137,180,250)", blue2: "rgb(116,199,236)",
      green: "rgb(166,227,161)", yellow: "rgb(249,226,175)", red: "rgb(243,139,168)", pink: "rgb(245,194,231)",
    },
  },
  {
    id: "dracula",
    label: "Dracula",
    isDark: true,
    vars: {
      bg: "#282a36", bg2: "#21222c", bg3: "#191a21",
      border: "#44475a", border2: "#6272a4",
      fg: "#f8f8f2", fg2: "#bdbdc7", fg3: "#6272a4",
      blue: "#8be9fd", blue2: "#bd93f9",
      green: "#50fa7b", yellow: "#f1fa8c", red: "#ff5555", pink: "#ff79c6",
    },
  },
  {
    id: "nord",
    label: "Nord",
    isDark: true,
    vars: {
      bg: "#2e3440", bg2: "#272b35", bg3: "#1f232b",
      border: "#3b4252", border2: "#4c566a",
      fg: "#eceff4", fg2: "#d8dee9", fg3: "#7b88a0",
      blue: "#88c0d0", blue2: "#81a1c1",
      green: "#a3be8c", yellow: "#ebcb8b", red: "#bf616a", pink: "#b48ead",
    },
  },
  {
    id: "monokai",
    label: "Monokai",
    isDark: true,
    vars: {
      bg: "#272822", bg2: "#1f201b", bg3: "#171812",
      border: "#3e3d32", border2: "#75715e",
      fg: "#f8f8f2", fg2: "#d6d6c4", fg3: "#75715e",
      blue: "#66d9ef", blue2: "#a6e22e",
      green: "#a6e22e", yellow: "#e6db74", red: "#f92672", pink: "#fd5ff0",
    },
  },
  {
    id: "latte",
    label: "Catppuccin Latte (light)",
    isDark: false,
    vars: {
      bg: "#eff1f5", bg2: "#e6e9ef", bg3: "#dce0e8",
      border: "#bcc0cc", border2: "#9ca0b0",
      fg: "#4c4f69", fg2: "#5c5f77", fg3: "#8c8fa1",
      blue: "#1e66f5", blue2: "#04a5e5",
      green: "#40a02b", yellow: "#df8e1d", red: "#d20f39", pink: "#ea76cb",
    },
  },
  {
    id: "github-light",
    label: "GitHub Light",
    isDark: false,
    vars: {
      bg: "#ffffff", bg2: "#f6f8fa", bg3: "#eaeef2",
      border: "#d0d7de", border2: "#afb8c1",
      fg: "#1f2328", fg2: "#656d76", fg3: "#8c959f",
      blue: "#0969da", blue2: "#218bff",
      green: "#1a7f37", yellow: "#9a6700", red: "#cf222e", pink: "#bf3989",
    },
  },
]

const DEFAULT_THEME_ID = "mocha"

function getTheme(id: string): EditorTheme {
  return THEMES.find((t) => t.id === id) || THEMES[0]
}

function themeStyleVars(theme: EditorTheme): React.CSSProperties {
  const v = theme.vars
  return {
    ["--ed-bg" as any]: v.bg,
    ["--ed-bg-2" as any]: v.bg2,
    ["--ed-bg-3" as any]: v.bg3,
    ["--ed-border" as any]: v.border,
    ["--ed-border-2" as any]: v.border2,
    ["--ed-fg" as any]: v.fg,
    ["--ed-fg-2" as any]: v.fg2,
    ["--ed-fg-3" as any]: v.fg3,
    ["--ed-blue" as any]: v.blue,
    ["--ed-blue-2" as any]: v.blue2,
    ["--ed-green" as any]: v.green,
    ["--ed-yellow" as any]: v.yellow,
    ["--ed-red" as any]: v.red,
    ["--ed-pink" as any]: v.pink,
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const fence = trimmed.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/)
  return fence ? fence[1] : trimmed
}

/**
 * Default starter script per language. JavaScript scripts get a runnable
 * sample using the `ctx` API; Deluge scripts get the legacy template (which
 * is editor-only — Deluge cannot be executed by the runtime).
 */
function getDefaultTemplate(name: string, language: string): string {
  const lang = (language || "").toLowerCase()
  if (lang === "javascript" || lang === "js") {
    return [
      `// ${name} — runs server-side with access to ctx.* helpers.`,
      `// Globals: ctx.modules, ctx.records, ctx.input, ctx.log, ...`,
      ``,
      `// Discover what's available:`,
      `// const modules = await ctx.modules.list();`,
      `// const fields  = await ctx.records.fields("Leads");`,
      ``,
      `// Read records — \`data\` is a flat { [Label]: value } map:`,
      `// const rows = await ctx.records.list("Leads", { limit: 5 });`,
      `// ctx.log("Found", rows.length, "records:", rows.map(r => r.data));`,
      ``,
      `// Write a record using label keys:`,
      `// await ctx.records.create("Leads", { "Name": "Alice", "Email": "a@b.com" });`,
      ``,
      `return { ok: true };`,
      ``,
    ].join("\n")
  }
  // Deluge / anything else — editor metadata only.
  return `void automation.${name}()\n{\n\t// Write your function logic here\n\t\n}\n`
}

/**
 * Heuristic: does this script look like Deluge? We catch a couple of obvious
 * cases so we can warn before sending it to the JS runtime.
 */
function looksLikeDeluge(script: string): boolean {
  const s = script.trim()
  if (!s) return false
  if (/^void\s+\w+(\.\w+)?\s*\(/m.test(s)) return true
  if (/^\s*info\s+["']/m.test(s)) return true
  if (/^\s*sendmail\s*\[/m.test(s)) return true
  if (/^\s*invokeUrl\s*\[/m.test(s)) return true
  return false
}

// ── Component ──────────────────────────────────────────────────────────────

export default function FunctionEditorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const functionId = searchParams.get("id") || ""
  const functionName = searchParams.get("name") || "Untitled_Function"
  const functionCategory = searchParams.get("category") || "Automation"
  const initialLanguage = searchParams.get("language") || "Deluge"
  const isEditing = !!functionId

  // The language is mutable from the editor (right-sidebar picker). Defaults
  // to the URL param; rehydrated from the saved record on first load.
  const [functionLanguage, setFunctionLanguage] = useState<string>(initialLanguage)

  // Editor state
  const [script, setScript] = useState(() =>
    getDefaultTemplate(functionName, initialLanguage)
  )
  const [commitMessage, setCommitMessage] = useState("")
  const [consoleOutput, setConsoleOutput] = useState("")
  const [showConsole, setShowConsole] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  // Editor UX state
  const [fontSize, setFontSize] = useState(13)
  const [wordWrap, setWordWrap] = useState(false)
  const [tabSize, setTabSize] = useState(4)
  const [autoClose, setAutoClose] = useState(true)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState("")
  const [replaceQuery, setReplaceQuery] = useState("")
  const [cursor, setCursor] = useState({ line: 1, col: 1, sel: 0 })
  const [themeId, setThemeId] = useState<string>(DEFAULT_THEME_ID)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const activeTheme = useMemo(() => getTheme(themeId), [themeId])

  // AI Assistant state
  const [rightTab, setRightTab] = useState<"details" | "ai">("details")
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiResult, setAiResult] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState("")
  const [aiHistory, setAiHistory] = useState<string[]>([])
  const aiAbortRef = useRef<AbortController | null>(null)

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)

  // API
  const { data: functionsData } = useGetFunctionsQuery(undefined, { skip: !isEditing })
  const [updateFunction, { isLoading: isUpdating }] = useUpdateFunctionMutation()
  const [createFunction, { isLoading: isCreating }] = useCreateFunctionMutation()
  const [executeFunctionApi, { isLoading: isRunning }] = useExecuteFunctionMutation()
  const isSaving = isUpdating || isCreating

  const existingFunction = useMemo(() => {
    if (!isEditing || !functionsData?.data) return null
    return functionsData.data.find((f: any) => f.id === functionId) || null
  }, [isEditing, functionsData, functionId])

  // Load existing script
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!existingFunction || initialized) return
    if (existingFunction.language) {
      setFunctionLanguage(existingFunction.language)
    }
    if (existingFunction.script) {
      setScript(existingFunction.script)
    } else {
      setScript(
        getDefaultTemplate(
          existingFunction.name,
          existingFunction.language || functionLanguage
        )
      )
    }
    setInitialized(true)
  }, [existingFunction, initialized, functionLanguage])

  // Load AI history from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AI_HISTORY_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setAiHistory(parsed.slice(0, 8))
      }
    } catch {
      /* ignore */
    }
  }, [])

  // Load saved theme from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved && THEMES.some((t) => t.id === saved)) setThemeId(saved)
    } catch {
      /* ignore */
    }
  }, [])

  const persistTheme = useCallback((id: string) => {
    setThemeId(id)
    setThemeMenuOpen(false)
    try {
      localStorage.setItem(THEME_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  const persistHistory = useCallback((next: string[]) => {
    setAiHistory(next)
    try {
      localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(next.slice(0, 8)))
    } catch {
      /* ignore */
    }
  }, [])

  // ── Save handlers ────────────────────────────────────────────────────────
  // Returns true on success so callers (Run, Save & Close) can chain.
  const handleSave = useCallback(async (): Promise<boolean> => {
    try {
      if (isEditing) {
        await updateFunction({
          id: functionId,
          script,
          language: functionLanguage,
        }).unwrap()
      } else {
        await createFunction({
          name: functionName,
          displayName: functionName,
          category: functionCategory,
          language: functionLanguage,
        }).unwrap()
      }
      return true
    } catch (err) {
      console.error("Failed to save function:", err)
      return false
    }
  }, [
    isEditing,
    functionId,
    script,
    functionName,
    functionCategory,
    functionLanguage,
    updateFunction,
    createFunction,
  ])

  const handleSaveAndClose = useCallback(async () => {
    await handleSave()
    router.push("/settings/functions")
  }, [handleSave, router])

  const handleClose = () => {
    router.push("/settings/functions")
  }

  // ── Editor utilities ─────────────────────────────────────────────────────

  const focusEditor = () => {
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const insertAtCursor = useCallback((text: string, replaceSelection = true) => {
    const ta = textareaRef.current
    if (!ta) {
      setScript((prev) => prev + text)
      return
    }
    const start = ta.selectionStart
    const end = replaceSelection ? ta.selectionEnd : ta.selectionStart
    const before = ta.value.slice(0, start)
    const after = ta.value.slice(end)
    const next = before + text + after
    setScript(next)
    requestAnimationFrame(() => {
      ta.focus()
      const cursorPos = start + text.length
      ta.setSelectionRange(cursorPos, cursorPos)
    })
  }, [])

  const replaceAll = useCallback((text: string) => {
    setScript(text)
    focusEditor()
  }, [])

  const replaceSelection = useCallback((text: string) => {
    insertAtCursor(text, true)
  }, [insertAtCursor])

  const insertSnippet = (snippet: string) => insertAtCursor(snippet, true)

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  // ── Cursor / selection tracking ──────────────────────────────────────────
  const updateCursor = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    const value = ta.value
    const pos = ta.selectionStart
    const before = value.slice(0, pos)
    const lineIdx = before.split("\n").length
    const lastNl = before.lastIndexOf("\n")
    const colIdx = pos - (lastNl + 1) + 1
    setCursor({
      line: lineIdx,
      col: colIdx,
      sel: ta.selectionEnd - ta.selectionStart,
    })
  }, [])

  // ── Sync line-numbers scroll with editor ─────────────────────────────────
  const handleScroll = () => {
    if (!textareaRef.current || !lineNumbersRef.current) return
    lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
  }

  // ── Find / Find-Next ─────────────────────────────────────────────────────
  const findNext = useCallback(() => {
    if (!findQuery) return
    const ta = textareaRef.current
    if (!ta) return
    const startFrom = ta.selectionEnd
    const value = ta.value
    let idx = value.indexOf(findQuery, startFrom)
    if (idx === -1) idx = value.indexOf(findQuery, 0)
    if (idx === -1) return
    ta.focus()
    ta.setSelectionRange(idx, idx + findQuery.length)
    updateCursor()
  }, [findQuery, updateCursor])

  const replaceCurrent = useCallback(() => {
    const ta = textareaRef.current
    if (!ta || !findQuery) return
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd)
    if (sel === findQuery) {
      insertAtCursor(replaceQuery, true)
    } else {
      findNext()
    }
  }, [findQuery, replaceQuery, findNext, insertAtCursor])

  const replaceAllOccurrences = useCallback(() => {
    if (!findQuery) return
    setScript((prev) => prev.split(findQuery).join(replaceQuery))
  }, [findQuery, replaceQuery])

  // ── Keyboard handling: Tab, brackets, comment, save, find ────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const value = ta.value

    // Save: Ctrl/Cmd + S
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault()
      handleSave()
      return
    }

    // Find: Ctrl/Cmd + F
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault()
      setFindOpen(true)
      return
    }

    // Toggle line comment: Ctrl/Cmd + /
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      e.preventDefault()
      const lineStart = value.lastIndexOf("\n", start - 1) + 1
      const lineEndIdx = value.indexOf("\n", end)
      const sliceEnd = lineEndIdx === -1 ? value.length : lineEndIdx
      const block = value.slice(lineStart, sliceEnd)
      const lines = block.split("\n")
      const allCommented = lines.every((l) => l.trim().startsWith("//") || l.trim() === "")
      const next = lines
        .map((l) => {
          if (l.trim() === "") return l
          if (allCommented) return l.replace(/^(\s*)\/\/\s?/, "$1")
          const indent = l.match(/^\s*/)?.[0] ?? ""
          return `${indent}// ${l.slice(indent.length)}`
        })
        .join("\n")
      const newValue = value.slice(0, lineStart) + next + value.slice(sliceEnd)
      setScript(newValue)
      requestAnimationFrame(() => {
        ta.focus()
        ta.setSelectionRange(lineStart, lineStart + next.length)
      })
      return
    }

    // Tab / Shift+Tab
    if (e.key === "Tab") {
      e.preventDefault()
      if (start !== end) {
        // Block indent / outdent
        const lineStart = value.lastIndexOf("\n", start - 1) + 1
        const lineEndIdx = value.indexOf("\n", end - 1)
        const sliceEnd = lineEndIdx === -1 ? value.length : lineEndIdx
        const block = value.slice(lineStart, sliceEnd)
        const lines = block.split("\n")
        const next = e.shiftKey
          ? lines.map((l) => l.replace(/^\t| {1,4}/, "")).join("\n")
          : lines.map((l) => `\t${l}`).join("\n")
        const newValue = value.slice(0, lineStart) + next + value.slice(sliceEnd)
        setScript(newValue)
        requestAnimationFrame(() => {
          ta.focus()
          ta.setSelectionRange(lineStart, lineStart + next.length)
        })
      } else {
        const newValue = value.slice(0, start) + "\t" + value.slice(end)
        setScript(newValue)
        requestAnimationFrame(() => {
          ta.focus()
          ta.setSelectionRange(start + 1, start + 1)
        })
      }
      return
    }

    // Auto-indent on Enter (preserve indent + extra indent after `{`)
    if (e.key === "Enter") {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1
      const currentLine = value.slice(lineStart, start)
      const indent = currentLine.match(/^[\t ]*/)?.[0] ?? ""
      const charBefore = value[start - 1]
      const charAfter = value[start]
      let extra = ""
      let trailing = ""
      if (charBefore === "{") {
        extra = "\t"
        if (charAfter === "}") {
          trailing = `\n${indent}`
        }
      }
      const insert = `\n${indent}${extra}${trailing}`
      e.preventDefault()
      const newValue = value.slice(0, start) + insert + value.slice(end)
      setScript(newValue)
      const cursorPos = start + 1 + indent.length + extra.length
      requestAnimationFrame(() => {
        ta.focus()
        ta.setSelectionRange(cursorPos, cursorPos)
      })
      return
    }

    // Auto-close brackets/quotes
    if (autoClose && BRACKET_PAIRS[e.key]) {
      const close = BRACKET_PAIRS[e.key]
      // If user is typing the closing char and it already exists at cursor, skip duplicate
      if (
        (e.key === '"' || e.key === "'" || e.key === "`") &&
        value[start] === e.key
      ) {
        e.preventDefault()
        requestAnimationFrame(() => ta.setSelectionRange(start + 1, start + 1))
        return
      }
      e.preventDefault()
      const sel = value.slice(start, end)
      const inserted = `${e.key}${sel}${close}`
      const newValue = value.slice(0, start) + inserted + value.slice(end)
      setScript(newValue)
      requestAnimationFrame(() => {
        ta.focus()
        if (sel) {
          ta.setSelectionRange(start + 1, start + 1 + sel.length)
        } else {
          ta.setSelectionRange(start + 1, start + 1)
        }
      })
      return
    }

    // Closing-bracket overwrite
    if ((e.key === ")" || e.key === "]" || e.key === "}") && value[start] === e.key && start === end) {
      e.preventDefault()
      requestAnimationFrame(() => ta.setSelectionRange(start + 1, start + 1))
      return
    }
  }

  // ── Console execution ────────────────────────────────────────────────────
  const handleRunConsole = useCallback(async () => {
    setShowConsole(true)

    // Pre-flight: catch obvious Deluge syntax before round-tripping to the
    // server. The runtime only executes JavaScript; running Deluge would just
    // produce a confusing "X is not defined" error.
    if (looksLikeDeluge(script)) {
      setConsoleOutput(
        [
          ">> Cannot run: this script looks like Deluge.",
          ">> The function runtime executes JavaScript only.",
          ">>",
          ">> Rewrite using JavaScript + the ctx API. Example:",
          ">>   const rows = await ctx.records.list(\"Leads\", { limit: 5 });",
          ">>   ctx.log(rows);",
          ">>   return rows;",
          ">>",
          ">> Tip: open the AI panel (top toolbar) and ask it to convert your script.",
        ].join("\n")
      )
      return
    }

    // Auto-save when editing so the persisted script + language match what
    // you're about to run. Workflow rules also pick up the latest version.
    if (isEditing) {
      setConsoleOutput(">> Saving…")
      const ok = await handleSave()
      if (!ok) {
        setConsoleOutput("!! Save failed — fix the error above before running.")
        return
      }
    }

    setConsoleOutput(">> Running…")
    try {
      const res = await executeFunctionApi({
        id: isEditing ? functionId : undefined,
        script,
      }).unwrap()
      const data: any = (res as any).data ?? res
      const lines: string[] = []
      lines.push(`>> Run finished in ${data.durationMs ?? 0}ms`)
      if (Array.isArray(data.logs) && data.logs.length > 0) {
        for (const l of data.logs) {
          const text = l.args
            .map((a: any) => {
              if (typeof a === "string") return a
              try {
                return JSON.stringify(a, null, 2)
              } catch {
                return String(a)
              }
            })
            .join(" ")
          lines.push(`[${l.level}] ${text}`)
        }
      }
      if (data.success) {
        if (data.result !== undefined) {
          lines.push("")
          lines.push(`return: ${typeof data.result === "string" ? data.result : JSON.stringify(data.result, null, 2)}`)
        } else {
          lines.push("(no return value)")
        }
      } else {
        lines.push("")
        lines.push(`!! ${data.error || "Execution failed"}`)
        // Most failures we surface are async/await or ctx.* misuse — show a
        // pointer at the docs so the user knows where to look.
        if (data.error && !data.error.includes("looks like Deluge")) {
          lines.push(">>")
          lines.push(">> Available helpers:")
          lines.push(">>   ctx.modules.list() / .get(name)")
          lines.push(">>   ctx.records.list(module, { limit?, where? })")
          lines.push(">>   ctx.records.get / .create / .update / .delete / .count")
          lines.push(">>   ctx.log(...args)  ctx.input")
        }
      }
      setConsoleOutput(lines.join("\n"))
    } catch (err: any) {
      setConsoleOutput(`!! ${err?.data?.error || err?.message || "Run failed"}`)
    }
  }, [executeFunctionApi, functionId, isEditing, script, handleSave])

  const handleDebug = () => {
    setShowConsole(true)
    setConsoleOutput(
      ">> Debug mode\n>> Add ctx.log('msg', value) calls in your script and Run to see output.\n>> Selected text and `ctx.input` are available at runtime."
    )
  }

  // ── AI Assistant ─────────────────────────────────────────────────────────
  const runAiWithPrompt = useCallback(async (rawPrompt: string, opts: { recordHistory?: boolean } = {}) => {
    const prompt = rawPrompt.trim()
    if (!prompt) return
    if (aiLoading) return

    aiAbortRef.current?.abort()
    const controller = new AbortController()
    aiAbortRef.current = controller

    setAiLoading(true)
    setAiError("")
    setAiResult("")

    const ta = textareaRef.current
    const selection = ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : ""

    const systemMsg = `You are an expert JavaScript developer assisting inside an in-app function editor for an ERP/CRM platform.
The script will be EXECUTED server-side as JavaScript regardless of the editor's "language" label — never produce Deluge, Python, or any other language.
Generate ONLY the requested JavaScript code. No explanations, no markdown fences, no commentary — return raw source.
Do NOT use Deluge constructs like \`void automation.X()\`, \`info "..."\`, \`sendmail [...]\`, \`invokeUrl [...]\`, etc.
Match the user's existing style and indentation. Keep responses focused and minimal.

The script runs server-side inside an async sandbox with these helpers available as globals:

  ctx.organizationId            // string — current org id
  ctx.userId                    // string — current user id
  ctx.input                     // any   — input passed to the run (record data, etc.)
  ctx.log(...args)              // log to the console panel
  ctx.info / .warn / .error     // same, with a level

  await ctx.modules.list()                          // -> [{ id, name }]
  await ctx.modules.get(name)                       // -> { id, name, formId, formName }

  await ctx.records.list(moduleName, { limit?, skip?, where? })
    // -> [{ id, data: { [Label]: value, ... }, recordData, createdAt, ... }]
    // \`data\` is a flat label→value map; use \`recordData\` for the raw stored shape.
  await ctx.records.get(moduleName, recordId)        // same shape as a list item, or null
  await ctx.records.create(moduleName, flatOrStructured)
    // Pass either { "Email": "x@y.com", "Name": "..." } (label keys) OR
    // the structured { sections: { ... } } shape. Returns { id, formId }.
  await ctx.records.update(moduleName, recordId, flatOrStructuredPatch)
  await ctx.records.delete(moduleName, recordId)
  await ctx.records.count(moduleName, where?)
  await ctx.records.fields(moduleName)               // -> [{ id, label, type }]

You can use top-level await. Use \`return value;\` to surface a result back to the caller.
Do NOT import modules — only the bound globals above are available.`

    const userMsg = `Function name: ${functionName}
Category: ${functionCategory}
Language: ${functionLanguage}

Current script:
\`\`\`
${script}
\`\`\`
${selection ? `\nSelected portion:\n\`\`\`\n${selection}\n\`\`\`\n` : ""}
Task: ${prompt}`

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          stream: true,
          temperature: 0.2,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "")
        throw new Error(errText || `Request failed (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let assembled = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split("\n\n")
        buffer = frames.pop() ?? ""
        for (const frame of frames) {
          const line = frame.trim()
          if (!line.startsWith("data:")) continue
          const data = line.slice(5).trim()
          if (data === "[DONE]") continue
          try {
            const parsed = JSON.parse(data)
            if (typeof parsed.delta === "string") {
              assembled += parsed.delta
              setAiResult(assembled)
            }
            if (typeof parsed.error === "string") {
              throw new Error(parsed.error)
            }
          } catch (e) {
            if (e instanceof Error && e.message && !e.message.includes("Unexpected")) {
              throw e
            }
          }
        }
      }

      setAiResult(stripCodeFences(assembled))

      // Push to history (dedup, newest first) — only for user-typed prompts.
      if (opts.recordHistory !== false) {
        const next = [prompt, ...aiHistory.filter((p) => p !== prompt)].slice(0, 8)
        persistHistory(next)
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return
      setAiError(err?.message || "AI request failed")
    } finally {
      setAiLoading(false)
    }
  }, [
    aiLoading,
    aiHistory,
    persistHistory,
    script,
    functionName,
    functionCategory,
    functionLanguage,
  ])

  const runAi = useCallback(() => runAiWithPrompt(aiPrompt, { recordHistory: true }), [aiPrompt, runAiWithPrompt])

  // Quick-action prompts. These bypass the prompt textarea and just ask for
  // a specific transformation against the current script + selection.
  const aiQuickAction = useCallback(
    (action: "explain" | "fix" | "comment" | "optimize" | "convert") => {
      const ta = textareaRef.current
      const hasSelection = ta && ta.selectionEnd > ta.selectionStart
      const target = hasSelection ? "the selected portion" : "the script"
      const prompts: Record<typeof action, string> = {
        explain: `Explain ${target} in concise inline comments (one comment per logical block). Return the same code with explanatory // comments added — preserve all logic.`,
        fix: `Find and fix any bugs, syntax errors, or logic issues in ${target}. Pay special attention to async/await usage, missing returns, and incorrect ctx.* API calls. Return the corrected JavaScript only.`,
        comment: `Add clear, concise JSDoc-style comments to functions and inline // comments at non-obvious lines in ${target}. Do not change any logic. Return the commented JavaScript.`,
        optimize: `Optimize ${target} for clarity, correctness and performance. Avoid premature abstractions. Replace expensive patterns (e.g. N+1 ctx.records.* calls inside loops) with batched alternatives where possible. Return the optimized JavaScript.`,
        convert: `Convert ${target} from Deluge to JavaScript using the ctx.* API. Preserve the intent. Use ctx.records.list/get/create/update/delete and ctx.modules.* helpers. Return only the JavaScript.`,
      }
      runAiWithPrompt(prompts[action])
    },
    [runAiWithPrompt]
  )

  const cancelAi = () => {
    aiAbortRef.current?.abort()
    setAiLoading(false)
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const lineCount = script.split("\n").length
  const charCount = script.length
  const displayName = existingFunction?.displayName || functionName
  const apiName = (existingFunction?.name || functionName).toLowerCase().replace(/\s+/g, "_")
  const category = existingFunction?.category || functionCategory

  // Re-sync line-numbers scroll on layout
  useLayoutEffect(() => {
    handleScroll()
  }, [script, fontSize, wordWrap])

  return (
    <div
      className={`h-screen flex flex-col bg-[var(--ed-bg)] overflow-hidden ${activeTheme.isDark ? "text-white" : "text-black"}`}
      style={themeStyleVars(activeTheme)}
    >
      {/* ── Top Bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--ed-bg-2)] border-b border-[var(--ed-border)] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--ed-fg-2)] font-mono">FX</span>
          <span className="text-sm font-medium text-[var(--ed-fg)]">{displayName}</span>
          <span className="text-[10px] text-[var(--ed-fg-3)] uppercase tracking-wider">{functionLanguage}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)]"
            onClick={() => setFindOpen((v) => !v)}
            title="Find (Ctrl+F)"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-[var(--ed-fg-2)] hover:text-[var(--ed-fg)] hover:bg-[var(--ed-border)]"
            onClick={() => setWordWrap((v) => !v)}
            title="Toggle word wrap"
          >
            <WrapText className={`h-3.5 w-3.5 ${wordWrap ? "text-[var(--ed-blue)]" : ""}`} />
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-[var(--ed-fg-2)] hover:text-[var(--ed-fg)] hover:bg-[var(--ed-border)]"
              onClick={() => setThemeMenuOpen((v) => !v)}
              title={`Theme: ${activeTheme.label}`}
            >
              <Palette className="h-3.5 w-3.5" />
            </Button>
            {themeMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setThemeMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-56 bg-[var(--ed-bg-2)] border border-[var(--ed-border)] rounded-md shadow-xl z-40 overflow-hidden">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--ed-fg-3)] border-b border-[var(--ed-border)]">
                    Editor Theme
                  </div>
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => persistTheme(t.id)}
                      className={`w-full flex items-center gap-2 text-left text-xs px-3 py-2 hover:bg-[var(--ed-border)] transition-colors ${themeId === t.id ? "text-[var(--ed-fg)]" : "text-[var(--ed-fg-2)]"}`}
                    >
                      <span className="flex gap-0.5 shrink-0">
                        <span className="h-3 w-3 rounded-sm border border-black/20" style={{ background: t.vars.bg }} />
                        <span className="h-3 w-3 rounded-sm border border-black/20" style={{ background: t.vars.blue }} />
                        <span className="h-3 w-3 rounded-sm border border-black/20" style={{ background: t.vars.green }} />
                      </span>
                      <span className="flex-1 truncate">{t.label}</span>
                      {themeId === t.id && <Check className="h-3 w-3 text-[var(--ed-blue)]" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-0.5 mr-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)]"
              onClick={() => setFontSize((s) => Math.max(10, s - 1))}
              title="Decrease font size"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-[10px] text-[var(--ed-fg-3)] w-5 text-center">{fontSize}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)]"
              onClick={() => setFontSize((s) => Math.min(24, s + 1))}
              title="Increase font size"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)]"
            onClick={handleRunConsole}
            disabled={isRunning}
            title="Run function"
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin text-[var(--ed-green)]" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1 text-[var(--ed-green)]" />
            )}
            Run
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)]"
            onClick={() => {
              setRightTab("ai")
              requestAnimationFrame(() => {
                document.getElementById("ai-prompt-input")?.focus()
              })
            }}
            title="AI Assist"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1 text-[var(--ed-yellow)]" />
            AI
          </Button>
          <div className="w-px h-5 bg-[var(--ed-border)] mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)]"
            onClick={handleClose}
          >
            Close
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-[var(--ed-border)] hover:bg-[var(--ed-border-2)] text-[var(--ed-fg)]"
            disabled={isSaving}
            onClick={handleSaveAndClose}
          >
            Save and Close
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-[var(--ed-blue)] hover:bg-[var(--ed-blue-2)] text-[var(--ed-bg)]"
            disabled={isSaving}
            onClick={handleSave}
          >
            <Save className="h-3 w-3 mr-1" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* ── Find/Replace Bar ───────────────────────────────────────────── */}
      {findOpen && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--ed-bg-2)] border-b border-[var(--ed-border)] shrink-0">
          <Input
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                findNext()
              }
              if (e.key === "Escape") {
                setFindOpen(false)
                focusEditor()
              }
            }}
            placeholder="Find"
            className="h-6 text-xs bg-[var(--ed-bg)] border-[var(--ed-border)] text-[var(--ed-fg)] placeholder:text-[var(--ed-fg-3)] w-48"
          />
          <Input
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="Replace"
            className="h-6 text-xs bg-[var(--ed-bg)] border-[var(--ed-border)] text-[var(--ed-fg)] placeholder:text-[var(--ed-fg-3)] w-48"
          />
          <Button size="sm" variant="ghost" className="h-6 text-xs text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)]" onClick={findNext}>
            Next
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-xs text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)]" onClick={replaceCurrent}>
            Replace
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-xs text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)]" onClick={replaceAllOccurrences}>
            All
          </Button>
          <button
            className="ml-auto text-[var(--ed-fg-3)] hover:text-[var(--ed-fg-2)]"
            onClick={() => {
              setFindOpen(false)
              focusEditor()
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Main Content (Resizable) ───────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* ── Left Sidebar: Snippets ─────────────────────────────── */}
          <ResizablePanel defaultSize={14} minSize={0} maxSize={30} collapsible collapsedSize={0}>
            <div className="h-full bg-[var(--ed-bg-2)] overflow-y-auto">
              <div className="px-3 py-2 text-[10px] font-semibold tracking-wider text-[var(--ed-fg-3)] uppercase border-b border-[var(--ed-border)]">
                Snippets
              </div>
              {snippetCategories.map((cat) => (
                <div key={cat.title}>
                  <button
                    onClick={() => toggleSection(cat.title)}
                    className="w-full flex items-center gap-1 px-3 py-2 text-[10px] font-semibold tracking-wider text-[var(--ed-fg-2)] uppercase hover:bg-[var(--ed-bg)] transition-colors"
                  >
                    {collapsedSections.has(cat.title) ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    {cat.title}
                  </button>
                  {!collapsedSections.has(cat.title) && (
                    <div className="pb-1">
                      {cat.items.map((item) => (
                        <button
                          key={item.label}
                          onClick={() => insertSnippet(item.snippet)}
                          className="w-full text-left text-xs text-[var(--ed-fg)] py-1.5 px-6 hover:bg-[var(--ed-border)] transition-colors"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ResizablePanel>

          <ResizableHandle className="bg-[var(--ed-border)] hover:bg-[var(--ed-border-2)] transition-colors" />

          {/* ── Center: Code Editor + Console (vertical resizable) ── */}
          <ResizablePanel defaultSize={62} minSize={30}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={showConsole ? 70 : 100} minSize={20}>
                <div className="h-full flex overflow-hidden">
                  {/* Line numbers */}
                  <div
                    ref={lineNumbersRef}
                    className="bg-[var(--ed-bg-2)] border-r border-[var(--ed-border)] overflow-hidden pt-3 shrink-0"
                    style={{ width: `${Math.max(36, String(lineCount).length * 9 + 16)}px` }}
                  >
                    <div
                      className="font-mono text-right pr-2 select-none text-[var(--ed-fg-3)]"
                      style={{ fontSize: `${fontSize - 1}px`, lineHeight: `${fontSize + 7}px` }}
                    >
                      {Array.from({ length: lineCount }, (_, i) => (
                        <div key={i + 1}>{i + 1}</div>
                      ))}
                    </div>
                  </div>
                  {/* Editor */}
                  <textarea
                    ref={textareaRef}
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onScroll={handleScroll}
                    onSelect={updateCursor}
                    onClick={updateCursor}
                    onKeyUp={updateCursor}
                    spellCheck={false}
                    className="flex-1 bg-[var(--ed-bg)] text-[var(--ed-fg)] font-mono p-3 resize-none outline-none border-none overflow-auto"
                    style={{
                      tabSize,
                      fontSize: `${fontSize}px`,
                      lineHeight: `${fontSize + 7}px`,
                      whiteSpace: wordWrap ? "pre-wrap" : "pre",
                    }}
                  />
                </div>
              </ResizablePanel>

              {showConsole && (
                <>
                  <ResizableHandle className="bg-[var(--ed-border)] hover:bg-[var(--ed-border-2)] transition-colors" />
                  <ResizablePanel defaultSize={30} minSize={10} maxSize={70}>
                    <div className="h-full flex flex-col bg-[var(--ed-bg-3)]">
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--ed-border)] shrink-0">
                        <span className="text-[10px] font-semibold tracking-wider text-[var(--ed-fg-2)] uppercase">
                          Console
                        </span>
                        <button
                          onClick={() => setShowConsole(false)}
                          className="text-[var(--ed-fg-3)] hover:text-[var(--ed-fg-2)]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <pre className="px-3 py-2 text-xs text-[var(--ed-green)] font-mono flex-1 overflow-auto">
                        {consoleOutput || "No output."}
                      </pre>
                    </div>
                  </ResizablePanel>
                </>
              )}

              {/* Bottom status bar */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--ed-bg-2)] border-t border-[var(--ed-border)] shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRunConsole}
                    className="flex items-center gap-1 text-xs text-[var(--ed-fg-2)] hover:text-white transition-colors"
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    Console
                  </button>
                  <button
                    onClick={handleDebug}
                    className="flex items-center gap-1 text-xs text-[var(--ed-fg-2)] hover:text-white transition-colors"
                  >
                    <Bug className="h-3.5 w-3.5" />
                    Debug
                  </button>
                  <div className="w-px h-3 bg-[var(--ed-border)]" />
                  <button
                    onClick={() => setAutoClose((v) => !v)}
                    className="flex items-center gap-1 text-[10px] text-[var(--ed-fg-3)] hover:text-[var(--ed-fg-2)] transition-colors"
                    title="Toggle auto-close brackets"
                  >
                    <Settings2 className="h-3 w-3" />
                    auto-close: {autoClose ? "on" : "off"}
                  </button>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[var(--ed-fg-3)]">
                  <span>
                    Ln {cursor.line}, Col {cursor.col}
                    {cursor.sel > 0 && ` (${cursor.sel} sel)`}
                  </span>
                  <span>{lineCount} lines</span>
                  <span>{charCount} chars</span>
                  <span>{functionLanguage}</span>
                </div>
              </div>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle className="bg-[var(--ed-border)] hover:bg-[var(--ed-border-2)] transition-colors" />

          {/* ── Right Sidebar: Details / AI ────────────────────────── */}
          <ResizablePanel defaultSize={24} minSize={15} maxSize={50}>
            <div className="h-full bg-[var(--ed-bg-2)] flex flex-col overflow-hidden">
              <Tabs
                value={rightTab}
                onValueChange={(v) => setRightTab(v as "details" | "ai")}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <TabsList className="grid w-full grid-cols-2 h-8 bg-[var(--ed-bg-3)] rounded-none border-b border-[var(--ed-border)] shrink-0">
                  <TabsTrigger
                    value="details"
                    className="text-xs data-[state=active]:bg-[var(--ed-bg-2)] data-[state=active]:text-white text-[var(--ed-fg-2)]"
                  >
                    Details
                  </TabsTrigger>
                  <TabsTrigger
                    value="ai"
                    className="text-xs data-[state=active]:bg-[var(--ed-bg-2)] data-[state=active]:text-white text-[var(--ed-fg-2)]"
                  >
                    <Sparkles className="h-3 w-3 mr-1 text-[var(--ed-yellow)]" />
                    AI Assist
                  </TabsTrigger>
                </TabsList>

                {/* Details tab */}
                <TabsContent value="details" className="flex-1 overflow-y-auto p-4 space-y-4 m-0">
                  <p className="text-sm font-medium text-[var(--ed-fg)]">{displayName}</p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] text-[var(--ed-fg-3)] uppercase tracking-wider mb-1">API Name</p>
                      <p className="text-xs text-[var(--ed-fg-2)] font-mono break-all">{apiName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--ed-fg-3)] uppercase tracking-wider mb-1">Category</p>
                      <p className="text-xs text-[var(--ed-fg-2)]">{category}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--ed-fg-3)] uppercase tracking-wider mb-1">Return</p>
                      <p className="text-xs text-[var(--ed-fg-2)] font-mono">void</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--ed-fg-3)] uppercase tracking-wider mb-1">Language</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {["JavaScript", "Deluge"].map((lang) => (
                          <button
                            key={lang}
                            onClick={() => setFunctionLanguage(lang)}
                            className={`px-2 py-0.5 text-[11px] rounded ${
                              functionLanguage === lang
                                ? "bg-[var(--ed-blue)] text-[var(--ed-bg)]"
                                : "bg-[var(--ed-bg)] text-[var(--ed-fg-2)] hover:bg-[var(--ed-border)]"
                            }`}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>
                      {functionLanguage !== "JavaScript" && (
                        <p className="text-[10px] text-[var(--ed-yellow)] mt-1.5">
                          Only JavaScript runs server-side. Deluge is editor-only metadata.
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--ed-fg-3)] uppercase tracking-wider mb-1">Tab Size</p>
                      <div className="flex items-center gap-1">
                        {[2, 4, 8].map((n) => (
                          <button
                            key={n}
                            onClick={() => setTabSize(n)}
                            className={`px-2 py-0.5 text-[11px] rounded ${
                              tabSize === n
                                ? "bg-[var(--ed-blue)] text-[var(--ed-bg)]"
                                : "bg-[var(--ed-bg)] text-[var(--ed-fg-2)] hover:bg-[var(--ed-border)]"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-[var(--ed-border)] pt-4">
                    <p className="text-[10px] text-[var(--ed-fg-3)] uppercase tracking-wider mb-2">Commit Message</p>
                    <Textarea
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Describe your changes..."
                      rows={3}
                      className="resize-none text-xs bg-[var(--ed-bg)] border-[var(--ed-border)] text-[var(--ed-fg)] placeholder:text-[var(--ed-fg-3)]"
                    />
                  </div>
                </TabsContent>

                {/* AI Assist tab */}
                <TabsContent value="ai" className="flex-1 overflow-hidden flex flex-col m-0">
                  <div className="p-3 border-b border-[var(--ed-border)] shrink-0 space-y-2">
                    <p className="text-[10px] text-[var(--ed-fg-3)] uppercase tracking-wider">
                      Describe what to generate
                    </p>
                    <Textarea
                      id="ai-prompt-input"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                          e.preventDefault()
                          runAi()
                        }
                      }}
                      placeholder={`e.g. "Loop through orders and send a reminder email if status is pending"`}
                      rows={4}
                      className="resize-none text-xs bg-[var(--ed-bg)] border-[var(--ed-border)] text-[var(--ed-fg)] placeholder:text-[var(--ed-fg-3)]"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-[var(--ed-yellow)] hover:bg-[var(--ed-pink)] text-[var(--ed-bg)] flex-1"
                        onClick={runAi}
                        disabled={aiLoading || !aiPrompt.trim()}
                      >
                        {aiLoading ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3 mr-1" />
                            Generate
                            <span className="ml-2 text-[9px] opacity-70">⌘↵</span>
                          </>
                        )}
                      </Button>
                      {aiLoading && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)]"
                          onClick={cancelAi}
                        >
                          Stop
                        </Button>
                      )}
                    </div>
                    {aiError && (
                      <p className="text-[11px] text-[var(--ed-red)]">{aiError}</p>
                    )}

                    {/* Quick Actions — prefab AI prompts that act on the script/selection */}
                    <div className="pt-1">
                      <p className="text-[10px] text-[var(--ed-fg-3)] uppercase tracking-wider mb-1.5">
                        Quick Actions
                      </p>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          onClick={() => aiQuickAction("explain")}
                          disabled={aiLoading}
                          className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded bg-[var(--ed-bg)] border border-[var(--ed-border)] text-[var(--ed-fg-2)] hover:text-[var(--ed-fg)] hover:border-[var(--ed-border-2)] disabled:opacity-50 transition-colors"
                          title="Explain the script (or selection) with inline comments"
                        >
                          <MessageSquareText className="h-3 w-3 text-[var(--ed-blue)]" />
                          Explain
                        </button>
                        <button
                          onClick={() => aiQuickAction("fix")}
                          disabled={aiLoading}
                          className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded bg-[var(--ed-bg)] border border-[var(--ed-border)] text-[var(--ed-fg-2)] hover:text-[var(--ed-fg)] hover:border-[var(--ed-border-2)] disabled:opacity-50 transition-colors"
                          title="Find and fix bugs"
                        >
                          <Bug className="h-3 w-3 text-[var(--ed-red)]" />
                          Fix Bugs
                        </button>
                        <button
                          onClick={() => aiQuickAction("comment")}
                          disabled={aiLoading}
                          className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded bg-[var(--ed-bg)] border border-[var(--ed-border)] text-[var(--ed-fg-2)] hover:text-[var(--ed-fg)] hover:border-[var(--ed-border-2)] disabled:opacity-50 transition-colors"
                          title="Add JSDoc + inline comments"
                        >
                          <Wand2 className="h-3 w-3 text-[var(--ed-pink)]" />
                          Add Comments
                        </button>
                        <button
                          onClick={() => aiQuickAction("optimize")}
                          disabled={aiLoading}
                          className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded bg-[var(--ed-bg)] border border-[var(--ed-border)] text-[var(--ed-fg-2)] hover:text-[var(--ed-fg)] hover:border-[var(--ed-border-2)] disabled:opacity-50 transition-colors"
                          title="Optimize for clarity and performance"
                        >
                          <Zap className="h-3 w-3 text-[var(--ed-yellow)]" />
                          Optimize
                        </button>
                        <button
                          onClick={() => aiQuickAction("convert")}
                          disabled={aiLoading}
                          className="col-span-2 flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 rounded bg-[var(--ed-bg)] border border-[var(--ed-border)] text-[var(--ed-fg-2)] hover:text-[var(--ed-fg)] hover:border-[var(--ed-border-2)] disabled:opacity-50 transition-colors"
                          title="Convert Deluge to JavaScript using ctx.* API"
                        >
                          <Sparkles className="h-3 w-3 text-[var(--ed-green)]" />
                          Convert Deluge → JavaScript
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Result + actions */}
                  <div className="flex-1 overflow-hidden flex flex-col">
                    {aiResult ? (
                      <>
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--ed-border)] shrink-0">
                          <span className="text-[10px] font-semibold tracking-wider text-[var(--ed-fg-2)] uppercase">
                            Generated
                          </span>
                          <button
                            onClick={() => {
                              setAiResult("")
                              setAiError("")
                            }}
                            className="text-[var(--ed-fg-3)] hover:text-[var(--ed-fg-2)]"
                            title="Clear"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <pre className="flex-1 overflow-auto px-3 py-2 text-[11px] text-[var(--ed-green)] font-mono whitespace-pre-wrap break-words">
                          {aiResult}
                        </pre>
                        <div className="border-t border-[var(--ed-border)] p-2 grid grid-cols-2 gap-1 shrink-0">
                          <Button
                            size="sm"
                            className="h-7 text-[11px] bg-[var(--ed-blue)] hover:bg-[var(--ed-blue-2)] text-[var(--ed-bg)]"
                            onClick={() => insertAtCursor(stripCodeFences(aiResult), false)}
                          >
                            <CornerDownLeft className="h-3 w-3 mr-1" />
                            Insert
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-[11px] bg-[var(--ed-border)] hover:bg-[var(--ed-border-2)] text-[var(--ed-fg)]"
                            onClick={() => replaceSelection(stripCodeFences(aiResult))}
                          >
                            <Replace className="h-3 w-3 mr-1" />
                            Replace Sel
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)]"
                            onClick={() => replaceAll(stripCodeFences(aiResult))}
                          >
                            Replace All
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)]"
                            onClick={() => {
                              navigator.clipboard?.writeText(stripCodeFences(aiResult)).catch(() => {})
                            }}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 min-w-0">
                        {aiHistory.length > 0 && (
                          <>
                            <div className="flex items-center gap-1 mb-2">
                              <HistoryIcon className="h-3 w-3 text-[var(--ed-fg-3)] shrink-0" />
                              <span className="text-[10px] uppercase tracking-wider text-[var(--ed-fg-3)] truncate">
                                Recent Prompts
                              </span>
                            </div>
                            <div className="space-y-1">
                              {aiHistory.map((p, i) => (
                                <button
                                  key={i}
                                  onClick={() => setAiPrompt(p)}
                                  title={p}
                                  className="w-full max-w-full block text-left text-[11px] text-[var(--ed-fg-2)] hover:text-white hover:bg-[var(--ed-border)] px-2 py-1.5 rounded line-clamp-2 break-words whitespace-normal min-w-0 overflow-hidden"
                                  style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
                                >
                                  {p}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        {aiHistory.length === 0 && !aiLoading && (
                          <p className="text-[11px] text-[var(--ed-fg-3)] italic break-words">
                            Tip: select code in the editor first to give the AI context to refactor or extend.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
