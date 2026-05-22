"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useGetPermittedModulesQuery } from "@/lib/api/modules"
import { useGetFormDetailQuery } from "@/lib/api/forms"
import {
  useCreateWorkflowRuleMutation,
  useUpdateWorkflowRuleMutation,
  useGetWorkflowRulesQuery,
  useRunWorkflowRuleMutation,
} from "@/lib/api/workflow-rules"
import { useGetFunctionsQuery, useCreateFunctionMutation, useGetBindingsTreeQuery } from "@/lib/api/functions"
import { useGetRolesQuery } from "@/lib/api/permissions"
import { useGetAdminUsersQuery } from "@/lib/api/users"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmailTemplatePicker } from "@/components/workflow/email-template-picker"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ArrowLeft, ArrowRight, Clock, Code2, Copy, FileText, HelpCircle, MinusCircle, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2, X, Zap } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { format } from "date-fns"
import {
  getStaticFieldsForModule,
  getStaticFormEntries,
  getStaticModules,
} from "@/lib/static-page-fields"

// ── Types ──────────────────────────────────────────────────────────────────

type ExecuteBasedOn = "" | "record-action" | "record-field" | "schedule"
type ScheduleCadence = "" | "daily" | "weekly" | "monthly" | "custom"
type RecordAction = "" | "Create" | "Create or Edit" | "Edit" | "Delete"
type DateField = "" | "Created Time" | "Last Activity Time" | "Last Emailed Time" | "Unsubscribed Time"

interface ConditionRow {
  id: string
  field: string
  operator: string
  value: string
}

interface ArgumentMapping {
  name: string
  value: string
}

interface WebhookHeader {
  key: string
  value: string
}

interface WebhookParam {
  name: string
  value: string
}

interface InstantAction {
  type: string
  // For type === "Function": which custom function to invoke
  functionId?: string
  functionName?: string
  // For type === "Function": per-argument value mapping
  argumentMappings?: ArgumentMapping[]
  // For type === "Field Update": which field to write and the literal value
  targetFieldId?: string
  targetValue?: string
  // For type === "Email Notification": addressing + template + sender config.
  // Stored inline on the rule (no separate Notifications entity yet) so each
  // rule carries its own email config. Name is user-facing label.
  emailName?: string
  /** Field on the record holding the recipient email. */
  emailToField?: string
  /** Comma- or semicolon-separated list of literal email addresses. */
  emailToStatic?: string
  /** Roles whose users will receive the email at their account email. */
  emailToRoleIds?: string[]
  emailSubject?: string
  emailBody?: string
  emailFrom?: string
  emailReplyTo?: string
  /**
   * SMTP credentials. Required so the email is authenticated as the picked
   * sender — without these the relaying SMTP server (e.g. Gmail) silently
   * rewrites the visible `From` to its env-level auth account. `emailSmtpUser`
   * defaults to `emailFrom` when absent.
   */
  emailSmtpUser?: string
  emailSmtpPass?: string
  /** Field IDs whose values get appended to the body. */
  emailFieldIds?: string[]
  emailSendAsMass?: boolean
  emailBestTime?: boolean
  // For type === "Webhook": HTTP callout config stored inline on the rule.
  // Name is the user-facing label shown in the actions list.
  webhookName?: string
  webhookDescription?: string
  webhookMethod?: string
  webhookUrl?: string
  webhookAuthType?: "General" | "Connection"
  webhookHeaders?: WebhookHeader[]
  webhookParams?: WebhookParam[]
  // For type === "System Notification": fans out an in-app notification to
  // every user assigned any of the chosen roles. Optional formId scopes the
  // rule down to a single form within the module; notifyFieldIds controls
  // which record fields are surfaced in the notification body.
  notifyName?: string
  notifyRoleIds?: string[]
  notifyFormId?: string
  notifyFieldIds?: string[]
  notifyTitle?: string
  notifyMessage?: string
  // For type === "Report Export": data source + period + recipients. Subject/
  // body / from / SMTP creds reuse the Email Notification fields above.
  reportName?: string
  reportDataSource?: string
  reportModuleName?: string
  reportPeriod?: string
  reportTimezone?: string
  reportFieldIds?: string[]
  reportFormIds?: string[]
  reportFilters?: Array<{ field: string; operator: string; value?: string }>
  reportSortBy?: string
  reportSortDir?: string
  reportFilenameTemplate?: string
  reportMaxRows?: number
  reportSheetName?: string
}

const ALL_INSTANT_ACTION_TYPES = [
  "Email Notification",
  "Report Export",
  "System Notification",
  "Task",
  "Field Update",
  "Create Record",
  "Webhook",
  "Function",
  "Custom Action",
  "Slack",
  "Cliq",
] as const

