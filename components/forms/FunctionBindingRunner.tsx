"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Form, ClientFunctionBinding } from "@/types/form-builder";

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
  // Debounce timers per-binding so a fast typist's keystrokes coalesce.
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Latch in-flight bindings so we don't double-fire while a request is open.
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // First mount: capture the snapshot, don't fire (initial values aren't
    // user changes). Subsequent runs diff against this baseline.
    if (Object.keys(lastSnapshotRef.current).length === 0 && Object.keys(formData).length > 0) {
      lastSnapshotRef.current = { ...formData };
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
      const watched = Object.values(binding.inputMapping || {}).filter(
        (v): v is string => typeof v === "string" && !v.startsWith("$")
      );
      if (watched.length === 0) continue;
      const triggered = watched.find((fid) => changedFieldIds.has(fid));
      if (!triggered) continue;

      // Debounce per binding (300ms — matches what feels right for typing).
      if (timersRef.current[binding.id]) clearTimeout(timersRef.current[binding.id]);
      timersRef.current[binding.id] = setTimeout(() => {
        if (inFlightRef.current.has(binding.id)) return;
        inFlightRef.current.add(binding.id);

        const snapshot = { ...lastSnapshotRef.current };
        fetch(`/api/forms/${form.id}/functions/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            bindingId: binding.id,
            formData: snapshot,
            triggerFieldId: triggered,
          }),
        })
          .then(async (r) => {
            const json = await r.json().catch(() => ({}));
            if (!r.ok || !json?.ok) {
              const msg = json?.error || `Function "${binding.function?.displayName ?? binding.function?.name ?? "binding"}" failed`;
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
          });
      }, 300);
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
  const bindings = form.functionBindings.filter(
    (b) =>
      b.event === "onFieldBlur" &&
      Object.values(b.inputMapping || {}).includes(fieldId)
  );
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
