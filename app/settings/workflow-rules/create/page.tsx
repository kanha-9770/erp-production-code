"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useGetPermittedModulesQuery } from "@/lib/api/modules"
import { useGetFormDetailQuery } from "@/lib/api/forms"
import { useCreateWorkflowRuleMutation, useUpdateWorkflowRuleMutation, useGetWorkflowRulesQuery } from "@/lib/api/workflow-rules"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Clock, Pencil, Plus, X, Zap } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────

type ExecuteBasedOn = "" | "record-action" | "record-field"
type RecordAction = "" | "Create" | "Create or Edit" | "Edit" | "Delete"
type DateField = "" | "Created Time" | "Last Activity Time" | "Last Emailed Time" | "Unsubscribed Time"

interface ConditionRow {
  id: string
  field: string
  operator: string
  value: string
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CreateWorkflowRulePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const ruleId = searchParams.get("id") || ""
  const moduleName = searchParams.get("module") || ""
  const ruleName = searchParams.get("name") || ""
  const ruleDescription = searchParams.get("description") || ""
  const isEditing = !!ruleId

  // Step 1: WHEN
  const [step, setStep] = useState(1)
  const [editingWhen, setEditingWhen] = useState(false)
  const [executeBasedOn, setExecuteBasedOn] = useState<ExecuteBasedOn>("")
  const [recordAction, setRecordAction] = useState<RecordAction>("")
  const [dateField, setDateField] = useState<DateField>("")
  const [showDescription, setShowDescription] = useState(!!ruleDescription)

  // Step 2: CONDITION
  const [conditionDone, setConditionDone] = useState(false)
  const [conditionType, setConditionType] = useState<"all" | "matching">("matching")
  const [conditions, setConditions] = useState<ConditionRow[]>([
    { id: "1", field: "", operator: "", value: "" },
  ])

  // Step 3: ACTIONS
  const [activeAction, setActiveAction] = useState<"" | "instant" | "scheduled">("")
  const [selectedInstantActions, setSelectedInstantActions] = useState<string[]>([])
  const [scheduledExecute, setScheduledExecute] = useState("")
  const [scheduledUnit, setScheduledUnit] = useState("Hours")
  const [scheduledDone, setScheduledDone] = useState(false)

  const [createWorkflowRule, { isLoading: isCreating }] = useCreateWorkflowRuleMutation()
  const [updateWorkflowRule, { isLoading: isUpdating }] = useUpdateWorkflowRuleMutation()
  const isSaving = isCreating || isUpdating

  // Fetch existing rule data when editing
  const { data: rulesData } = useGetWorkflowRulesQuery(undefined, { skip: !isEditing })

  const existingRule = useMemo(() => {
    if (!isEditing || !rulesData?.data) return null
    return rulesData.data.find((r: any) => r.id === ruleId) || null
  }, [isEditing, rulesData, ruleId])

