/**
 * Shared international dialing codes — the single source of truth for the
 * "Country Code" selector that sits next to EVERY phone / mobile field across
 * the ERP. One list to maintain.
 *
 *  - `DIAL_CODES` is the structured data (code + flag + country).
 *  - `DIAL_CODE_OPTIONS` is the `{value,label}` shape that schema-driven
 *    `select` fields consume.
 *  - The shared <PhoneField> component (components/form-fields/phone-field.tsx)
 *    renders from `DIAL_CODES`.
 *
 * Storage standard: a phone is stored as the joined string "<code> <number>"
 * (e.g. "+91 9999900000") in a single text column, so no schema/DB change is
 * needed and any country number round-trips. Use `splitPhone` / `joinPhone`
 * (exported from the component) to convert.
 *
 * India is first as this org's default. Shared codes (+1 US/Canada, +7
 * Russia/Kazakhstan) appear once.
 */

export interface DialCode {
  code: string; // "+91"
  flag: string; // "🇮🇳"
  country: string; // "India"
}

export const DEFAULT_DIAL_CODE = "+91";

export const DIAL_CODES: DialCode[] = [
  { code: "+91", flag: "🇮🇳", country: "India" },
  { code: "+1", flag: "🇺🇸", country: "USA / Canada" },
  { code: "+44", flag: "🇬🇧", country: "United Kingdom" },
  { code: "+971", flag: "🇦🇪", country: "UAE" },
  { code: "+966", flag: "🇸🇦", country: "Saudi Arabia" },
  { code: "+974", flag: "🇶🇦", country: "Qatar" },
  { code: "+965", flag: "🇰🇼", country: "Kuwait" },
  { code: "+973", flag: "🇧🇭", country: "Bahrain" },
  { code: "+968", flag: "🇴🇲", country: "Oman" },
  { code: "+65", flag: "🇸🇬", country: "Singapore" },
  { code: "+60", flag: "🇲🇾", country: "Malaysia" },
  { code: "+62", flag: "🇮🇩", country: "Indonesia" },
  { code: "+66", flag: "🇹🇭", country: "Thailand" },
  { code: "+84", flag: "🇻🇳", country: "Vietnam" },
  { code: "+63", flag: "🇵🇭", country: "Philippines" },
  { code: "+852", flag: "🇭🇰", country: "Hong Kong" },
  { code: "+86", flag: "🇨🇳", country: "China" },
  { code: "+81", flag: "🇯🇵", country: "Japan" },
  { code: "+82", flag: "🇰🇷", country: "South Korea" },
  { code: "+886", flag: "🇹🇼", country: "Taiwan" },
  { code: "+92", flag: "🇵🇰", country: "Pakistan" },
  { code: "+880", flag: "🇧🇩", country: "Bangladesh" },
  { code: "+94", flag: "🇱🇰", country: "Sri Lanka" },
  { code: "+977", flag: "🇳🇵", country: "Nepal" },
  { code: "+95", flag: "🇲🇲", country: "Myanmar" },
  { code: "+93", flag: "🇦🇫", country: "Afghanistan" },
  { code: "+98", flag: "🇮🇷", country: "Iran" },
  { code: "+964", flag: "🇮🇶", country: "Iraq" },
  { code: "+972", flag: "🇮🇱", country: "Israel" },
  { code: "+90", flag: "🇹🇷", country: "Turkey" },
  { code: "+7", flag: "🇷🇺", country: "Russia / Kazakhstan" },
  { code: "+33", flag: "🇫🇷", country: "France" },
  { code: "+49", flag: "🇩🇪", country: "Germany" },
  { code: "+39", flag: "🇮🇹", country: "Italy" },
  { code: "+34", flag: "🇪🇸", country: "Spain" },
  { code: "+351", flag: "🇵🇹", country: "Portugal" },
  { code: "+31", flag: "🇳🇱", country: "Netherlands" },
  { code: "+32", flag: "🇧🇪", country: "Belgium" },
  { code: "+41", flag: "🇨🇭", country: "Switzerland" },
  { code: "+43", flag: "🇦🇹", country: "Austria" },
  { code: "+46", flag: "🇸🇪", country: "Sweden" },
  { code: "+47", flag: "🇳🇴", country: "Norway" },
  { code: "+45", flag: "🇩🇰", country: "Denmark" },
  { code: "+358", flag: "🇫🇮", country: "Finland" },
  { code: "+48", flag: "🇵🇱", country: "Poland" },
  { code: "+30", flag: "🇬🇷", country: "Greece" },
  { code: "+353", flag: "🇮🇪", country: "Ireland" },
  { code: "+380", flag: "🇺🇦", country: "Ukraine" },
  { code: "+20", flag: "🇪🇬", country: "Egypt" },
  { code: "+27", flag: "🇿🇦", country: "South Africa" },
  { code: "+234", flag: "🇳🇬", country: "Nigeria" },
  { code: "+254", flag: "🇰🇪", country: "Kenya" },
  { code: "+255", flag: "🇹🇿", country: "Tanzania" },
  { code: "+251", flag: "🇪🇹", country: "Ethiopia" },
  { code: "+212", flag: "🇲🇦", country: "Morocco" },
  { code: "+61", flag: "🇦🇺", country: "Australia" },
  { code: "+64", flag: "🇳🇿", country: "New Zealand" },
  { code: "+55", flag: "🇧🇷", country: "Brazil" },
  { code: "+52", flag: "🇲🇽", country: "Mexico" },
  { code: "+54", flag: "🇦🇷", country: "Argentina" },
  { code: "+56", flag: "🇨🇱", country: "Chile" },
  { code: "+57", flag: "🇨🇴", country: "Colombia" },
  { code: "+51", flag: "🇵🇪", country: "Peru" },
];

/** `{value,label}` options for schema-driven `select` country-code fields. */
export const DIAL_CODE_OPTIONS: Array<{ value: string; label: string }> = DIAL_CODES.map((c) => ({
  value: c.code,
  label: `${c.flag} ${c.code} · ${c.country}`,
}));

/** Dial codes sorted longest-first, so "+971" wins over "+9" when splitting. */
const CODES_BY_LENGTH = [...DIAL_CODES].map((c) => c.code).sort((a, b) => b.length - a.length);

/** Split a stored phone string into its dial code + local number. Falls back
 *  to the default code for a bare local number. */
export function splitPhone(raw: unknown): { code: string; number: string } {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { code: DEFAULT_DIAL_CODE, number: "" };
  for (const code of CODES_BY_LENGTH) {
    if (trimmed.startsWith(code)) {
      return { code, number: trimmed.slice(code.length).trim() };
    }
  }
  // Unknown/explicit "+" code we don't list — keep it as the code up to the
  // first space so any country still round-trips; else treat as a local number.
  if (trimmed.startsWith("+")) {
    const sp = trimmed.indexOf(" ");
    if (sp > 0) return { code: trimmed.slice(0, sp), number: trimmed.slice(sp + 1).trim() };
  }
  return { code: DEFAULT_DIAL_CODE, number: trimmed };
}

/** Join a dial code + local number into the stored string (empty when no
 *  number). Strips spaces/dashes from the number, keeps digits. */
export function joinPhone(code: string, number: string): string {
  const cleaned = String(number ?? "").replace(/[^\d]/g, "");
  return cleaned ? `${code || DEFAULT_DIAL_CODE} ${cleaned}` : "";
}

export function flagForDialCode(code: string): string {
  return DIAL_CODES.find((c) => c.code === code)?.flag ?? "🌐";
}
