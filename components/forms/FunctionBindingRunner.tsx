"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Form, ClientFunctionBinding } from "@/types/form-builder";

// Identifiers only present in legacy non-JS scripts (Deluge-era bodies that
// weren't rewritten). If any of them surface as "X is not defined", the
// function will keep failing on every run until its script is rewritten.
const LEGACY_SCRIPT_IDENTS = new Set([
  "automation",
  "info",
  "sendmail",
  "invokeUrl",
  "openUrl",
]);

function isLegacyScriptError(msg: string): boolean {
  if (!msg) return false;
  const m = /([A-Za-z_$][\w$]*)\s+is not defined/.exec(msg);
  return !!m && LEGACY_SCRIPT_IDENTS.has(m[1]);
}

interface FunctionBindingRunnerProps {
  form: Form | null;
  formData: Record<string, any>;
  setFieldValues: (updates: Record<string, any>) => void;
  /**
   * Optional toast hook so failures surface to the user. Pass nothing to
   * silently swallow — the executor's error is also logged to the console.
   */
  onError?: (msg: string) => void;
}

/**
 * Sibling of FormulaCalculator. Watches the form's `functionBindings` and:
 *
 *   - For event=`onFieldChange`: when any source field referenced in a
 *     binding's inputMapping changes (vs. the previous formData snapshot),
 *     POST /api/forms/[formId]/functions/run for that binding and apply the
 *     returned `fieldUpdates`. Debounced ~300ms to avoid thrashing the
 *     executor while the user types.
 *
 *   - For event=`onFieldBlur`: not handled here — wire those via an onBlur
 *     prop on the field input itself in FormFieldRenderer.
 *
 * The binding's `inputMapping` defines the watched-field set: any fieldId
 * that appears as a value in the mapping is a dependency. Special tokens
 * (`$userId`, `$formData`, …) are NOT field deps; the runner doesn't need to
 * re-fire when they change because they don't.
 */
export const FunctionBindingRunner: React.FC<FunctionBindingRunnerProps> = ({
  form,
  formData,
  setFieldValues,
  onError,
}) => {
  // Active onFieldChange bindings only — onBlur is handled at the field site.
  const changeBindings = useMemo<ClientFunctionBinding[]>(() => {
    return (form?.functionBindings || []).filter((b) => b.event === "onFieldChange");
  }, [form?.functionBindings]);

  // Track the last formData snapshot so we can diff "what just changed".
  const lastSnapshotRef = useRef<Record<string, any>>({});
  // Flip after the first effect run so the initial snapshot (whether empty or
  // pre-filled from an edit) is always baseline — never fires bindings.
  const initializedRef = useRef(false);
  // Debounce timers per-binding so a fast typist's keystrokes coalesce.
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Latch in-flight bindings so we don't double-fire while a request is open.
  const inFlightRef = useRef<Set<string>>(new Set());
  // "Re-run when in-flight completes" flag. If a new change arrives while a
  // request is still open, we set this so the runner fires ONE more time with
  // the latest snapshot once the open request resolves — otherwise the final
  // keystroke's binding call gets silently dropped.
  const pendingRetryRef = useRef<Record<string, { triggered: string }>>({});
  // Bindings whose function contains legacy non-JS script. We warn the
  // developer console once and then stop firing — otherwise every keystroke
  // produces a toast + failed request for a script that can never succeed.
  const legacyDisabledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // First effect run: baseline the snapshot regardless of its shape (empty
    // new form, or pre-filled edit record). Never fires on the first run.
    if (!initializedRef.current) {
      lastSnapshotRef.current = { ...formData };
      initializedRef.current = true;
      return;
    }

    if (!form?.id || changeBindings.length === 0) return;

    const previous = lastSnapshotRef.current;
    const changedFieldIds = new Set<string>();
    const allKeys = Object.keys(formData).concat(
      Object.keys(previous).filter((k) => !(k in formData))
    );
    for (let i = 0; i < allKeys.length; i++) {
      const fid = allKeys[i];
      if (formData[fid] !== previous[fid]) changedFieldIds.add(fid);
    }
    lastSnapshotRef.current = { ...formData };

    if (changedFieldIds.size === 0) return;

    for (const binding of changeBindings) {
      const mapping = binding.inputMapping || {};
      const hasExplicitMapping = Object.keys(mapping).length > 0;

      // Figure out the trigger field. Three modes:
      //   1. Explicit mapping — fire if any watched fieldId changed.
      //   2. Auto-mode, field-scoped — fire only when the binding's own field changed.
      //   3. Auto-mode, form-scoped — fire on any field change in the form.
      let triggered: string | undefined;
      if (hasExplicitMapping) {
        const watched = Object.values(mapping).filter(
          (v): v is string => typeof v === "string" && !v.startsWith("$")
        );
        triggered = watched.find((fid) => changedFieldIds.has(fid));
      } else if (binding.fieldId) {
        if (changedFieldIds.has(binding.fieldId)) triggered = binding.fieldId;
      } else {
        // Form-scoped auto binding — use the first changed field as the trigger.
        const first = changedFieldIds.values().next();
        triggered = first.done ? undefined : first.value;
      }
      if (!triggered) continue;

      // Skip bindings whose function was already flagged as legacy (non-JS).
      // Avoids spamming toasts and wasteful requests on every keystroke.
      if (legacyDisabledRef.current.has(binding.id)) continue;

      // Debounce per binding. 120ms feels instant while still coalescing a
      // burst of keystrokes into one request. Previously 300ms, which felt
      // laggy on per-letter auto-fill workflows.
      const DEBOUNCE_MS = 120;
      if (timersRef.current[binding.id]) clearTimeout(timersRef.current[binding.id]);

      // fire() is extracted so it can be re-invoked from the in-flight finally
      // handler when a pending retry has queued up.
      const fire = (triggeredField: string) => {
        if (inFlightRef.current.has(binding.id)) {
          // Queue a re-run with the LATEST snapshot after the current
          // request finishes. Previously we silently dropped this call —
          // which is why fast typists saw "missing" auto-fills on the final
          // keystroke of a burst.
          pendingRetryRef.current[binding.id] = { triggered: triggeredField };
          return;
        }
        inFlightRef.current.add(binding.id);

        const snapshot = { ...lastSnapshotRef.current };
        fetch(`/api/forms/${form.id}/functions/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            bindingId: binding.id,
            formData: snapshot,
            triggerFieldId: triggeredField,
          }),
        })
          .then(async (r) => {
            // 401 = unauthenticated (anonymous public form). Server skips
            // bindings for unauth users too — swallow silently so anon
            // visitors don't see a "Not authenticated" toast on every keystroke.
            if (r.status === 401) return;
            const json = await r.json().catch(() => ({}));
            if (!r.ok || !json?.ok) {
              const msg = json?.error || `Function "${binding.function?.displayName ?? binding.function?.name ?? "binding"}" failed`;
              // Legacy non-JS script (e.g. `void automation.X()` bodies from
              // the old Deluge era). Runtime fails with "automation is not
              // defined" / similar. Disable this binding for the session and
              // log a single actionable warning to the console — no toast.
              if (isLegacyScriptError(msg)) {
                legacyDisabledRef.current.add(binding.id);
                console.warn(
                  `[FunctionBinding] Disabled binding for function "${
                    binding.function?.displayName ?? binding.function?.name ?? binding.functionId
                  }" — its script is legacy (non-JavaScript). Open Settings → Functions, rewrite the script as JavaScript using ctx.* helpers, then re-enable.`
                );
                return;
              }
              if (onError) onError(msg);
              else console.warn("[FunctionBinding]", msg);
              return;
            }
            const updates = (json.fieldUpdates || {}) as Record<string, any>;
            if (Object.keys(updates).length > 0) {
              setFieldValues(updates);
              // Treat the fields we just wrote as the new baseline so the
              // setFieldValues update doesn't get diffed back as a "change"
              // and re-fire the same binding next tick.
              for (const [k, v] of Object.entries(updates)) {
                lastSnapshotRef.current[k] = v;
              }
            }
          })
          .catch((err) => {
            const msg = err?.message || "Function binding request failed";
            if (onError) onError(msg);
            else console.warn("[FunctionBinding]", msg);
          })
          .finally(() => {
            inFlightRef.current.delete(binding.id);
            // If a retry was queued while the request was in-flight, fire it
            // now with the latest snapshot. This guarantees the user's final
            // keystrokes always reach the server.
            const pending = pendingRetryRef.current[binding.id];
            if (pending) {
              delete pendingRetryRef.current[binding.id];
              fire(pending.triggered);
            }
          });
      };

      timersRef.current[binding.id] = setTimeout(() => fire(triggered!), DEBOUNCE_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, changeBindings, form?.id]);

  // Cleanup any pending timers on unmount.
  useEffect(() => {
    return () => {
      for (const t of Object.values(timersRef.current)) clearTimeout(t);
    };
  }, []);

  return null;
};

