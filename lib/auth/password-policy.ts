/**
 * Password complexity policy.
 *
 * Single source of truth for what counts as an acceptable password.
 * Enforced server-side on register/reset/change, and exported as a
 * pure function so the UI can render a live strength meter without
 * a network round-trip.
 *
 * Requirements (production-grade but not absurd):
 *   - 10 chars min (8 was below current OWASP guidance)
 *   - 128 chars max (defends against bcrypt DOS)
 *   - At least 1 lowercase letter
 *   - At least 1 uppercase letter
 *   - At least 1 digit
 *   - At least 1 of: special char OR a 4+ char alphabetic run
 *     (the OR is a small concession — passphrases like
 *     "correct horse battery staple" should pass without symbols)
 *   - Not on the small built-in deny list of the most-common passwords
 *
 * The `score` is a 0-4 zxcvbn-style estimate based on length and class
 * coverage. The UI maps it to the strength bar color/label.
 */

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd',
  'qwerty', 'qwerty123', 'qwertyuiop',
  '123456', '12345678', '123456789', '1234567890',
  'admin', 'admin123', 'root', 'toor',
  'letmein', 'welcome', 'welcome1', 'monkey', 'dragon',
  'login', 'master', 'superman', 'iloveyou',
  'abc123', 'abc12345', '111111', '000000',
]);

export interface PasswordCheck {
  ok: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  label: 'too short' | 'weak' | 'fair' | 'good' | 'strong';
  errors: string[];
  /** True for each rule that passed — the UI renders this as a checklist. */
  rules: {
    minLength: boolean;
    maxLength: boolean;
    lowercase: boolean;
    uppercase: boolean;
    digit: boolean;
    symbolOrPhrase: boolean;
    notCommon: boolean;
  };
}

export function checkPassword(password: string): PasswordCheck {
  const pwd = password ?? '';
  const lower = pwd.toLowerCase();

  const rules = {
    minLength: pwd.length >= 10,
    maxLength: pwd.length <= 128,
    lowercase: /[a-z]/.test(pwd),
    uppercase: /[A-Z]/.test(pwd),
    digit: /\d/.test(pwd),
    symbolOrPhrase: /[^A-Za-z0-9]/.test(pwd) || /[a-zA-Z]{4,}/.test(pwd),
    notCommon: !COMMON_PASSWORDS.has(lower),
  };

  const errors: string[] = [];
  if (!rules.minLength) errors.push('Use at least 10 characters');
  if (!rules.maxLength) errors.push('Use at most 128 characters');
  if (!rules.lowercase) errors.push('Add a lowercase letter');
  if (!rules.uppercase) errors.push('Add an uppercase letter');
  if (!rules.digit) errors.push('Add a number');
  if (!rules.symbolOrPhrase) errors.push('Add a symbol or use a longer phrase');
  if (!rules.notCommon) errors.push('Avoid common passwords like "password123"');

  const ok = Object.values(rules).every(Boolean);

  // Score: rough 0-4. Length contributes the most, then class diversity.
  let raw = 0;
  if (pwd.length >= 10) raw += 1;
  if (pwd.length >= 14) raw += 1;
  if (pwd.length >= 20) raw += 1;
  const classes =
    Number(rules.lowercase) +
    Number(rules.uppercase) +
    Number(rules.digit) +
    Number(/[^A-Za-z0-9]/.test(pwd));
  if (classes >= 3) raw += 1;
  if (classes >= 4) raw += 1;
  if (!rules.notCommon || pwd.length < 6) raw = 0;

  const score = (Math.max(0, Math.min(4, raw)) as 0 | 1 | 2 | 3 | 4);
  const label = (
    pwd.length < 6 ? 'too short' :
    score <= 1 ? 'weak' :
    score === 2 ? 'fair' :
    score === 3 ? 'good' : 'strong'
  ) as PasswordCheck['label'];

  return { ok, score, label, errors, rules };
}

/**
 * Throws a thin error object suitable for returning as a 400 from a route
 * handler. Use this at the top of register/reset/change endpoints.
 */
export function assertStrongPassword(password: string): void {
  const r = checkPassword(password);
  if (!r.ok) {
    const err = new Error(r.errors[0] ?? 'Password does not meet the policy');
    (err as any).code = 'WEAK_PASSWORD';
    (err as any).errors = r.errors;
    throw err;
  }
}
