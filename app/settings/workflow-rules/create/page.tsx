"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useGetPermittedModulesQuery } from "@/lib/api/modules"
import { useGetFormDetailQuery } from "@/lib/api/forms"
import { useCreateWorkflowRuleMutation, useUpdateWorkflowRuleMutation, useGetWorkflowRulesQuery } from "@/lib/api/workflow-rules"
import { useGetFunctionsQuery, useCreateFunctionMutation, useGetBindingsTreeQuery } from "@/lib/api/functions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
  emailToField?: string
  emailSubject?: string
  emailBody?: string
  emailFrom?: string
  emailReplyTo?: string
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
}

const ALL_INSTANT_ACTION_TYPES = [
  "Email Notification",
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
          emailSubject: typeof entry.emailSubject === "string" ? entry.emailSubject : undefined,
          emailBody: typeof entry.emailBody === "string" ? entry.emailBody : undefined,
          emailFrom: typeof entry.emailFrom === "string" ? entry.emailFrom : undefined,
          emailReplyTo: typeof entry.emailReplyTo === "string" ? entry.emailReplyTo : undefined,
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

  // Active / inactive toggle (existing rules only)
  const [isActive, setIsActive] = useState(true)
  const [togglingActive, setTogglingActive] = useState(false)

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
    if (existingRule.instantActions) {
      const normalized = normalizeActions(existingRule.instantActions)
      setSelectedInstantActions(normalized)
      if (normalized.length > 0) setInstantDone(true)
    }
    setScheduledExecute(existingRule.scheduledExecute || "")
    setScheduledUnit(existingRule.scheduledUnit || "Hours")
    if (existingRule.scheduledExecute) setScheduledDone(true)
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

  // ── Email Notification dialog state ─────────────────────────────────────
  type EmailDialogStep = null | "associate" | "create"
  const [emailDialogStep, setEmailDialogStep] = useState<EmailDialogStep>(null)
  const [emailSearchQuery, setEmailSearchQuery] = useState("")
  const [emailFormName, setEmailFormName] = useState("")
  const [emailFormToField, setEmailFormToField] = useState("")
  const [emailFormSubject, setEmailFormSubject] = useState("")
  const [emailFormBody, setEmailFormBody] = useState("")
  const [emailFormFrom, setEmailFormFrom] = useState("")
  const [emailFormReplyTo, setEmailFormReplyTo] = useState("")
  const [emailFormSendAsMass, setEmailFormSendAsMass] = useState(false)
  const [emailFormBestTime, setEmailFormBestTime] = useState(false)

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
    setEmailFormSubject("")
    setEmailFormBody("")
    setEmailFormFrom("")
    setEmailFormReplyTo("")
    setEmailFormSendAsMass(false)
    setEmailFormBestTime(false)
  }

  const loadEmailForm = (a: InstantAction | undefined) => {
    setEmailFormName(a?.emailName || "")
    setEmailFormToField(a?.emailToField || "")
    setEmailFormSubject(a?.emailSubject || "")
    setEmailFormBody(a?.emailBody || "")
    setEmailFormFrom(a?.emailFrom || "")
    setEmailFormReplyTo(a?.emailReplyTo || "")
    setEmailFormSendAsMass(!!a?.emailSendAsMass)
    setEmailFormBestTime(!!a?.emailBestTime)
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
    const nextActions = (() => {
      const filtered = selectedInstantActions.filter((a) => a.type !== "Email Notification")
      filtered.push({
        type: "Email Notification",
        emailName: emailFormName.trim(),
        emailToField: emailFormToField || undefined,
        emailSubject: emailFormSubject || undefined,
        emailBody: emailFormBody || undefined,
        emailFrom: emailFormFrom || undefined,
        emailReplyTo: emailFormReplyTo || undefined,
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
  const moduleFields = useMemo(() => {
    const mods = treeData?.data || []
    // Match by name first (our URL carries moduleName), fall back to any
    // module whose name matches case-insensitively.
    const mod =
      mods.find((m: any) => m.name === moduleName) ||
      mods.find((m: any) => (m.name || "").toLowerCase() === moduleName.toLowerCase())
    if (!mod) return [] as Array<{ id: string; label: string; formName: string; apiName: string }>
    const out: Array<{ id: string; label: string; formName: string; apiName: string }> = []
    for (const f of mod.forms || []) {
      for (const fld of f.fields || []) {
        out.push({ id: fld.id, label: fld.label, formName: f.name, apiName: fld.apiName })
      }
    }
    return out
  }, [treeData, moduleName])

  const canGoNext =
    executeBasedOn === "record-action"
      ? !!recordAction
      : executeBasedOn === "record-field"
        ? !!dateField
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
    (recordAction || dateField)
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
                    {(treeData?.data || []).length === 0 ? (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                        No modules yet. Create one in Settings → Modules.
                      </div>
                    ) : (
                      (treeData?.data || []).map((m: any) => (
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
                          const label =
                            isFn && functionAction?.functionName
                              ? `Function: ${functionAction.functionName}`
                              : isEmail && emailAction?.emailName
                                ? `Email Notification: ${emailAction.emailName}`
                                : isWebhook && webhookAction?.webhookName
                                  ? `Webhook: ${webhookAction.webhookName}`
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
                                        {(treeData?.data || []).length === 0 ? (
                                          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                                            No modules yet. Create one in Settings → Modules.
                                          </div>
                                        ) : (
                                          (treeData?.data || []).map((m: any) => (
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

                <div className="grid grid-cols-[110px_1fr] items-start gap-3">
                  <Label className="text-xs text-right pt-2">To</Label>
                  <div className="space-y-2">
                    <Select value={emailFormToField} onValueChange={setEmailFormToField}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Pick a field containing the recipient email…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {moduleFields.length === 0 ? (
                          <div className="px-2 py-2 text-[11px] text-muted-foreground">
                            No fields on this module. Pick a module with fields first.
                          </div>
                        ) : (
                          moduleFields.map((f) => (
                            <SelectItem key={f.id} value={f.id} className="text-xs">
                              <div className="flex items-center justify-between gap-2 w-full">
                                <span className="truncate">{f.label}</span>
                                <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                                  {f.apiName}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={emailFormSendAsMass}
                        onChange={(e) => setEmailFormSendAsMass(e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      Send this notification as a Single Mass Email with all recipients displayed
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-[110px_1fr] items-start gap-3">
                  <Label htmlFor="email-subject" className="text-xs text-right pt-2">Email Template</Label>
                  <div className="space-y-2">
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
                      rows={5}
                      className="text-xs resize-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                  <Label htmlFor="email-from" className="text-xs text-right">From</Label>
                  <Input
                    id="email-from"
                    value={emailFormFrom}
                    onChange={(e) => setEmailFormFrom(e.target.value)}
                    placeholder="sender@example.com"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                  <Label htmlFor="email-replyto" className="text-xs text-right">Reply to</Label>
                  <Input
                    id="email-replyto"
                    value={emailFormReplyTo}
                    onChange={(e) => setEmailFormReplyTo(e.target.value)}
                    placeholder="Optional"
                    className="h-8 text-xs"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-muted-foreground ml-[122px]">
                  <input
                    type="checkbox"
                    checked={emailFormBestTime}
                    onChange={(e) => setEmailFormBestTime(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Send this email notification at Best Time to Email.
                </label>
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
                  disabled={!emailFormName.trim() || !emailFormToField}
                  onClick={saveEmailNotification}
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
    </div>
  )
}
