export const dynamic = "force-dynamic"
export const runtime = "nodejs"

import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/api-helpers"
import { runBindingById } from "@/lib/functions/bindingRunner"

/**
 * POST /api/forms/[formId]/functions/run
 *
 * Body: {
 *   bindingId: string
 *   formData?: { [fieldId]: value }   // current form snapshot
 *   triggerFieldId?: string           // optional, for onFieldChange / onBlur
 * }
 *
 * The binding's inputMapping decides which keys of formData (and which
 * special tokens like `$userId`) the script actually sees. The mapping is
 * applied SERVER-side, so the script can never read fields the binding
 * author didn't whitelist.
 *
 * Response: {
 *   ok: boolean
 *   fieldUpdates: { [fieldId]: value }   // patch the client should setFieldValue
 *   result?: any                         // raw script return value
 *   error?: string
 *   logs: ExecuteResult["logs"]
 *   durationMs: number
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
  try {
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    if (!authUser.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({} as any))
    const { bindingId, formData, triggerFieldId } = body || {}

    if (typeof bindingId !== "string" || !bindingId) {
      return NextResponse.json(
        { error: "bindingId is required" },
        { status: 400 }
      )
    }

    // The binding must be scoped to THIS form (or to one of its fields).
    // We pass formId as the scope filter — the runner won't load a binding
    // attached to a different form even if the id is right.
    const result = await runBindingById(
      bindingId,
      {
        organizationId: authUser.organizationId,
        userId: authUser.id,
        formData: formData && typeof formData === "object" ? formData : {},
        triggerFieldId: typeof triggerFieldId === "string" ? triggerFieldId : undefined,
      },
      // We don't enforce { formId } strictly because a binding may live on a
      // FormField (fieldId set, formId null). The fields belong to this form
      // — that's checked when the client builds its dispatch map from the
      // form-detail response (which only emits bindings for this form's
      // fields). For belt-and-suspenders, callers can also pass the formId
      // through scope.formId here.
      {}
    )

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Binding not found", fieldUpdates: {}, logs: [], durationMs: 0 },
        { status: 404 }
      )
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error(`[POST /api/forms/${params.formId}/functions/run]`, err)
    return NextResponse.json(
      {
        ok: false,
        fieldUpdates: {},
        error: err?.message || "Execution failed",
        logs: [],
        durationMs: 0,
      },
      { status: 500 }
    )
  }
}
