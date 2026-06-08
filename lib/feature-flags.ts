/**
 * Build-time feature flags.
 *
 * Read from `NEXT_PUBLIC_*` env vars so the SAME constant is usable in both
 * client components and server route handlers (Next inlines NEXT_PUBLIC vars
 * for the browser; they're also plain env vars on the server). Values are
 * resolved at build time — change one, rebuild to apply.
 */

/** Coerce an env string ("true"/"1"/"yes") to a boolean; default false. */
function envFlag(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

/**
 * Hybrid Employee-form mode — the module-page "Hybrid form" banner, the locked
 * Identity core-field auto-injection (form_records_14), and the form-builder
 * "Employee Form" toggle. OFF by default: employee data uses the dedicated
 * `Employee` table instead. Set `NEXT_PUBLIC_HYBRID_FORMS_ENABLED=true` (and
 * rebuild) to bring it back.
 */
export const HYBRID_FORMS_ENABLED = envFlag(process.env.NEXT_PUBLIC_HYBRID_FORMS_ENABLED);
