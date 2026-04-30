/**
 * Helpers for handling Email Notification SMTP passwords stored on workflow
 * rules. Passwords are AES-256-GCM encrypted at rest (reusing the same
 * crypto helpers as AI provider keys) and replaced with a `__KEPT__:<id>`
 * sentinel before being returned to the browser, so the plaintext never
 * crosses the network after creation.
 *
 * Lifecycle:
 *   POST/PUT  → `prepareInstantActionsForWrite`  encrypts new passwords,
 *                                                 unwraps `__KEPT__:<id>`
 *                                                 sentinels back to the
 *                                                 stored ciphertext.
 *   GET       → `redactInstantActionsForRead`    swaps stored ciphertext
 *                                                 for a sentinel keyed by
 *                                                 the rule's id.
 *   trigger   → `decryptStoredSmtpPass`          decrypts at send time.
 */

import { encryptApiKey, decryptApiKey } from "@/lib/ai/crypto"

const CIPHER_PREFIX = "ENC::"
const KEPT_PREFIX = "__KEPT__:"

const isCiphertext = (s: string) => s.startsWith(CIPHER_PREFIX)
const isKept = (s: string) => s.startsWith(KEPT_PREFIX)

function encryptIfPlain(value: string): string {
  if (!value) return value
  if (isCiphertext(value)) return value // already encrypted, no double-encrypt
  return CIPHER_PREFIX + encryptApiKey(value)
}

/**
 * Decrypt a stored SMTP password. Tolerates both prefixed and legacy
 * unprefixed ciphertext (for rules saved by an older code path), as well
 * as plaintext fallback (returns as-is). Never throws — returns "" on
 * failure so the caller can warn instead of crashing the trigger.
 */
export function decryptStoredSmtpPass(stored: string | null | undefined): string {
  if (!stored) return ""
  try {
    if (isCiphertext(stored)) {
      return decryptApiKey(stored.slice(CIPHER_PREFIX.length))
    }
    // Heuristic: looks like our base64 cipher payload? Try to decrypt it.
    if (/^[A-Za-z0-9+/=]{32,}$/.test(stored)) {
      try {
        return decryptApiKey(stored)
      } catch {
        // Fall through to plaintext fallback
      }
    }
    return stored
  } catch (err) {
    console.warn("[workflow] decryptStoredSmtpPass failed:", (err as Error).message)
    return ""
  }
}

interface PreparePrevContext {
  /** Existing stored instantActions for this rule, used to resolve KEPT sentinels. */
  previous?: any
}

/**
 * Walk the instantActions array, encrypting any new SMTP passwords and
 * unwrapping `__KEPT__` sentinels back to whatever ciphertext was already
 * stored on the matching action. Returns a new array — does not mutate.
 */
export function prepareInstantActionsForWrite(
  instantActions: any,
  ctx: PreparePrevContext = {}
): any {
  if (!Array.isArray(instantActions)) return instantActions

  const previousActions = Array.isArray(ctx.previous) ? ctx.previous : []
  const previousEmail = previousActions.find(
    (a: any) => a && a.type === "Email Notification"
  )
  const previousStoredPass: string | undefined =
    typeof previousEmail?.emailSmtpPass === "string" ? previousEmail.emailSmtpPass : undefined

  return instantActions.map((entry: any) => {
    if (!entry || entry.type !== "Email Notification") return entry
    const raw: unknown = entry.emailSmtpPass
    if (typeof raw !== "string" || raw.length === 0) {
      // No password supplied — explicit clear. Persist as undefined.
      return { ...entry, emailSmtpPass: undefined }
    }
    if (isKept(raw)) {
      // Client signalled "keep what you had" — restore previous ciphertext.
      return { ...entry, emailSmtpPass: previousStoredPass }
    }
    if (isCiphertext(raw)) {
      // Defensive: already encrypted (shouldn't happen from the UI, but
      // tolerate it so a round-trip can't double-encrypt).
      return entry
    }
    return { ...entry, emailSmtpPass: encryptIfPlain(raw) }
  })
}

/**
 * Replace stored SMTP ciphertexts with a `__KEPT__:<ruleId>` sentinel so
 * the plaintext never leaves the server. The UI uses the presence of this
 * sentinel to render "•••••••• (saved — leave blank to keep)".
 */
export function redactInstantActionsForRead(
  instantActions: any,
  ruleId: string
): any {
  if (!Array.isArray(instantActions)) return instantActions
  return instantActions.map((entry: any) => {
    if (!entry || entry.type !== "Email Notification") return entry
    if (typeof entry.emailSmtpPass !== "string" || entry.emailSmtpPass.length === 0) {
      return entry
    }
    return { ...entry, emailSmtpPass: `${KEPT_PREFIX}${ruleId}` }
  })
}