  // Populate form fields from existing rule
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!existingRule || initialized) return
    setExecuteBasedOn((existingRule.executeBasedOn || "") as ExecuteBasedOn)
    setRecordAction((existingRule.recordAction || "") as RecordAction)
    setDateField((existingRule.dateField || "") as DateField)
    setConditionType((existingRule.conditionType || "all") as "all" | "matching")
    if (existingRule.conditions && Array.isArray(existingRule.conditions) && existingRule.conditions.length > 0) {
      setConditions(
        existingRule.conditions.map((c: any, i: number) => ({
          id: String(i + 1),
          field: c.field || "",
          operator: c.operator || "",
          value: c.value || "",
        }))
      )
    }
    if (existingRule.instantActions && Array.isArray(existingRule.instantActions)) {
      setSelectedInstantActions(existingRule.instantActions as string[])
    }
    setScheduledExecute(existingRule.scheduledExecute || "")
    setScheduledUnit(existingRule.scheduledUnit || "Hours")
    if (existingRule.scheduledExecute) setScheduledDone(true)
    setShowDescription(!!existingRule.description)
    // Move to completed state
    setStep(2)
    setConditionDone(true)
    setInitialized(true)
  }, [existingRule, initialized])

  // Fetch module form fields dynamically
  const { data: modulesData } = useGetPermittedModulesQuery()

  const selectedModule = useMemo(() => {
    const mods = modulesData?.modules || []
    return mods.find((m: any) => (m.module_name || m.name) === moduleName)
  }, [modulesData, moduleName])

  const firstPublishedFormId = useMemo(() => {
    const forms = selectedModule?.forms || []
    const published = forms.find((f: any) => f.isPublished)
    return published?.id || forms[0]?.id || ""
  }, [selectedModule])

  const { data: formDetail } = useGetFormDetailQuery(firstPublishedFormId, {
    skip: !firstPublishedFormId,
  })

  const formFields = useMemo(() => {
    if (!formDetail?.data) return []
    const fields: { id: string; label: string }[] = []
    for (const section of formDetail.data.sections || []) {
      for (const f of section.fields || []) {
        fields.push({ id: f.id, label: f.label })
      }
    }
    return fields
  }, [formDetail])

  const canGoNext =
    executeBasedOn === "record-action"
      ? !!recordAction
      : executeBasedOn === "record-field"
        ? !!dateField
        : false

  const handleNext = () => {
    if (step === 1 && canGoNext) setStep(2)
  }

  const handleSave = async () => {
    const payload = {
      name: ruleName,
      description: ruleDescription || undefined,
      moduleName,
      executeBasedOn,
      recordAction: recordAction || undefined,
      dateField: dateField || undefined,
      conditionType,
      conditions:
        conditionType === "matching"
          ? conditions.filter((c) => c.field && c.operator).map(({ field, operator, value }) => ({ field, operator, value }))
          : undefined,
      instantActions: selectedInstantActions.length > 0 ? selectedInstantActions : undefined,
      scheduledExecute: scheduledExecute || undefined,
      scheduledUnit: scheduledExecute ? scheduledUnit : undefined,
    }
    try {
      if (isEditing) {
        await updateWorkflowRule({ id: ruleId, ...payload }).unwrap()
      } else {
        await createWorkflowRule(payload).unwrap()
      }
      router.push("/settings/workflow-rules")
    } catch (err) {
      console.error("Failed to save workflow rule:", err)
    }
  }

  // Condition helpers
  const addCondition = () => {
    setConditions((prev) => [
      ...prev,
      { id: Date.now().toString(), field: "", operator: "", value: "" },
    ])
  }

  const removeCondition = (id: string) => {
    setConditions((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== id)))
  }

  const updateCondition = (id: string, key: keyof ConditionRow, value: string) => {
    setConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [key]: value } : c))
    )
  }

  // Summary text for step 1
  const getTriggerSummary = () => {
    if (executeBasedOn === "record-action" && recordAction) {
      return (
        <>
          This rule will be executed when a record is <strong>{recordAction.toLowerCase()}d</strong>.
        </>
      )
    }
    if (executeBasedOn === "record-field" && dateField) {
      return (
        <>
          This rule will be executed based on <strong>{dateField}</strong> field.
        </>
      )
    }
    return null
  }

  const getConditionSummary = () => {
    if (conditionType === "all") {
      return (
        <>
          Apply to <strong>all {moduleName || "records"}</strong>.
        </>
      )
    }
    const filledConditions = conditions.filter((c) => c.field && c.operator)
    if (filledConditions.length === 0) {
      return (
        <>
          Apply to records <strong>matching certain conditions</strong>.
        </>
      )
    }
    return (
      <>
        Apply to records where{" "}
        {filledConditions.map((c, i) => (
          <span key={c.id}>
            {i > 0 && " and "}
            <strong>{c.field}</strong> {c.operator} {c.value ? `"${c.value}"` : ""}
          </span>
        ))}
        .
      </>
    )
  }

  const operators = ["is", "is not", "contains", "does not contain", "starts with", "ends with", "is empty", "is not empty"]

  return (
    <div className="min-h-screen bg-[#e6eaed] pb-14">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="border-b bg-background">
        <div className="px-4 sm:px-6 py-3">
          <button
            onClick={() => router.push("/settings/workflow-rules")}
            className="flex items-center gap-1.5 text-md text-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {ruleName}
          </button>

          <p className="text-[12px] text-foreground">@  {moduleName}</p>

          {showDescription ? (
            <p className="text-xs text-foreground mt-0.5">{ruleDescription}</p>
          ) : (
            <button
              onClick={() => setShowDescription(true)}
              className="text-[11px] text-primary hover:underline mt-0.5"
            >
              Add Description
            </button>
          )}
        </div>
      </div>

      {/* ── Visual Flow Editor ──────────────────────────────────────────── */}
      <div className="py-8 px-4 sm:px-8">
        {/* Each step is a row: circle on left, horizontal line, card on right */}

        {/* ── Step 1: WHEN ─────────────────────────────────────────────── */}
        <div className="flex items-start">
          {/* Left: circle column */}
          <div className="flex flex-col items-center shrink-0">
            <div className="w-14 h-14 rounded-full bg-indigo-800 flex items-center justify-center shadow-md">
              <span className="text-white font-semibold text-[11px] tracking-wide">WHEN</span>
            </div>
            {/* Vertical connector to next step */}
            {step >= 2 && <div className="w-px flex-1 min-h-[24px] bg-indigo-800" />}
          </div>

          {/* Horizontal connector */}
          <div className="w-8 h-px bg-indigo-800 mt-7 shrink-0" />

          {/* Right: card */}
          <div className="flex-1 max-w-sm bg-background border rounded-md shadow-sm">
            {step === 1 || editingWhen ? (
              <>
                <div className="px-3 py-2.5 border-b">
                  <p className="text-xs font-medium text-foreground">
                    Execute the workflow rule based on
                  </p>
                </div>

                <div className="px-3 py-3 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <Select
                      value={executeBasedOn}
                      onValueChange={(v) => {
                        setExecuteBasedOn(v as ExecuteBasedOn)
                        setRecordAction("")
                        setDateField("")
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="record-action" className="text-xs">Record Action</SelectItem>
                        <SelectItem value="record-field" className="text-xs">Date/Time field</SelectItem>
                      </SelectContent>
                    </Select>

                    {executeBasedOn === "record-action" && (
                      <Select
                        value={recordAction}
                        onValueChange={(v) => setRecordAction(v as RecordAction)}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Choose..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Create" className="text-xs">Create</SelectItem>
                          <SelectItem value="Create or Edit" className="text-xs">Create or Edit</SelectItem>
                          <SelectItem value="Edit" className="text-xs">Edit</SelectItem>
                          <SelectItem value="Delete" className="text-xs">Delete</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {executeBasedOn === "record-field" && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-foreground">
                        Record is of field (Date/DateTime Field)
                      </p>
                      <Select
                        value={dateField}
                        onValueChange={(v) => setDateField(v as DateField)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Choose..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Created Time" className="text-xs">Created Time</SelectItem>
                          <SelectItem value="Last Activity Time" className="text-xs">Last Activity Time</SelectItem>
                          <SelectItem value="Last Emailed Time" className="text-xs">Last Emailed Time</SelectItem>
                          <SelectItem value="Unsubscribed Time" className="text-xs">Unsubscribed Time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="px-3 py-2 border-t flex justify-end">
                  <Button size="sm" className="h-7 text-xs px-3" disabled={!canGoNext} onClick={() => { handleNext(); setEditingWhen(false) }}>
                    Next
                  </Button>
                </div>
              </>
            ) : (
              /* Summary with edit on hover */
              <div
                className="px-3 py-3 flex items-center justify-between group cursor-pointer hover:bg-muted/30 transition-colors rounded-md"
                onClick={() => setEditingWhen(true)}
              >
                <p className="text-xs text-foreground">{getTriggerSummary()}</p>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-foreground hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Step 2: CONDITION ────────────────────────────────────────── */}
        {step >= 2 && (
          <div className="flex items-start">
            {/* Left: rounded-square badge */}
            <div className="flex flex-col items-center shrink-0">
              <div className="w-14 h-14 rounded-lg bg-indigo-800 flex items-center justify-center shadow-md rotate-45">
                <span className="text-white font-semibold text-[9px] tracking-wide text-center leading-tight uppercase -rotate-[45deg]">
                  Condition
                </span>
              </div>
            </div>

            {/* Horizontal connector */}
            <div className="w-8 h-px bg-indigo-800 mt-7 shrink-0" />

            {/* Right: card */}
            <div className="flex-1 max-w-lg bg-background border rounded-md shadow-sm z-10">
              {!conditionDone ? (
                <>
                  <div className="px-3 py-2.5 border-b">
                    <p className="text-xs font-medium text-foreground">
                      Which {moduleName || "records"} would you like to apply the rule to?
                    </p>
                  </div>

                  <div className="px-3 py-3 space-y-3">
                    {/* Radio options in one row */}
                    <RadioGroup value={conditionType} onValueChange={(v) => setConditionType(v as "all" | "matching")} className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="all" id="cond-all" className="h-3.5 w-3.5" />
                        <Label htmlFor="cond-all" className="text-xs font-normal cursor-pointer">All {moduleName || "records"}</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="matching" id="cond-matching" className="h-3.5 w-3.5" />
                        <Label htmlFor="cond-matching" className="text-xs font-normal cursor-pointer">and if matching certain conditions</Label>
                      </div>
                    </RadioGroup>

                    {conditionType === "matching" && (
                      <div className="space-y-2">
                        {conditions.map((condition) => (
                          <div key={condition.id} className="flex items-center gap-1.5">
                            <Select
                              value={condition.field}
                              onValueChange={(v) => updateCondition(condition.id, "field", v)}
                            >
                              <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                                <SelectValue placeholder="Field" />
                              </SelectTrigger>
                              <SelectContent>
                                {formFields.length > 0 ? (
                                  formFields.map((f) => (
                                    <SelectItem key={f.id} value={f.label} className="text-xs">
                                      {f.label}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <div className="px-2 py-2 text-xs text-muted-foreground text-center">
                                    No fields found
                                  </div>
                                )}
                              </SelectContent>
                            </Select>

                            <Select
                              value={condition.operator}
                              onValueChange={(v) => updateCondition(condition.id, "operator", v)}
                            >
                              <SelectTrigger className="h-7 text-xs w-20 shrink-0">
                                <SelectValue placeholder="is" />
                              </SelectTrigger>
                              <SelectContent>
                                {operators.map((op) => (
                                  <SelectItem key={op} value={op} className="text-xs">{op}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Input
                              value={condition.value}
                              onChange={(e) => updateCondition(condition.id, "value", e.target.value)}
                              placeholder="Value"
                              className="h-7 text-xs flex-1 min-w-0"
                            />

                            {/* + button inline at end of row */}
                            <button
                              onClick={addCondition}
                              className="w-5 h-5 rounded-full border border-primary text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-colors shrink-0"
                            >
                              <Plus className="h-3 w-3" />
                            </button>

                            {conditions.length > 1 && (
                              <button
                                onClick={() => removeCondition(condition.id)}
                                className="text-foreground hover:text-destructive shrink-0"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="px-3 py-2 border-t flex justify-end">
                    <Button size="sm" className="h-7 text-xs px-3" onClick={() => setConditionDone(true)}>
                      Done
                    </Button>
                  </div>
                </>
              ) : (
                /* Summary with edit on hover */
                <div
                  className="px-3 py-3  flex items-center justify-between group cursor-pointer hover:bg-muted/30 transition-colors rounded-md"
                  onClick={() => setConditionDone(false)}
                >
                  <p className="text-xs text-foreground">{getConditionSummary()}</p>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity text-foreground hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Vertical connector from condition card to actions ──────── */}
        {conditionDone && (
          <div className="flex items-end">
            {/* Left: alignment column */}
            <div className="shrink-0 w-14" />
            {/* Spacer for horizontal connector width */}
            <div className="w-8 shrink-0" />
            {/* Vertical line under the condition card */}
            <div className="flex-1 flex justify-start pl-8">
              <div className="w-px h-12 -mt-[1rem] bg-indigo-800" />
            </div>
          </div>
        )}

        {/* ── Step 3: ACTIONS ─────────────────────────────────────────── */}
        {conditionDone && (
          <div className="flex items-start">
            {/* Left: empty column for alignment */}
            <div className="shrink-0 w-14" />

            {/* Spacer matching horizontal connector width */}
            <div className="w-8 shrink-0" />

            {/* Right: action cards */}
            <div className="flex-1 max-w-3xl space-y-3">
              {/* Two action card buttons side-by-side */}
              <div className="flex items-start">
                <div className="flex-1 relative">
                  <button
                    onClick={() => setActiveAction(activeAction === "instant" ? "" : "instant")}
                    className="w-full flex items-center gap-2.5 px-4 py-3 rounded-md border border-dashed border-indigo-800 bg-background shadow-sm text-xs font-medium text-foreground hover:border-solid transition-all"
                  >
                    <Zap className="h-4 w-4 text-foreground" />
                    Instant Actions
                  </button>

                  {activeAction === "instant" && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-background border rounded-md shadow-lg z-20">
                      {[
                        "Email Notification",
                        "Task",
                        "Field Update",
                        "Create Record",
                        "Webhook",
                        "Function",
                        "Custom Action",
                        "Slack",
                        "Cliq",
                      ].map((action) => (
                        <button
                          key={action}
                          className={`w-full text-left text-xs py-2 px-3 hover:bg-muted transition-colors first:rounded-t-md last:rounded-b-md ${selectedInstantActions.includes(action) ? "bg-muted font-medium text-primary" : "text-foreground"}`}
                          onClick={() => {
                            setSelectedInstantActions((prev) =>
                              prev.includes(action)
                                ? prev.filter((a) => a !== action)
                                : [...prev, action]
                            )
                          }}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Horizontal connector */}
                <div className="w-20 h-px bg-indigo-800 mt-5 shrink-0" />

                {/* Scheduled Actions — expands inline */}
                <div className="flex-1 rounded-md border border-dashed border-indigo-800 bg-background shadow-sm transition-all">
                  {/* Header / toggle */}
                  <button
                    onClick={() => {
                      if (scheduledDone) {
                        setScheduledDone(false)
                      } else {
                        setActiveAction(activeAction === "scheduled" ? "" : "scheduled")
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-medium text-foreground"
                  >
                    <Clock className="h-4 w-4 text-foreground" />
                    Scheduled Actions
                  </button>

                  {/* Expanded fields (inline) */}
                  {activeAction === "scheduled" && !scheduledDone && (
                    <>
                      <div className="px-4 pb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-foreground shrink-0">Execute</span>
                          <Input
                            type="number"
                            min="1"
                            value={scheduledExecute}
                            onChange={(e) => setScheduledExecute(e.target.value)}
                            placeholder="0"
                            className="h-7 text-xs w-16"
                          />
                          <Select value={scheduledUnit} onValueChange={setScheduledUnit}>
                            <SelectTrigger className="h-7 text-xs w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Minutes" className="text-xs">Minutes</SelectItem>
                              <SelectItem value="Hours" className="text-xs">Hours</SelectItem>
                              <SelectItem value="Days" className="text-xs">Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="px-4 pb-3 flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-3"
                          onClick={() => setActiveAction("")}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs px-3"
                          disabled={!scheduledExecute}
                          onClick={() => setScheduledDone(true)}
                        >
                          Save
                        </Button>
                      </div>
                    </>
                  )}

                  {/* Saved summary (inline) */}
                  {scheduledDone && (
                    <div className="px-4 pb-3">
                      <p className="text-xs text-foreground">
                        Execute after <strong>{scheduledExecute} {scheduledUnit.toLowerCase()}</strong>.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Footer Bar ──────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-12 right-0 border-t bg-background px-4 sm:px-6 py-2.5 flex items-center justify-start gap-3 z-10">
        <Button size="sm" className="h-7 text-xs px-4" disabled={step < 2 || isSaving} onClick={handleSave}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-4"
          onClick={() => router.push("/settings/workflow-rules")}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