// Back-compat: existing rules may have stored a string[] of action names.
// Normalize to InstantAction[] on load.
function normalizeActions(raw: unknown): InstantAction[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry: any): InstantAction | null => {
      if (typeof entry === "string") return { type: entry }
      if (entry && typeof entry === "object" && typeof entry.type === "string") {
        const mappings: ArgumentMapping[] | undefined = Array.isArray(entry.argumentMappings)
          ? entry.argumentMappings
            .filter((m: any) => m && typeof m.name === "string")
            .map((m: any) => ({ name: m.name, value: typeof m.value === "string" ? m.value : "" }))
          : undefined
        return {
          type: entry.type,
          functionId: typeof entry.functionId === "string" ? entry.functionId : undefined,
          functionName: typeof entry.functionName === "string" ? entry.functionName : undefined,
          argumentMappings: mappings,
          targetFieldId: typeof entry.targetFieldId === "string" ? entry.targetFieldId : undefined,
          targetValue: typeof entry.targetValue === "string" ? entry.targetValue : undefined,
          emailName: typeof entry.emailName === "string" ? entry.emailName : undefined,
          emailToField: typeof entry.emailToField === "string" ? entry.emailToField : undefined,
          emailToStatic: typeof entry.emailToStatic === "string" ? entry.emailToStatic : undefined,
          emailToRoleIds: Array.isArray(entry.emailToRoleIds)
            ? entry.emailToRoleIds.filter((x: any) => typeof x === "string")
            : undefined,
          emailSubject: typeof entry.emailSubject === "string" ? entry.emailSubject : undefined,
          emailBody: typeof entry.emailBody === "string" ? entry.emailBody : undefined,
          emailFrom: typeof entry.emailFrom === "string" ? entry.emailFrom : undefined,
          emailReplyTo: typeof entry.emailReplyTo === "string" ? entry.emailReplyTo : undefined,
          emailSmtpUser: typeof entry.emailSmtpUser === "string" ? entry.emailSmtpUser : undefined,
          emailSmtpPass: typeof entry.emailSmtpPass === "string" ? entry.emailSmtpPass : undefined,
          emailFieldIds: Array.isArray(entry.emailFieldIds)
            ? entry.emailFieldIds.filter((x: any) => typeof x === "string")
            : undefined,
          emailSendAsMass: typeof entry.emailSendAsMass === "boolean" ? entry.emailSendAsMass : undefined,
          emailBestTime: typeof entry.emailBestTime === "boolean" ? entry.emailBestTime : undefined,
          webhookName: typeof entry.webhookName === "string" ? entry.webhookName : undefined,
          webhookDescription: typeof entry.webhookDescription === "string" ? entry.webhookDescription : undefined,
          webhookMethod: typeof entry.webhookMethod === "string" ? entry.webhookMethod : undefined,
          webhookUrl: typeof entry.webhookUrl === "string" ? entry.webhookUrl : undefined,
          webhookAuthType:
            entry.webhookAuthType === "Connection" || entry.webhookAuthType === "General"
              ? entry.webhookAuthType
              : undefined,
          webhookHeaders: Array.isArray(entry.webhookHeaders)
            ? entry.webhookHeaders
              .filter((h: any) => h && typeof h.key === "string")
              .map((h: any) => ({ key: h.key, value: typeof h.value === "string" ? h.value : "" }))
            : undefined,
          webhookParams: Array.isArray(entry.webhookParams)
            ? entry.webhookParams
              .filter((p: any) => p && typeof p.name === "string")
              .map((p: any) => ({ name: p.name, value: typeof p.value === "string" ? p.value : "" }))
            : undefined,
          notifyName: typeof entry.notifyName === "string" ? entry.notifyName : undefined,
          notifyRoleIds: Array.isArray(entry.notifyRoleIds)
            ? entry.notifyRoleIds.filter((x: any) => typeof x === "string")
            : undefined,
          notifyFormId: typeof entry.notifyFormId === "string" ? entry.notifyFormId : undefined,
          notifyFieldIds: Array.isArray(entry.notifyFieldIds)
            ? entry.notifyFieldIds.filter((x: any) => typeof x === "string")
            : undefined,
          notifyTitle: typeof entry.notifyTitle === "string" ? entry.notifyTitle : undefined,
          notifyMessage: typeof entry.notifyMessage === "string" ? entry.notifyMessage : undefined,
          reportName: typeof entry.reportName === "string" ? entry.reportName : undefined,
          reportDataSource: typeof entry.reportDataSource === "string" ? entry.reportDataSource : undefined,
          reportModuleName: typeof entry.reportModuleName === "string" ? entry.reportModuleName : undefined,
          reportPeriod: typeof entry.reportPeriod === "string" ? entry.reportPeriod : undefined,
          reportTimezone: typeof entry.reportTimezone === "string" ? entry.reportTimezone : undefined,
          reportFieldIds: Array.isArray(entry.reportFieldIds)
            ? entry.reportFieldIds.filter((x: any) => typeof x === "string")
            : undefined,
          reportFormIds: Array.isArray(entry.reportFormIds)
            ? entry.reportFormIds.filter((x: any) => typeof x === "string")
            : undefined,
          reportFilters: Array.isArray(entry.reportFilters)
            ? entry.reportFilters
                .filter((f: any) => f && typeof f.field === "string" && typeof f.operator === "string")
                .map((f: any) => ({
                  field: f.field,
                  operator: f.operator,
                  value: typeof f.value === "string" ? f.value : "",
                }))
            : undefined,
          reportSortBy: typeof entry.reportSortBy === "string" ? entry.reportSortBy : undefined,
          reportSortDir:
            entry.reportSortDir === "asc" || entry.reportSortDir === "desc"
              ? entry.reportSortDir
              : undefined,
          reportFilenameTemplate:
            typeof entry.reportFilenameTemplate === "string" ? entry.reportFilenameTemplate : undefined,
          reportMaxRows:
            typeof entry.reportMaxRows === "number" && Number.isFinite(entry.reportMaxRows)
              ? entry.reportMaxRows
              : undefined,
          reportSheetName:
            typeof entry.reportSheetName === "string" ? entry.reportSheetName : undefined,
        }
      }
      return null
    })
    .filter((a): a is InstantAction => a !== null)
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CreateWorkflowRulePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const ruleId = searchParams.get("id") || ""
  // Module is passed via ?module= but can also be picked inline (when users
  // land on /create without a module param). Keep it in state so the inline
  // picker can update it; initial value still comes from the URL.
  const [moduleName, setModuleName] = useState(searchParams.get("module") || "")
  // Name + description come from the URL (passed by the "New Workflow" dialog)
  // but we keep them in state so users who land on /create directly can still
  // edit them inline — no need to bounce back through the dialog.
  const [ruleName, setRuleName] = useState(searchParams.get("name") || "")
  const [ruleDescription, setRuleDescription] = useState(searchParams.get("description") || "")
  const isEditing = !!ruleId

  // Step 1: WHEN
  const [step, setStep] = useState(1)
  const [editingWhen, setEditingWhen] = useState(false)
  // Sensible defaults so Save is reachable as soon as the user has a name +
  // module — the two almost-always-intended values for a new rule. If they
  // want something else, Step 1's dropdowns still work. Editing an existing
  // rule overwrites these from the loaded record.
  const [executeBasedOn, setExecuteBasedOn] = useState<ExecuteBasedOn>("record-action")
  const [recordAction, setRecordAction] = useState<RecordAction>("Create or Edit")
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
  const [selectedInstantActions, setSelectedInstantActions] = useState<InstantAction[]>([])
  const [instantDone, setInstantDone] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"" | "saving" | "saved" | "error">("")
  const [saveError, setSaveError] = useState("")
  const [scheduledExecute, setScheduledExecute] = useState("")
  const [scheduledUnit, setScheduledUnit] = useState("Hours")
  const [scheduledDone, setScheduledDone] = useState(false)

  // Schedule trigger (executeBasedOn === "schedule") — independent of the
  // legacy "scheduledExecute/Unit" delay which only applies to date-field
  // triggers. The cron engine reads these.
  const [scheduleCadence, setScheduleCadence] = useState<ScheduleCadence>("daily")
  const [scheduleHour, setScheduleHour] = useState<number>(9)
  const [scheduleMinute, setScheduleMinute] = useState<number>(0)
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState<number>(1) // Monday
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState<number>(1)
  const [scheduleTimezone, setScheduleTimezone] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  )
  const [scheduleCron, setScheduleCron] = useState<string>("")
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(true)

  // Active / inactive toggle (existing rules only)
  const [isActive, setIsActive] = useState(true)
  const [togglingActive, setTogglingActive] = useState(false)

  const [createWorkflowRule, { isLoading: isCreating }] = useCreateWorkflowRuleMutation()
  const [updateWorkflowRule, { isLoading: isUpdating }] = useUpdateWorkflowRuleMutation()
  const [runWorkflowRule, { isLoading: isRunning }] = useRunWorkflowRuleMutation()
  const isSaving = isCreating || isUpdating

  // ── Test Run state ───────────────────────────────────────────────────────
  // Pops a side panel that fires the rule against /api/workflow-rules/:id/run
  // and renders the per-action results inline. The dev-server log lines that
  // would normally be the only signal are also pulled in via the response's
  // `results` array — same content, but visible in the UI.
  type TestLogEntry = {
    ts: string
    level: "info" | "success" | "warn" | "error"
    message: string
  }
  const [testPanelOpen, setTestPanelOpen] = useState(false)
  const [testLog, setTestLog] = useState<TestLogEntry[]>([])
  const [testResult, setTestResult] = useState<null | {
    success: boolean
    status: "success" | "partial" | "failed" | "skipped"
    results: Array<{ type: string; ok: boolean; detail?: any; error?: string }>
    error?: string
    elapsedMs: number
  }>(null)

  const appendTestLog = (level: TestLogEntry["level"], message: string) => {
    setTestLog((prev) => [
      ...prev,
      { ts: new Date().toISOString(), level, message },
    ])
  }

  const handleTestRun = async () => {
    setTestPanelOpen(true)
    setTestLog([])
    setTestResult(null)

    if (!canSaveRule) {
      appendTestLog("error", "Cannot test — fill required fields first.")
      return
    }

    const startedAt = Date.now()

    // Save first so /run reads the current configuration. We do this even
    // when isEditing because the user may have unsaved changes mid-edit.
    appendTestLog("info", isEditing ? "Saving latest changes..." : "Saving new rule before test run...")
    const saved = await persistRule({}, true)
    if (!saved) {
      appendTestLog("error", `Save failed: ${saveError || "see console for details"}`)
      return
    }
    appendTestLog("success", "Saved.")

    // After a fresh create the URL still says ?ruleId=... isn't set; to find
    // the new rule's id we re-query the list. For edits ruleId is already
    // known from the URL.
    let targetRuleId = ruleId
    if (!targetRuleId) {
      try {
        const refreshed = await fetch("/api/workflow-rules", { credentials: "include" }).then((r) => r.json())
        const match = (refreshed?.data || []).find(
          (r: any) =>
            r.name === ruleName.trim() && r.moduleName === moduleName,
        )
        if (match?.id) targetRuleId = match.id
      } catch {
        /* ignored — we'll error below */
      }
    }
    if (!targetRuleId) {
      appendTestLog("error", "Could not determine rule id after save — try Save then click Test again.")
      return
    }

    appendTestLog("info", `POST /api/workflow-rules/${targetRuleId}/run`)
    try {
      const res = await runWorkflowRule(targetRuleId).unwrap()
      const elapsed = Date.now() - startedAt
      const summary = `Status=${res.status}  actions=${res.results.length}  ok=${res.results.filter((r) => r.ok).length}/${res.results.length}`
      appendTestLog(
        res.status === "success" ? "success" : res.status === "partial" ? "warn" : "error",
        summary,
      )
      for (const r of res.results) {
        const detailStr = r.detail
          ? ` — ${typeof r.detail === "object" ? JSON.stringify(r.detail) : String(r.detail)}`
          : ""
        if (r.ok) {
          appendTestLog("success", `[${r.type}] ok${detailStr}`)
        } else {
          appendTestLog("error", `[${r.type}] failed: ${r.error || "(no error message)"}${detailStr}`)
        }
      }
      if (res.error) {
        appendTestLog("error", `top-level error: ${res.error}`)
      }
      setTestResult({ ...res, elapsedMs: elapsed })
    } catch (err: any) {
      const elapsed = Date.now() - startedAt
      const msg = err?.data?.error || err?.message || String(err)
      appendTestLog("error", `Request failed: ${msg}`)
      setTestResult({
        success: false,
        status: "failed",
        results: [],
        error: msg,
        elapsedMs: elapsed,
      })
    }
  }

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
    if (existingRule.instantActions) {
      const normalized = normalizeActions(existingRule.instantActions)
      setSelectedInstantActions(normalized)
      if (normalized.length > 0) setInstantDone(true)
    }
    setScheduledExecute(existingRule.scheduledExecute || "")
    setScheduledUnit(existingRule.scheduledUnit || "Hours")
    if (existingRule.scheduledExecute) setScheduledDone(true)
    // Schedule trigger fields
    if (existingRule.scheduleCadence) setScheduleCadence(existingRule.scheduleCadence as ScheduleCadence)
    if (typeof existingRule.scheduleHour === "number") setScheduleHour(existingRule.scheduleHour)
    if (typeof existingRule.scheduleMinute === "number") setScheduleMinute(existingRule.scheduleMinute)
    if (typeof existingRule.scheduleDayOfWeek === "number") setScheduleDayOfWeek(existingRule.scheduleDayOfWeek)
    if (typeof existingRule.scheduleDayOfMonth === "number") setScheduleDayOfMonth(existingRule.scheduleDayOfMonth)
    if (existingRule.scheduleTimezone) setScheduleTimezone(existingRule.scheduleTimezone)
    if (existingRule.scheduleCron) setScheduleCron(existingRule.scheduleCron)
    if (typeof existingRule.scheduleEnabled === "boolean") setScheduleEnabled(existingRule.scheduleEnabled)
    setShowDescription(!!existingRule.description)
    setIsActive(existingRule.active !== false)
    // Move to completed state
    setStep(2)
    setConditionDone(true)
    setInitialized(true)
  }, [existingRule, initialized])

  // Fetch module form fields dynamically
  const { data: modulesData } = useGetPermittedModulesQuery()
  // Functions list for the "Function" instant action picker
  const { data: functionsData, refetch: refetchFunctions } = useGetFunctionsQuery()
  const [createFunction, { isLoading: isCreatingFn }] = useCreateFunctionMutation()
  const availableFunctions = useMemo(() => {
    return (functionsData?.data || []) as Array<{
      id: string
      displayName: string
      name: string
      description: string | null
      language: string
      updatedAt: string
    }>
  }, [functionsData])
  const functionAction = useMemo(
    () => selectedInstantActions.find((a) => a.type === "Function"),
    [selectedInstantActions]
  )

  // ── Configure Function dialog state ─────────────────────────────────────
  type FnDialogStep = null | "chooser" | "associate" | "create"
  const [fnDialogStep, setFnDialogStep] = useState<FnDialogStep>(null)
  const [fnSearchQuery, setFnSearchQuery] = useState("")
  const [pendingFunctionId, setPendingFunctionId] = useState<string>("")

  // Inline create-form state
  const [newFnDisplayName, setNewFnDisplayName] = useState("")
  const [newFnName, setNewFnName] = useState("")
  const [newFnDescription, setNewFnDescription] = useState("")
  const [newFnLanguage, setNewFnLanguage] = useState("JavaScript")
  const [createFnError, setCreateFnError] = useState("")

  // View Function dialog (argument mapping)
  const [viewFnDialogOpen, setViewFnDialogOpen] = useState(false)
  const [fnArgMappings, setFnArgMappings] = useState<Array<{ id: string; name: string; value: string }>>([])

  // ── Report Export dialog state ──────────────────────────────────────────
  // Generates an XLSX from a data source (attendance | form-module) and emails
  // it to the configured recipients. All fields below live on a single
  // "Report Export" InstantAction entry, so editing/loading uses the same
  // index lookup as Email Notification.
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [reportFormName, setReportFormName] = useState("")
  const [reportFormDataSource, setReportFormDataSource] = useState<"attendance" | "form-module">("attendance")
  const [reportFormModuleName, setReportFormModuleName] = useState("")
  const [reportFormPeriod, setReportFormPeriod] = useState<"daily" | "weekly" | "monthly" | "all-time">("daily")
  const [reportFormTimezone, setReportFormTimezone] = useState("")
  const [reportFormToStatic, setReportFormToStatic] = useState("")
  const [reportFormSubject, setReportFormSubject] = useState("")
  const [reportFormBody, setReportFormBody] = useState("")
  // Empty array = "all fields" (the runner sends every column when fieldIds is
  // empty/undefined). The picker turns specific field ids on/off.
  const [reportFormFieldIds, setReportFormFieldIds] = useState<string[]>([])
  const [reportFieldSearch, setReportFieldSearch] = useState("")
  // Form allowlist within the chosen module — empty = include every form.
  const [reportSelectedFormIds, setReportSelectedFormIds] = useState<string[]>([])
  // Record-level filters (AND-combined). Each row is field/operator/value.
  const [reportFilters, setReportFilters] = useState<
    Array<{ id: string; field: string; operator: string; value: string }>
  >([])
  const [reportSortBy, setReportSortBy] = useState<string>("")
  const [reportSortDir, setReportSortDir] = useState<"asc" | "desc">("desc")
  const [reportFilenameTemplate, setReportFilenameTemplate] = useState<string>("")
  const [reportSheetName, setReportSheetName] = useState<string>("")
  const [reportMaxRows, setReportMaxRows] = useState<number>(5000)
  // Tab so the dialog stays compact even with all the new options.
  const [reportDialogTab, setReportDialogTab] = useState<"data" | "filters" | "delivery" | "advanced">("data")

  // Email template picker — shared between Email Notification + Report Export
  // dialogs. `templatePickerTarget` decides which form fields get filled when
  // the user picks a template.
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [templatePickerTarget, setTemplatePickerTarget] = useState<"report" | "email">("report")

  const reportAction = useMemo(
    () => selectedInstantActions.find((a) => a.type === "Report Export"),
    [selectedInstantActions],
  )

  const openReportDialog = () => {
    if (reportAction) {
      setReportFormName(reportAction.reportName || "")
      setReportFormDataSource((reportAction.reportDataSource as any) || "attendance")
      setReportFormModuleName(reportAction.reportModuleName || moduleName || "")
      setReportFormPeriod((reportAction.reportPeriod as any) || "daily")
      setReportFormTimezone(reportAction.reportTimezone || scheduleTimezone || "")
      setReportFormToStatic(reportAction.emailToStatic || "")
      setReportFormSubject(reportAction.emailSubject || "")
      setReportFormBody(reportAction.emailBody || "")
      setReportFormFieldIds(reportAction.reportFieldIds || [])
      setReportSelectedFormIds(reportAction.reportFormIds || [])
      setReportFilters(
        (reportAction.reportFilters || []).map((f, i) => ({
          id: `f-${i}-${Math.random().toString(36).slice(2, 6)}`,
          field: f.field,
          operator: f.operator,
          value: f.value || "",
        })),
      )
      setReportSortBy(reportAction.reportSortBy || "")
      setReportSortDir((reportAction.reportSortDir as any) || "desc")
      setReportFilenameTemplate(reportAction.reportFilenameTemplate || "")
      setReportSheetName(reportAction.reportSheetName || "")
      setReportMaxRows(reportAction.reportMaxRows ?? 5000)
    } else {
      setReportFormName("")
      setReportFormDataSource("attendance")
      setReportFormModuleName(moduleName || "")
      setReportFormPeriod("daily")
      setReportFormTimezone(scheduleTimezone || "")
      setReportFormToStatic("")
      setReportFormSubject("")
      setReportFormBody("")
      setReportFormFieldIds([])
      setReportSelectedFormIds([])
      setReportFilters([])
      setReportSortBy("")
      setReportSortDir("desc")
      setReportFilenameTemplate("")
      setReportSheetName("")
      setReportMaxRows(5000)
    }
    setReportFieldSearch("")
    setReportDialogTab("data")
    setReportDialogOpen(true)
  }

  const saveReportAction = async () => {
    if (!reportFormToStatic.trim()) return
    const cleanFilters = reportFilters
      .filter((f) => f.field && f.operator)
      .map((f) => ({ field: f.field, operator: f.operator, value: f.value || "" }))
    const newAction: InstantAction = {
      type: "Report Export",
      reportName: reportFormName.trim() || "Scheduled Report",
      reportDataSource: reportFormDataSource,
      reportModuleName:
        reportFormDataSource === "form-module"
          ? reportFormModuleName.trim() || moduleName
          : undefined,
      reportPeriod: reportFormPeriod,
      reportTimezone: reportFormTimezone.trim() || undefined,
      reportFieldIds: reportFormFieldIds.length > 0 ? reportFormFieldIds : undefined,
      reportFormIds: reportSelectedFormIds.length > 0 ? reportSelectedFormIds : undefined,
      reportFilters: cleanFilters.length > 0 ? cleanFilters : undefined,
      reportSortBy: reportSortBy.trim() || undefined,
      reportSortDir: reportSortBy.trim() ? reportSortDir : undefined,
      reportFilenameTemplate: reportFilenameTemplate.trim() || undefined,
      reportSheetName: reportSheetName.trim() || undefined,
      reportMaxRows: reportMaxRows && reportMaxRows !== 5000 ? reportMaxRows : undefined,
      emailToStatic: reportFormToStatic.trim(),
      emailSubject: reportFormSubject.trim() || undefined,
      emailBody: reportFormBody.trim() || undefined,
    }
    const filtered = selectedInstantActions.filter((a) => a.type !== "Report Export")
    const nextActions = [...filtered, newAction]
    setSelectedInstantActions(nextActions)
    setReportDialogOpen(false)
    if (isEditing) {
      await persistRule({ instantActions: nextActions }, true)
    }
  }

  // Recipient validation runs without `treeData` so it stays declared early.
  const reportRecipientStats = useMemo(() => {
    const raw = reportFormToStatic.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
    const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
    const valid = raw.filter(isEmail)
    const invalid = raw.filter((s) => !isEmail(s))
    return { valid, invalid, total: raw.length }
  }, [reportFormToStatic])

  const removeReportAction = async () => {
    const nextActions = selectedInstantActions.filter((a) => a.type !== "Report Export")
    setSelectedInstantActions(nextActions)
    if (isEditing) {
      await persistRule({ instantActions: nextActions }, true)
    }
  }

  // ── Email Notification dialog state ─────────────────────────────────────
  type EmailDialogStep = null | "associate" | "create"
  const [emailDialogStep, setEmailDialogStep] = useState<EmailDialogStep>(null)
  const [emailSearchQuery, setEmailSearchQuery] = useState("")
  const [emailFormName, setEmailFormName] = useState("")
  const [emailFormToField, setEmailFormToField] = useState("")
  // Comma/semicolon-separated list of static email addresses.
  const [emailFormToStatic, setEmailFormToStatic] = useState("")
  const [emailFormToRoleIds, setEmailFormToRoleIds] = useState<string[]>([])
  const [emailFormFieldIds, setEmailFormFieldIds] = useState<string[]>([])
  const [emailFormSubject, setEmailFormSubject] = useState("")
  const [emailFormBody, setEmailFormBody] = useState("")
  const [emailFormFrom, setEmailFormFrom] = useState("")
  const [emailFormReplyTo, setEmailFormReplyTo] = useState("")
  const [emailFormSendAsMass, setEmailFormSendAsMass] = useState(false)
  const [emailFormBestTime, setEmailFormBestTime] = useState(false)
  const [emailRoleSearch, setEmailRoleSearch] = useState("")
  const [emailFieldSearch, setEmailFieldSearch] = useState("")
  // SMTP credentials for the picked sender. SMTP user defaults to From, so
  // we don't surface a separate input unless the admin wants a different
  // auth username (rare). Password input is masked, with a "kept" sentinel
  // when editing an existing rule so the admin doesn't have to re-enter it.
  const [emailFormSmtpUser, setEmailFormSmtpUser] = useState("")
  const [emailFormSmtpPass, setEmailFormSmtpPass] = useState("")
  const [emailFormShowAdvanced, setEmailFormShowAdvanced] = useState(false)
  const [emailFormShowSmtpPass, setEmailFormShowSmtpPass] = useState(false)
  // Tracks whether the edited rule already has a stored SMTP password. We
  // never receive the plaintext from the API, so we keep an empty input as
  // "leave existing password unchanged" when this flag is true.
  const [emailFormSmtpPassPreserved, setEmailFormSmtpPassPreserved] = useState(false)
  // From-address combobox state — admin either picks an org user's email
  // from the dropdown or types one directly. The free-text wins; the
  // dropdown just helps them avoid typos.
  const [emailFromOpen, setEmailFromOpen] = useState(false)

  // Org users for the "From" picker. Reused for the dropdown; manual typing
  // remains the source of truth (so admins can use any sender they're
  // allowed to relay through).
  const { data: adminUsersResp } = useGetAdminUsersQuery()
  const orgUserOptions = useMemo(() => {
    const rows = adminUsersResp?.data || []
    return rows
      .filter((u) => !!u.email)
      .map((u) => ({
        id: u.id,
        email: u.email,
        name:
          (u.fullName && u.fullName.trim()) ||
          [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
          u.username ||
          u.email,
      }))
  }, [adminUsersResp])

  const emailAction = useMemo(
    () => selectedInstantActions.find((a) => a.type === "Email Notification"),
    [selectedInstantActions]
  )

  // ── Webhook dialog state ────────────────────────────────────────────────
  type WebhookDialogStep = null | "associate" | "create"
  const [webhookDialogStep, setWebhookDialogStep] = useState<WebhookDialogStep>(null)
  const [webhookFormName, setWebhookFormName] = useState("")
  const [webhookFormDescription, setWebhookFormDescription] = useState("")
  const [webhookFormMethod, setWebhookFormMethod] = useState("POST")
  const [webhookFormUrl, setWebhookFormUrl] = useState("")
  const [webhookFormAuthType, setWebhookFormAuthType] = useState<"General" | "Connection">("General")
  const [webhookFormHeaders, setWebhookFormHeaders] = useState<Array<{ id: string; key: string; value: string }>>([])
  const [webhookFormParams, setWebhookFormParams] = useState<Array<{ id: string; name: string; value: string }>>([])

  const webhookAction = useMemo(
    () => selectedInstantActions.find((a) => a.type === "Webhook"),
    [selectedInstantActions]
  )

  // ── System Notification dialog state ────────────────────────────────────
  // Mirrors the email-notification flow: an "associate" list (showing the one
  // configured notification, if any) and a "create" form. The form picks a
  // role multi-select, an optional form-within-the-module to scope by, the
  // record fields to surface in the body, and title/message templates.
  type NotifyDialogStep = null | "associate" | "create"
  const [notifyDialogStep, setNotifyDialogStep] = useState<NotifyDialogStep>(null)
  const [notifyFormName, setNotifyFormNameLocal] = useState("")
  const [notifyFormRoleIds, setNotifyFormRoleIds] = useState<string[]>([])
  const [notifyFormFormId, setNotifyFormFormId] = useState<string>("")
  const [notifyFormFieldIds, setNotifyFormFieldIds] = useState<string[]>([])
  const [notifyFormTitle, setNotifyFormTitle] = useState("")
  const [notifyFormMessage, setNotifyFormMessage] = useState("")
  const [notifyRoleSearch, setNotifyRoleSearch] = useState("")
  const [notifyFieldSearch, setNotifyFieldSearch] = useState("")

  const notifyAction = useMemo(
    () => selectedInstantActions.find((a) => a.type === "System Notification"),
    [selectedInstantActions]
  )

  // Roles for the org — used to pick recipients. RTK keeps this cached for
  // 5 min so opening the dialog repeatedly is cheap.
  const { data: rolesResp } = useGetRolesQuery()
  const availableRoles = useMemo(
    () => (rolesResp?.data || []).filter((r: any) => r.isActive !== false),
    [rolesResp]
  )

  const filteredFunctions = useMemo(() => {
    const q = fnSearchQuery.trim().toLowerCase()
    if (!q) return availableFunctions
    return availableFunctions.filter((f) => {
      const hay = `${f.displayName || ""} ${f.name || ""} ${f.description || ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [fnSearchQuery, availableFunctions])

  const openConfigureFunction = () => {
    setPendingFunctionId(functionAction?.functionId || "")
    setFnSearchQuery("")
    setCreateFnError("")
    // If they already picked one, jump straight to the associate list with it preselected.
    setFnDialogStep(functionAction?.functionId ? "associate" : "chooser")
  }

  const closeFnDialog = () => {
    setFnDialogStep(null)
    setCreateFnError("")
  }

  const associateFunction = async (id: string) => {
    const fn = availableFunctions.find((f) => f.id === id)
    if (!fn) return
    const nextActions = (() => {
      const filtered = selectedInstantActions.filter((a) => a.type !== "Function")
      filtered.push({
        type: "Function",
        functionId: fn.id,
        functionName: fn.displayName || fn.name,
      })
      return filtered
    })()
    setSelectedInstantActions(nextActions)
    setInstantDone(true)
    closeFnDialog()
    // Auto-persist when editing an already-saved rule so the attachment is durable.
    if (isEditing && canSaveRule) {
      await persistRule({ instantActions: nextActions }, true)
    }
  }

  const removeFunctionAction = async () => {
    const nextActions = selectedInstantActions.filter((a) => a.type !== "Function")
    setSelectedInstantActions(nextActions)
    closeFnDialog()
    if (isEditing && canSaveRule) {
      await persistRule({ instantActions: nextActions }, true)
    }
  }

  const openViewFunctionDialog = () => {
    const existing = functionAction?.argumentMappings || []
    setFnArgMappings(
      existing.length > 0
        ? existing.map((m, i) => ({ id: String(i), name: m.name, value: m.value }))
        : [{ id: "0", name: "", value: "" }]
    )
    setViewFnDialogOpen(true)
  }

  const updateArgMapping = (id: string, key: "name" | "value", v: string) => {
    setFnArgMappings((prev) => prev.map((m) => (m.id === id ? { ...m, [key]: v } : m)))
  }

  const addArgMapping = () => {
    setFnArgMappings((prev) => [...prev, { id: Date.now().toString(), name: "", value: "" }])
  }

  const removeArgMapping = (id: string) => {
    setFnArgMappings((prev) => (prev.length <= 1 ? prev : prev.filter((m) => m.id !== id)))
  }

  const saveArgMappings = async () => {
    const mappings = fnArgMappings
      .filter((m) => m.name.trim())
      .map(({ name, value }) => ({ name: name.trim(), value }))
    const nextActions = selectedInstantActions.map((a) =>
      a.type === "Function" ? { ...a, argumentMappings: mappings } : a
    )
    setSelectedInstantActions(nextActions)
    setViewFnDialogOpen(false)
    if (isEditing && canSaveRule) {
      await persistRule({ instantActions: nextActions }, true)
    }
  }

  // ── Email Notification handlers ─────────────────────────────────────────
  const resetEmailForm = () => {
    setEmailFormName("")
    setEmailFormToField("")
    setEmailFormToStatic("")
    setEmailFormToRoleIds([])
    setEmailFormFieldIds([])
    setEmailFormSubject("")
    setEmailFormBody("")
    setEmailFormFrom("")
    setEmailFormReplyTo("")
    setEmailFormSendAsMass(false)
    setEmailFormBestTime(false)
    setEmailRoleSearch("")
    setEmailFieldSearch("")
    setEmailFormSmtpUser("")
    setEmailFormSmtpPass("")
    setEmailFormShowSmtpPass(false)
    setEmailFormShowAdvanced(false)
    setEmailFormSmtpPassPreserved(false)
  }

  const loadEmailForm = (a: InstantAction | undefined) => {
    setEmailFormName(a?.emailName || "")
    setEmailFormToField(a?.emailToField || "")
    setEmailFormToStatic(a?.emailToStatic || "")
    setEmailFormToRoleIds(a?.emailToRoleIds || [])
    setEmailFormFieldIds(a?.emailFieldIds || [])
    setEmailFormSubject(a?.emailSubject || "")
    setEmailFormBody(a?.emailBody || "")
    setEmailFormFrom(a?.emailFrom || "")
    setEmailFormReplyTo(a?.emailReplyTo || "")
    setEmailFormSendAsMass(!!a?.emailSendAsMass)
    setEmailFormBestTime(!!a?.emailBestTime)
    setEmailRoleSearch("")
    setEmailFieldSearch("")
    setEmailFormSmtpUser(a?.emailSmtpUser || "")
    // GET /workflow-rules masks emailSmtpPass with a sentinel so we can
    // distinguish "no password set" (empty) from "password exists but
    // not exposed" (sentinel). Show a placeholder + leave the input
    // empty in the latter case.
    const hadStoredPass =
      typeof a?.emailSmtpPass === "string" &&
      a.emailSmtpPass.startsWith("__KEPT__")
    setEmailFormSmtpPass("")
    setEmailFormSmtpPassPreserved(hadStoredPass)
    setEmailFormShowSmtpPass(false)
    // Auto-expand SMTP section when editing an existing email notification
    // — admins editing in place want to see the picked sender's auth state.
    setEmailFormShowAdvanced(!!a?.emailFrom)
  }

  const toggleEmailRole = (id: string) => {
    setEmailFormToRoleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleEmailField = (id: string) => {
    setEmailFormFieldIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const openEmailDialog = () => {
    setEmailSearchQuery("")
    loadEmailForm(emailAction)
    setEmailDialogStep("associate")
  }

  const closeEmailDialog = () => setEmailDialogStep(null)

  const openNewEmailForm = () => {
    resetEmailForm()
    setEmailDialogStep("create")
  }

  const openEditEmailForm = () => {
    loadEmailForm(emailAction)
    setEmailDialogStep("create")
  }

  const saveEmailNotification = async () => {
    // Find the existing action so we can preserve a previously-saved SMTP
    // password when the admin leaves the input blank during edit. The GET
    // route masks the stored password with `__KEPT__…`, so we re-read the
    // raw current rule from the cache via selectedInstantActions.
    const existing = selectedInstantActions.find(
      (a) => a.type === "Email Notification"
    )
    const newPass = emailFormSmtpPass.trim()
    // Preserve old password when the admin didn't type a new one AND we
    // know one is on file (preserved sentinel from load). Pass the marker
    // through; the API's PUT/POST handler unwraps it back to the stored
    // ciphertext.
    const passToPersist = newPass
      ? newPass
      : emailFormSmtpPassPreserved && existing?.emailSmtpPass
        ? existing.emailSmtpPass
        : undefined

    const nextActions = (() => {
      const filtered = selectedInstantActions.filter((a) => a.type !== "Email Notification")
      filtered.push({
        type: "Email Notification",
        emailName: emailFormName.trim(),
        emailToField: emailFormToField || undefined,
        emailToStatic: emailFormToStatic.trim() || undefined,
        emailToRoleIds: emailFormToRoleIds.length > 0 ? emailFormToRoleIds : undefined,
        emailFieldIds: emailFormFieldIds.length > 0 ? emailFormFieldIds : undefined,
        emailSubject: emailFormSubject || undefined,
        emailBody: emailFormBody || undefined,
        emailFrom: emailFormFrom || undefined,
        emailReplyTo: emailFormReplyTo || undefined,
        emailSmtpUser: emailFormSmtpUser.trim() || undefined,
        emailSmtpPass: passToPersist,
        emailSendAsMass: emailFormSendAsMass || undefined,
        emailBestTime: emailFormBestTime || undefined,
      })
      return filtered
    })()
    setSelectedInstantActions(nextActions)
    setInstantDone(true)
    setActiveAction("")
    closeEmailDialog()
    if (isEditing && canSaveRule) {
      await persistRule({ instantActions: nextActions }, true)
    }
  }

  const removeEmailAction = async () => {
    const nextActions = selectedInstantActions.filter((a) => a.type !== "Email Notification")
    setSelectedInstantActions(nextActions)
    closeEmailDialog()
    if (isEditing && canSaveRule) {
      await persistRule({ instantActions: nextActions }, true)
    }
  }

  // ── Webhook handlers ────────────────────────────────────────────────────
  const resetWebhookForm = () => {
    setWebhookFormName("")
    setWebhookFormDescription("")
    setWebhookFormMethod("POST")
    setWebhookFormUrl("")
    setWebhookFormAuthType("General")
    setWebhookFormHeaders([])
    setWebhookFormParams([])
  }

  const loadWebhookForm = (a: InstantAction | undefined) => {
    setWebhookFormName(a?.webhookName || "")
    setWebhookFormDescription(a?.webhookDescription || "")
    setWebhookFormMethod(a?.webhookMethod || "POST")
    setWebhookFormUrl(a?.webhookUrl || "")
    setWebhookFormAuthType(a?.webhookAuthType || "General")
    setWebhookFormHeaders(
      (a?.webhookHeaders || []).map((h, i) => ({ id: String(i), key: h.key, value: h.value }))
    )
    setWebhookFormParams(
      (a?.webhookParams || []).map((p, i) => ({ id: String(i), name: p.name, value: p.value }))
    )
  }

  const openWebhookDialog = () => {
    loadWebhookForm(webhookAction)
    setWebhookDialogStep("associate")
  }

  const closeWebhookDialog = () => setWebhookDialogStep(null)

  const openNewWebhookForm = () => {
    resetWebhookForm()
    setWebhookDialogStep("create")
  }

  const openEditWebhookForm = () => {
    loadWebhookForm(webhookAction)
    setWebhookDialogStep("create")
  }

  const addWebhookParam = () => {
    setWebhookFormParams((prev) => [...prev, { id: Date.now().toString(), name: "", value: "" }])
  }

  const updateWebhookParam = (id: string, key: "name" | "value", v: string) => {
    setWebhookFormParams((prev) => prev.map((p) => (p.id === id ? { ...p, [key]: v } : p)))
  }

  const removeWebhookParam = (id: string) => {
    setWebhookFormParams((prev) => prev.filter((p) => p.id !== id))
  }

  const saveWebhook = async () => {
    const headers: WebhookHeader[] = webhookFormHeaders
      .filter((h) => h.key.trim())
      .map(({ key, value }) => ({ key: key.trim(), value }))
    const params: WebhookParam[] = webhookFormParams
      .filter((p) => p.name.trim())
      .map(({ name, value }) => ({ name: name.trim(), value }))
    const nextActions = (() => {
      const filtered = selectedInstantActions.filter((a) => a.type !== "Webhook")
      filtered.push({
        type: "Webhook",
        webhookName: webhookFormName.trim(),
        webhookDescription: webhookFormDescription.trim() || undefined,
        webhookMethod: webhookFormMethod || "POST",
        webhookUrl: webhookFormUrl.trim(),
        webhookAuthType: webhookFormAuthType,
        webhookHeaders: headers.length > 0 ? headers : undefined,
        webhookParams: params.length > 0 ? params : undefined,
      })
      return filtered
    })()
    setSelectedInstantActions(nextActions)
    setInstantDone(true)
    setActiveAction("")
    closeWebhookDialog()
    if (isEditing && canSaveRule) {
      await persistRule({ instantActions: nextActions }, true)
    }
  }

  const removeWebhookAction = async () => {
    const nextActions = selectedInstantActions.filter((a) => a.type !== "Webhook")
    setSelectedInstantActions(nextActions)
    closeWebhookDialog()
    if (isEditing && canSaveRule) {
      await persistRule({ instantActions: nextActions }, true)
    }
  }

  // ── System Notification handlers ────────────────────────────────────────
  const resetNotifyForm = () => {
    setNotifyFormNameLocal("")
    setNotifyFormRoleIds([])
    setNotifyFormFormId("")
    setNotifyFormFieldIds([])
    setNotifyFormTitle("")
    setNotifyFormMessage("")
    setNotifyRoleSearch("")
    setNotifyFieldSearch("")
  }

  const loadNotifyForm = (a: InstantAction | undefined) => {
    setNotifyFormNameLocal(a?.notifyName || "")
    setNotifyFormRoleIds(a?.notifyRoleIds || [])
    setNotifyFormFormId(a?.notifyFormId || "")
    setNotifyFormFieldIds(a?.notifyFieldIds || [])
    setNotifyFormTitle(a?.notifyTitle || "")
    setNotifyFormMessage(a?.notifyMessage || "")
    setNotifyRoleSearch("")
    setNotifyFieldSearch("")
  }

  const openNotifyDialog = () => {
    loadNotifyForm(notifyAction)
    setNotifyDialogStep(notifyAction?.notifyName ? "associate" : "create")
  }

  const closeNotifyDialog = () => setNotifyDialogStep(null)

  const openNewNotifyForm = () => {
    resetNotifyForm()
    setNotifyDialogStep("create")
  }

  const openEditNotifyForm = () => {
    loadNotifyForm(notifyAction)
    setNotifyDialogStep("create")
  }

  const toggleNotifyRole = (id: string) => {
    setNotifyFormRoleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleNotifyField = (id: string) => {
    setNotifyFormFieldIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const saveSystemNotification = async () => {
    const nextActions = (() => {
      const filtered = selectedInstantActions.filter((a) => a.type !== "System Notification")
      filtered.push({
        type: "System Notification",
        notifyName: notifyFormName.trim(),
        notifyRoleIds: notifyFormRoleIds.length > 0 ? notifyFormRoleIds : undefined,
        notifyFormId: notifyFormFormId || undefined,
        notifyFieldIds: notifyFormFieldIds.length > 0 ? notifyFormFieldIds : undefined,
        notifyTitle: notifyFormTitle || undefined,
        notifyMessage: notifyFormMessage || undefined,
      })
      return filtered
    })()
    setSelectedInstantActions(nextActions)
    setInstantDone(true)
    setActiveAction("")
    closeNotifyDialog()
    if (isEditing && canSaveRule) {
      await persistRule({ instantActions: nextActions }, true)
    }
  }

  const removeNotifyAction = async () => {
    const nextActions = selectedInstantActions.filter((a) => a.type !== "System Notification")
    setSelectedInstantActions(nextActions)
    closeNotifyDialog()
    if (isEditing && canSaveRule) {
      await persistRule({ instantActions: nextActions }, true)
    }
  }

  // Auto-derive Function Name from Display Name (snake-case, ASCII)
  useEffect(() => {
    if (fnDialogStep !== "create") return
    if (!newFnDisplayName) return
    const derived = newFnDisplayName
      .trim()
      .replace(/[^a-zA-Z0-9_\s]/g, "")
      .replace(/\s+/g, "_")
    setNewFnName((prev) => (prev ? prev : derived))
  }, [newFnDisplayName, fnDialogStep])

  const handleCreateFn = async () => {
    setCreateFnError("")
    const displayName = newFnDisplayName.trim()
    const name = newFnName.trim()
    if (!displayName) {
      setCreateFnError("Display Name is required")
      return
    }
    if (!name) {
      setCreateFnError("Function Name is required")
      return
    }
    try {
      const res = await createFunction({
        name,
        displayName,
        category: "Automation",
        language: newFnLanguage,
        description: newFnDescription.trim() || undefined,
      }).unwrap()
      const created = (res as any).data
      if (!created?.id) throw new Error("Create did not return an id")

      // Refresh list so new function appears immediately
      await refetchFunctions()

      // Auto-associate it with this rule
      const nextActions = (() => {
        const filtered = selectedInstantActions.filter((a) => a.type !== "Function")
        filtered.push({
          type: "Function",
          functionId: created.id,
          functionName: created.displayName || created.name,
        })
        return filtered
      })()
      setSelectedInstantActions(nextActions)
      setInstantDone(true)

      // Persist the rule's new attachment before navigating away so it
      // isn't lost when the user edits the function code. The dialog stays
      // open during this so the user doesn't see a flash of the rule page.
      if (canSaveRule) {
        await persistRule({ instantActions: nextActions }, true)
      }

      // Redirect directly to the function editor — skip the intermediate
      // dialog-close / form-reset since the component unmounts on navigate.
      const params = new URLSearchParams({
        id: created.id,
        name: created.displayName || created.name || "",
      })
      router.push(`/settings/functions/editor?${params.toString()}`)
    } catch (err: any) {
      setCreateFnError(err?.data?.error || err?.message || "Failed to create function")
    }
  }

  const toggleInstantAction = (type: string) => {
    if (type === "Function") {
      // Function uses the multi-step Configure dialog instead of a checkbox toggle.
      openConfigureFunction()
      return
    }
    if (type === "Email Notification") {
      // Email Notification uses the associate/create dialog — not a toggle.
      openEmailDialog()
      return
    }
    if (type === "Webhook") {
      // Webhook uses the associate/create dialog — not a toggle.
      openWebhookDialog()
      return
    }
    if (type === "System Notification") {
      // System Notification uses its own dialog — not a toggle.
      openNotifyDialog()
      return
    }
    if (type === "Report Export") {
      // Report Export uses its own dialog — not a toggle.
      openReportDialog()
      return
    }
    setSelectedInstantActions((prev) => {
      const exists = prev.some((a) => a.type === type)
      if (exists) return prev.filter((a) => a.type !== type)
      return [...prev, { type }]
    })
  }

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

  // ── Module-wide field list for the Field Update action picker ──
  // Uses the bindings tree endpoint which already flattens sections + subforms
  // from every form in the module and attaches stable API Names. This is
  // resilient: it works even if no form is published yet, if the module was
  // renamed, or if fields live in subforms only — all scenarios where the
  // original `formFields` (tied to first published form detail) returns [].
  const { data: treeData } = useGetBindingsTreeQuery()
  const treeModule = useMemo(() => {
    const mods = treeData?.data || []
    return (
      mods.find((m: any) => m.name === moduleName) ||
      mods.find((m: any) => (m.name || "").toLowerCase() === moduleName.toLowerCase())
    )
  }, [treeData, moduleName])

  // ── Module picker options (dynamic + static) ───────────────────────────
  // The bindings tree (`treeData`) only knows about form-builder modules.
  // Static, hand-coded pages (Employee Master, Job Application, Leads, …)
  // never appear there, so on their own the module dropdowns would hide
  // them. Merge in `getStaticModules()` and dedupe by name (case-insensitive)
  // so a static page that *also* has a dynamic form isn't listed twice. The
  // dynamic entry wins the dedupe because it carries the real module_id.
  const moduleSelectOptions = useMemo(() => {
    const out: Array<{ id: string; name: string }> = []
    const seen = new Set<string>()
    for (const m of (treeData?.data || []) as any[]) {
      const name = m.name || ""
      if (!name) continue
      const key = name.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ id: m.id, name })
    }
    for (const m of getStaticModules()) {
      const key = m.name.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ id: m.id, name: m.name })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }, [treeData])

  // Report Export module/forms/fields options — declared after `treeData`
  // so they don't trigger a TDZ error on render.
  const reportFormsInModule = useMemo(() => {
    const target = reportFormModuleName.trim() || moduleName
    if (!target) return [] as Array<{ id: string; name: string }>
    const mods = treeData?.data || []
    const mod =
      mods.find((m: any) => m.name === target) ||
      mods.find((m: any) => (m.name || "").toLowerCase() === target.toLowerCase())
    if (!mod) return []
    return ((mod as any).forms || []).map((f: any) => ({ id: f.id, name: f.name }))
  }, [treeData, reportFormModuleName, moduleName])

  const reportModuleOptions = useMemo(() => {
    const mods = treeData?.data || []
    return mods.map((m: any) => ({
      name: m.name,
      label: m.label || m.name,
    }))
  }, [treeData])

  const reportFieldOptions = useMemo(() => {
    const target = reportFormModuleName.trim() || moduleName
    if (!target) return [] as Array<{ id: string; label: string; apiName: string; formName: string }>
    const mods = treeData?.data || []
    const mod =
      mods.find((m: any) => m.name === target) ||
      mods.find((m: any) => (m.name || "").toLowerCase() === target.toLowerCase())
    if (!mod) return []
    const out: Array<{ id: string; label: string; apiName: string; formName: string }> = []
    for (const f of (mod as any).forms || []) {
      for (const fld of f.fields || []) {
        out.push({
          id: fld.id,
          label: fld.label,
          apiName: fld.apiName,
          formName: f.name,
        })
      }
    }
    return out
  }, [treeData, reportFormModuleName, moduleName])

  const moduleFields = useMemo(() => {
    const out: Array<{ id: string; label: string; formId: string; formName: string; apiName: string }> = []
    // Dynamic form-builder fields first so they show up before the static
    // ones — admins editing dynamic forms expect them to appear at the top.
    if (treeModule) {
      for (const f of (treeModule as any).forms || []) {
        for (const fld of f.fields || []) {
          out.push({ id: fld.id, label: fld.label, formId: f.id, formName: f.name, apiName: fld.apiName })
        }
      }
    }
    // Then static-page fields for this module (e.g. Employee Master). These
    // come from the registry in lib/static-page-fields.ts and let admins
    // wire workflow rules against pages that aren't form-builder based.
    for (const sf of getStaticFieldsForModule(moduleName)) {
      out.push({
        id: sf.id,
        label: sf.label,
        formId: sf.formId,
        formName: sf.formName,
        apiName: sf.apiName,
      })
    }
    return out
  }, [treeModule, moduleName])

  // Forms in the active module — sourced from the bindings tree so the
  // System Notification dialog's form picker lists every form (including
  // unpublished ones). The permitted-modules response only attaches forms
  // that are published, which is why the picker came up empty for users
  // configuring a notification before any form was published.
  // Static-page forms (e.g. Employee Master) are appended so admins on a
  // page that has no form-builder form yet can still scope a rule to it.
  const moduleForms = useMemo<Array<{ id: string; name: string; isPublished: boolean }>>(() => {
    const dynamic = treeModule
      ? ((treeModule as any).forms || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          isPublished: !!f.isPublished,
        }))
      : []
    return [...dynamic, ...getStaticFormEntries(moduleName)]
  }, [treeModule, moduleName])

  const scheduleIsValid =
    executeBasedOn === "schedule" &&
    !!scheduleCadence &&
    (scheduleCadence !== "custom" || !!scheduleCron.trim())

  const canGoNext =
    executeBasedOn === "record-action"
      ? !!recordAction
      : executeBasedOn === "record-field"
        ? !!dateField
        : executeBasedOn === "schedule"
          ? scheduleIsValid
          : false

  const handleNext = () => {
    if (step === 1 && canGoNext) setStep(2)
  }

  // Returns true on success. `overrides` lets callers (e.g. the function
  // dialog) auto-save with a freshly-chosen action without waiting for state.
  // `silent` skips the post-save redirect and is used by inline auto-saves.
  const persistRule = async (
    overrides: { instantActions?: InstantAction[] } = {},
    silent = false
  ): Promise<boolean> => {
    const effectiveActions = overrides.instantActions ?? selectedInstantActions
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
      // Always send the array (even empty) so the backend clears the field
      // instead of treating `undefined` as "skip update" — otherwise removing
      // the last action would leave the stale value on the server.
      instantActions: effectiveActions,
      scheduledExecute: scheduledExecute || undefined,
      scheduledUnit: scheduledExecute ? scheduledUnit : undefined,
      // Schedule trigger fields — sent only when this trigger type is active
      // so we don't accidentally clobber unrelated rules.
      ...(executeBasedOn === "schedule"
        ? {
            scheduleCadence,
            scheduleCron: scheduleCadence === "custom" ? scheduleCron.trim() : null,
            scheduleHour,
            scheduleMinute,
            scheduleDayOfWeek: scheduleCadence === "weekly" ? scheduleDayOfWeek : null,
            scheduleDayOfMonth: scheduleCadence === "monthly" ? scheduleDayOfMonth : null,
            scheduleTimezone,
            scheduleEnabled,
          }
        : {}),
    }
    try {
      setSaveStatus("saving")
      setSaveError("")
      if (isEditing) {
        await updateWorkflowRule({ id: ruleId, ...payload }).unwrap()
      } else {
        await createWorkflowRule(payload).unwrap()
      }
      setSaveStatus("saved")
      if (!silent) {
        router.push("/settings/workflow-rules")
      } else {
        // Brief "Saved" indicator
        setTimeout(() => setSaveStatus(""), 1500)
      }
      return true
    } catch (err: any) {
      console.error("Failed to save workflow rule:", err)
      setSaveStatus("error")
      setSaveError(err?.data?.error || err?.message || "Failed to save rule")
      return false
    }
  }

  const handleSave = () => persistRule()

  const toggleActive = async () => {
    if (!isEditing || togglingActive) return
    const next = !isActive
    try {
      setTogglingActive(true)
      await updateWorkflowRule({ id: ruleId, active: next }).unwrap()
      setIsActive(next)
    } catch (err) {
      console.error("Failed to toggle rule active state:", err)
    } finally {
      setTogglingActive(false)
    }
  }

  // Minimum required to persist a rule:
  //   name + module + (recordAction OR dateField). Wizard step doesn't gate it.
  const canSaveRule = Boolean(
    ruleName?.trim() &&
    moduleName &&
    executeBasedOn &&
    (executeBasedOn === "schedule"
      ? scheduleIsValid
      : recordAction || dateField),
  )

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
    if (executeBasedOn === "schedule" && scheduleIsValid) {
      const h12 = scheduleHour % 12 === 0 ? 12 : scheduleHour % 12
      const period = scheduleHour >= 12 ? "PM" : "AM"
      const time = `${h12}:${String(scheduleMinute).padStart(2, "0")} ${period}`
      const dowName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][scheduleDayOfWeek]
      let when = ""
      if (scheduleCadence === "daily") when = `every day at ${time}`
      else if (scheduleCadence === "weekly") when = `every ${dowName} at ${time}`
      else if (scheduleCadence === "monthly") when = `on day ${scheduleDayOfMonth} of every month at ${time}`
      else if (scheduleCadence === "custom") when = `on cron \`${scheduleCron}\``
      return (
        <>
          Runs <strong>{when}</strong> ({scheduleTimezone}).
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
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: "#e6eaed",
        backgroundImage:
          "radial-gradient(circle, rgba(71, 85, 105, 0.18) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
        backgroundPosition: "0 0",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="border-b bg-background sticky top-0 z-20">
        <div className="px-4 sm:px-6 py-3 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <button
              onClick={() => router.push("/settings/workflow-rules")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to workflow rules
            </button>

            {/* Inline editable basics. The Save button is only enabled when
                name + module + trigger are set — we surface those as plain
                inputs here so users can fix gaps without navigating away. */}
            <div className="space-y-1.5">
              <Input
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="Rule name (required)"
                className="h-8 text-sm font-medium border-transparent hover:border-border focus:border-border bg-transparent px-2"
              />
              <div className="flex items-center gap-1.5 px-2">
                <span className="text-[11px] text-muted-foreground shrink-0">@</span>
                <Select value={moduleName} onValueChange={(v) => setModuleName(v)}>
                  <SelectTrigger className="h-7 text-xs w-auto min-w-[160px] border-transparent hover:border-border bg-transparent">
                    <SelectValue placeholder="Pick a module…" />
                  </SelectTrigger>
                  <SelectContent>
                    {moduleSelectOptions.length === 0 ? (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                        No modules yet. Create one in Settings → Modules.
                      </div>
                    ) : (
                      moduleSelectOptions.map((m: any) => (
                        <SelectItem key={m.id} value={m.name} className="text-xs">
                          {m.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              {showDescription ? (
                <Input
                  value={ruleDescription}
                  onChange={(e) => setRuleDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="h-7 text-xs border-transparent hover:border-border focus:border-border bg-transparent px-2"
                />
              ) : (
                <button
                  onClick={() => setShowDescription(true)}
                  className="text-[11px] text-primary hover:underline px-2"
                >
                  Add Description
                </button>
              )}
            </div>
          </div>

          {/* Header controls — rule status, activate/deactivate, view usage, overflow menu */}
          <div className="flex items-center gap-2 shrink-0">
            {saveStatus === "saved" && (
              <span className="text-xs text-emerald-600">✓ Saved</span>
            )}
            {saveStatus === "saving" && (
              <span className="text-xs text-muted-foreground">Saving…</span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-destructive truncate max-w-xs" title={saveError}>
                {saveError || "Save failed"}
              </span>
            )}

            {isEditing && (
              <>
                <span className="text-xs text-foreground">
                  This rule is{" "}
                  <strong className={isActive ? "text-emerald-600" : "text-muted-foreground"}>
                    {isActive ? "active" : "inactive"}
                  </strong>
                  .
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 text-xs px-3 ${isActive ? "text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive" : "text-emerald-600 border-emerald-600/40 hover:bg-emerald-600/10 hover:text-emerald-600"}`}
                  disabled={togglingActive}
                  onClick={toggleActive}
                  title={isActive ? "Deactivate this rule" : "Activate this rule"}
                >
                  {togglingActive ? "…" : isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-3"
                  onClick={() => {
                    // TODO: open usage drawer / page
                  }}
                >
                  View Usage
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="More">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onClick={() => {
                        navigator.clipboard?.writeText(ruleId).catch(() => { })
                      }}
                      className="text-xs"
                    >
                      <Copy className="h-3.5 w-3.5 mr-2" />
                      Copy rule ID
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        // TODO: wire up rule delete via useDeleteWorkflowRuleMutation
                      }}
                      className="text-xs text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete rule
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Visual Flow Editor ──────────────────────────────────────────── */}
      <div className="flex-1 py-8 px-4 sm:px-8">
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
                        <SelectItem value="schedule" className="text-xs">Schedule (recurring)</SelectItem>
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

                  {executeBasedOn === "schedule" && (
                    <div className="space-y-2 border-t pt-2">
                      <div className="space-y-1">
                        <p className="text-[11px] text-foreground">Cadence</p>
                        <Select
                          value={scheduleCadence}
                          onValueChange={(v) => setScheduleCadence(v as ScheduleCadence)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Choose..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                            <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                            <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                            <SelectItem value="custom" className="text-xs">Custom (cron)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {scheduleCadence !== "custom" && (
                        <div className="space-y-1">
                          <p className="text-[11px] text-foreground">Time</p>
                          <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                            {/* 12-hour input (1-12). Stored as 24-hour internally. */}
                            <Input
                              type="number"
                              min={1}
                              max={12}
                              className="h-7 text-xs"
                              placeholder="hr"
                              value={(() => {
                                const h12 = scheduleHour % 12
                                return h12 === 0 ? 12 : h12
                              })()}
                              onChange={(e) => {
                                const raw = Number(e.target.value)
                                if (!Number.isFinite(raw)) return
                                const h12 = Math.max(1, Math.min(12, raw))
                                const isPM = scheduleHour >= 12
                                // Mirror the AM/PM-aware mapping in saveSchedule below.
                                const next =
                                  h12 === 12 ? (isPM ? 12 : 0) : isPM ? h12 + 12 : h12
                                setScheduleHour(next)
                              }}
                            />
                            <Input
                              type="number"
                              min={0}
                              max={59}
                              className="h-7 text-xs"
                              placeholder="min"
                              value={scheduleMinute}
                              onChange={(e) =>
                                setScheduleMinute(Math.max(0, Math.min(59, Number(e.target.value) || 0)))
                              }
                            />
                            <Select
                              value={scheduleHour >= 12 ? "PM" : "AM"}
                              onValueChange={(v) => {
                                const isPM = v === "PM"
                                const h12 = scheduleHour % 12 === 0 ? 12 : scheduleHour % 12
                                const next =
                                  h12 === 12 ? (isPM ? 12 : 0) : isPM ? h12 + 12 : h12
                                setScheduleHour(next)
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs w-16">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="AM" className="text-xs">AM</SelectItem>
                                <SelectItem value="PM" className="text-xs">PM</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Stored as {String(scheduleHour).padStart(2, "0")}:{String(scheduleMinute).padStart(2, "0")} (24-hour) in {scheduleTimezone || "your timezone"}.
                          </p>
                        </div>
                      )}

                      {scheduleCadence === "weekly" && (
                        <div className="space-y-1">
                          <p className="text-[11px] text-foreground">Day of week</p>
                          <Select
                            value={String(scheduleDayOfWeek)}
                            onValueChange={(v) => setScheduleDayOfWeek(Number(v))}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0" className="text-xs">Sunday</SelectItem>
                              <SelectItem value="1" className="text-xs">Monday</SelectItem>
                              <SelectItem value="2" className="text-xs">Tuesday</SelectItem>
                              <SelectItem value="3" className="text-xs">Wednesday</SelectItem>
                              <SelectItem value="4" className="text-xs">Thursday</SelectItem>
                              <SelectItem value="5" className="text-xs">Friday</SelectItem>
                              <SelectItem value="6" className="text-xs">Saturday</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {scheduleCadence === "monthly" && (
                        <div className="space-y-1">
                          <p className="text-[11px] text-foreground">Day of month (1-31)</p>
                          <Input
                            type="number"
                            min={1}
                            max={31}
                            className="h-7 text-xs"
                            value={scheduleDayOfMonth}
                            onChange={(e) => setScheduleDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                          />
                        </div>
                      )}

                      {scheduleCadence === "custom" && (
                        <div className="space-y-1">
                          <p className="text-[11px] text-foreground">Cron expression (5 fields: M H D M DOW)</p>
                          <Input
                            placeholder="0 9 * * 1-5"
                            className="h-7 text-xs font-mono"
                            value={scheduleCron}
                            onChange={(e) => setScheduleCron(e.target.value)}
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Example: <code>0 9 * * 1-5</code> = weekdays at 09:00.
                          </p>
                        </div>
                      )}

                      <div className="space-y-1">
                        <p className="text-[11px] text-foreground">Timezone (IANA)</p>
                        <Input
                          placeholder="Asia/Kolkata"
                          className="h-7 text-xs font-mono"
                          value={scheduleTimezone}
                          onChange={(e) => setScheduleTimezone(e.target.value)}
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="checkbox"
                          id="schedule-enabled"
                          checked={scheduleEnabled}
                          onChange={(e) => setScheduleEnabled(e.target.checked)}
                          className="h-3.5 w-3.5"
                        />
                        <Label htmlFor="schedule-enabled" className="text-xs font-normal cursor-pointer">
                          Schedule enabled
                        </Label>
                      </div>
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
                                {moduleFields.length > 0 ? (
                                  moduleFields.map((f) => (
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
                <div className="flex-1 rounded-md border border-dashed border-indigo-800 bg-background shadow-sm transition-all">
                  {/* Header / toggle — anchors the picker Popover */}
                  <Popover
                    open={activeAction === "instant" && !instantDone}
                    onOpenChange={(open) => {
                      if (open) {
                        setActiveAction("instant")
                        setInstantDone(false)
                      } else {
                        setActiveAction("")
                        if (selectedInstantActions.length === 0) setInstantDone(false)
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-medium text-foreground"
                      >
                        <Zap className="h-4 w-4 text-foreground" />
                        Instant Actions
                        {selectedInstantActions.length > 0 && (
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {selectedInstantActions.length} configured
                          </span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" sideOffset={6} className="p-0 w-64">
                      <div className="max-h-72 overflow-y-auto">
                        {ALL_INSTANT_ACTION_TYPES.map((action) => {
                          const isSelected = selectedInstantActions.some((a) => a.type === action)
                          const isFn = action === "Function"
                          const isEmail = action === "Email Notification"
                          const isWebhook = action === "Webhook"
                          const isNotify = action === "System Notification"
                          const label =
                            isFn && functionAction?.functionName
                              ? `Function: ${functionAction.functionName}`
                              : isEmail && emailAction?.emailName
                                ? `Email Notification: ${emailAction.emailName}`
                                : isWebhook && webhookAction?.webhookName
                                  ? `Webhook: ${webhookAction.webhookName}`
                                  : isNotify && notifyAction?.notifyName
                                    ? `System Notification: ${notifyAction.notifyName}`
                                    : action
                          return (
                            <button
                              key={action}
                              className={`w-full text-left text-xs py-2 px-3 hover:bg-muted transition-colors flex items-center justify-between gap-2 ${isSelected ? "bg-muted font-medium text-primary" : "text-foreground"}`}
                              onClick={() => toggleInstantAction(action)}
                            >
                              <span className="truncate">{label}</span>
                              {isFn ? (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {functionAction?.functionId ? "configured" : "configure ›"}
                                </span>
                              ) : isEmail ? (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {emailAction?.emailName ? "configured" : "configure ›"}
                                </span>
                              ) : isWebhook ? (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {webhookAction?.webhookName ? "configured" : "configure ›"}
                                </span>
                              ) : isNotify ? (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {notifyAction?.notifyName ? "configured" : "configure ›"}
                                </span>
                              ) : (
                                isSelected && (
                                  <span className="text-[10px] text-emerald-600 shrink-0">selected</span>
                                )
                              )}
                            </button>
                          )
                        })}
                      </div>
                      <div className="px-3 py-2 border-t flex justify-end gap-2 bg-muted/30">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-3"
                          onClick={() => {
                            setActiveAction("")
                            if (selectedInstantActions.length === 0) setInstantDone(false)
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs px-3"
                          disabled={selectedInstantActions.length === 0}
                          onClick={async () => {
                            setInstantDone(true)
                            setActiveAction("")
                            if (isEditing && canSaveRule) {
                              await persistRule({}, true)
                            }
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Saved summary — visible whenever any action is picked,
                      so the user can see current selections even while the
                      picker popover is open. */}
                  {selectedInstantActions.length > 0 && (
                    <div className="border-t">
                      <div className="px-4 py-3 space-y-3">
                        {selectedInstantActions.map((a) => {
                          if (a.type === "Email Notification") {
                            return (
                              <div
                                key={a.type}
                                className="group flex items-start justify-between gap-2"
                              >
                                <button
                                  type="button"
                                  onClick={openEditEmailForm}
                                  className="flex-1 min-w-0 text-left -mx-2 px-2 py-0.5 rounded hover:bg-muted/40 transition-colors"
                                  title="Edit email notification"
                                >
                                  <p className="text-xs font-medium text-foreground">Email Notification</p>
                                  <p
                                    className="text-xs mt-0.5 truncate text-muted-foreground"
                                    title={a.emailName || ""}
                                  >
                                    {a.emailName || "Unconfigured"}
                                  </p>
                                </button>
                                <button
                                  type="button"
                                  onClick={removeEmailAction}
                                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive mt-0.5"
                                  title="Remove Email Notification"
                                >
                                  <MinusCircle className="h-4 w-4" />
                                </button>
                              </div>
                            )
                          }
                          if (a.type === "Function") {
                            const fnName = a.functionName || "—"
                            const fnExists =
                              !a.functionId ||
                              availableFunctions.some((f) => f.id === a.functionId)
                            return (
                              <div
                                key={a.type}
                                className="group flex items-start justify-between gap-2"
                              >
                                <button
                                  type="button"
                                  onClick={openViewFunctionDialog}
                                  className="flex-1 min-w-0 text-left -mx-2 px-2 py-0.5 rounded hover:bg-muted/40 transition-colors"
                                  title={fnExists ? "View function" : "This function no longer exists — remove it"}
                                >
                                  <p className="text-xs font-medium text-foreground">Function</p>
                                  <p
                                    className={`text-xs mt-0.5 truncate ${fnExists ? "text-muted-foreground" : "text-destructive line-through"}`}
                                    title={fnName}
                                  >
                                    {fnName}
                                    {!fnExists && (
                                      <span className="ml-1.5 no-underline text-[10px] uppercase tracking-wider text-destructive">
                                        deleted
                                      </span>
                                    )}
                                  </p>
                                </button>
                                <button
                                  type="button"
                                  onClick={removeFunctionAction}
                                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive mt-0.5"
                                  title="Remove function"
                                >
                                  <MinusCircle className="h-4 w-4" />
                                </button>
                              </div>
                            )
                          }
                          if (a.type === "System Notification") {
                            const roleNames = (a.notifyRoleIds || [])
                              .map((id) => availableRoles.find((r: any) => r.id === id)?.name)
                              .filter(Boolean)
                              .join(", ")
                            return (
                              <div
                                key={a.type}
                                className="group flex items-start justify-between gap-2"
                              >
                                <button
                                  type="button"
                                  onClick={openEditNotifyForm}
                                  className="flex-1 min-w-0 text-left -mx-2 px-2 py-0.5 rounded hover:bg-muted/40 transition-colors"
                                  title="Edit system notification"
                                >
                                  <p className="text-xs font-medium text-foreground">System Notification</p>
                                  <p
                                    className="text-xs mt-0.5 truncate text-muted-foreground"
                                    title={a.notifyName || ""}
                                  >
                                    {a.notifyName || "Unconfigured"}
                                    {roleNames ? ` — ${roleNames}` : ""}
                                  </p>
                                </button>
                                <button
                                  type="button"
                                  onClick={removeNotifyAction}
                                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive mt-0.5"
                                  title="Remove System Notification"
                                >
                                  <MinusCircle className="h-4 w-4" />
                                </button>
                              </div>
                            )
                          }
                          if (a.type === "Webhook") {
                            return (
                              <div
                                key={a.type}
                                className="group flex items-start justify-between gap-2"
                              >
                                <button
                                  type="button"
                                  onClick={openEditWebhookForm}
                                  className="flex-1 min-w-0 text-left -mx-2 px-2 py-0.5 rounded hover:bg-muted/40 transition-colors"
                                  title="Edit webhook"
                                >
                                  <p className="text-xs font-medium text-foreground">Webhook</p>
                                  <p
                                    className="text-xs mt-0.5 truncate text-muted-foreground"
                                    title={a.webhookUrl || ""}
                                  >
                                    {a.webhookName || "Unconfigured"}
                                    {a.webhookUrl ? ` — ${a.webhookMethod || "POST"} ${a.webhookUrl}` : ""}
                                  </p>
                                </button>
                                <button
                                  type="button"
                                  onClick={removeWebhookAction}
                                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive mt-0.5"
                                  title="Remove Webhook"
                                >
                                  <MinusCircle className="h-4 w-4" />
                                </button>
                              </div>
                            )
                          }
                          if (a.type === "Field Update") {
                            return (
                              <div key={a.type} className="group space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-medium text-foreground">Field Update</p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedInstantActions((prev) =>
                                        prev.filter((x) => x.type !== "Field Update")
                                      )
                                    }
                                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                                    title="Remove Field Update"
                                  >
                                    <MinusCircle className="h-4 w-4" />
                                  </button>
                                </div>
                                {!moduleName && (
                                  <div className="space-y-1 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
                                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                      Pick a module first
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      Workflows are module-scoped. Choose which module this rule runs against.
                                    </p>
                                    <Select
                                      value={moduleName}
                                      onValueChange={(v) => setModuleName(v)}
                                    >
                                      <SelectTrigger className="h-8 text-xs mt-1">
                                        <SelectValue placeholder="Select a module…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {moduleSelectOptions.length === 0 ? (
                                          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                                            No modules yet. Create one in Settings → Modules.
                                          </div>
                                        ) : (
                                          moduleSelectOptions.map((m: any) => (
                                            <SelectItem key={m.id} value={m.name} className="text-xs">
                                              {m.name}
                                            </SelectItem>
                                          ))
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                  <Select
                                    value={a.targetFieldId || ""}
                                    onValueChange={(v) =>
                                      setSelectedInstantActions((prev) =>
                                        prev.map((x) =>
                                          x.type === "Field Update" ? { ...x, targetFieldId: v } : x
                                        )
                                      )
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Pick field…" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px]">
                                      {moduleFields.length === 0 ? (
                                        <div className="px-2 py-2 text-[11px] text-muted-foreground space-y-1">
                                          <p className="font-medium text-foreground">
                                            No fields available
                                          </p>
                                          <p>
                                            Module <span className="font-mono">{moduleName || "?"}</span>{" "}
                                            has no forms with fields. Create a form, add a field, then come back.
                                          </p>
                                        </div>
                                      ) : (
                                        moduleFields.map((f) => (
                                          <SelectItem key={f.id} value={f.id} className="text-xs">
                                            <div className="flex items-center justify-between gap-2 w-full">
                                              <span className="truncate">{f.label}</span>
                                              <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                                                {f.apiName} · {f.formName}
                                              </span>
                                            </div>
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    value={a.targetValue || ""}
                                    onChange={(e) =>
                                      setSelectedInstantActions((prev) =>
                                        prev.map((x) =>
                                          x.type === "Field Update"
                                            ? { ...x, targetValue: e.target.value }
                                            : x
                                        )
                                      )
                                    }
                                    placeholder="Value to write"
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                  Fires on record {recordAction || "Create/Edit"}. Overwrites the
                                  field with this value.
                                </p>
                              </div>
                            )
                          }

                          return (
                            <div
                              key={a.type}
                              className="group flex items-start justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground">{a.type}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setInstantDone(false)
                                  setActiveAction("instant")
                                }}
                                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                title="Edit instant actions"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                      <button
                        onClick={() => {
                          setInstantDone(false)
                          setActiveAction("instant")
                        }}
                        className="w-full border-t bg-primary/5 hover:bg-primary/10 transition-colors text-xs font-medium text-primary px-4 py-2.5 text-left flex items-center gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Action
                      </button>
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
      <div className="sticky bottom-0 left-0 right-0 border-t bg-background px-4 sm:px-6 py-2.5 flex items-center justify-start gap-3 z-30 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <Button
          size="sm"
          className="h-8 text-xs px-5 font-medium"
          disabled={!canSaveRule || isSaving || saveStatus === "saving"}
          onClick={handleSave}
          title={!canSaveRule ? "Pick a When trigger before saving" : "Save rule"}
        >
          {isSaving || saveStatus === "saving" ? "Saving..." : "Save"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs px-4 gap-1.5"
          disabled={!canSaveRule || isRunning || isSaving}
          onClick={handleTestRun}
          title={
            !canSaveRule
              ? "Fill required fields before testing"
              : "Save and run this rule once — actions WILL fire (emails sent, notifications posted)"
          }
        >
          <Zap className="h-3.5 w-3.5" />
          {isRunning ? "Testing..." : "Test Rule"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs px-4"
          onClick={() => router.push("/settings/workflow-rules")}
        >
          Cancel
        </Button>
        {saveStatus === "saved" && (
          <span className="text-xs text-emerald-600 ml-2">✓ Saved</span>
        )}
        {saveStatus === "error" && (
          <span className="text-xs text-destructive ml-2 truncate max-w-md" title={saveError}>
            ✗ {saveError || "Save failed"}
          </span>
        )}
        {!canSaveRule && (
          <span className="text-[11px] text-muted-foreground ml-auto mr-4">
            {!ruleName.trim()
              ? "Name the rule to enable Save"
              : !moduleName
              ? "Pick a module to enable Save"
              : !executeBasedOn
              ? "Pick a When trigger to enable Save"
              : !(recordAction || dateField)
              ? "Pick a record action or date field to enable Save"
              : "Fill required fields to enable Save"}
          </span>
        )}
      </div>

      {/* ── Configure Function Dialog (Zoho-style multi-step) ─────────── */}
      <Dialog open={fnDialogStep !== null} onOpenChange={(open) => !open && closeFnDialog()}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          {/* ── Step: Chooser ─────────────────────────────────────────── */}
          {fnDialogStep === "chooser" && (
            <>
              <DialogHeader className="px-6 pt-6 pb-2">
                <DialogTitle className="text-lg">Configure Function</DialogTitle>
                <DialogDescription className="text-xs">
                  Configure functions through one of the following methods.
                </DialogDescription>
              </DialogHeader>
              <div className="px-6 py-4 space-y-3">
                <button
                  className="w-full flex items-start gap-4 p-4 rounded-md border hover:border-primary hover:bg-muted/40 transition-colors text-left opacity-60 cursor-not-allowed"
                  disabled
                  title="Gallery is coming soon"
                >
                  <div className="h-10 w-10 rounded-md border flex items-center justify-center shrink-0 bg-muted/40">
                    <Sparkles className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Gallery</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      View pre-made functions to learn how they're made or apply them to your own workflow rules.
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-amber-600 mt-1">Coming soon</p>
                  </div>
                </button>

                <button
                  className="w-full flex items-start gap-4 p-4 rounded-md border hover:border-primary hover:bg-muted/40 transition-colors text-left"
                  onClick={() => {
                    setFnSearchQuery("")
                    setPendingFunctionId(functionAction?.functionId || "")
                    setFnDialogStep("associate")
                  }}
                >
                  <div className="h-10 w-10 rounded-md border flex items-center justify-center shrink-0 bg-muted/40">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Functions</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Functions created by users in your organization.
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground self-center shrink-0" />
                </button>

                <button
                  className="w-full flex items-start gap-4 p-4 rounded-md border hover:border-primary hover:bg-muted/40 transition-colors text-left"
                  onClick={() => {
                    setNewFnDisplayName("")
                    setNewFnName("")
                    setNewFnDescription("")
                    setNewFnLanguage("JavaScript")
                    setCreateFnError("")
                    setFnDialogStep("create")
                  }}
                >
                  <div className="h-10 w-10 rounded-md border flex items-center justify-center shrink-0 bg-muted/40">
                    <Code2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Write your own</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Create your own functions.
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground self-center shrink-0" />
                </button>
              </div>
              <DialogFooter className="border-t px-6 py-3">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeFnDialog}>
                  Cancel
                </Button>
                {functionAction?.functionId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    onClick={removeFunctionAction}
                  >
                    Remove function
                  </Button>
                )}
              </DialogFooter>
            </>
          )}

          {/* ── Step: Associate existing function ─────────────────────── */}
          {fnDialogStep === "associate" && (
            <>
              <DialogHeader className="px-6 pt-6 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <DialogTitle className="text-base">
                      Functions{moduleName ? ` — ${moduleName}` : ""}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      Select an existing function to attach to this rule.
                    </DialogDescription>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    onClick={() => setFnDialogStep("chooser")}
                  >
                    Configure Function
                  </Button>
                </div>
              </DialogHeader>

              <div className="px-6 pb-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={fnSearchQuery}
                    onChange={(e) => setFnSearchQuery(e.target.value)}
                    placeholder="Search"
                    className="h-8 text-xs pl-8"
                  />
                </div>
              </div>

              <div className="border-t border-b max-h-80 overflow-y-auto">
                {filteredFunctions.length === 0 ? (
                  <div className="px-6 py-12 text-center text-xs text-muted-foreground">
                    {availableFunctions.length === 0
                      ? 'No functions yet. Click "Configure Function" → "Write your own" to create one.'
                      : "No functions match your search."}
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-6 py-2 font-medium w-6"></th>
                        <th className="px-2 py-2 font-medium">Name</th>
                        <th className="px-2 py-2 font-medium">Description</th>
                        <th className="px-2 py-2 font-medium">Language</th>
                        <th className="px-2 py-2 font-medium">Modified On</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFunctions.map((fn) => {
                        const checked = pendingFunctionId === fn.id
                        return (
                          <tr
                            key={fn.id}
                            onClick={() => setPendingFunctionId(fn.id)}
                            className={`cursor-pointer hover:bg-muted/40 transition-colors ${checked ? "bg-primary/5" : ""}`}
                          >
                            <td className="px-6 py-2.5">
                              <input
                                type="radio"
                                name="fn-pick"
                                checked={checked}
                                onChange={() => setPendingFunctionId(fn.id)}
                                className="h-3.5 w-3.5 cursor-pointer"
                              />
                            </td>
                            <td className="px-2 py-2.5 font-medium text-foreground truncate max-w-[180px]">
                              {fn.displayName || fn.name}
                            </td>
                            <td className="px-2 py-2.5 text-muted-foreground truncate max-w-[220px]">
                              {fn.description || "—"}
                            </td>
                            <td className="px-2 py-2.5 text-muted-foreground">{fn.language}</td>
                            <td className="px-2 py-2.5 text-muted-foreground whitespace-nowrap">
                              {fn.updatedAt ? format(new Date(fn.updatedAt), "dd/MM/yyyy") : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <DialogFooter className="px-6 py-3 gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeFnDialog}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!pendingFunctionId}
                  onClick={() => associateFunction(pendingFunctionId)}
                >
                  Associate
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Step: Create (Write your own) ─────────────────────────── */}
          {fnDialogStep === "create" && (
            <>
              <DialogHeader className="px-6 pt-6 pb-2">
                <DialogTitle className="text-lg">Create Function</DialogTitle>
                <DialogDescription className="text-xs">
                  Defines a new automation function. You can edit its script later in Settings → Functions.
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                  <Label htmlFor="fn-display-name" className="text-xs text-right">Display Name</Label>
                  <Input
                    id="fn-display-name"
                    value={newFnDisplayName}
                    onChange={(e) => setNewFnDisplayName(e.target.value)}
                    placeholder="e.g. Send Welcome Email"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                  <Label htmlFor="fn-name" className="text-xs text-right">Function Name</Label>
                  <Input
                    id="fn-name"
                    value={newFnName}
                    onChange={(e) => setNewFnName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                    placeholder="e.g. send_welcome_email"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="grid grid-cols-[110px_1fr] items-start gap-3">
                  <Label htmlFor="fn-desc" className="text-xs text-right pt-2">Description</Label>
                  <Textarea
                    id="fn-desc"
                    value={newFnDescription}
                    onChange={(e) => setNewFnDescription(e.target.value)}
                    placeholder="Optional"
                    rows={3}
                    className="text-xs resize-none"
                  />
                </div>
                <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                  <Label htmlFor="fn-lang" className="text-xs text-right">Language</Label>
                  <Select value={newFnLanguage} onValueChange={setNewFnLanguage}>
                    <SelectTrigger id="fn-lang" className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="JavaScript" className="text-xs">JavaScript (executable)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {createFnError && (
                  <p className="text-[11px] text-destructive ml-[122px]">{createFnError}</p>
                )}
              </div>

              <DialogFooter className="border-t px-6 py-3 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs mr-auto"
                  onClick={() => setFnDialogStep("chooser")}
                >
                  ← Back
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeFnDialog}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={isCreatingFn || !newFnDisplayName.trim() || !newFnName.trim()}
                  onClick={handleCreateFn}
                >
                  {isCreatingFn ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── View Function Dialog (argument mapping) ───────────────────── */}
      <Dialog open={viewFnDialogOpen} onOpenChange={setViewFnDialogOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg">View Function</DialogTitle>
                <button
                  type="button"
                  onClick={() => {
                    if (!functionAction?.functionId) return
                    setViewFnDialogOpen(false)
                    const params = new URLSearchParams({
                      id: functionAction.functionId,
                      name: functionAction.functionName || "",
                    })
                    router.push(`/settings/functions/editor?${params.toString()}`)
                  }}
                  disabled={!functionAction?.functionId}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                  title="Edit function code"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                title="Help"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                Help
              </button>
            </div>
          </DialogHeader>

          <div className="px-6 pb-4 space-y-2">
            <div className="grid grid-cols-[160px_1fr] items-center gap-2">
              <span className="text-xs text-muted-foreground">Function Name</span>
              <span className="text-xs text-foreground">{functionAction?.functionName || "—"}</span>
            </div>
            <div className="grid grid-cols-[160px_1fr] items-center gap-2">
              <span className="text-xs text-muted-foreground">Module associated</span>
              <span className="text-xs text-foreground">{moduleName || "—"}</span>
            </div>
          </div>

          <div className="px-6 pb-2">
            <h3 className="text-sm font-semibold text-foreground">Argument Mapping</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Map the arguments of this function with the appropriate fields. You can also apply custom values to these arguments.
            </p>
          </div>

          <div className="px-6 pb-4">
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium w-1/3">Name</th>
                    <th className="px-3 py-2 font-medium">Value</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {fnArgMappings.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="px-3 py-2 align-middle">
                        <Input
                          value={m.name}
                          onChange={(e) => updateArgMapping(m.id, "name", e.target.value)}
                          placeholder="arg_name"
                          className="h-7 text-xs font-mono"
                        />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <Input
                          value={m.value}
                          onChange={(e) => updateArgMapping(m.id, "value", e.target.value)}
                          placeholder="Field or custom value"
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="px-1 py-2 align-middle text-right">
                        {fnArgMappings.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeArgMapping(m.id)}
                            className="text-muted-foreground hover:text-destructive"
                            title="Remove argument"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-[11px] text-muted-foreground">Type # to choose argument value</p>
              <button
                type="button"
                onClick={addArgMapping}
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Add argument
              </button>
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setViewFnDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={saveArgMappings}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Email Notification Dialog (Zoho-style associate + create) ─── */}
      <Dialog open={emailDialogStep !== null} onOpenChange={(open) => !open && closeEmailDialog()}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          {/* ── Step: Associate (list + search + New button) ──────────── */}
          {emailDialogStep === "associate" && (
            <>
              <DialogHeader className="px-6 pt-6 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <DialogTitle className="text-base">
                      Email Notification{moduleName ? ` - ${moduleName}` : ""}
                    </DialogTitle>
                  </div>
                  <Button size="sm" className="h-8 text-xs shrink-0" onClick={openNewEmailForm}>
                    New Email Notification
                  </Button>
                </div>
              </DialogHeader>

              <div className="px-6 pb-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={emailSearchQuery}
                    onChange={(e) => setEmailSearchQuery(e.target.value)}
                    placeholder="Search"
                    className="h-8 text-xs pl-8"
                  />
                </div>
              </div>

              <div className="border-t border-b max-h-80 overflow-y-auto">
                {emailAction?.emailName &&
                (!emailSearchQuery.trim() ||
                  emailAction.emailName.toLowerCase().includes(emailSearchQuery.trim().toLowerCase())) ? (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-6 py-2 font-medium">Name</th>
                        <th className="px-2 py-2 font-medium">Email Template</th>
                        <th className="px-2 py-2 font-medium">Modified On</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        onClick={openEditEmailForm}
                        className="cursor-pointer hover:bg-muted/40 transition-colors bg-primary/5"
                      >
                        <td className="px-6 py-2.5 font-medium text-foreground truncate max-w-[180px]">
                          {emailAction.emailName}
                        </td>
                        <td className="px-2 py-2.5 text-muted-foreground truncate max-w-[220px]">
                          {emailAction.emailSubject || "—"}
                        </td>
                        <td className="px-2 py-2.5 text-muted-foreground whitespace-nowrap">
                          {format(new Date(), "dd/MM/yyyy")}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div className="px-6 py-12 text-center text-xs text-muted-foreground">
                    {emailAction?.emailName
                      ? "No notifications match your search."
                      : 'No email notifications yet. Click "New Email Notification" to create one.'}
                  </div>
                )}
              </div>

              <div className="px-6 py-3 border-t flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={emailFormBestTime}
                    onChange={(e) => setEmailFormBestTime(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Send this email notification at Best Time to Email.
                </label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeEmailDialog}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!emailAction?.emailName}
                    onClick={closeEmailDialog}
                  >
                    Associate
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* ── Step: Create / Edit (form) ────────────────────────────── */}
          {emailDialogStep === "create" && (
            <>
              <DialogHeader className="px-6 pt-6 pb-4">
                <DialogTitle className="text-base">
                  Email Notification{moduleName ? ` - ${moduleName}` : ""}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Configure who receives this email and what it says. Use{" "}
                  <span className="font-mono">{"{{api_name}}"}</span> in the subject or body to
                  insert record field values.
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 pb-4 space-y-4 max-h-[65vh] overflow-y-auto">
                {/* Module-required warning — both the field-based recipient
                    and the Include Fields list derive from moduleName. */}
                {!moduleName && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-1">
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      Pick a module first
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      The recipient field picker and the Include Fields list are scoped
                      to the rule's module.
                    </p>
                    <Select value={moduleName} onValueChange={(v) => setModuleName(v)}>
                      <SelectTrigger className="h-8 text-xs mt-1">
                        <SelectValue placeholder="Select a module…" />
                      </SelectTrigger>
                      <SelectContent>
                        {moduleSelectOptions.length === 0 ? (
                          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                            No modules yet. Create one in Settings → Modules.
                          </div>
                        ) : (
                          moduleSelectOptions.map((m: any) => (
                            <SelectItem key={m.id} value={m.name} className="text-xs">
                              {m.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                  <Label htmlFor="email-name" className="text-xs text-right">Name</Label>
                  <Input
                    id="email-name"
                    value={emailFormName}
                    onChange={(e) => setEmailFormName(e.target.value)}
                    placeholder="e.g. Welcome Email"
                    className="h-8 text-xs"
                  />
                </div>

                {/* Recipients — three sources, any combination. The trigger
                    de-dupes the union before sending. */}
                <div className="grid grid-cols-[110px_1fr] items-start gap-3">
                  <Label className="text-xs text-right pt-2">Recipients</Label>
                  <div className="space-y-3 rounded border border-dashed p-3">
                    <p className="text-[10px] text-muted-foreground">
                      Use any combination of these. At least one source must resolve to
                      a non-empty address.
                    </p>

                    {/* Source 1: field on the record */}
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">From a field on the record</Label>
                      <div className="flex items-center gap-2">
                        <Select
                          value={emailFormToField || "__none__"}
                          onValueChange={(v) => setEmailFormToField(v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={moduleName ? "Pick a field containing an email…" : "Pick a module first"} />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            <SelectItem value="__none__" className="text-xs">
                              — none —
                            </SelectItem>
                            {moduleFields.length === 0 ? (
                              <div className="px-2 py-2 text-[11px] text-muted-foreground">
                                {moduleName
                                  ? `Module "${moduleName}" has no fields yet.`
                                  : "Pick a module to see its fields."}
                              </div>
                            ) : (
                              moduleFields.map((f) => (
                                <SelectItem key={f.id} value={f.id} className="text-xs">
                                  <div className="flex items-center justify-between gap-2 w-full">
                                    <span className="truncate">{f.label}</span>
                                    <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                                      {f.apiName} · {f.formName}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Source 2: literal address list */}
                    <div className="space-y-1">
                      <Label htmlFor="email-to-static" className="text-[11px] text-muted-foreground">
                        Specific email addresses
                      </Label>
                      <Input
                        id="email-to-static"
                        value={emailFormToStatic}
                        onChange={(e) => setEmailFormToStatic(e.target.value)}
                        placeholder="alice@x.com, bob@x.com"
                        className="h-8 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Comma- or semicolon-separated.
                      </p>
                    </div>

                    {/* Source 3: roles → user emails */}
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Users in roles
                      </Label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={emailRoleSearch}
                          onChange={(e) => setEmailRoleSearch(e.target.value)}
                          placeholder="Search roles…"
                          className="h-8 text-xs pl-8"
                        />
                      </div>
                      <div className="rounded border max-h-[140px] overflow-y-auto">
                        {availableRoles.length === 0 ? (
                          <div className="px-3 py-3 text-[11px] text-muted-foreground">
                            No roles found in this organization.
                          </div>
                        ) : (
                          availableRoles
                            .filter((r: any) =>
                              !emailRoleSearch.trim() ||
                              r.name.toLowerCase().includes(emailRoleSearch.trim().toLowerCase())
                            )
                            .map((r: any) => {
                              const checked = emailFormToRoleIds.includes(r.id)
                              return (
                                <label
                                  key={r.id}
                                  className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleEmailRole(r.id)}
                                    className="h-3.5 w-3.5"
                                  />
                                  <span className="flex-1 truncate">{r.name}</span>
                                  {typeof r.userCount === "number" && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {r.userCount} user{r.userCount === 1 ? "" : "s"}
                                    </span>
                                  )}
                                </label>
                              )
                            })
                        )}
                      </div>
                      {emailFormToRoleIds.length > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          {emailFormToRoleIds.length} role{emailFormToRoleIds.length === 1 ? "" : "s"} selected — emails go to each user's account email.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subject + body templates */}
                <div className="grid grid-cols-[110px_1fr] items-start gap-3">
                  <Label htmlFor="email-subject" className="text-xs text-right pt-2">Email Template</Label>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] text-indigo-900">
                        <FileText className="h-3.5 w-3.5" />
                        <span>Start from a professional template.</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] px-2 border-indigo-300"
                        onClick={() => {
                          setTemplatePickerTarget("email")
                          setTemplatePickerOpen(true)
                        }}
                      >
                        Browse templates
                      </Button>
                    </div>
                    <Input
                      id="email-subject"
                      value={emailFormSubject}
                      onChange={(e) => setEmailFormSubject(e.target.value)}
                      placeholder="Subject"
                      className="h-8 text-xs"
                    />
                    <Textarea
                      value={emailFormBody}
                      onChange={(e) => setEmailFormBody(e.target.value)}
                      placeholder={"Body — e.g. Hi {{full_name}}, welcome!"}
                      rows={6}
                      className="text-xs resize-none font-mono"
                    />
                  </div>
                </div>

                {/* Include Fields — appended as a "Field — Value" block to the body */}
                <div className="grid grid-cols-[110px_1fr] items-start gap-3">
                  <Label className="text-xs text-right pt-2">Include Fields</Label>
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={emailFieldSearch}
                        onChange={(e) => setEmailFieldSearch(e.target.value)}
                        placeholder="Search fields…"
                        className="h-8 text-xs pl-8"
                      />
                    </div>
                    <div className="rounded border max-h-[160px] overflow-y-auto">
                      {moduleFields.length === 0 ? (
                        <div className="px-3 py-3 text-[11px] text-muted-foreground">
                          {moduleName
                            ? `Module "${moduleName}" has no fields yet.`
                            : "Pick a module to see its fields."}
                        </div>
                      ) : (
                        moduleFields
                          .filter((f) => {
                            const q = emailFieldSearch.trim().toLowerCase()
                            if (!q) return true
                            return (
                              f.label.toLowerCase().includes(q) ||
                              (f.apiName || "").toLowerCase().includes(q)
                            )
                          })
                          .map((f) => {
                            const checked = emailFormFieldIds.includes(f.id)
                            return (
                              <label
                                key={f.id}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleEmailField(f.id)}
                                  className="h-3.5 w-3.5"
                                />
                                <span className="flex-1 truncate">{f.label}</span>
                                <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                                  {f.apiName} · {f.formName}
                                </span>
                              </label>
                            )
                          })
                      )}
                    </div>
                    {emailFormFieldIds.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {emailFormFieldIds.length} field{emailFormFieldIds.length === 1 ? "" : "s"} selected — their values will be appended to the email body.
                      </p>
                    )}
                  </div>
                </div>

                {/* From — combobox seeded with org user emails. Admin can
                    either click a user from the suggestion list or type any
                    address manually; the typed/selected value is what gets
                    sent. There is no env fallback — this field is the only
                    source of the sender address. */}
                <div className="grid grid-cols-[110px_1fr] items-start gap-3">
                  <Label htmlFor="email-from" className="text-xs text-right pt-2">From</Label>
                  <div className="space-y-1">
                    <Popover open={emailFromOpen} onOpenChange={setEmailFromOpen}>
                      <PopoverTrigger asChild>
                        <Input
                          id="email-from"
                          value={emailFormFrom}
                          onChange={(e) => {
                            setEmailFormFrom(e.target.value)
                            if (!emailFromOpen) setEmailFromOpen(true)
                          }}
                          onFocus={() => setEmailFromOpen(true)}
                          placeholder="Pick an org user or type any address…"
                          className="h-8 text-xs"
                          autoComplete="off"
                        />
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        sideOffset={4}
                        // Prevent the popover from stealing focus on open so
                        // the user can keep typing in the input above.
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        className="p-0 w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto"
                      >
                        {(() => {
                          const q = emailFormFrom.trim().toLowerCase()
                          const filtered = q
                            ? orgUserOptions.filter(
                                (u) =>
                                  u.email.toLowerCase().includes(q) ||
                                  (u.name || "").toLowerCase().includes(q)
                              )
                            : orgUserOptions
                          if (orgUserOptions.length === 0) {
                            return (
                              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                                No users found in this organization.
                              </div>
                            )
                          }
                          if (filtered.length === 0) {
                            return (
                              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                                No users match. Press Enter to use the typed address as-is.
                              </div>
                            )
                          }
                          return filtered.map((u) => (
                            <button
                              type="button"
                              key={u.id}
                              onClick={() => {
                                setEmailFormFrom(u.email)
                                setEmailFromOpen(false)
                              }}
                              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">
                                  {u.email}
                                </p>
                                {u.name && u.name !== u.email && (
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {u.name}
                                  </p>
                                )}
                              </div>
                              {emailFormFrom.trim().toLowerCase() === u.email.toLowerCase() && (
                                <span className="text-[10px] text-emerald-600 shrink-0">
                                  selected
                                </span>
                              )}
                            </button>
                          ))
                        })()}
                      </PopoverContent>
                    </Popover>
                    <p className="text-[10px] text-muted-foreground">
                      Pick a teammate's address from the list or type any sender. This is
                      required — no env-var fallback.
                    </p>
                  </div>
                </div>

              </div>

              <DialogFooter className="border-t px-6 py-3 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs mr-auto"
                  onClick={() => setEmailDialogStep("associate")}
                >
                  ← Back
                </Button>
                {emailAction?.emailName && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    onClick={removeEmailAction}
                  >
                    Remove
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeEmailDialog}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={
                    !emailFormName.trim() ||
                    !emailFormFrom.trim() ||
                    !/\S+@\S+\.\S+/.test(emailFormFrom.trim()) ||
                    (!emailFormToField &&
                      !emailFormToStatic.trim() &&
                      emailFormToRoleIds.length === 0)
                  }
                  onClick={saveEmailNotification}
                >
                  Save and Associate
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── System Notification Dialog (associate list + configure form) ─ */}
      <Dialog open={notifyDialogStep !== null} onOpenChange={(open) => !open && closeNotifyDialog()}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          {/* ── Step: Associate (list of existing notifications) ──────── */}
          {notifyDialogStep === "associate" && (
            <>
              <DialogHeader className="px-6 pt-6 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <DialogTitle className="text-base">
                      System Notification{moduleName ? ` - ${moduleName}` : ""}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      An in-app notification fanned out to every user with the chosen role(s).
                    </DialogDescription>
                  </div>
                  <Button size="sm" className="h-8 text-xs shrink-0" onClick={openNewNotifyForm}>
                    New Notification
                  </Button>
                </div>
              </DialogHeader>

              <div className="border-t border-b max-h-80 overflow-y-auto">
                {notifyAction?.notifyName ? (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-6 py-2 font-medium">Name</th>
                        <th className="px-2 py-2 font-medium">Roles</th>
                        <th className="px-2 py-2 font-medium">Form Scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        onClick={openEditNotifyForm}
                        className="cursor-pointer hover:bg-muted/40 transition-colors bg-primary/5"
                      >
                        <td className="px-6 py-2.5 font-medium text-foreground truncate max-w-[180px]">
                          {notifyAction.notifyName}
                        </td>
                        <td className="px-2 py-2.5 text-muted-foreground truncate max-w-[220px]">
                          {(notifyAction.notifyRoleIds || [])
                            .map((id) => availableRoles.find((r: any) => r.id === id)?.name)
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td className="px-2 py-2.5 text-muted-foreground whitespace-nowrap">
                          {notifyAction.notifyFormId
                            ? moduleForms.find((f) => f.id === notifyAction.notifyFormId)?.name || "—"
                            : "Any form"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div className="px-6 py-12 text-center text-xs text-muted-foreground">
                    No notification yet. Click "New Notification" to create one.
                  </div>
                )}
              </div>

              <div className="px-6 py-3 border-t flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeNotifyDialog}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!notifyAction?.notifyName}
                  onClick={closeNotifyDialog}
                >
                  Associate
                </Button>
              </div>
            </>
          )}

          {/* ── Step: Create / Edit (form) ────────────────────────────── */}
          {notifyDialogStep === "create" && (
            <>
              <DialogHeader className="px-6 pt-6 pb-4">
                <DialogTitle className="text-base">
                  System Notification{moduleName ? ` - ${moduleName}` : ""}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Pick the role(s) to notify, optionally narrow to one form, and choose which
                  record fields to include in the message. Use{" "}
                  <span className="font-mono">{"{{api_name}}"}</span> in the title or message
                  to insert other field values.
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 pb-4 space-y-4 max-h-[65vh] overflow-y-auto">
                {/* Module-required warning — the form list and field list both
                    derive from moduleName, so without it the Form/Fields
                    selectors will be empty. Surface this up-front instead of
                    silently showing empty pickers. */}
                {!moduleName && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-1">
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      Pick a module first
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      The form list and field list are scoped to the rule's module. Choose
                      one and the pickers below will populate.
                    </p>
                    <Select
                      value={moduleName}
                      onValueChange={(v) => setModuleName(v)}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1">
                        <SelectValue placeholder="Select a module…" />
                      </SelectTrigger>
                      <SelectContent>
                        {moduleSelectOptions.length === 0 ? (
                          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                            No modules yet. Create one in Settings → Modules.
                          </div>
                        ) : (
                          moduleSelectOptions.map((m: any) => (
                            <SelectItem key={m.id} value={m.name} className="text-xs">
                              {m.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Name */}
                <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                  <Label htmlFor="notify-name" className="text-xs text-right">Name</Label>
                  <Input
                    id="notify-name"
                    value={notifyFormName}
                    onChange={(e) => setNotifyFormNameLocal(e.target.value)}
                    placeholder="e.g. New Lead Assigned"
                    className="h-8 text-xs"
                  />
                </div>

                {/* Roles */}
                <div className="grid grid-cols-[110px_1fr] items-start gap-3">
                  <Label className="text-xs text-right pt-2">Notify Roles</Label>
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={notifyRoleSearch}
                        onChange={(e) => setNotifyRoleSearch(e.target.value)}
                        placeholder="Search roles…"
                        className="h-8 text-xs pl-8"
                      />
                    </div>
                    <div className="rounded border max-h-[180px] overflow-y-auto">
                      {availableRoles.length === 0 ? (
                        <div className="px-3 py-3 text-[11px] text-muted-foreground">
                          No roles found in this organization.
                        </div>
                      ) : (
                        availableRoles
                          .filter((r: any) =>
                            !notifyRoleSearch.trim() ||
                            r.name.toLowerCase().includes(notifyRoleSearch.trim().toLowerCase())
                          )
                          .map((r: any) => {
                            const checked = notifyFormRoleIds.includes(r.id)
                            return (
                              <label
                                key={r.id}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleNotifyRole(r.id)}
                                  className="h-3.5 w-3.5"
                                />
                                <span className="flex-1 truncate">{r.name}</span>
                                {typeof r.userCount === "number" && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {r.userCount} user{r.userCount === 1 ? "" : "s"}
                                  </span>
                                )}
                              </label>
                            )
                          })
                      )}
                    </div>
                    {notifyFormRoleIds.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {notifyFormRoleIds.length} role{notifyFormRoleIds.length === 1 ? "" : "s"} selected
                      </p>
                    )}
                  </div>
                </div>

                {/* Form scope */}
                <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                  <Label className="text-xs text-right">Form</Label>
                  <Select
                    value={notifyFormFormId || "__any__"}
                    onValueChange={(v) => setNotifyFormFormId(v === "__any__" ? "" : v)}
                    disabled={!moduleName}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={moduleName ? "Any form in this module" : "Pick a module first"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__" className="text-xs">
                        Any form in this module
                      </SelectItem>
                      {moduleForms.length === 0 ? (
                        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                          {moduleName
                            ? `Module "${moduleName}" has no forms yet.`
                            : "Pick a module to see its forms."}
                        </div>
                      ) : (
                        moduleForms.map((f) => (
                          <SelectItem key={f.id} value={f.id} className="text-xs">
                            <div className="flex items-center justify-between gap-2 w-full">
                              <span className="truncate">{f.name}</span>
                              {!f.isPublished && (
                                <span className="shrink-0 text-[9px] uppercase tracking-wider text-amber-600">
                                  draft
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Fields to include */}
                <div className="grid grid-cols-[110px_1fr] items-start gap-3">
                  <Label className="text-xs text-right pt-2">Include Fields</Label>
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={notifyFieldSearch}
                        onChange={(e) => setNotifyFieldSearch(e.target.value)}
                        placeholder="Search fields…"
                        className="h-8 text-xs pl-8"
                      />
                    </div>
                    <div className="rounded border max-h-[180px] overflow-y-auto">
                      {moduleFields.length === 0 ? (
                        <div className="px-3 py-3 text-[11px] text-muted-foreground">
                          {moduleName
                            ? `Module "${moduleName}" has no fields yet. Create a form with fields first.`
                            : "Pick a module above to see its fields."}
                        </div>
                      ) : (
                        moduleFields
                          .filter((f) => {
                            // Scope-filter: when a specific form is chosen, only
                            // that form's fields are eligible. Compared by
                            // formId (stable) rather than form name.
                            if (notifyFormFormId && f.formId !== notifyFormFormId) return false
                            const q = notifyFieldSearch.trim().toLowerCase()
                            if (!q) return true
                            return (
                              f.label.toLowerCase().includes(q) ||
                              (f.apiName || "").toLowerCase().includes(q)
                            )
                          })
                          .map((f) => {
                            const checked = notifyFormFieldIds.includes(f.id)
                            return (
                              <label
                                key={f.id}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleNotifyField(f.id)}
                                  className="h-3.5 w-3.5"
                                />
                                <span className="flex-1 truncate">{f.label}</span>
                                <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                                  {f.apiName} · {f.formName}
                                </span>
                              </label>
                            )
                          })
                      )}
                    </div>
                    {notifyFormFieldIds.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {notifyFormFieldIds.length} field{notifyFormFieldIds.length === 1 ? "" : "s"} selected — their values will be appended to the notification body.
                      </p>
                    )}
                  </div>
                </div>

                {/* Templates */}
                <div className="grid grid-cols-[110px_1fr] items-start gap-3">
                  <Label htmlFor="notify-title" className="text-xs text-right pt-2">Title</Label>
                  <div className="space-y-2">
                    <Input
                      id="notify-title"
                      value={notifyFormTitle}
                      onChange={(e) => setNotifyFormTitle(e.target.value)}
                      placeholder="e.g. New {{Form Name}} submitted"
                      className="h-8 text-xs"
                    />
                    <Textarea
                      value={notifyFormMessage}
                      onChange={(e) => setNotifyFormMessage(e.target.value)}
                      placeholder={"Optional message — e.g. Hi team, a new entry was added by {{full_name}}."}
                      rows={4}
                      className="text-xs resize-none"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="border-t px-6 py-3 gap-2">
                {notifyAction?.notifyName && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs mr-auto"
                    onClick={() => setNotifyDialogStep("associate")}
                  >
                    ← Back
                  </Button>
                )}
                {notifyAction?.notifyName && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    onClick={removeNotifyAction}
                  >
                    Remove
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeNotifyDialog}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!notifyFormName.trim() || notifyFormRoleIds.length === 0}
                  onClick={saveSystemNotification}
                >
                  Save and Associate
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Webhook Dialog (associate list + configure form) ──────────── */}
      <Dialog open={webhookDialogStep !== null} onOpenChange={(open) => !open && closeWebhookDialog()}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          {/* ── Step: Associate (list of existing webhooks) ─────────────── */}
          {webhookDialogStep === "associate" && (
            <>
              <DialogHeader className="px-6 pt-6 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <DialogTitle className="text-base">
                      Webhooks{moduleName ? ` - ${moduleName}` : ""}
                    </DialogTitle>
                  </div>
                  <Button size="sm" className="h-8 text-xs shrink-0" onClick={openNewWebhookForm}>
                    Configure Webhook
                  </Button>
                </div>
              </DialogHeader>

              <div className="border-t border-b max-h-80 overflow-y-auto">
                {webhookAction?.webhookName ? (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-6 py-2 font-medium">Name</th>
                        <th className="px-2 py-2 font-medium">URL To Notify</th>
                        <th className="px-2 py-2 font-medium">Modified On</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        onClick={openEditWebhookForm}
                        className="cursor-pointer hover:bg-muted/40 transition-colors bg-primary/5"
                      >
                        <td className="px-6 py-2.5 font-medium text-foreground truncate max-w-[180px]">
                          {webhookAction.webhookName}
                        </td>
                        <td
                          className="px-2 py-2.5 text-muted-foreground truncate max-w-[260px]"
                          title={webhookAction.webhookUrl || ""}
                        >
                          {webhookAction.webhookUrl || "—"}
                        </td>
                        <td className="px-2 py-2.5 text-muted-foreground whitespace-nowrap">
                          {format(new Date(), "dd/MM/yyyy")}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div className="px-6 py-12 text-center text-xs text-muted-foreground">
                    No webhooks yet. Click "Configure Webhook" to create one.
                  </div>
                )}
              </div>

              <DialogFooter className="px-6 py-3 gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeWebhookDialog}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!webhookAction?.webhookName}
                  onClick={closeWebhookDialog}
                >
                  Associate
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Step: Configure (create / edit form) ───────────────────── */}
          {webhookDialogStep === "create" && (
            <>
              <DialogHeader className="px-6 pt-6 pb-4">
                <DialogTitle className="text-base">
                  Webhook{moduleName ? ` - ${moduleName}` : ""}
                </DialogTitle>
              </DialogHeader>

              <div className="px-6 pb-4 space-y-4 max-h-[65vh] overflow-y-auto">
                <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                  <Label htmlFor="webhook-name" className="text-xs text-right">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="webhook-name"
                    value={webhookFormName}
                    onChange={(e) => setWebhookFormName(e.target.value)}
                    className={`h-8 text-xs ${!webhookFormName.trim() ? "border-destructive/60 focus-visible:ring-destructive/30" : ""}`}
                  />
                </div>

                <div className="grid grid-cols-[140px_1fr] items-start gap-3">
                  <Label htmlFor="webhook-desc" className="text-xs text-right pt-2">Description</Label>
                  <Textarea
                    id="webhook-desc"
                    value={webhookFormDescription}
                    onChange={(e) => setWebhookFormDescription(e.target.value)}
                    rows={2}
                    className="text-xs resize-none"
                  />
                </div>

                <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                  <Label htmlFor="webhook-method" className="text-xs text-right">Method</Label>
                  <Select value={webhookFormMethod} onValueChange={setWebhookFormMethod}>
                    <SelectTrigger id="webhook-method" className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST" className="text-xs">POST</SelectItem>
                      <SelectItem value="GET" className="text-xs">GET</SelectItem>
                      <SelectItem value="PUT" className="text-xs">PUT</SelectItem>
                      <SelectItem value="PATCH" className="text-xs">PATCH</SelectItem>
                      <SelectItem value="DELETE" className="text-xs">DELETE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                  <Label htmlFor="webhook-url" className="text-xs text-right">
                    URL to Notify <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="webhook-url"
                    value={webhookFormUrl}
                    onChange={(e) => setWebhookFormUrl(e.target.value)}
                    placeholder="Example: https://yourdomain.com/getNotified.do"
                    className={`h-8 text-xs ${!webhookFormUrl.trim() ? "border-destructive/60 focus-visible:ring-destructive/30" : ""}`}
                  />
                </div>

                <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                  <Label className="text-xs text-right">Authorization Type</Label>
                  <RadioGroup
                    value={webhookFormAuthType}
                    onValueChange={(v) => setWebhookFormAuthType(v as "General" | "Connection")}
                    className="flex items-center gap-6"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="General" id="auth-general" className="h-3.5 w-3.5" />
                      <Label htmlFor="auth-general" className="text-xs font-normal cursor-pointer flex items-center gap-1">
                        General
                        <HelpCircle className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="Connection" id="auth-connection" className="h-3.5 w-3.5" />
                      <Label htmlFor="auth-connection" className="text-xs font-normal cursor-pointer flex items-center gap-1">
                        Connection
                        <HelpCircle className="h-3 w-3 text-muted-foreground" />
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs font-semibold text-foreground mb-1">Header</p>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs font-semibold text-foreground mb-2">Module Parameters</p>
                  {webhookFormParams.length > 0 && (
                    <div className="space-y-2 mb-2">
                      {webhookFormParams.map((p) => (
                        <div key={p.id} className="flex items-center gap-2">
                          <Input
                            value={p.name}
                            onChange={(e) => updateWebhookParam(p.id, "name", e.target.value)}
                            placeholder="Parameter name"
                            className="h-8 text-xs flex-1"
                          />
                          <Input
                            value={p.value}
                            onChange={(e) => updateWebhookParam(p.id, "value", e.target.value)}
                            placeholder="Value"
                            className="h-8 text-xs flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => removeWebhookParam(p.id)}
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            title="Remove parameter"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={addWebhookParam}
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Add parameter
                  </button>
                </div>
              </div>

              <DialogFooter className="border-t px-6 py-3 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs mr-auto"
                  onClick={() => setWebhookDialogStep("associate")}
                >
                  ← Back
                </Button>
                {webhookAction?.webhookName && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    onClick={removeWebhookAction}
                  >
                    Remove
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeWebhookDialog}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!webhookFormName.trim() || !webhookFormUrl.trim()}
                  onClick={saveWebhook}
                >
                  Save and Associate
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Report Export Dialog ───────────────────────────────────────── */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Report Export {reportFormName ? `— ${reportFormName}` : ""}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={reportDialogTab} onValueChange={(v) => setReportDialogTab(v as any)}>
            <TabsList className="grid w-full grid-cols-4 h-8">
              <TabsTrigger value="data" className="text-xs">Data</TabsTrigger>
              <TabsTrigger value="filters" className="text-xs">
                Filters
                {reportFilters.filter((f) => f.field && f.operator).length > 0 && (
                  <Badge className="ml-1.5 h-4 px-1 text-[9px] bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                    {reportFilters.filter((f) => f.field && f.operator).length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="delivery" className="text-xs">Delivery</TabsTrigger>
              <TabsTrigger value="advanced" className="text-xs">Advanced</TabsTrigger>
            </TabsList>

            {/* ── Data tab ───────────────────────────────────────────── */}
            <TabsContent value="data" className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-1">
                <Label className="text-xs">Report name</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. Daily attendance digest"
                  value={reportFormName}
                  onChange={(e) => setReportFormName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Data source</Label>
                  <Select
                    value={reportFormDataSource}
                    onValueChange={(v) => setReportFormDataSource(v as any)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="attendance" className="text-xs">Attendance (HR)</SelectItem>
                      <SelectItem value="form-module" className="text-xs">Form Module records</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Period</Label>
                  <Select
                    value={reportFormPeriod}
                    onValueChange={(v) => setReportFormPeriod(v as any)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily" className="text-xs">Daily (yesterday)</SelectItem>
                      <SelectItem value="weekly" className="text-xs">Weekly (last 7 days)</SelectItem>
                      <SelectItem value="monthly" className="text-xs">Monthly (last calendar month)</SelectItem>
                      {reportFormDataSource === "form-module" && (
                        <SelectItem value="all-time" className="text-xs">All time</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {reportFormDataSource === "form-module" && (
                <div className="space-y-1">
                  <Label className="text-xs">Module to export</Label>
                  <Select
                    value={reportFormModuleName || moduleName || ""}
                    onValueChange={(v) => {
                      setReportFormModuleName(v)
                      setReportFormFieldIds([])
                      setReportSelectedFormIds([])
                      setReportFilters([])
                      setReportSortBy("")
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Pick a module..." />
                    </SelectTrigger>
                    <SelectContent>
                      {reportModuleOptions.length === 0 ? (
                        <div className="px-2 py-2 text-xs text-muted-foreground">No modules</div>
                      ) : (
                        reportModuleOptions.map((m) => (
                          <SelectItem key={m.name} value={m.name} className="text-xs">
                            {m.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Defaults to the rule's module ({moduleName || "—"}). Pick a different one to export records from elsewhere.
                  </p>
                </div>
              )}

              {reportFormDataSource === "form-module" && reportFormsInModule.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      Forms to include
                      <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                        {reportSelectedFormIds.length === 0
                          ? `All ${reportFormsInModule.length} forms`
                          : `${reportSelectedFormIds.length} of ${reportFormsInModule.length} selected`}
                      </span>
                    </Label>
                    {reportSelectedFormIds.length > 0 && (
                      <button
                        type="button"
                        className="text-[10px] text-primary hover:underline"
                        onClick={() => setReportSelectedFormIds([])}
                      >
                        Use all
                      </button>
                    )}
                  </div>
                  <div className="border rounded max-h-32 overflow-y-auto">
                    {reportFormsInModule.map((f) => {
                      const checked = reportSelectedFormIds.includes(f.id)
                      return (
                        <label
                          key={f.id}
                          className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted/40 cursor-pointer border-b last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={checked}
                            onChange={(e) =>
                              setReportSelectedFormIds((prev) =>
                                e.target.checked
                                  ? [...prev, f.id]
                                  : prev.filter((id) => id !== f.id),
                              )
                            }
                          />
                          <span className="flex-1 truncate">{f.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {reportFormDataSource === "form-module" && reportFieldOptions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      Columns to include
                      <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                        {reportFormFieldIds.length === 0
                          ? `All ${reportFieldOptions.length} fields`
                          : `${reportFormFieldIds.length} of ${reportFieldOptions.length} selected`}
                      </span>
                    </Label>
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() =>
                          setReportFormFieldIds(reportFieldOptions.map((f) => f.id))
                        }
                      >
                        Select all
                      </button>
                      {reportFormFieldIds.length > 0 && (
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => setReportFormFieldIds([])}
                        >
                          Use all
                        </button>
                      )}
                    </div>
                  </div>
                  <Input
                    className="h-7 text-xs"
                    placeholder="Search fields..."
                    value={reportFieldSearch}
                    onChange={(e) => setReportFieldSearch(e.target.value)}
                  />
                  <div className="border rounded max-h-44 overflow-y-auto">
                    {reportFieldOptions
                      .filter((f) => {
                        const q = reportFieldSearch.trim().toLowerCase()
                        if (!q) return true
                        return (
                          f.label.toLowerCase().includes(q) ||
                          (f.apiName || "").toLowerCase().includes(q) ||
                          f.formName.toLowerCase().includes(q)
                        )
                      })
                      .map((f) => {
                        const checked = reportFormFieldIds.includes(f.id)
                        return (
                          <label
                            key={f.id}
                            className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted/40 cursor-pointer border-b last:border-b-0"
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5"
                              checked={checked}
                              onChange={(e) => {
                                setReportFormFieldIds((prev) =>
                                  e.target.checked
                                    ? [...prev, f.id]
                                    : prev.filter((id) => id !== f.id),
                                )
                              }}
                            />
                            <span className="flex-1 truncate">{f.label}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {f.formName}
                            </span>
                          </label>
                        )
                      })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Leave all unchecked to export every field. Otherwise the XLSX includes only the columns you tick.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Timezone (IANA)</Label>
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="Asia/Kolkata"
                  value={reportFormTimezone}
                  onChange={(e) => setReportFormTimezone(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Sets the boundaries of "yesterday", "last 7 days", etc. Defaults to the rule's schedule timezone if blank.
                </p>
              </div>
            </TabsContent>

            {/* ── Filters tab ────────────────────────────────────────── */}
            <TabsContent value="filters" className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
              {reportFormDataSource !== "form-module" ? (
                <div className="text-xs text-muted-foreground italic px-2 py-3 bg-muted/30 rounded">
                  Filters and sort are only available for Form Module exports. Attendance reports use a fixed format.
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">
                        Filter records
                        <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                          (AND-combined)
                        </span>
                      </Label>
                      <button
                        type="button"
                        className="text-[10px] text-primary hover:underline"
                        onClick={() =>
                          setReportFilters((prev) => [
                            ...prev,
                            {
                              id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                              field: "",
                              operator: "equals",
                              value: "",
                            },
                          ])
                        }
                      >
                        + Add filter
                      </button>
                    </div>
                    {reportFilters.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">
                        No filters — every record in the period will be exported.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {reportFilters.map((f) => (
                          <div key={f.id} className="flex items-center gap-1.5">
                            <Select
                              value={f.field}
                              onValueChange={(v) =>
                                setReportFilters((prev) =>
                                  prev.map((row) => (row.id === f.id ? { ...row, field: v } : row)),
                                )
                              }
                            >
                              <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                                <SelectValue placeholder="Field" />
                              </SelectTrigger>
                              <SelectContent>
                                {reportFieldOptions.length === 0 ? (
                                  <div className="px-2 py-2 text-xs text-muted-foreground">
                                    No fields
                                  </div>
                                ) : (
                                  reportFieldOptions.map((opt) => (
                                    <SelectItem key={opt.id} value={opt.id} className="text-xs">
                                      {opt.label}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            <Select
                              value={f.operator}
                              onValueChange={(v) =>
                                setReportFilters((prev) =>
                                  prev.map((row) => (row.id === f.id ? { ...row, operator: v } : row)),
                                )
                              }
                            >
                              <SelectTrigger className="h-7 text-xs w-32 shrink-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equals" className="text-xs">equals</SelectItem>
                                <SelectItem value="is not" className="text-xs">is not</SelectItem>
                                <SelectItem value="contains" className="text-xs">contains</SelectItem>
                                <SelectItem value="does not contain" className="text-xs">does not contain</SelectItem>
                                <SelectItem value="is empty" className="text-xs">is empty</SelectItem>
                                <SelectItem value="is not empty" className="text-xs">is not empty</SelectItem>
                                <SelectItem value=">" className="text-xs">{">"}</SelectItem>
                                <SelectItem value=">=" className="text-xs">{"≥"}</SelectItem>
                                <SelectItem value="<" className="text-xs">{"<"}</SelectItem>
                                <SelectItem value="<=" className="text-xs">{"≤"}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              className="h-7 text-xs flex-1 min-w-0"
                              placeholder="Value"
                              disabled={f.operator === "is empty" || f.operator === "is not empty"}
                              value={f.value}
                              onChange={(e) =>
                                setReportFilters((prev) =>
                                  prev.map((row) =>
                                    row.id === f.id ? { ...row, value: e.target.value } : row,
                                  ),
                                )
                              }
                            />
                            <button
                              type="button"
                              className="text-foreground hover:text-destructive shrink-0"
                              onClick={() =>
                                setReportFilters((prev) => prev.filter((row) => row.id !== f.id))
                              }
                              title="Remove filter"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-3 space-y-1.5">
                    <Label className="text-xs">Sort records by</Label>
                    <div className="grid grid-cols-[1fr_auto] gap-1.5">
                      <Select
                        value={reportSortBy || "__created__"}
                        onValueChange={(v) => setReportSortBy(v === "__created__" ? "" : v)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Pick a field" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__created__" className="text-xs">
                            Created date (default)
                          </SelectItem>
                          {reportFieldOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id} className="text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={reportSortDir} onValueChange={(v) => setReportSortDir(v as any)}>
                        <SelectTrigger className="h-7 text-xs w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="desc" className="text-xs">Newest first</SelectItem>
                          <SelectItem value="asc" className="text-xs">Oldest first</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Max rows (1–50,000)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50000}
                      className="h-7 text-xs w-32"
                      value={reportMaxRows}
                      onChange={(e) =>
                        setReportMaxRows(
                          Math.max(1, Math.min(50000, Number(e.target.value) || 5000)),
                        )
                      }
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Hard cap. The XLSX header notes when truncation happens.
                    </p>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ── Delivery tab ───────────────────────────────────────── */}
            <TabsContent value="delivery" className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
              <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded px-2.5 py-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-indigo-900">
                  <FileText className="h-3.5 w-3.5" />
                  <span>Quickly fill subject + body from a professional template.</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2 border-indigo-300"
                  onClick={() => {
                    setTemplatePickerTarget("report")
                    setTemplatePickerOpen(true)
                  }}
                >
                  Browse templates
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Recipients (comma- or newline-separated)</Label>
                <Textarea
                  rows={3}
                  className="text-xs"
                  placeholder="hr@example.com, manager@example.com"
                  value={reportFormToStatic}
                  onChange={(e) => setReportFormToStatic(e.target.value)}
                />
                {reportRecipientStats.total > 0 && (
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-emerald-700">
                      ✓ {reportRecipientStats.valid.length} valid
                    </span>
                    {reportRecipientStats.invalid.length > 0 && (
                      <span className="text-red-600" title={reportRecipientStats.invalid.join(", ")}>
                        ✗ {reportRecipientStats.invalid.length} invalid: {reportRecipientStats.invalid.slice(0, 3).join(", ")}
                        {reportRecipientStats.invalid.length > 3 ? "..." : ""}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Email subject</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Daily attendance report"
                  value={reportFormSubject}
                  onChange={(e) => setReportFormSubject(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Email body (HTML allowed; report summary appended automatically)</Label>
                <Textarea
                  rows={5}
                  className="text-xs"
                  placeholder="Hi team, please find attached today's report."
                  value={reportFormBody}
                  onChange={(e) => setReportFormBody(e.target.value)}
                />
              </div>
            </TabsContent>

            {/* ── Advanced tab ───────────────────────────────────────── */}
            <TabsContent value="advanced" className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-1">
                <Label className="text-xs">Filename template</Label>
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="{{module}}-{{period}}-{{date}}.xlsx"
                  value={reportFilenameTemplate}
                  onChange={(e) => setReportFilenameTemplate(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Placeholders:
                  <code className="mx-1">{"{{module}}"}</code>
                  <code className="mx-1">{"{{period}}"}</code>
                  <code className="mx-1">{"{{date}}"}</code>
                  <code className="mx-1">{"{{from}}"}</code>
                  <code className="mx-1">{"{{to}}"}</code>
                  . Default:{" "}
                  <code>{"{{module}}-{{period}}-{{date}}.xlsx"}</code>
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">XLSX sheet name</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Records"
                  maxLength={31}
                  value={reportSheetName}
                  onChange={(e) => setReportSheetName(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Max 31 chars (Excel limit). Default: <code>Records</code>.
                </p>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter className="gap-2">
            {reportAction && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive hover:text-destructive"
                onClick={() => {
                  removeReportAction()
                  setReportDialogOpen(false)
                }}
              >
                Remove
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setReportDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={reportRecipientStats.valid.length === 0}
              onClick={saveReportAction}
            >
              Save Report Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Email Template Picker (shared between Email Notification + Report Export) ── */}
      <EmailTemplatePicker
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        actionType={templatePickerTarget === "email" ? "Email Notification" : "Report Export"}
        onApply={({ subject, body }) => {
          if (templatePickerTarget === "email") {
            setEmailFormSubject(subject)
            setEmailFormBody(body)
          } else {
            setReportFormSubject(subject)
            setReportFormBody(body)
          }
        }}
      />

      {/* ── Test Run Result Panel ──────────────────────────────────────── */}
      {/* Modeless dock pinned bottom-right so the user can see the rule
          editor underneath while reading the per-action log. Closes on click
          or after a successful run; the executions page is the persistent
          history. */}
      {testPanelOpen && (
        <div className="fixed bottom-4 right-4 w-[480px] max-w-[calc(100vw-2rem)] max-h-[70vh] bg-background border rounded-md shadow-xl z-50 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-indigo-700" />
              <span className="text-xs font-semibold">Test Run</span>
              {isRunning && (
                <span className="text-[10px] text-muted-foreground">running...</span>
              )}
              {testResult && (
                <Badge
                  className={`text-[10px] px-1.5 py-0 font-medium ${
                    testResult.status === "success"
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                      : testResult.status === "partial"
                      ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                      : testResult.status === "skipped"
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-100"
                      : "bg-red-100 text-red-700 hover:bg-red-100"
                  }`}
                >
                  {testResult.status}
                </Badge>
              )}
              {testResult && (
                <span className="text-[10px] text-muted-foreground">{testResult.elapsedMs}ms</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground px-1.5"
                onClick={() => {
                  setTestLog([])
                  setTestResult(null)
                }}
                title="Clear log"
              >
                Clear
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setTestPanelOpen(false)}
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px]">
            {testLog.length === 0 ? (
              <p className="text-muted-foreground italic">Waiting for run...</p>
            ) : (
              testLog.map((entry, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 px-2 py-1 rounded ${
                    entry.level === "error"
                      ? "bg-red-50 text-red-700"
                      : entry.level === "warn"
                      ? "bg-amber-50 text-amber-700"
                      : entry.level === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-muted/30 text-foreground"
                  }`}
                >
                  <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                    {entry.ts.slice(11, 19)}
                  </span>
                  <span className="break-words flex-1">{entry.message}</span>
                </div>
              ))
            )}
          </div>

          {testResult && testResult.results.length > 0 && (
            <div className="border-t px-2 py-1.5 bg-muted/20">
              <p className="text-[10px] font-semibold text-foreground mb-1">Action results</p>
              <div className="space-y-1">
                {testResult.results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 px-2 py-1 rounded text-[11px] ${
                      r.ok ? "bg-emerald-50" : "bg-red-50"
                    }`}
                  >
                    <span className={r.ok ? "text-emerald-700" : "text-red-700"}>
                      {r.ok ? "✓" : "✗"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{r.type}</div>
                      {r.error && <div className="text-red-700 break-words">{r.error}</div>}
                      {r.detail && (
                        <div className="text-[10px] text-muted-foreground font-mono break-all">
                          {typeof r.detail === "object"
                            ? JSON.stringify(r.detail)
                            : String(r.detail)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t px-3 py-2 flex items-center justify-between bg-muted/30">
            <span className="text-[10px] text-muted-foreground">
              ⚠ Real run — emails sent, notifications posted, reports generated
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] px-2"
                onClick={() => router.push(`/settings/workflow-rules/executions${ruleId ? `?ruleId=${ruleId}` : ""}`)}
              >
                Full log →
              </Button>
              <Button
                size="sm"
                className="h-6 text-[11px] px-2 gap-1"
                disabled={isRunning || isSaving || !canSaveRule}
                onClick={handleTestRun}
              >
                <Zap className="h-3 w-3" />
                Run again
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
