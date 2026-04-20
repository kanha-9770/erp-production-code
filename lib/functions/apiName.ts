/**
 * Shared API-Name slug helper.
 *
 * One place computes the human-readable identifier we show next to every
 * field ("Ad Adcopy ID" → "Ad_Adcopy_ID"). The tree endpoint, the executor
 * runtime, and the binding picker all import from here so the UI's API
 * Name is always the same string the script can use.
 */

/**
 * Replicates Zoho CRM's `api_name` algorithm exactly. Steps applied in this
 * order — each step name matches the public spec so reviewers can audit:
 *
 *   1. trim
 *   2. strip diacritics                ("Café" → "Cafe")
 *   3. remove disallowed chars         (keep A-Za-z0-9, space, underscore)
 *   4. spaces → underscores
 *   5. collapse repeated underscores
 *   6. trim underscores
 *   7. leading digit → prefix "_"      ("2nd Address" → "_2nd_Address")
 *   8. preserve original casing        ("first name" → "first_name")
 *   9. cap at 50 chars + trim trailing "_"
 *
 * Rule 10 (system-field collision) lives in the caller because it depends on
 * module context, which this pure function deliberately doesn't know about.
 *
 * Empty labels (or labels that strip to empty) fall back to `Field_<6char of id>`
 * so the runner never has to deal with ""-keyed fields.
 */
export function slugifyFieldLabel(label: string, fallbackId: string): string {
  // 1. trim
  let s = (label || "").trim()
  if (!s) return `Field_${fallbackId.slice(0, 6)}`

  // 2. strip diacritics — NFD splits "é" into "e" + combining mark, then we
  //    drop the combining-mark range U+0300–U+036F.
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")

  // 3. remove disallowed chars — anything that isn't in the allowlist is
  //    deleted (NOT replaced with a space). This is what makes "Email-ID"
  //    collapse to "EmailID" instead of "Email_ID".
  s = s.replace(/[^A-Za-z0-9 _]/g, "")

  // 4. spaces → underscores
  s = s.replace(/ /g, "_")

  // 5. collapse repeated underscores
  s = s.replace(/_+/g, "_")

  // 6. trim leading/trailing underscores
  s = s.replace(/^_+|_+$/g, "")

  if (!s) return `Field_${fallbackId.slice(0, 6)}`

  // 7. leading digit → prefix "_"
  if (/^[0-9]/.test(s)) s = "_" + s

  // 8. (no-op — original casing is preserved by never lowercasing/uppercasing)

  // 9. cap at 50 chars; if the cut leaves a trailing "_", trim it.
  if (s.length > 50) s = s.slice(0, 50).replace(/_+$/, "")

  return s
}

/**
 * Attach a stable `apiName` to each field. Within the input array,
 * duplicates of the same base slug get `_2`, `_3`, … so every apiName is
 * unique inside that scope (typically one form).
 *
 * Order-stable: passing the same fields in the same order always yields the
 * same apiNames. Reordering fields can shuffle which one gets the un-suffixed
 * name — that's a known cost of computing slugs at read time. If a user
 * reorders fields and a script breaks, the fix is to use the field's `id`
 * (cuid) instead of the apiName.
 */
export function attachApiNames<T extends { id: string; label: string }>(
  fields: T[]
): Array<T & { apiName: string }> {
  const seen = new Map<string, number>()
  return fields.map((f) => {
    const base = slugifyFieldLabel(f.label, f.id)
    const used = seen.get(base) || 0
    const apiName = used === 0 ? base : `${base}_${used + 1}`
    seen.set(base, used + 1)
    return { ...f, apiName }
  })
}
