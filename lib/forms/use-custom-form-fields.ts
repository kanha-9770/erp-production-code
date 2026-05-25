"use client";

/**
 * Client hook + shared types for the "Customize form → render added fields"
 * round-trip. Fetches the non-core sections/fields for a given static form
 * kind (jobApplication, employee, etc.) and refetches when the window
 * regains focus — so after the user adds a field in the builder and clicks
 * back to the static-form tab, the new field appears immediately.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Subset of FormField needed to render an input. Matches the shape the
 *  /api/forms/by-kind endpoint returns. */
export interface CustomField {
  id: string;
  label: string;
  type: string;
  placeholder: string | null;
  options: { label: string; value: string }[] | null;
  validation: { required?: boolean } | null;
}

export interface CustomSection {
  id: string;
  title: string;
  order: number;
  columns: number;
  fields: CustomField[];
}

export interface CustomFieldValues {
  [fieldId: string]: unknown;
}

export interface UseCustomFormFieldsResult {
  sections: CustomSection[];
  formId: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCustomFormFields(kind: string): UseCustomFormFieldsResult {
  const [sections, setSections] = useState<CustomSection[]>([]);
  const [formId, setFormId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumping this triggers a refetch on demand (e.g. after the user comes back
  // from the form builder). Also used as a window-focus trigger below.
  const tickRef = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetch(`/api/forms/by-kind/${encodeURIComponent(kind)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (!r.ok || !json?.success) {
          throw new Error(json?.error ?? `Failed to load custom fields (${r.status})`);
        }
        if (!cancelled) {
          setSections(json.sections ?? []);
          setFormId(json.formId ?? null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to load custom fields");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, tick]);

  // Refetch on window focus — so the second the user tabs back from the
  // builder, their new fields appear in the static form.
  useEffect(() => {
    const onFocus = () => {
      tickRef.current += 1;
      setTick(tickRef.current);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const refetch = useCallback(() => {
    tickRef.current += 1;
    setTick(tickRef.current);
  }, []);

  return { sections, formId, isLoading, error, refetch };
}
