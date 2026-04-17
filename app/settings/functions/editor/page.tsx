"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  useGetFunctionsQuery,
  useUpdateFunctionMutation,
  useCreateFunctionMutation,
} from "@/lib/api/functions"
import { X, Save, Terminal, Bug, ChevronRight, ChevronDown } from "lucide-react"

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
      { label: "for each", snippet: 'for each item in collection\n{\n\t\n}\n' },
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

// ── Component ──────────────────────────────────────────────────────────────

export default function FunctionEditorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const functionId = searchParams.get("id") || ""
  const functionName = searchParams.get("name") || "Untitled_Function"
  const functionCategory = searchParams.get("category") || "Automation"
  const functionLanguage = searchParams.get("language") || "Deluge"
  const isEditing = !!functionId

  // State
  const [script, setScript] = useState(
    `void automation.${functionName}()\n{\n\t// Write your function logic here\n\t\n}\n`
  )
  const [commitMessage, setCommitMessage] = useState("")
  const [consoleOutput, setConsoleOutput] = useState("")
  const [showConsole, setShowConsole] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  // API
  const { data: functionsData } = useGetFunctionsQuery(undefined, { skip: !isEditing })
  const [updateFunction, { isLoading: isUpdating }] = useUpdateFunctionMutation()
  const [createFunction, { isLoading: isCreating }] = useCreateFunctionMutation()
  const isSaving = isUpdating || isCreating

  const existingFunction = useMemo(() => {
    if (!isEditing || !functionsData?.data) return null
    return functionsData.data.find((f: any) => f.id === functionId) || null
  }, [isEditing, functionsData, functionId])

  // Load existing script
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!existingFunction || initialized) return
    if (existingFunction.script) {
      setScript(existingFunction.script)
    } else {
      setScript(
        `void automation.${existingFunction.name}()\n{\n\t// Write your function logic here\n\t\n}\n`
      )
    }
    setInitialized(true)
  }, [existingFunction, initialized])

  // Handlers
  const handleSave = useCallback(async () => {
    try {
      if (isEditing) {
        await updateFunction({ id: functionId, script }).unwrap()
      } else {
        await createFunction({
          name: functionName,
          displayName: functionName,
          category: functionCategory,
          language: functionLanguage,
        }).unwrap()
      }
    } catch (err) {
      console.error("Failed to save function:", err)
    }
  }, [isEditing, functionId, script, functionName, functionCategory, functionLanguage, updateFunction, createFunction])

  const handleSaveAndClose = useCallback(async () => {
    await handleSave()
    router.push("/settings/functions")
  }, [handleSave, router])

  const handleClose = () => {
    router.push("/settings/functions")
  }

  const insertSnippet = (snippet: string) => {
    setScript((prev) => prev + snippet)
  }

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  const handleRunConsole = () => {
    setShowConsole(true)
    setConsoleOutput(">> Function executed successfully.\n>> No output.")
  }

  // Line numbers for the editor
  const lineCount = script.split("\n").length

  const displayName = existingFunction?.displayName || functionName
  const apiName = (existingFunction?.name || functionName).toLowerCase().replace(/\s+/g, "_")
  const category = existingFunction?.category || functionCategory
  const returnType = "void"

  return (
    <div className="h-screen flex flex-col bg-[#1e1e2e] text-white overflow-hidden">
      {/* ── Top Bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#a6adc8] font-mono">FX</span>
          <span className="text-sm font-medium text-[#cdd6f4]">{displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#a6adc8] hover:text-white hover:bg-[#313244]"
            onClick={handleClose}
          >
            Close
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4]"
            disabled={isSaving}
            onClick={handleSaveAndClose}
          >
            Save and Close
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-[#89b4fa] hover:bg-[#74c7ec] text-[#1e1e2e]"
            disabled={isSaving}
            onClick={handleSave}
          >
            <Save className="h-3 w-3 mr-1" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* ── Main Content ───────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar: Snippets ───────────────────────────────────── */}
        <div className="w-48 bg-[#181825] border-r border-[#313244] overflow-y-auto shrink-0">
          {snippetCategories.map((cat) => (
            <div key={cat.title}>
              <button
                onClick={() => toggleSection(cat.title)}
                className="w-full flex items-center gap-1 px-3 py-2 text-[10px] font-semibold tracking-wider text-[#a6adc8] uppercase hover:bg-[#1e1e2e] transition-colors"
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
                      className="w-full text-left text-xs text-[#cdd6f4] py-1.5 px-6 hover:bg-[#313244] transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Center: Code Editor ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            {/* Line numbers */}
            <div className="w-10 bg-[#181825] border-r border-[#313244] overflow-hidden pt-3 shrink-0">
              <div className="font-mono text-[12px] leading-[20px] text-[#585b70] text-right pr-2 select-none">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i + 1}>{i + 1}</div>
                ))}
              </div>
            </div>
            {/* Editor */}
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              spellCheck={false}
              className="flex-1 bg-[#1e1e2e] text-[#cdd6f4] font-mono text-[13px] leading-[20px] p-3 resize-none outline-none border-none overflow-auto"
              style={{ tabSize: 4 }}
            />
          </div>

          {/* Console output */}
          {showConsole && (
            <div className="border-t border-[#313244] bg-[#11111b]">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#313244]">
                <span className="text-[10px] font-semibold tracking-wider text-[#a6adc8] uppercase">
                  Console
                </span>
                <button
                  onClick={() => setShowConsole(false)}
                  className="text-[#585b70] hover:text-[#a6adc8]"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <pre className="px-3 py-2 text-xs text-[#a6e3a1] font-mono h-24 overflow-auto">
                {consoleOutput || "No output."}
              </pre>
            </div>
          )}

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-t border-[#313244]">
            <div className="flex items-center gap-2">
              <button
                onClick={handleRunConsole}
                className="flex items-center gap-1 text-xs text-[#a6adc8] hover:text-white transition-colors"
              >
                <Terminal className="h-3.5 w-3.5" />
                Console
              </button>
              <button
                onClick={() => {
                  setShowConsole(true)
                  setConsoleOutput(">> Debug mode enabled.\n>> Set breakpoints in your code.")
                }}
                className="flex items-center gap-1 text-xs text-[#a6adc8] hover:text-white transition-colors"
              >
                <Bug className="h-3.5 w-3.5" />
                Debug
              </button>
            </div>
            <span className="text-[10px] text-[#585b70]">
              {functionLanguage} | Lines: {lineCount}
            </span>
          </div>
        </div>

        {/* ── Right Sidebar: Details ───────────────────────────────────── */}
        <div className="w-56 bg-[#181825] border-l border-[#313244] overflow-y-auto shrink-0 p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-[#cdd6f4] mb-3">{displayName}</p>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[10px] text-[#585b70] uppercase tracking-wider mb-1">API Name</p>
              <p className="text-xs text-[#a6adc8] font-mono break-all">{apiName}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#585b70] uppercase tracking-wider mb-1">Category</p>
              <p className="text-xs text-[#a6adc8]">{category}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#585b70] uppercase tracking-wider mb-1">Return</p>
              <p className="text-xs text-[#a6adc8] font-mono">{returnType}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#585b70] uppercase tracking-wider mb-1">Language</p>
              <p className="text-xs text-[#a6adc8]">{functionLanguage}</p>
            </div>
          </div>

          <div className="border-t border-[#313244] pt-4">
            <p className="text-[10px] text-[#585b70] uppercase tracking-wider mb-2">Commit Message</p>
            <Textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Describe your changes..."
              rows={3}
              className="resize-none text-xs bg-[#1e1e2e] border-[#313244] text-[#cdd6f4] placeholder:text-[#585b70]"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