/**
 * Build the set of fieldIds that any active binding writes to via its
 * outputMapping. Used by FormFieldRenderer to mark those fields read-only
 * so user keystrokes can't race the script's writes.
 */
export function getBindingWriteTargets(form: Form | null): Set<string> {
  const out = new Set<string>();
  if (!form?.functionBindings) return out;
  for (const b of form.functionBindings) {
    for (const fid of Object.values(b.outputMapping || {})) {
      if (typeof fid === "string") out.add(fid);
    }
  }
  return out;
}

/**
 * Helper for FormFieldRenderer's onBlur path: fire any binding whose event
 * is `onFieldBlur` and whose inputMapping watches the just-blurred fieldId.
 */
export async function fireBlurBindings(
  form: Form | null,
  fieldId: string,
  formData: Record<string, any>,
  setFieldValues: (updates: Record<string, any>) => void,
  onError?: (msg: string) => void
): Promise<void> {
  if (!form?.id || !form.functionBindings) return;
  const bindings = form.functionBindings.filter((b) => {
    if (b.event !== "onFieldBlur") return false;
    const mapping = b.inputMapping || {};
    if (Object.keys(mapping).length > 0) {
      return Object.values(mapping).includes(fieldId);
    }
    // Auto-mode: field-scoped binding fires only for its own field;
    // form-scoped binding fires on any blur.
    return b.fieldId ? b.fieldId === fieldId : true;
  });
  if (bindings.length === 0) return;

  for (const binding of bindings) {
    try {
      const r = await fetch(`/api/forms/${form.id}/functions/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bindingId: binding.id,
          formData,
          triggerFieldId: fieldId,
        }),
      });
      if (r.status === 401) continue; // anon user — skip silently
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json?.ok) {
        const msg = json?.error || "Function binding failed";
        if (onError) onError(msg);
        else console.warn("[FunctionBinding/blur]", msg);
        continue;
      }
      const updates = (json.fieldUpdates || {}) as Record<string, any>;
      if (Object.keys(updates).length > 0) setFieldValues(updates);
    } catch (err: any) {
      const msg = err?.message || "Function binding request failed";
      if (onError) onError(msg);
      else console.warn("[FunctionBinding/blur]", msg);
    }
  }
}
